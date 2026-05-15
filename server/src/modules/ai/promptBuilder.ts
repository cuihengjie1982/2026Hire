interface ScoringRule {
  dimension: string;
  weight: number;
  keywords: string[];
  matchMode?: 'all' | 'any';
}

export function buildSystemPrompt(
  aiPrompt: string,
  scoringRules: ScoringRule[],
): string {
  const dimensions = scoringRules.length > 0
    ? scoringRules.map(r =>
        `- ${r.dimension}（权重 ${r.weight}%，关键字：${(r.keywords || []).join('、')}，匹配模式：${r.matchMode === 'all' ? '全部匹配' : '任一匹配'}）`
      ).join('\n')
    : '综合评估候选人与岗位的匹配度';

  return `你是一名专业的招聘评估 AI，负责评估候选人简历与岗位要求的匹配度。

## 岗位筛选标准
${aiPrompt || '请根据候选人整体情况评估其与岗位的匹配度。'}

## 评分维度（满分 100 分，按权重分配）
${dimensions}

## 输出要求
你必须严格按照以下 JSON 格式回复，不要包含任何其他文字：

{
  "totalScore": <0-100 的整数>,
  "dimensionScores": [
    {
      "dimension": "<维度名称>",
      "score": <该维度得分，不超过该维度权重>,
      "maxScore": <该维度满分，等于权重>,
      "reasoning": "<1-2句中文字评价>"
    }
  ],
  "strengths": ["<候选人优势1>", "<优势2>"],
  "weaknesses": ["<候选人不足1>", "<不足2>"],
  "matchedQualifications": ["<匹配的资质>"],
  "missingQualifications": ["<缺失的资质>"],
  "overallAssessment": "<2-3句中文综合评价>",
  "recommendation": "强烈推荐" | "推荐" | "考虑" | "不推荐"
}`;
}

export function buildUserMessage(
  resumeText: string,
  positionName: string,
): string {
  // Truncate resume to ~12000 chars to stay within token limits
  const truncated = resumeText.length > 12000
    ? resumeText.slice(0, 12000) + '\n\n[简历内容过长，已截断]'
    : resumeText;

  return `请评估以下候选人对于"${positionName || '目标岗位'}"岗位的匹配度：

## 候选人简历内容
${truncated}`;
}

// ---------------------------------------------------------------------------
// Interview scoring prompts
// ---------------------------------------------------------------------------

export function buildInterviewScoringSystemPrompt(
  scoringDimensions: Array<{name: string; maxScore: number}>,
  scoringGuide?: {standard?: string; rubric?: Array<{label: string; score: string}>},
): string {
  const dimensionList = scoringDimensions.length > 0
    ? scoringDimensions.map(d => `- ${d.name}（满分 ${d.maxScore} 分）`).join('\n')
    : '- 综合评估（满分 100 分）';

  const rubricSection = scoringGuide?.rubric?.length
    ? `\n## 评分参考标准\n${scoringGuide.rubric.map(r => `- ${r.label}：${r.score} 分`).join('\n')}`
    : '';

  const standardSection = scoringGuide?.standard
    ? `\n## 评分标准说明\n${scoringGuide.standard}`
    : '';

  return `你是一名专业的面试评估 AI。你需要根据面试题目、评分标准和候选人的回答内容，对候选人的回答进行评分。

## 评分维度
${dimensionList}${rubricSection}${standardSection}

## 评分要求
1. 根据候选人回答的内容质量、逻辑性、专业性给出评分
2. 只根据候选人实际表达的内容评分，不要假设未提及的内容
3. 如果回答明显偏题或未回答，相关维度应给低分
4. 如果候选人的回答过于简短（少于3句话），应适当降低评分

## 输出要求
你必须严格按照以下 JSON 格式回复，不要包含任何其他文字：

{
  "score": <本题得分，0-100 的数字>,
  "dimensionScores": [
    {
      "dimension": "<维度名称>",
      "score": <该维度得分>,
      "maxScore": <该维度满分>,
      "reasoning": "<1-2句中文评价>"
    }
  ],
  "strengths": ["<回答亮点1>", "<亮点2>"],
  "weaknesses": ["<回答不足1>", "<不足2>"],
  "overallAssessment": "<2-3句中文综合评价>"
}`;
}

export function buildInterviewScoringUserMessage(
  questionTitle: string,
  questionPrompt: string,
  transcript: string,
): string {
  const truncatedTranscript = transcript.length > 8000
    ? transcript.slice(0, 8000) + '\n\n[回答内容过长，已截断]'
    : transcript;

  return `## 面试题目
标题：${questionTitle}
题目内容：${questionPrompt}

## 候选人回答（语音转文字）
${truncatedTranscript || '[候选人未作答或语音未能识别]'}`;
}

export function buildRankingSystemPrompt(
  aiPrompt: string,
  scoringRules: ScoringRule[],
): string {
  const dimensions = scoringRules.length > 0
    ? scoringRules.map(r =>
        `- ${r.dimension}（权重 ${r.weight}%，关键字：${(r.keywords || []).join('、')}）`
      ).join('\n')
    : '综合评估';

  return `你是一名专业的招聘评估 AI，负责对多位候选人进行横向对比和排名。

## 岗位筛选标准
${aiPrompt || '请根据候选人整体情况进行排名。'}

## 评分维度
${dimensions}

## 输出要求
你必须严格按照以下 JSON 格式回复，不要包含任何其他文字：

{
  "ranking": [
    {
      "rank": 1,
      "candidateIndex": <原始候选人数组中的索引>,
      "totalScore": <0-100 的整数>,
      "reasoning": "<中文排名理由>"
    }
  ],
  "analysisSummary": "<2-3句中文整体分析>"
}`;
}

export function buildRankingUserMessage(
  candidates: Array<{index: number; resumeText: string}>,
  positionName: string,
): string {
  const candidateSections = candidates.map(c => {
    const truncated = c.resumeText.length > 4000
      ? c.resumeText.slice(0, 4000) + '\n[已截断]'
      : c.resumeText;
    return `### 候选人 ${c.index + 1}\n${truncated}`;
  }).join('\n\n---\n\n');

  return `请对以下 ${candidates.length} 位候选人进行横向对比排名，岗位为"${positionName || '目标岗位'}"：

${candidateSections}`;
}

// ---------------------------------------------------------------------------
// Resume vision extraction — for image-based / scanned PDFs
// ---------------------------------------------------------------------------

export function buildResumeVisionSystemPrompt(): string {
  return `你是一名专业的简历解析 AI。请从简历图片中完整提取所有文字内容。

## 输出要求
- 提取图片中的所有文字，保持原始结构和格式
- 包括但不限于：个人信息（姓名、性别、年龄、联系方式）、教育背景、工作经历、技能、证书等
- 以清晰的 Markdown 格式输出
- 不要添加任何解释、评估或额外评论
- 不要包含"以下是提取的文字"、"从图片中提取的内容如下"等前缀
- 如果某部分文字不清晰或无法识别，标注为"[无法识别]"
- 如果简历有多页图片，请按顺序提取`;
}

export function buildResumeVisionUserMessage(fileName: string): string {
  return `请从以下简历图片中提取所有文字内容。文件名：${fileName}`;
}
