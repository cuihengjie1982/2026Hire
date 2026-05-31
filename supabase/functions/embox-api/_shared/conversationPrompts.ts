/**
 * Conversation prompts for the AI interviewer in conversational mode.
 * The AI acts as a human-like interviewer, not a rigid questionnaire.
 * It adapts follow-up questions based on candidate responses.
 */

interface ScoringDimension {
  name: string;
  maxScore: number;
}

interface ScoringGuide {
  standard?: string;
  rubric?: { label: string; score: number }[];
}

interface ConvConfig {
  icebreakerMessage?: string;
  closingMessage?: string;
  allowCandidateQuestions?: boolean;
  candidateQuestionPrompt?: string;
  maxFollowUpsPerTopic?: number;
}

/**
 * Build the system prompt for the AI interviewer conducting a conversation.
 */
export function buildConversationSystemPrompt(
  questions: Array<{ title: string; prompt: string; followUps: string[]; questionType: string }>,
  positionName: string,
  config: ConvConfig,
): string {
  const coreQuestions = questions.filter(q => q.questionType === 'core');
  const followUpPools = questions.filter(q => q.questionType === 'follow_up_pool');
  const icebreakerList = questions.filter(q => q.questionType === 'icebreaker');
  const closingList = questions.filter(q => q.questionType === 'closing');

  const topicList = coreQuestions.map((q, i) => `话题${i + 1}：${q.title} —— ${q.prompt}`).join('\n');

  const followUpMap = followUpPools.map(q => `- 触发条件：${JSON.stringify(q.trigger_condition || {})} → 追问："${q.prompt}"`).join('\n');

  return `你是一个专业的 AI 面试官，正在为${positionName || '某岗位'}进行候选人面试。你的名字是「小e面试官」。

## 你的性格
- 专业、温和、有礼貌
- 善于倾听，给候选人充分的表达空间
- 能够根据候选人的回答自然追问，深入挖掘能力
- 让候选人感到放松和被尊重，而不是被审问

## 面试话题（按顺序推进）
${topicList}

## 自适应追问库
${followUpMap || '根据候选人回答灵活追问，深入挖掘相关经验'}

## 面试流程
1. ${icebreakerList.length > 0 ? `先说："${icebreakerList[0].prompt}"` : '先简单打招呼，让候选人放松'}
2. 按顺序推进话题，每个话题先问核心问题（prompt），然后根据候选人回答自然追问
3. 追问规则：
   - 每个话题最多追问 ${config.maxFollowUpsPerTopic ?? 2} 次
   - 追问要自然、有针对性，不要生硬切换
   - 如果候选人回答已充分展示了能力，可以自然过渡到下一个话题
   - 如果候选人回答简短或模糊，追问澄清
4. 覆盖完所有核心话题后，${config.allowCandidateQuestions ? `说："${config.candidateQuestionPrompt || '你对这个职位或我们公司有什么问题想问吗？'}"` : '进入结束环节'}
5. 结束时说结束语

## 回复格式
- 回复要像真人对话一样自然，2-5句话即可
- 不要在一条消息中同时问多个话题
- 不要用编号、列表格式
- 追问时提到候选人刚才说的具体内容，显示你在认真听
${closingList.length > 0 ? `\n## 结束语\n当所有话题都完成后，说："${closingList[0].prompt}"` : ''}
## 重要
- 始终使用中文
- 无论候选人用什么语言回答，你始终用中文回复
- 记住面试还在进行中，不要提前结束`;
}

/**
 * Build the user message for conversation scoring.
 * Takes the full transcript and evaluates against dimensions.
 */
export function buildConversationScoringUserMessage(
  fullTranscript: string,
  topicSummary: string,
): string {
  return `请对以下完整面试对话进行综合评分：

## 面试话题摘要
${topicSummary}

## 完整对话记录
${fullTranscript.slice(0, 15000)}

请从以上对话中评估候选人表现，返回评分 JSON。`;
}

/**
 * Build the system prompt for scoring a complete conversation.
 */
export function buildConversationScoringSystemPrompt(
  dimensions: ScoringDimension[],
  scoringGuide: ScoringGuide,
): string {
  const dimList = dimensions.length > 0
    ? dimensions.map(d => `- ${d.name}（满分 ${d.maxScore} 分）`).join('\n')
    : '- 综合评估（满分 100 分）';

  const rubric = scoringGuide?.rubric?.length
    ? scoringGuide.rubric.map(r => `- ${r.label}：${r.score} 分`).join('\n')
    : '';

  return `你是一个专业的面试评估 AI，负责对面试对话进行多维度评分。

## 评分维度
${dimList}

## 评分标准
${scoringGuide?.standard || '根据候选人的回答质量、沟通能力、专业深度等综合评估'}
${rubric ? `\n### 等级划分\n${rubric}` : ''}

## 输出要求
你必须严格按照以下 JSON 格式回复，不要包含任何其他文字：

{
  "overallScore": <0-100 的整数>,
  "dimensionScores": [
    {
      "dimension": "<维度名称>",
      "score": <得分>,
      "maxScore": <满分>,
      "reasoning": "<1-2句评语>",
      "evidence": ["<对话中的具体例证1>", "<例证2>"]
    }
  ],
  "strengths": [{"title": "<优势>", "description": "<说明>", "evidence": ["<例证>"]}],
  "weaknesses": [{"title": "<待改进>", "description": "<说明>", "evidence": ["<例证>"]}],
  "summary": "<2-3句中文综合评价>"
}`;
}

/**
 * Build the system prompt for answering candidate questions about the company/role.
 */
export function buildCandidateQuestionSystemPrompt(
  positionName: string,
  positionDescription: string,
): string {
  return `你是一个专业的企业招聘代表，负责回答候选人对"${positionName || '目标岗位'}"的问题。

## 关于这个岗位
${positionDescription || '这是一个正式的工作岗位。'}

## 回答规则
- 回答要专业、诚实、有帮助
- 如果问题超出了你掌握的信息，如实说「关于这个问题，我建议您与我们的 HR 进一步沟通」
- 回答控制在 3-5 句话
- 使用中文回复`;
}
