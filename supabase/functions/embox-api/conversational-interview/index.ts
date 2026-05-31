/**
 * Conversational AI Interview — Edge Function handlers.
 * Phase 1: Text chat conversational MVP.
 * Phase 2: Digital human video avatar (Tavus CVI integration).
 */

import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import { callLLM } from '../_shared/llmClient.ts';
import { parseJSONResponse } from '../_shared/jsonParser.ts';
import {
  buildConversationSystemPrompt,
  buildConversationScoringSystemPrompt,
  buildConversationScoringUserMessage,
  buildCandidateQuestionSystemPrompt,
} from '../_shared/conversationPrompts.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// ---- LLM config resolution (reused pattern from ai-proxy) ----

async function resolveLLMConfig(supabase: ReturnType<typeof createSupabaseAdmin>) {
  const { data } = await supabase.from('ai_model_configs')
    .select('*').eq('is_default', true).eq('is_active', true).limit(1).single();
  const row = data as Record<string, unknown> | null;
  if (!row) return null;
  return {
    provider: String(row.provider),
    model_name: String(row.model_name),
    api_key: String(row.api_key),
    base_url: row.base_url ? String(row.base_url) : null,
    temperature: parseFloat(String(row.temperature ?? 0.7)),
    max_tokens: parseInt(String(row.max_tokens ?? 4096)),
  };
}

// ---- Question normalization ----

function normalizeFollowUps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && 'prompt' in item) return String((item as Record<string, unknown>).prompt ?? '');
    return String(item);
  });
}

function mapQuestion(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    prompt: String(row.prompt ?? ''),
    followUps: normalizeFollowUps(parseJsonField(row.follow_ups ?? row.followUps, [])),
    questionType: String(row.question_type ?? 'core'),
    triggerCondition: parseJsonField<Record<string, unknown>>(row.trigger_condition ?? row.triggerCondition, {}),
  };
}

function parseJsonField<T>(val: unknown, fallback: T): T {
  if (typeof val === 'object' && val !== null) return val as unknown as T;
  if (typeof val === 'string') {
    try { return JSON.parse(val) as T; } catch { return fallback; }
  }
  return fallback;
}

// ---- Helper: build conversation context from messages ----

function buildMessageContext(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role === 'interviewer' ? 'assistant' : 'user', content: m.content })),
  ];
}

function buildConversationMessagesPrompt(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
): { systemPrompt: string; userMessage: string } {
  // For providers that don't support multi-turn system+user natively,
  // we build a formatted text prompt with the full conversation history.
  const history = messages.map(m => {
    const label = m.role === 'interviewer' ? '面试官' : '候选人';
    return `${label}：${m.content}`;
  }).join('\n\n');

  return {
    systemPrompt,
    userMessage: `以下是当前的对话记录：\n\n${history}\n\n请以面试官的身份回复候选人的最后一条消息。`,
  };
}

// ---- Topic tracking ----

function parseTopicsCovered(raw: unknown): Array<{ questionId: string; title: string; completedAt?: string; summary?: string }> {
  if (Array.isArray(raw)) return raw;
  return [];
}

/**
 * Determine which topic to advance to next based on LLM response and current state.
 */
function extractTopicTransition(
  aiResponse: string,
  currentTopic: string | null,
  coreQuestions: Array<{ id: string; title: string }>,
  topicsCovered: Array<{ questionId: string }>,
): { newTopic: string | null; shouldClose: boolean } {
  // Simple heuristic: if all core questions are covered, suggest closing
  const uncoveredTopics = coreQuestions.filter(
    q => !topicsCovered.some(tc => tc.questionId === q.id),
  );

  if (uncoveredTopics.length === 0) {
    return { newTopic: null, shouldClose: true };
  }

  // The AI response content is analyzed to see if the conversation
  // should move to the next topic. We keep it on the current topic
  // unless the AI explicitly signals a transition (via conversational flow).
  // In practice, the LLM handles this naturally through the system prompt.
  return { newTopic: currentTopic || uncoveredTopics[0].title, shouldClose: false };
}

// ============================================================================
// Endpoint 1: POST /conversational-interview/sessions
// ============================================================================
export const createConvSession = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const body = await req.json();
    const { sessionId, action } = body as { sessionId?: string; action?: string };

    if (!sessionId) return jsonRes({ error: 'sessionId is required' }, 400);

    const supabase = createSupabaseAdmin(req);

    // Verify the interview session exists
    const { data: session } = await supabase.from('interview_sessions')
      .select('id, template_id').eq('id', sessionId).single();
    if (!session) return jsonRes({ error: 'Interview session not found' }, 404);

    const templateId = String((session as Record<string, unknown>).template_id ?? '');

    // Check if a conversational session already exists (resume)
    if (action === 'resume') {
      const { data: existing } = await supabase.from('conversational_interview_sessions')
        .select('*').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(1).single();

      if (existing) {
        const conv = existing as Record<string, unknown>;
        // Load recent messages
        const { data: messages } = await supabase.from('conversational_interview_messages')
          .select('*').eq('conv_session_id', String(conv.id))
          .order('created_at', { ascending: true }).limit(100);

        return jsonRes({
          convSessionId: conv.id,
          status: conv.status,
          currentTopic: conv.current_topic ?? null,
          topicsCovered: parseTopicsCovered(conv.topics_covered),
          messages: (messages as unknown[] || []).map((m: unknown) => {
            const msg = m as Record<string, unknown>;
            return {
              id: msg.id,
              role: msg.role,
              content: msg.content,
              messageType: msg.message_type,
              questionId: msg.question_id ?? null,
              createdAt: msg.created_at,
            };
          }),
          isResumed: true,
        });
      }
    }

    // Create new conversational session
    const { data: template } = await supabase.from('interview_templates')
      .select('name, interview_mode, conversational_config, scoring_config, grade_rules')
      .eq('id', templateId).single();

    const tpl = template as Record<string, unknown> | null;
    const convConfig = parseJsonField<Record<string, unknown>>(tpl?.conversational_config, {});

    // Load questions
    const { data: questions } = await supabase.from('interview_questions')
      .select('*').eq('template_id', templateId).order('sort_order', { ascending: true });

    const mappedQuestions = (questions as unknown[] || []).map((q: unknown) =>
      mapQuestion(q as Record<string, unknown>),
    );

    // Generate AI icebreaker message
    const config = await resolveLLMConfig(supabase);
    if (!config) return jsonRes({ error: 'No active AI model configured' }, 400);

    const positionName = String(tpl?.name ?? '');

    const icebreakerQ = mappedQuestions.find(q => q.questionType === 'icebreaker');
    const icebreakerMessage = icebreakerQ?.prompt
      || String(convConfig.icebreakerMessage || '你好！欢迎参加今天的面试。我是 AI 面试官小e，很高兴认识你。请先简单介绍一下你自己。');

    // Insert the conversational session
    const firstTopic = mappedQuestions.find(q => q.questionType === 'core');
    const { data: convSession } = await supabase.from('conversational_interview_sessions').insert({
      session_id: sessionId,
      status: 'active',
      current_topic: firstTopic?.title ?? null,
      topics_covered: JSON.stringify([]),
      transcript_full: `面试官：${icebreakerMessage}`,
      message_count: 1,
      started_at: new Date().toISOString(),
    }).select('*').single();

    const conv = convSession as Record<string, unknown>;

    // Insert the icebreaker as the first message
    await supabase.from('conversational_interview_messages').insert({
      conv_session_id: conv.id,
      role: 'interviewer',
      content: icebreakerMessage,
      message_type: 'icebreaker',
      question_id: icebreakerQ?.id ?? null,
    });

    // Update interview session status to in_progress
    await supabase.from('interview_sessions')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', sessionId);

    return jsonRes({
      convSessionId: conv.id,
      status: 'active',
      currentTopic: firstTopic?.title ?? null,
      topicsCovered: [],
      messages: [{
        id: null,
        role: 'interviewer',
        content: icebreakerMessage,
        messageType: 'icebreaker',
        questionId: icebreakerQ?.id ?? null,
      }],
      config: {
        allowCandidateQuestions: Boolean(convConfig.allowCandidateQuestions ?? false),
        maxDurationMinutes: Number(convConfig.maxDurationMinutes ?? 30),
        maxFollowUpsPerTopic: Number(convConfig.maxFollowUpsPerTopic ?? 2),
      },
      isResumed: false,
    });
  } catch (e) {
    console.error('[createConvSession]', e);
    return jsonRes({ error: 'Internal error' }, 500);
  }
};

// ============================================================================
// Endpoint 2: POST /conversational-interview/messages
// ============================================================================
export const sendMessage = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const body = await req.json();
    const { convSessionId, content } = body as { convSessionId?: string; content?: string };

    if (!convSessionId || !content?.trim()) {
      return jsonRes({ error: 'convSessionId and content are required' }, 400);
    }

    const supabase = createSupabaseAdmin(req);

    // Load conversation session
    const { data: convData } = await supabase.from('conversational_interview_sessions')
      .select('*').eq('id', convSessionId).single();
    if (!convData) return jsonRes({ error: 'Conversation session not found' }, 404);

    const conv = convData as Record<string, unknown>;
    if (conv.status !== 'active') return jsonRes({ error: 'Conversation is not active' }, 400);

    // Save candidate message
    await supabase.from('conversational_interview_messages').insert({
      conv_session_id: convSessionId,
      role: 'candidate',
      content: content.trim(),
      message_type: 'text',
    });

    // Get the interview session to load template data
    const { data: interviewSession } = await supabase.from('interview_sessions')
      .select('template_id').eq('id', String(conv.session_id)).single();
    const is = interviewSession as Record<string, unknown>;
    const templateId = String(is?.template_id ?? '');

    // Load template config
    const { data: template } = await supabase.from('interview_templates')
      .select('name, conversational_config').eq('id', templateId).single();
    const tpl = template as Record<string, unknown> | null;
    const convConfig = parseJsonField<Record<string, unknown>>(tpl?.conversational_config, {});

    // Load questions
    const { data: questions } = await supabase.from('interview_questions')
      .select('*').eq('template_id', templateId).order('sort_order', { ascending: true });
    const mappedQuestions = (questions as unknown[] || []).map((q: unknown) =>
      mapQuestion(q as Record<string, unknown>),
    );

    // Load recent messages for context
    const { data: recentMessages } = await supabase.from('conversational_interview_messages')
      .select('*').eq('conv_session_id', convSessionId)
      .order('created_at', { ascending: true }).limit(50);

    const messages = (recentMessages as unknown[] || []).map((m: unknown) => {
      const msg = m as Record<string, unknown>;
      return { role: String(msg.role ?? ''), content: String(msg.content ?? '') };
    });

    // Build prompt and call LLM
    const config = await resolveLLMConfig(supabase);
    if (!config) return jsonRes({ error: 'No active AI model configured' }, 400);

    const systemPrompt = buildConversationSystemPrompt(
      mappedQuestions,
      String(tpl?.name ?? ''),
      {
        icebreakerMessage: String(convConfig.icebreakerMessage ?? ''),
        closingMessage: String(convConfig.closingMessage ?? ''),
        allowCandidateQuestions: Boolean(convConfig.allowCandidateQuestions ?? false),
        candidateQuestionPrompt: String(convConfig.candidateQuestionPrompt ?? ''),
        maxFollowUpsPerTopic: Number(convConfig.maxFollowUpsPerTopic ?? 2),
      },
    );

    const { systemPrompt: sp, userMessage } = buildConversationMessagesPrompt(messages, systemPrompt);

    const rawResponse = await callLLM(config, sp, userMessage);
    const aiContent = rawResponse.trim();

    // Save AI response
    const { data: aiMessage } = await supabase.from('conversational_interview_messages').insert({
      conv_session_id: convSessionId,
      role: 'interviewer',
      content: aiContent,
      message_type: 'text',
    }).select('*').single();

    const aiMsg = aiMessage as Record<string, unknown>;

    // Update transcript and message count
    const topicsCovered = parseTopicsCovered(conv.topics_covered);
    const coreQuestions = mappedQuestions.filter(q => q.questionType === 'core');
    const currentTopic = String(conv.current_topic ?? '');
    const topicTransition = extractTopicTransition(aiContent, currentTopic, coreQuestions, topicsCovered);

    const newTranscript = `${conv.transcript_full || ''}\n候选人：${content.trim()}\n面试官：${aiContent}`;

    await supabase.from('conversational_interview_sessions').update({
      transcript_full: newTranscript,
      message_count: (Number(conv.message_count) || 0) + 2,
      current_topic: topicTransition.newTopic,
      updated_at: new Date().toISOString(),
    }).eq('id', convSessionId);

    return jsonRes({
      message: {
        id: aiMsg.id,
        role: 'interviewer',
        content: aiContent,
        messageType: 'text',
        questionId: null,
        createdAt: aiMsg.created_at,
      },
      conversationState: {
        currentTopic: topicTransition.newTopic,
        topicsCovered: topicsCovered.length,
        shouldClose: topicTransition.shouldClose,
      },
    });
  } catch (e) {
    console.error('[sendMessage]', e);
    return jsonRes({ error: 'Internal error' }, 500);
  }
};

// ============================================================================
// Endpoint 3: GET /conversational-interview/messages/stream
// SSE streaming version of sendMessage
// ============================================================================
export const streamMessages = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const url = new URL(req.url);
    const convSessionId = url.searchParams.get('convSessionId');
    const content = url.searchParams.get('content');

    if (!convSessionId || !content?.trim()) {
      return jsonRes({ error: 'convSessionId and content are required' }, 400);
    }

    const supabase = createSupabaseAdmin(req);

    // Load conversation session
    const { data: convData } = await supabase.from('conversational_interview_sessions')
      .select('*').eq('id', convSessionId).single();
    if (!convData) return jsonRes({ error: 'Conversation session not found' }, 404);

    const conv = convData as Record<string, unknown>;
    if (conv.status !== 'active') return jsonRes({ error: 'Conversation is not active' }, 400);

    // Save candidate message
    await supabase.from('conversational_interview_messages').insert({
      conv_session_id: convSessionId,
      role: 'candidate',
      content: content.trim(),
      message_type: 'text',
    });

    // Load context (same as sendMessage but for streaming)
    const { data: interviewSession } = await supabase.from('interview_sessions')
      .select('template_id').eq('id', String(conv.session_id)).single();
    const is = interviewSession as Record<string, unknown>;
    const templateId = String(is?.template_id ?? '');

    const { data: template } = await supabase.from('interview_templates')
      .select('name, conversational_config').eq('id', templateId).single();
    const tpl = template as Record<string, unknown> | null;
    const convConfig = parseJsonField<Record<string, unknown>>(tpl?.conversational_config, {});

    const { data: questions } = await supabase.from('interview_questions')
      .select('*').eq('template_id', templateId).order('sort_order', { ascending: true });
    const mappedQuestions = (questions as unknown[] || []).map((q: unknown) =>
      mapQuestion(q as Record<string, unknown>),
    );

    const { data: recentMessages } = await supabase.from('conversational_interview_messages')
      .select('*').eq('conv_session_id', convSessionId)
      .order('created_at', { ascending: true }).limit(50);
    const messages = (recentMessages as unknown[] || []).map((m: unknown) => {
      const msg = m as Record<string, unknown>;
      return { role: String(msg.role ?? ''), content: String(msg.content ?? '') };
    });

    const config = await resolveLLMConfig(supabase);
    if (!config) return jsonRes({ error: 'No active AI model configured' }, 400);

    const systemPrompt = buildConversationSystemPrompt(
      mappedQuestions, String(tpl?.name ?? ''),
      {
        icebreakerMessage: String(convConfig.icebreakerMessage ?? ''),
        closingMessage: String(convConfig.closingMessage ?? ''),
        allowCandidateQuestions: Boolean(convConfig.allowCandidateQuestions ?? false),
        candidateQuestionPrompt: String(convConfig.candidateQuestionPrompt ?? ''),
        maxFollowUpsPerTopic: Number(convConfig.maxFollowUpsPerTopic ?? 2),
      },
    );

    const { systemPrompt: sp, userMessage } = buildConversationMessagesPrompt(messages, systemPrompt);

    // Stream the response
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(':ok\n\n'));

        let fullResponse = '';
        try {
          const rawResponse = await callLLM(config, sp, userMessage);
          fullResponse = rawResponse.trim();

          // Emit tokens in small chunks to simulate streaming
          const chars = [...fullResponse];
          for (let i = 0; i < chars.length; i += 3) {
            const chunk = chars.slice(i, i + 3).join('');
            controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`));
            await new Promise(r => setTimeout(r, 15));
          }

          // Save AI message to DB
          const { data: aiMessage } = await supabase.from('conversational_interview_messages').insert({
            conv_session_id: convSessionId,
            role: 'interviewer',
            content: fullResponse,
            message_type: 'text',
          }).select('*').single();

          const topicsCovered = parseTopicsCovered(conv.topics_covered);
          const coreQuestions = mappedQuestions.filter(q => q.questionType === 'core');
          const topicTransition = extractTopicTransition(
            fullResponse, String(conv.current_topic ?? ''), coreQuestions, topicsCovered,
          );
          const newTranscript = `${conv.transcript_full || ''}\n候选人：${content.trim()}\n面试官：${fullResponse}`;

          await supabase.from('conversational_interview_sessions').update({
            transcript_full: newTranscript,
            message_count: (Number(conv.message_count) || 0) + 2,
            current_topic: topicTransition.newTopic,
            updated_at: new Date().toISOString(),
          }).eq('id', convSessionId);

          controller.enqueue(encoder.encode(
            `event: done\ndata: ${JSON.stringify({
              messageId: (aiMessage as Record<string, unknown>)?.id ?? null,
              conversationState: {
                currentTopic: topicTransition.newTopic,
                shouldClose: topicTransition.shouldClose,
              },
            })}\n\n`,
          ));
        } catch (err) {
          controller.enqueue(encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : 'LLM error' })}\n\n`,
          ));
        }
        controller.close();
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    console.error('[streamMessages]', e);
    return jsonRes({ error: 'Internal error' }, 500);
  }
};

// ============================================================================
// Endpoint 4: POST /conversational-interview/complete
// ============================================================================
export const completeConversation = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const body = await req.json();
    const { convSessionId } = body as { convSessionId?: string };

    if (!convSessionId) return jsonRes({ error: 'convSessionId is required' }, 400);

    const supabase = createSupabaseAdmin(req);

    const { data: convData } = await supabase.from('conversational_interview_sessions')
      .select('*').eq('id', convSessionId).single();
    if (!convData) return jsonRes({ error: 'Conversation session not found' }, 404);

    const conv = convData as Record<string, unknown>;

    // Count messages
    const { count } = await supabase.from('conversational_interview_messages')
      .select('*', { count: 'exact', head: true }).eq('conv_session_id', convSessionId);

    const now = new Date().toISOString();
    const startedAt = String(conv.started_at ?? '');
    const durationMinutes = startedAt
      ? Math.round((new Date(now).getTime() - new Date(startedAt).getTime()) / 60000)
      : 0;

    await supabase.from('conversational_interview_sessions').update({
      status: 'completed',
      completed_at: now,
      message_count: count ?? (Number(conv.message_count) || 0),
      updated_at: now,
    }).eq('id', convSessionId);

    // Update the parent interview session
    await supabase.from('interview_sessions').update({
      status: 'submitted',
      submitted_at: now,
    }).eq('id', String(conv.session_id));

    return jsonRes({
      status: 'completed',
      messageCount: count ?? (Number(conv.message_count) || 0),
      durationMinutes,
    });
  } catch (e) {
    console.error('[completeConversation]', e);
    return jsonRes({ error: 'Internal error' }, 500);
  }
};

// ============================================================================
// Endpoint 5: POST /conversational-interview/score
// ============================================================================
export const scoreConversation = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const body = await req.json();
    const { convSessionId } = body as { convSessionId?: string };

    if (!convSessionId) return jsonRes({ error: 'convSessionId is required' }, 400);

    const supabase = createSupabaseAdmin(req);

    // Load conversation session + parent interview session + template
    const { data: convData } = await supabase.from('conversational_interview_sessions')
      .select('*').eq('id', convSessionId).single();
    if (!convData) return jsonRes({ error: 'Conversation session not found' }, 404);

    const conv = convData as Record<string, unknown>;

    const { data: interviewSession } = await supabase.from('interview_sessions')
      .select('*, candidates(name, email), interview_templates(name, scoring_config, grade_rules)')
      .eq('id', String(conv.session_id)).single();
    if (!interviewSession) return jsonRes({ error: 'Interview session not found' }, 404);

    const is = interviewSession as Record<string, unknown>;
    const candidates = is.candidates as Record<string, unknown> | null;
    const templates = is.interview_templates as Record<string, unknown> | null;

    const scoringConfig = parseJsonField<Record<string, unknown>>(templates?.scoring_config, {});
    const gradeRules = parseJsonField<Array<Record<string, unknown>>>(templates?.grade_rules, []);
    const dimensions = parseJsonField<Array<Record<string, unknown>>>(scoringConfig.dimensions, []);

    // Load all messages
    const { data: messages } = await supabase.from('conversational_interview_messages')
      .select('*').eq('conv_session_id', convSessionId).order('created_at', { ascending: true });

    // Build topic summary from topics_covered
    const topicsCovered = parseTopicsCovered(conv.topics_covered);
    const topicSummary = topicsCovered.map(t => `- ${t.title}: ${t.summary || '已回答'}`).join('\n');

    // Get full transcript
    const transcript = String(conv.transcript_full || '');

    // Build scoring prompt
    const scoringDims = dimensions.map((d: Record<string, unknown>) => ({
      name: String(d.name ?? d.dimension ?? ''),
      maxScore: Number(d.maxScore ?? d.weight ?? 20),
    }));

    const scoringGuide = parseJsonField<{ standard?: string; rubric?: Array<{ label: string; score: number }> }>(
      scoringConfig.scoringGuide || {}, {},
    );

    const systemPrompt = buildConversationScoringSystemPrompt(
      scoringDims.length > 0 ? scoringDims : [
        { name: '专业能力', maxScore: 30 },
        { name: '沟通表达', maxScore: 25 },
        { name: '逻辑思维', maxScore: 20 },
        { name: '综合素质', maxScore: 25 },
      ],
      scoringGuide,
    );

    const userMessage = buildConversationScoringUserMessage(transcript, topicSummary);

    // Call LLM for scoring
    const config = await resolveLLMConfig(supabase);
    if (!config) return jsonRes({ error: 'No active AI model configured' }, 400);

    const rawScore = await callLLM(config, systemPrompt, userMessage);
    const parsed = parseJSONResponse(rawScore);

    const overallScore = Number(parsed.overallScore ?? parsed.totalScore ?? 0);
    const dimensionScores = Array.isArray(parsed.dimensionScores) ? parsed.dimensionScores : [];
    const strengths = Array.isArray(parsed.strengths) ? parsed.strengths : [];
    const weaknesses = Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [];
    const summary = String(parsed.summary ?? '');

    // Compute grade from grade rules
    let grade = 'qualified';
    let gradeLabel = '合格';
    for (const rule of gradeRules) {
      const minScore = Number(rule.minScore ?? rule.min_score ?? 0);
      const maxScore = Number(rule.maxScore ?? rule.max_score ?? 100);
      if (overallScore >= minScore && overallScore <= maxScore) {
        grade = String(rule.grade ?? grade);
        gradeLabel = String(rule.label ?? rule.grade_label ?? gradeLabel);
        break;
      }
    }

    // Save score
    const { data: scoreRow } = await supabase.from('conversational_interview_scores').insert({
      conv_session_id: convSessionId,
      dimension_scores: JSON.stringify(dimensionScores),
      overall_score: overallScore,
      strengths: JSON.stringify(strengths),
      weaknesses: JSON.stringify(weaknesses),
      summary,
      scoring_model: config.model_name,
      scoring_provider: config.provider,
      status: 'completed',
    }).select('*').single();

    // Create interview_result
    const candidateId = is.candidate_id;
    const candidateName = candidates?.name
      ? String(candidates.name)
      : String(candidates?.email ?? '');
    const candidateEmail = String(candidates?.email ?? '');

    const { data: resultRow } = await supabase.from('interview_results').insert({
      session_id: String(conv.session_id),
      candidate_id: candidateId,
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      position: String(templates?.name ?? ''),
      template_name: String(templates?.name ?? ''),
      interview_date: new Date().toISOString(),
      total_score: overallScore,
      grade,
      grade_label: gradeLabel,
      dimensions: JSON.stringify(dimensionScores),
      duration: Math.round(transcript.length / 500), // rough estimate
      status: 'completed',
      interview_mode: 'text_chat_conversational',
      conversation_transcript: transcript,
      conversation_message_count: Number(conv.message_count) || 0,
    }).select('*').single();

    // Update session to scored
    await supabase.from('interview_sessions').update({ status: 'scored' })
      .eq('id', String(conv.session_id));

    // Auto-create approval for hiring_manager review
    try {
      const approvalType = 'interview_result';
      // Check if already exists (avoid duplicate)
      const { data: existingApproval } = await supabase.from('approval_requests')
        .select('id').eq('reference_type', approvalType)
        .eq('reference_id', (resultRow as Record<string, unknown>)?.id ?? '')
        .limit(1);

      if (!existingApproval || (existingApproval as unknown[]).length === 0) {
        await supabase.from('approval_requests').insert({
          reference_type: approvalType,
          reference_id: (resultRow as Record<string, unknown>)?.id ?? '',
          status: 'pending',
          title: `面试结果 - ${candidateName}`,
          description: `候选人 ${candidateName} 完成对话式面试，综合评分 ${overallScore} 分，等级 ${gradeLabel}`,
          created_by: candidateId,
        });
      }
    } catch {
      // Non-critical: approval creation failure should not block scoring
    }

    return jsonRes({
      scoreId: (scoreRow as Record<string, unknown>)?.id ?? null,
      resultId: (resultRow as Record<string, unknown>)?.id ?? null,
      overallScore,
      grade,
      gradeLabel,
      dimensionScores,
      strengths,
      weaknesses,
      summary,
      status: 'completed',
    });
  } catch (e) {
    console.error('[scoreConversation]', e);
    return jsonRes({ error: 'Internal error' }, 500);
  }
};

// ============================================================================
// Endpoint 6: POST /conversational-interview/candidate-question
// ============================================================================
export const answerCandidateQuestion = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const body = await req.json();
    const { convSessionId, question } = body as { convSessionId?: string; question?: string };

    if (!convSessionId || !question?.trim()) {
      return jsonRes({ error: 'convSessionId and question are required' }, 400);
    }

    const supabase = createSupabaseAdmin(req);

    // Save candidate question
    const { data: qRow } = await supabase.from('candidate_questions_asked').insert({
      conv_session_id: convSessionId,
      candidate_question: question.trim(),
    }).select('*').single();

    // Load context for position info
    const { data: convData } = await supabase.from('conversational_interview_sessions')
      .select('session_id').eq('id', convSessionId).single();
    const conv = convData as Record<string, unknown>;

    const { data: interviewSession } = await supabase.from('interview_sessions')
      .select('template_id').eq('id', String(conv.session_id)).single();
    const is = interviewSession as Record<string, unknown>;

    const { data: template } = await supabase.from('interview_templates')
      .select('name, conversational_config').eq('id', String(is?.template_id)).single();
    const tpl = template as Record<string, unknown> | null;

    // Also try to get position info
    const { data: position } = await supabase.from('positions')
      .select('description').eq('id', String((interviewSession as Record<string, unknown>)?.id ?? '')).single();
    const positionDesc = position ? String((position as Record<string, unknown>).description ?? '') : '';

    const config = await resolveLLMConfig(supabase);
    if (!config) return jsonRes({ error: 'No active AI model configured' }, 400);

    const systemPrompt = buildCandidateQuestionSystemPrompt(
      String(tpl?.name ?? ''),
      positionDesc || '我们是一个专业的团队，欢迎有志之士加入。',
    );

    const rawResponse = await callLLM(config, systemPrompt, `候选人提问：${question.trim()}`);
    const aiResponse = rawResponse.trim();

    // Update the question record with AI response
    const now = new Date().toISOString();
    await supabase.from('candidate_questions_asked').update({
      ai_response: aiResponse,
      response_timestamp: now,
      is_answered: true,
    }).eq('id', (qRow as Record<string, unknown>)?.id ?? '');

    // Save as a message in the conversation too
    await supabase.from('conversational_interview_messages').insert({
      conv_session_id: convSessionId,
      role: 'candidate',
      content: question.trim(),
      message_type: 'candidate_question',
    });

    const { data: aiMsg } = await supabase.from('conversational_interview_messages').insert({
      conv_session_id: convSessionId,
      role: 'interviewer',
      content: aiResponse,
      message_type: 'candidate_question',
    }).select('*').single();

    // Update transcript
    const newTranscript = `${convData?.transcript_full || ''}\n候选人（提问）：${question.trim()}\n面试官：${aiResponse}`;
    await supabase.from('conversational_interview_sessions').update({
      transcript_full: newTranscript,
      message_count: (Number((convData as Record<string, unknown>)?.message_count) || 0) + 2,
      updated_at: now,
    }).eq('id', convSessionId);

    return jsonRes({
      questionId: (qRow as Record<string, unknown>)?.id ?? null,
      message: {
        id: (aiMsg as Record<string, unknown>)?.id ?? null,
        role: 'interviewer',
        content: aiResponse,
        messageType: 'candidate_question',
        createdAt: now,
      },
    });
  } catch (e) {
    console.error('[answerCandidateQuestion]', e);
    return jsonRes({ error: 'Internal error' }, 500);
  }
};
