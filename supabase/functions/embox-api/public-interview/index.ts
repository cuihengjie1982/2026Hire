/**
 * Public Interview Entry — no authentication required.
 * Candidates access their interview via a unique access token link.
 */
import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export const handlePublicInterview = async (req: Request): Promise<Response> => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return jsonRes({ error: 'Missing access token' }, 400);
    }

    const supabase = createSupabaseAdmin(req);

    // Look up interview session by access_token
    const { data: session, error } = await supabase
      .from('interview_sessions')
      .select(`
        id, status, access_token, candidate_id,
        candidates!inner(id, name, email, phone),
        interview_templates!inner(id, name, interview_mode, conversational_config)
      `)
      .eq('access_token', token)
      .single();

    if (error || !session) {
      return jsonRes({ error: 'Invalid or expired interview link' }, 404);
    }

    const s = session as Record<string, unknown>;
    const candidate = s.candidates as Record<string, unknown> | null;
    const template = s.interview_templates as Record<string, unknown> | null;

    // Check if session is still accessible
    const status = String(s.status ?? '');
    if (status === 'closed' || status === 'scored') {
      return jsonRes({ error: 'This interview has already been completed' }, 410);
    }

    // Parse conversational config
    let convConfig: Record<string, unknown> = {};
    if (template?.conversational_config) {
      if (typeof template.conversational_config === 'string') {
        try { convConfig = JSON.parse(template.conversational_config); } catch { /* keep default */ }
      } else {
        convConfig = template.conversational_config as Record<string, unknown>;
      }
    }

    return jsonRes({
      sessionId: s.id,
      status,
      interviewMode: template?.interview_mode ?? 'audio_sequential',
      candidate: {
        id: candidate?.id ?? null,
        name: candidate?.name ?? '',
        email: candidate?.email ?? '',
      },
      template: {
        id: template?.id ?? null,
        name: template?.name ?? '',
      },
      config: {
        maxDurationMinutes: Number(convConfig.maxDurationMinutes ?? 30),
        allowCandidateQuestions: Boolean(convConfig.allowCandidateQuestions ?? false),
        candidateQuestionPrompt: String(convConfig.candidateQuestionPrompt ?? ''),
      },
    });
  } catch (e) {
    console.error('[public-interview]', e);
    return jsonRes({ error: 'Internal error' }, 500);
  }
};
