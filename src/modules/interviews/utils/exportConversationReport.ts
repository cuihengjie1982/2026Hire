import type { ConversationMessage, ConversationScore, ConversationalConfig } from '../types';
import { exportElementToPdf } from '../../../shared/lib/exportPdf';

export interface ConversationReportData {
  /** Template / interview name */
  interviewName: string;
  /** Candidate display name */
  candidateName: string;
  /** Interview date (ISO string or formatted) */
  interviewDate: string;
  /** Total duration in seconds */
  durationSeconds: number;
  /** Full message transcript */
  messages: ConversationMessage[];
  /** Score data (may be null if not yet scored) */
  score: ConversationScore | null;
  /** Interview config */
  config: ConversationalConfig;
}

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} 分 ${s} 秒`;
};

const formatDateTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const roleLabel = (role: string): string => {
  switch (role) {
    case 'interviewer': return 'AI 面试官';
    case 'candidate': return '候选人';
    case 'system': return '系统';
    default: return role;
  }
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Build a styled HTML string for the conversation interview report.
 * Rendered offscreen, captured via html2canvas, and exported as PDF.
 */
const buildReportHtml = (data: ConversationReportData): string => {
  const { interviewName, candidateName, interviewDate, durationSeconds, messages, score, config } = data;

  // Dimension score bars
  const dimensionRows = score?.dimensionScores?.length
    ? score.dimensionScores.map(d => {
        const pct = d.maxScore > 0 ? Math.round((d.score / d.maxScore) * 100) : 0;
        return `
          <div style="margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 3px;">
              <span style="font-weight: 500; color: #1f2937;">${escapeHtml(d.dimension)}</span>
              <span style="color: #6b7280;">${d.score} / ${d.maxScore}</span>
            </div>
            <div style="height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: ${pct}%; background: linear-gradient(90deg, #1a4bc4, #7c3aed); border-radius: 4px;"></div>
            </div>
            ${d.reasoning ? `<p style="font-size: 11px; color: #6b7280; margin: 4px 0 0 0;">${escapeHtml(d.reasoning)}</p>` : ''}
          </div>`;
      }).join('')
    : '<p style="color: #9ca3af; font-size: 13px;">暂无维度评分</p>';

  // Strengths
  const strengthsHtml = score?.strengths?.length
    ? score.strengths.map(s => `
        <div style="margin-bottom: 8px; padding: 8px 12px; background: #f0fdf4; border-left: 3px solid #22c55e; border-radius: 0 6px 6px 0;">
          <div style="font-weight: 600; font-size: 13px; color: #166534;">${escapeHtml(s.title)}</div>
          <div style="font-size: 12px; color: #374151; margin-top: 2px;">${escapeHtml(s.description)}</div>
        </div>`).join('')
    : '<p style="color: #9ca3af; font-size: 13px;">暂无</p>';

  // Weaknesses
  const weaknessesHtml = score?.weaknesses?.length
    ? score.weaknesses.map(w => `
        <div style="margin-bottom: 8px; padding: 8px 12px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 0 6px 6px 0;">
          <div style="font-weight: 600; font-size: 13px; color: #991b1b;">${escapeHtml(w.title)}</div>
          <div style="font-size: 12px; color: #374151; margin-top: 2px;">${escapeHtml(w.description)}</div>
        </div>`).join('')
    : '<p style="color: #9ca3af; font-size: 13px;">暂无</p>';

  // Transcript messages
  const transcriptHtml = messages.length
    ? messages.map(m => `
        <div style="margin-bottom: 10px; padding: 8px 12px; background: ${m.role === 'interviewer' ? '#f9fafb' : '#eef2ff'}; border-radius: 8px; border: 1px solid ${m.role === 'interviewer' ? '#e5e7eb' : '#c7d2fe'};">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: 600; font-size: 11px; color: ${m.role === 'interviewer' ? '#1a4bc4' : '#4f46e5'};">${roleLabel(m.role)}</span>
            <span style="font-size: 10px; color: #9ca3af;">${formatDateTime(m.createdAt)}</span>
          </div>
          <div style="font-size: 12px; color: #374151; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(m.content)}</div>
        </div>`).join('')
    : '<p style="color: #9ca3af; font-size: 13px;">暂无对话记录</p>';

  const usedDuration = config.maxDurationMinutes * 60 - durationSeconds;
  const actualDuration = Math.max(0, usedDuration);

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"></head>
<body style="width: 720px; margin: 0; padding: 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; background: #fff; color: #1f2937;">

  <!-- Header -->
  <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb;">
    <h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 8px 0;">AI 对话面试报告</h1>
    <p style="font-size: 16px; color: #1a4bc4; margin: 0 0 4px 0; font-weight: 500;">${escapeHtml(interviewName)}</p>
  </div>

  <!-- Meta info -->
  <div style="display: flex; justify-content: space-between; margin-bottom: 24px; padding: 12px 16px; background: #f9fafb; border-radius: 8px;">
    <div style="font-size: 13px;">
      <span style="color: #6b7280;">候选人：</span>
      <span style="font-weight: 500;">${escapeHtml(candidateName)}</span>
    </div>
    <div style="font-size: 13px;">
      <span style="color: #6b7280;">面试日期：</span>
      <span style="font-weight: 500;">${escapeHtml(interviewDate)}</span>
    </div>
    <div style="font-size: 13px;">
      <span style="color: #6b7280;">对话时长：</span>
      <span style="font-weight: 500;">${formatDuration(actualDuration)}</span>
    </div>
  </div>

  ${score ? `
  <!-- Score Overview -->
  <div style="text-align: center; margin-bottom: 24px; padding: 20px; background: linear-gradient(135deg, #f5f3ff 0%, #ebe0ff 100%); border-radius: 12px;">
    <div style="font-size: 48px; font-weight: 800; color: #1a4bc4; line-height: 1;">
      ${score.overallScore}<span style="font-size: 20px; font-weight: 400; color: #9ca3af;"> / 100</span>
    </div>
    <div style="display: inline-block; margin-top: 8px; padding: 4px 16px; background: #fff; border-radius: 20px; font-size: 14px; font-weight: 600; color: #374151;">
      ${escapeHtml(score.gradeLabel)}
    </div>
  </div>

  <!-- Dimension Scores -->
  <div style="margin-bottom: 24px;">
    <h2 style="font-size: 16px; font-weight: 700; color: #111827; margin: 0 0 12px 0; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb;">维度评分</h2>
    ${dimensionRows}
  </div>

  <!-- Strengths -->
  <div style="margin-bottom: 24px;">
    <h2 style="font-size: 16px; font-weight: 700; color: #16a34a; margin: 0 0 10px 0;">优势</h2>
    ${strengthsHtml}
  </div>

  <!-- Weaknesses -->
  <div style="margin-bottom: 24px;">
    <h2 style="font-size: 16px; font-weight: 700; color: #dc2626; margin: 0 0 10px 0;">待改进</h2>
    ${weaknessesHtml}
  </div>

  <!-- Summary -->
  ${score.summary ? `
  <div style="margin-bottom: 24px; padding: 14px 16px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
    <h2 style="font-size: 16px; font-weight: 700; color: #92400e; margin: 0 0 8px 0;">综合评价</h2>
    <p style="font-size: 13px; color: #374151; line-height: 1.7; margin: 0;">${escapeHtml(score.summary)}</p>
  </div>` : ''}
  ` : `
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 14px; margin-bottom: 24px;">
    暂无评分数据
  </div>`}

  <!-- Transcript -->
  <div style="margin-bottom: 16px;">
    <h2 style="font-size: 16px; font-weight: 700; color: #111827; margin: 0 0 12px 0; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb;">
      对话记录
      <span style="font-weight: 400; font-size: 12px; color: #9ca3af; margin-left: 8px;">共 ${messages.length} 条消息</span>
    </h2>
    ${transcriptHtml}
  </div>

  <!-- Footer -->
  <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af;">
    EM-BOX AI 招聘管理系统 · 自动生成报告
  </div>

</body>
</html>`;
};

/**
 * Export a conversation interview report as PDF.
 *
 * Creates an offscreen iframe with the report HTML, renders it,
 * captures via html2canvas, and triggers a PDF download.
 */
export const exportConversationReport = async (
  data: ConversationReportData,
): Promise<void> => {
  const html = buildReportHtml(data);

  // Create offscreen iframe for rendering
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:720px;height:0;border:none;';
  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error('Failed to load report iframe'));
    if (iframe.contentDocument) {
      iframe.contentDocument.open();
      iframe.contentDocument.write(html);
      iframe.contentDocument.close();
    }
  });

  // Small delay to ensure rendering is complete
  await new Promise(r => setTimeout(r, 300));

  try {
    const body = iframe.contentDocument?.body;
    if (!body) throw new Error('Report iframe has no body');

    const filename = `${data.candidateName}_${data.interviewName}_面试报告`
      .replace(/\s+/g, '_');

    await exportElementToPdf(body, filename, { scale: 2, margin: 0 });
  } finally {
    document.body.removeChild(iframe);
  }
};
