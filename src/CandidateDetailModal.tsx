import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { X, MapPin, Mail, Phone, Calendar, Download, MoreHorizontal, AlertCircle, Eye } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import type { CandidateCard } from './modules/talent/types';
import type { ScoreResult } from './shared/lib/resumeScorer';
import { calculateResumeScore } from './shared/lib/resumeScorer';
import { getPositionDetail } from './modules/positions/api';
import { listOutreachRecordsByCandidate } from './modules/outreach/api';
import { listContactsByCandidate } from './modules/contacts/api';
import type { PositionDetail } from './modules/positions/types';
import type { OutreachRecord } from './modules/outreach/types';
import type { Contact } from './modules/contacts/types';

interface CandidateDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate?: CandidateCard;
  positionDetail?: PositionDetail | null;
}

export const CandidateDetailModal = ({ isOpen, onClose, candidate, positionDetail: propPositionDetail }: CandidateDetailModalProps) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'fit' | 'outreach' | 'notes'>('profile');
  const [computedScore, setComputedScore] = useState<ScoreResult | null>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [outreachRecords, setOutreachRecords] = useState<OutreachRecord[]>([]);
  const [contactRecords, setContactRecords] = useState<Contact[]>([]);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [showOutreachModal, setShowOutreachModal] = useState(false);
  const [outreachEmail, setOutreachEmail] = useState('');
  const [outreachIncludeResume, setOutreachIncludeResume] = useState(true);
  const [outreachIncludeReport, setOutreachIncludeReport] = useState(true);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewType, setPreviewType] = useState<'resume' | 'report'>('resume');
  const evaluationRef = useRef<HTMLDivElement>(null);

  // Fetch outreach + contact records when switching to outreach tab
  useEffect(() => {
    if (activeTab === 'outreach' && candidate?.id) {
      setOutreachLoading(true);
      Promise.all([
        listOutreachRecordsByCandidate(candidate.id),
        listContactsByCandidate(candidate.id),
      ])
        .then(([outreach, contacts]) => {
          setOutreachRecords(outreach);
          setContactRecords(contacts);
        })
        .catch(() => { setOutreachRecords([]); setContactRecords([]); })
        .finally(() => setOutreachLoading(false));
    }
  }, [activeTab, candidate?.id]);

  // If candidate has positionId but no scoreResult, compute it on the fly
  useEffect(() => {
    if (!isOpen || !candidate?.resumeParsedInfo) {
      setComputedScore(null);
      return;
    }

    // Use passed positionDetail if available, otherwise fetch it
    if (propPositionDetail) {
      setComputedScore(calculateResumeScore(candidate.resumeParsedInfo!, propPositionDetail));
    } else if (candidate.positionId) {
      getPositionDetail(candidate.positionId).then((detail) => {
        if (detail) {
          setComputedScore(calculateResumeScore(candidate.resumeParsedInfo!, detail));
        }
      }).catch(() => {});
    } else {
      setComputedScore(null);
    }
  }, [isOpen, candidate?.id, propPositionDetail]);

  // Use stored scoreResult or computed one
  const scoreResult = candidate?.scoreResult || computedScore;

  // Download evaluation report as PDF — uses jsPDF directly for reliability
  const downloadEvaluationPDF = async () => {
    if (!scoreResult) {
      alert('暂无评分数据，无法生成报告');
      return;
    }
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 15;
      const contentW = pageW - margin * 2;
      let y = margin;

      // Helper: check page overflow and add new page
      const checkPage = (needed: number) => {
        if (y + needed > pdf.internal.pageSize.getHeight() - margin) {
          pdf.addPage();
          y = margin;
        }
      };

      // Title
      pdf.setFontSize(18);
      pdf.setTextColor(26, 75, 196);
      pdf.text(`${candidate?.name || '候选人'} — 匹配评估报告`, margin, y);
      y += 10;

      // Position & date
      pdf.setFontSize(10);
      pdf.setTextColor(107, 114, 128);
      pdf.text(`岗位: ${candidate?.positionName || '未关联'}    |    日期: ${new Date().toLocaleDateString('zh-CN')}`, margin, y);
      y += 8;

      // Divider
      pdf.setDrawColor(229, 231, 235);
      pdf.line(margin, y, pageW - margin, y);
      y += 6;

      // Score overview
      pdf.setFontSize(14);
      pdf.setTextColor(17, 24, 39);
      pdf.text('Fit Score 综合评分', margin, y);
      y += 7;

      pdf.setFontSize(28);
      pdf.setTextColor(26, 75, 196);
      pdf.text(`${totalScore}`, margin, y);
      pdf.setFontSize(12);
      pdf.setTextColor(107, 114, 128);
      pdf.text(`/100  等级: ${grade}`, margin + 22, y);
      y += 10;

      // Dimension scores
      if (scoreResult.dimensionScores.length > 0) {
        checkPage(10);
        pdf.setFontSize(12);
        pdf.setTextColor(17, 24, 39);
        pdf.text('维度得分详情', margin, y);
        y += 6;

        scoreResult.dimensionScores.forEach((ds) => {
          checkPage(14);
          const pct = ds.maxScore > 0 ? Math.round((ds.score / ds.maxScore) * 100) : 0;
          // Dimension name + score
          pdf.setFontSize(10);
          pdf.setTextColor(55, 65, 81);
          pdf.text(`${ds.dimension}: ${ds.score}/${ds.maxScore} (权重 ${ds.weight}%)`, margin, y);
          y += 4;
          // Progress bar background
          const barW = contentW;
          const barH = 3;
          pdf.setFillColor(229, 231, 235);
          pdf.roundedRect(margin, y, barW, barH, 1.5, 1.5, 'F');
          // Progress bar fill
          const fillW = barW * (pct / 100);
          if (pct >= 80) pdf.setFillColor(16, 185, 129);
          else if (pct >= 60) pdf.setFillColor(59, 130, 246);
          else if (pct >= 40) pdf.setFillColor(14, 165, 233);
          else pdf.setFillColor(156, 163, 175);
          pdf.roundedRect(margin, y, fillW, barH, 1.5, 1.5, 'F');
          y += 7;
        });
      }

      // Profile matching
      if (scoreResult.debugInfo?.profileDimension) {
        const pd = scoreResult.debugInfo.profileDimension;
        const pdMatched = pd.matched || [];
        const pdUnmatched = pd.unmatched || [];
        checkPage(12);
        pdf.setFontSize(12);
        pdf.setTextColor(17, 24, 39);
        pdf.text(`画像匹配 (${pd.score} 分)`, margin, y);
        y += 6;

        // Matched keywords
        if (pdMatched.length > 0) {
          pdf.setFontSize(9);
          pdf.setTextColor(4, 120, 87);
          const matchedText = '已匹配: ' + pdMatched.join('、');
          const lines = pdf.splitTextToSize(matchedText, contentW);
          checkPage(lines.length * 4 + 2);
          pdf.text(lines, margin, y);
          y += lines.length * 4 + 2;
        }
        // Unmatched keywords
        if (pdUnmatched.length > 0) {
          pdf.setFontSize(9);
          pdf.setTextColor(107, 114, 128);
          const unmatchedText = '未匹配: ' + pdUnmatched.join('、');
          const lines = pdf.splitTextToSize(unmatchedText, contentW);
          checkPage(lines.length * 4 + 2);
          pdf.text(lines, margin, y);
          y += lines.length * 4 + 2;
        }
      }

      // Per-dimension keyword details
      if (scoreResult.debugInfo?.dimensionDetails && scoreResult.debugInfo.dimensionDetails.length > 0) {
        checkPage(10);
        pdf.setFontSize(12);
        pdf.setTextColor(17, 24, 39);
        pdf.text('各维度关键词详情', margin, y);
        y += 6;

        scoreResult.debugInfo.dimensionDetails.forEach((dd) => {
          checkPage(14);
          pdf.setFontSize(10);
          pdf.setTextColor(55, 65, 81);
          pdf.text(`${dd.dimension} (${dd.score} 分)`, margin, y);
          y += 5;

          const ddKeywords = dd.keywords || [];
            const ddMatched = dd.matched || [];
            if (ddKeywords.length > 0) {
            const matchedKw = ddKeywords.filter(k => ddMatched.includes(k));
            const unmatchedKw = ddKeywords.filter(k => !ddMatched.includes(k));
            pdf.setFontSize(9);
            if (matchedKw.length > 0) {
              pdf.setTextColor(4, 120, 87);
              const text = '✓ ' + matchedKw.join('  ✓ ');
              const lines = pdf.splitTextToSize(text, contentW);
              checkPage(lines.length * 4);
              pdf.text(lines, margin, y);
              y += lines.length * 4;
            }
            if (unmatchedKw.length > 0) {
              pdf.setTextColor(156, 163, 175);
              const text = '✗ ' + unmatchedKw.join('  ✗ ');
              const lines = pdf.splitTextToSize(text, contentW);
              checkPage(lines.length * 4);
              pdf.text(lines, margin, y);
              y += lines.length * 4;
            }
          }
          y += 3;
        });
      }

      // Candidate basic info
      checkPage(30);
      y += 4;
      pdf.setDrawColor(229, 231, 235);
      pdf.line(margin, y, pageW - margin, y);
      y += 6;
      pdf.setFontSize(12);
      pdf.setTextColor(17, 24, 39);
      pdf.text('候选人基本信息', margin, y);
      y += 6;
      pdf.setFontSize(10);
      pdf.setTextColor(55, 65, 81);
      const infoLines = [
        `姓名: ${parsedInfo?.name || candidate?.name || '未知'}`,
        `电话: ${parsedInfo?.phone || '未知'}`,
        `邮箱: ${parsedInfo?.email || '未知'}`,
        `所在地: ${parsedInfo?.location || candidate?.location || '未知'}`,
        `学历: ${[parsedInfo?.school, parsedInfo?.highestEducation, parsedInfo?.major].filter(Boolean).join(' · ') || '未知'}`,
      ];
      infoLines.forEach(line => {
        checkPage(5);
        pdf.text(line, margin, y);
        y += 5;
      });

      pdf.save(`${candidate?.name || '候选人'}_评估报告.pdf`);
    } catch (e) {
      console.error('Failed to generate PDF:', e);
      alert('生成PDF失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Download evaluation report as PNG — render hidden content then capture
  const downloadEvaluationPNG = async () => {
    if (!scoreResult) {
      alert('暂无评分数据，无法生成报告');
      return;
    }
    try {
      const S = 2; // pixel scale for retina
      const W = 780 * S;
      const M = 48 * S;       // main margin
      const CW = W - M * 2;   // content width
      const R = 12 * S;       // card radius

      const canvas = document.createElement('canvas');
      canvas.width = W;
      const ctx = canvas.getContext('2d')!;
      let y = 0;

      // ── helpers ──
      const ensure = (need: number) => {
        if (y + need > canvas.height) {
          const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
          canvas.height = y + need + 200 * S;
          ctx.fillStyle = '#f3f4f6';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.putImageData(snap, 0, 0);
        }
      };
      const rr = (x: number, ry: number, w: number, h: number, r: number, fill: string) => {
        ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, ry, w, h, r); ctx.fill();
      };
      const rrStroke = (x: number, ry: number, w: number, h: number, r: number, stroke: string, lw: number) => {
        ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.beginPath(); ctx.roundRect(x, ry, w, h, r); ctx.stroke();
      };
      const text = (txt: string, x: number, ty: number, font: string, color: string) => {
        ctx.fillStyle = color; ctx.font = font; ctx.fillText(txt, x, ty);
      };
      const wrapText = (txt: string, x: number, ty: number, maxW: number, font: string, color: string, lineH: number) => {
        ctx.fillStyle = color; ctx.font = font;
        const chars = [...txt]; let line = ''; let cy = ty;
        for (const ch of chars) {
          const test = line + ch;
          if (ctx.measureText(test).width > maxW && line) {
            ensure(lineH); ctx.fillText(line, x, cy); line = ch; cy += lineH;
          } else { line = test; }
        }
        if (line) { ensure(lineH); ctx.fillText(line, x, cy); cy += lineH; }
        return cy;
      };

      // ── init canvas ──
      canvas.height = 2000 * S;
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ════════════════════════════════════════════════════
      // HEADER BANNER
      // ════════════════════════════════════════════════════
      const bannerH = 130 * S;
      // Blue gradient banner
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#1a4bc4');
      grad.addColorStop(1, '#3b6de8');
      rr(0, 0, W, bannerH, 0, '#1a4bc4');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, bannerH);

      y = 44 * S;
      text('候选人匹配评估报告', M, y, `bold ${28 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#ffffff');
      y += 36 * S;
      text(`${candidate?.name || '候选人'}`, M, y, `bold ${22 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#ffffff');
      y += 28 * S;
      text(`${candidate?.positionName || '未关联岗位'}  ·  ${new Date().toLocaleDateString('zh-CN')}`, M, y, `${13 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, 'rgba(255,255,255,0.75)');

      y = bannerH + 24 * S;

      // ════════════════════════════════════════════════════
      // SCORE CARD
      // ════════════════════════════════════════════════════
      const cardPad = 28 * S;
      const cardH = 120 * S;
      ensure(cardH + 20 * S);
      // White card background
      rr(M, y, CW, cardH, R, '#ffffff');
      rrStroke(M, y, CW, cardH, R, '#e5e7eb', 1 * S);

      // Left: big score circle
      const circR = 42 * S;
      const circX = M + cardPad + circR;
      const circY = y + cardH / 2;
      // Circle bg
      ctx.beginPath(); ctx.arc(circX, circY, circR, 0, Math.PI * 2);
      ctx.fillStyle = '#f0f4ff'; ctx.fill();
      // Circle border
      const scoreColor = totalScore >= 80 ? '#10b981' : totalScore >= 60 ? '#3b82f6' : totalScore >= 40 ? '#0ea5e9' : '#9ca3af';
      ctx.beginPath(); ctx.arc(circX, circY, circR, 0, Math.PI * 2);
      ctx.strokeStyle = scoreColor; ctx.lineWidth = 5 * S; ctx.stroke();
      // Score text
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      text(`${totalScore}`, circX, circY - 6 * S, `bold ${32 * S}px sans-serif`, '#111827');
      text('/100', circX, circY + 18 * S, `${10 * S}px sans-serif`, '#9ca3af');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

      // Right: grade + description
      const rightX = circX + circR + 30 * S;
      const rightY = y + 34 * S;
      // Grade badge
      const gradeColor = grade === 'A' ? '#10b981' : grade === 'B+' ? '#3b82f6' : grade === 'B' ? '#0ea5e9' : '#9ca3af';
      rr(rightX, rightY, 56 * S, 28 * S, 6 * S, gradeColor);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      text(grade, rightX + 28 * S, rightY + 15 * S, `bold ${16 * S}px sans-serif`, '#ffffff');
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

      text('Fit Score 综合评分', rightX + 68 * S, rightY + 10 * S, `bold ${15 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#111827');
      text(`基于岗位「${candidate?.positionName || '未关联'}」的标准配置自动评分`, rightX, rightY + 36 * S, `${12 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#6b7280');

      y += cardH + 20 * S;

      // ════════════════════════════════════════════════════
      // SECTION: 维度得分详情
      // ════════════════════════════════════════════════════
      if (scoreResult.dimensionScores.length > 0) {
        // Section header
        text('维度得分详情', M, y + 14 * S, `bold ${16 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#111827');
        y += 32 * S;

        scoreResult.dimensionScores.forEach((ds) => {
          const pct = ds.maxScore > 0 ? Math.round((ds.score / ds.maxScore) * 100) : 0;
          const rowH = 56 * S;
          ensure(rowH + 10 * S);
          // Card bg
          rr(M, y, CW, rowH, 8 * S, '#ffffff');
          rrStroke(M, y, CW, rowH, 8 * S, '#e5e7eb', 1 * S);

          const innerX = M + 20 * S;
          const innerY = y + 18 * S;
          // Dimension name
          text(ds.dimension, innerX, innerY, `bold ${13 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#111827');
          // Score text right-aligned
          const scoreTxt = `${ds.score}/${ds.maxScore}`;
          ctx.font = `bold ${13 * S}px sans-serif`;
          const scoreW = ctx.measureText(scoreTxt).width;
          text(scoreTxt, M + CW - 20 * S - scoreW, innerY, `bold ${13 * S}px sans-serif`, '#1a4bc4');
          // Weight
          const weightTxt = `权重 ${ds.weight}%`;
          ctx.font = `${11 * S}px sans-serif`;
          const weightW = ctx.measureText(weightTxt).width;
          text(weightTxt, M + CW - 20 * S - scoreW - 12 * S - weightW, innerY, `${11 * S}px sans-serif`, '#9ca3af');

          // Progress bar
          const barY = innerY + 14 * S;
          const barW = CW - 40 * S;
          const barH = 10 * S;
          rr(innerX, barY, barW, barH, 5 * S, '#e5e7eb');
          const fillW = barW * (pct / 100);
          const fillColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#3b82f6' : pct >= 40 ? '#0ea5e9' : '#9ca3af';
          if (fillW > 0) rr(innerX, barY, fillW, barH, 5 * S, fillColor);

          y += rowH + 10 * S;
        });
      }

      // ════════════════════════════════════════════════════
      // SECTION: 画像匹配
      // ════════════════════════════════════════════════════
      if (scoreResult.debugInfo?.profileDimension) {
        const pd = scoreResult.debugInfo.profileDimension;
        const allKw = [...pd.matched.map(k => ({w: k, m: true})), ...pd.unmatched.map(k => ({w: k, m: false}))];
        if (allKw.length > 0) {
          text('画像匹配', M, y + 14 * S, `bold ${16 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#111827');
          // Score badge
          const badgeW = 48 * S;
          rr(M + 100 * S, y + 2 * S, badgeW, 18 * S, 4 * S, '#dbeafe');
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          text(`${pd.score} 分`, M + 100 * S + badgeW / 2, y + 11 * S, `bold ${11 * S}px sans-serif`, '#1a4bc4');
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          y += 30 * S;

          // Keyword tags
          const tagPadX = 12 * S;
          const tagPadY = 6 * S;
          const tagGap = 8 * S;
          const tagLineH = 28 * S;
          let tx = M + 16 * S;
          allKw.forEach(({w: kw, m}) => {
            ctx.font = `${11 * S}px "PingFang SC","Microsoft YaHei",sans-serif`;
            const tw = ctx.measureText((m ? '✓ ' : '✗ ') + kw).width + tagPadX * 2;
            if (tx + tw > M + CW - 16 * S) { tx = M + 16 * S; y += tagLineH + tagGap; ensure(tagLineH + tagGap); }
            ensure(tagLineH);
            rr(tx, y, tw, tagLineH, 6 * S, m ? '#ecfdf5' : '#f3f4f6');
            rrStroke(tx, y, tw, tagLineH, 6 * S, m ? '#a7f3d0' : '#e5e7eb', 1 * S);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            text((m ? '✓ ' : '✗ ') + kw, tx + tw / 2, y + tagLineH / 2, `${11 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, m ? '#047857' : '#9ca3af');
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            tx += tw + tagGap;
          });
          y += tagLineH + 24 * S;
        }
      }

      // ════════════════════════════════════════════════════
      // SECTION: 各维度关键词
      // ════════════════════════════════════════════════════
      if (scoreResult.debugInfo?.dimensionDetails && scoreResult.debugInfo.dimensionDetails.length > 0) {
        text('各维度关键词详情', M, y + 14 * S, `bold ${16 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#111827');
        y += 32 * S;

        scoreResult.debugInfo.dimensionDetails.forEach((dd) => {
          const matchedKw = dd.keywords.filter(k => dd.matched.includes(k));
          const unmatchedKw = dd.keywords.filter(k => !dd.matched.includes(k));
          const allDDKw = [...matchedKw.map(k => ({w: k, m: true})), ...unmatchedKw.map(k => ({w: k, m: false}))];

          // Dimension card
          const innerPad = 18 * S;
          const tagPadX2 = 10 * S;
          const tagLineH2 = 24 * S;
          const tagGap2 = 6 * S;
          // Calculate card height: header + tags rows
          let tagRows = 1; let tmpX = 0;
          ctx.font = `${10 * S}px "PingFang SC","Microsoft YaHei",sans-serif`;
          allDDKw.forEach(({w: kw}) => {
            const tw2 = ctx.measureText((matchedKw.includes(kw) ? '✓ ' : '✗ ') + kw).width + tagPadX2 * 2;
            if (tmpX + tw2 > CW - innerPad * 2 - 32 * S) { tagRows++; tmpX = 0; }
            tmpX += tw2 + tagGap2;
          });
          const cardH2 = innerPad + 20 * S + tagRows * (tagLineH2 + tagGap2) + innerPad;
          ensure(cardH2 + 10 * S);

          rr(M, y, CW, cardH2, R, '#ffffff');
          rrStroke(M, y, CW, cardH2, R, '#e5e7eb', 1 * S);

          // Header line
          const hY = y + innerPad + 13 * S;
          text(dd.dimension, M + innerPad, hY, `bold ${13 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#111827');
          const scoreStr = `${dd.score} 分`;
          ctx.font = `bold ${12 * S}px sans-serif`;
          const scW = ctx.measureText(scoreStr).width;
          text(scoreStr, M + CW - innerPad - scW, hY, `bold ${12 * S}px sans-serif`, '#1a4bc4');

          // Tags
          let tY = hY + 18 * S;
          let tX = M + innerPad;
          allDDKw.forEach(({w: kw, m: ok}) => {
            ctx.font = `${10 * S}px "PingFang SC","Microsoft YaHei",sans-serif`;
            const label = (ok ? '✓ ' : '✗ ') + kw;
            const tw3 = ctx.measureText(label).width + tagPadX2 * 2;
            if (tX + tw3 > M + CW - innerPad) { tX = M + innerPad; tY += tagLineH2 + tagGap2; }
            rr(tX, tY, tw3, tagLineH2, 5 * S, ok ? '#ecfdf5' : '#f9fafb');
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            text(label, tX + tw3 / 2, tY + tagLineH2 / 2, `${10 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, ok ? '#047857' : '#9ca3af');
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            tX += tw3 + tagGap2;
          });

          y += cardH2 + 10 * S;
        });
      }

      // ════════════════════════════════════════════════════
      // SECTION: 候选人信息
      // ════════════════════════════════════════════════════
      {
        text('候选人基本信息', M, y + 14 * S, `bold ${16 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#111827');
        y += 32 * S;

        const infoItems = [
          {label: '姓名', value: parsedInfo?.name || candidate?.name || '未知'},
          {label: '电话', value: parsedInfo?.phone || '未知'},
          {label: '邮箱', value: parsedInfo?.email || '未知'},
          {label: '所在地', value: parsedInfo?.location || candidate?.location || '未知'},
          {label: '学历', value: [parsedInfo?.school, parsedInfo?.highestEducation, parsedInfo?.major].filter(Boolean).join(' · ') || '未知'},
          {label: '在职状态', value: parsedInfo?.currentlyEmployed || '未知'},
        ];

        const infoCardH = infoItems.length * 24 * S + 24 * S;
        ensure(infoCardH);
        rr(M, y, CW, infoCardH, R, '#ffffff');
        rrStroke(M, y, CW, infoCardH, R, '#e5e7eb', 1 * S);

        const labelW = 80 * S;
        infoItems.forEach((item, idx) => {
          const iy = y + 20 * S + idx * 24 * S;
          // Label
          rr(M + 16 * S, iy - 10 * S, labelW, 18 * S, 4 * S, '#f0f4ff');
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          text(item.label, M + 16 * S + labelW / 2, iy - 1 * S, `${11 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#1a4bc4');
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          // Value
          text(item.value, M + 16 * S + labelW + 12 * S, iy, `${12 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#111827');
        });

        y += infoCardH + 20 * S;
      }

      // ════════════════════════════════════════════════════
      // FOOTER
      // ════════════════════════════════════════════════════
      y += 8 * S;
      ensure(40 * S);
      ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
      y += 16 * S;
      text(`报告生成时间: ${new Date().toLocaleString('zh-CN')}`, M, y, `${10 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#9ca3af');
      const sysName = 'EM-BOX 招聘管理系统';
      ctx.font = `${10 * S}px "PingFang SC","Microsoft YaHei",sans-serif`;
      const sysW = ctx.measureText(sysName).width;
      text(sysName, W - M - sysW, y, `${10 * S}px "PingFang SC","Microsoft YaHei",sans-serif`, '#9ca3af');
      y += 20 * S;

      // ── trim & download ──
      const trimmed = document.createElement('canvas');
      trimmed.width = W;
      trimmed.height = y + 24 * S;
      trimmed.getContext('2d')!.drawImage(canvas, 0, 0);

      const link = document.createElement('a');
      link.download = `${candidate?.name || '候选人'}_评估报告.png`;
      link.href = trimmed.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Failed to generate PNG:', e);
      alert('生成PNG失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Download original resume
  const downloadOriginalResume = () => {
    const resumeText = parsedInfo?.rawText;
    if (candidate?.originalFileBase64) {
      try {
        const byteString = atob(candidate.originalFileBase64);
        const bytes = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) {
          bytes[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = candidate.originalFileName || `${candidate.name.replace(/\s+/g, '_')}_简历.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Failed to decode resume file:', e);
        // Fallback to markdown
        const text = candidate.rawResumeMd || resumeText;
        if (text) {
          const blob = new Blob([text], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${candidate.name.replace(/\s+/g, '_')}_简历.md`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          alert('简历文件不可用');
        }
      }
    } else if (candidate?.rawResumeMd || resumeText) {
      const text = candidate.rawResumeMd || resumeText!;
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${candidate.name.replace(/\s+/g, '_')}_简历.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      alert('简历文件不可用');
    }
  };

  // Handle outreach - open email modal
  const handleInitiateOutreach = () => {
    setOutreachEmail(parsedInfo?.email || '');
    setShowOutreachModal(true);
  };

  // Build an attachment blob from candidate data
  const getAttachmentBlob = (type: 'resume' | 'report'): {blob: Blob; filename: string} | null => {
    if (type === 'resume') {
      const resumeText = parsedInfo?.rawText;
      if (candidate?.originalFileBase64) {
        try {
          const byteString = atob(candidate.originalFileBase64);
          const bytes = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
          const fname = candidate.originalFileName || `${candidate.name.replace(/\s+/g, '_')}_简历.pdf`;
          return {blob: new Blob([bytes], {type: 'application/pdf'}), filename: fname};
        } catch { /* fallback below */ }
      }
      if (candidate?.rawResumeMd || resumeText) {
        return {blob: new Blob([candidate.rawResumeMd || resumeText!], {type: 'text/markdown'}), filename: `${candidate.name.replace(/\s+/g, '_')}_简历.md`};
      }
      return null;
    } else {
      // Report — generate a simple text report
      if (!scoreResult) return null;
      const lines: string[] = [];
      lines.push(`${candidate?.name || '候选人'} — 匹配评估报告`);
      lines.push(`岗位: ${candidate?.positionName || '未关联'}`);
      lines.push(`日期: ${new Date().toLocaleDateString('zh-CN')}`);
      lines.push('');
      lines.push(`Fit Score 综合评分: ${totalScore}/100  等级: ${grade}`);
      lines.push('');
      if (scoreResult.dimensionScores.length > 0) {
        lines.push('【维度得分详情】');
        scoreResult.dimensionScores.forEach(ds => {
          const pct = ds.maxScore > 0 ? Math.round((ds.score / ds.maxScore) * 100) : 0;
          lines.push(`  ${ds.dimension}: ${ds.score}/${ds.maxScore} (权重 ${ds.weight}%, 得分率 ${pct}%)`);
        });
        lines.push('');
      }
      if (scoreResult.debugInfo?.profileDimension) {
        const pd = scoreResult.debugInfo.profileDimension;
        const pdMatched = pd.matched || [];
        const pdUnmatched = pd.unmatched || [];
        lines.push(`【画像匹配】${pd.score} 分`);
        if (pdMatched.length) lines.push(`  已匹配: ${pdMatched.join('、')}`);
        if (pdUnmatched.length) lines.push(`  未匹配: ${pdUnmatched.join('、')}`);
        lines.push('');
      }
      if (scoreResult.debugInfo?.dimensionDetails?.length) {
        lines.push('【各维度关键词】');
        scoreResult.debugInfo.dimensionDetails.forEach(dd => {
          lines.push(`  ${dd.dimension} (${dd.score} 分)`);
          (dd.keywords || []).forEach(kw => {
            lines.push(`    ${(dd.matched || []).includes(kw) ? '✓' : '✗'} ${kw}`);
          });
        });
        lines.push('');
      }
      lines.push('【候选人信息】');
      lines.push(`  姓名: ${parsedInfo?.name || candidate?.name || '未知'}`);
      lines.push(`  电话: ${parsedInfo?.phone || '未知'}`);
      lines.push(`  邮箱: ${parsedInfo?.email || '未知'}`);
      lines.push(`  所在地: ${parsedInfo?.location || candidate?.location || '未知'}`);
      return {blob: new Blob([lines.join('\n')], {type: 'text/plain'}), filename: `${candidate?.name || '候选人'}_评估报告.txt`};
    }
  };

  const handleSendOutreach = async () => {
    if (!outreachEmail.trim()) {
      alert('请输入邮箱地址');
      return;
    }
    const positionName = candidate?.positionName || '相关岗位';
    const subject = `关于${positionName}的面试邀请`;
    const bodyText = `您好 ${candidate?.name || ''}，\n\n我们对您的简历印象深刻，想就${positionName}进一步沟通。\n\n此致`;

    // Collect attachments
    const attachments: {blob: Blob; filename: string}[] = [];
    if (outreachIncludeResume) {
      const att = getAttachmentBlob('resume');
      if (att) attachments.push(att);
    }
    if (outreachIncludeReport) {
      const att = getAttachmentBlob('report');
      if (att) attachments.push(att);
    }

    if (attachments.length > 0) {
      // Build .eml file with MIME attachments that Foxmail can open
      const boundary = '----=_Part_' + Date.now();
      const parts: string[] = [];

      // Headers
      parts.push(`To: ${outreachEmail.trim()}`);
      parts.push(`Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`);
      parts.push('MIME-Version: 1.0');
      parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      parts.push('');

      // Body part
      parts.push(`--${boundary}`);
      parts.push('Content-Type: text/plain; charset=UTF-8');
      parts.push('Content-Transfer-Encoding: 8bit');
      parts.push('');
      parts.push(bodyText);

      // Attachment parts
      for (const att of attachments) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(',')[1] || '');
          };
          reader.readAsDataURL(att.blob);
        });
        const mimeMainType = att.blob.type.split('/')[0] === 'text' ? 'text/plain' : 'application/octet-stream';
        const encodedName = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(att.filename)))}?=`;
        parts.push('');
        parts.push(`--${boundary}`);
        parts.push(`Content-Type: ${mimeMainType}; name="${encodedName}"`);
        parts.push('Content-Transfer-Encoding: base64');
        parts.push(`Content-Disposition: attachment; filename="${encodedName}"`);
        parts.push('');
        // Write base64 in 76-char lines
        for (let i = 0; i < base64.length; i += 76) {
          parts.push(base64.slice(i, i + 76));
        }
      }

      parts.push('');
      parts.push(`--${boundary}--`);
      parts.push('');

      const emlContent = parts.join('\r\n');
      const emlBlob = new Blob([emlContent], {type: 'message/rfc822'});
      const url = URL.createObjectURL(emlBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${subject}.eml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Also open mailto so Foxmail composes the email
      const mailtoSubject = encodeURIComponent(subject);
      const mailtoBody = encodeURIComponent(bodyText + (attachments.length > 0 ? `\n\n附件包含：${attachments.map(a => a.filename).join('、')}，请查收。` : ''));
      window.open(`mailto:${outreachEmail.trim()}?subject=${mailtoSubject}&body=${mailtoBody}`);
    } else {
      // No attachments — simple mailto
      const mailtoSubject = encodeURIComponent(subject);
      const mailtoBody = encodeURIComponent(bodyText);
      window.open(`mailto:${outreachEmail.trim()}?subject=${mailtoSubject}&body=${mailtoBody}`);
    }
    setShowOutreachModal(false);
  };

  const handlePreview = (type: 'resume' | 'report') => {
    setPreviewType(type);
    setShowPreviewModal(true);
  };

  if (!isOpen) return null;

  // Get initials from name
  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return parts[0][0] + parts[1][0];
    }
    return name.slice(0, 2);
  };

  // Parse parsed info if available
  const parsedInfo = candidate?.resumeParsedInfo;
  const displayEmail = parsedInfo?.email || '未设置';
  const displayPhone = parsedInfo?.phone || '未设置';
  const displayLocation = parsedInfo?.location || candidate?.location || '未设置';
  const displayEducation = parsedInfo?.education || '';

  // Extract clean skill keywords from rawText
  const rawText = parsedInfo?.rawText || '';
  const displaySkills = (() => {
    if (!rawText) return candidate?.tags?.length ? candidate.tags : parsedInfo?.skills?.filter(s => s.length > 1 && !/^\d/.test(s) && !/%/.test(s)) || [];
    const skillsSection = rawText.match(/(?:专业技能|技能特长|职业技能)[：:\s]*([\s\S]*?)(?=(?:语言|工作经历|教育|项目|实习|自我评价|荣誉|\f|$))/i);
    if (!skillsSection) return candidate?.tags?.length ? candidate.tags : parsedInfo?.skills?.filter(s => s.length > 1 && !/^\d/.test(s) && !/%/.test(s)) || [];
    const text = skillsSection[1];
    const keywords: string[] = [];
    const toolMatches = text.matchAll(/(?:精通|熟练[使用掌握]*|熟悉|了解|掌握)\s*([A-Za-z0-9\u4e00-\u9fa5、,，\s]+?)(?:[，,。；;等]|\n|$)/g);
    for (const m of toolMatches) {
      const items = m[1].split(/[、,，\s]+/).filter(s => s.length >= 2 && s.length <= 15);
      keywords.push(...items);
    }
    const labelMatches = text.matchAll(/([\u4e00-\u9fa5]{2,8}(?:能力|处理|操作|分析|设计|开发|管理|编程|技术))/g);
    for (const m of labelMatches) {
      if (m[1].length <= 10) keywords.push(m[1]);
    }
    const clean = [...new Set(keywords)].filter(k => k.length >= 2 && !/^\d+$/.test(k) && !/%/.test(k) && !/[：:]/.test(k));
    if (clean.length > 0) return clean.slice(0, 10);
    return candidate?.tags?.length ? candidate.tags : parsedInfo?.skills?.filter(s => s.length > 1 && !/^\d/.test(s) && !/%/.test(s)) || [];
  })();

  // Extract work experience from rawText: company + role + period
  const displayExperience = (() => {
    if (!rawText) return parsedInfo?.workExperience?.length ? parsedInfo.workExperience : [];
    const workSection = rawText.split(/工作经历/).pop() || '';
    // Stop at education/internship sections
    const cleanWork = workSection.split(/(?:教育经历|实习经历|专业技能|自我评价|\f)/)[0] || '';
    const entries: {period: string; company: string; role: string; desc: string}[] = [];
    const companyIndicators = /(?:公司|集团|科技|有限|股份|研究院|事务所|实验室|工作室)/;
    const workLines = cleanWork.split('\n').map(l => l.trim()).filter(Boolean);
    let i = 0;
    while (i < workLines.length) {
      const line = workLines[i];
      // Detect company line
      if (line.length >= 4 && line.length <= 40 && (companyIndicators.test(line) || (line === 'iconvey'))) {
        const company = line;
        let role = '';
        let period = '';
        let desc: string[] = [];
        // Look ahead for role and period
        for (let j = i + 1; j < Math.min(i + 8, workLines.length); j++) {
          const next = workLines[j];
          if (companyIndicators.test(next) && next !== company) break; // next company
          if (/^\d{4}[.\-]/.test(next) && !period) { period = next; continue; }
          if (!role && next.length >= 2 && next.length <= 20 && !/^(内容|业绩|项目|描述)/.test(next)) {
            role = next;
          } else if (next.length > 10 && !/^(内容|业绩)[：:]/.test(next)) {
            desc.push(next);
          }
        }
        entries.push({period, company, role, desc: desc.join(' ')});
        i++;
      } else {
        i++;
      }
    }
    if (entries.length > 0) return entries;
    return parsedInfo?.workExperience?.length ? parsedInfo.workExperience : [];
  })();

  // Build radar data from scoreResult — includes profile matching + 6 skill dimensions
  const profileWeight = scoreResult?.debugInfo?.profileWeight ?? 50;
  const radarData = scoreResult
    ? [
        // 画像匹配维度（第一个轴）
        ...(scoreResult.debugInfo?.profileDimension ? [{
          subject: `画像匹配=${scoreResult.debugInfo.profileDimension.score}`,
          A: scoreResult.debugInfo.profileDimension.score,
          fullMark: profileWeight,
        }] : []),
        // 技能与经验匹配维度
        ...scoreResult.dimensionScores.map((d) => ({
          subject: `${d.dimension}=${d.score}`,
          A: d.score,
          fullMark: d.maxScore,
        })),
      ]
    : [
        { subject: 'TD=0', A: 0, fullMark: 100 },
        { subject: 'PE=0', A: 0, fullMark: 100 },
        { subject: 'JF=0', A: 0, fullMark: 100 },
      ];

  const totalScore = scoreResult?.totalScore ?? candidate?.fitScore?.[0] ?? 0;
  const grade = candidate?.grade || 'C';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-[640px] max-h-[90vh] flex flex-col relative z-10 overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 rounded-full z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="overflow-y-auto w-full flex-1 scrollbar-hide">
          <div className="p-8">

            {/* Header section */}
            <div className="flex items-start mb-6">
              <div className="w-16 h-16 rounded-full bg-[#1a4bc4] flex items-center justify-center text-white text-2xl font-bold mr-5 flex-shrink-0 shadow-sm">
                {candidate ? getInitials(candidate.name) : '??'}
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{candidate?.name || '未知'}</h2>
                <div className="text-gray-600 dark:text-gray-300 font-medium mb-1">{propPositionDetail?.position.name || candidate?.positionName || candidate?.roles?.[0] || '未分配岗位'}</div>
                <div className="text-gray-500 dark:text-gray-400 text-sm flex items-center">
                  {displayLocation}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3 mb-6">
              <button
                onClick={handleInitiateOutreach}
                className="border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 text-gray-700 dark:text-gray-300 px-5 py-2 rounded-lg text-sm font-medium transition-colors bg-white dark:bg-gray-800"
              >
                发起外联
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                  className="border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 text-gray-700 dark:text-gray-300 px-5 py-2 rounded-lg text-sm font-medium transition-colors bg-white dark:bg-gray-800 flex items-center"
                >
                  <Download className="w-4 h-4 mr-2" />
                  下载
                  <MoreHorizontal className="w-4 h-4 ml-2" />
                </button>
                {showDownloadMenu && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 min-w-[200px]">
                    <button
                      onClick={() => { setShowDownloadMenu(false); handlePreview('report'); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      预览匹配评估报告
                    </button>
                    <div className="border-t border-gray-100 dark:border-gray-700" />
                    <button
                      onClick={() => { downloadEvaluationPDF(); setShowDownloadMenu(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      下载匹配评估报告 (PDF)
                    </button>
                    <button
                      onClick={() => { downloadEvaluationPNG(); setShowDownloadMenu(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      下载匹配评估报告 (PNG)
                    </button>
                    <div className="border-t border-gray-100 dark:border-gray-700" />
                    <button
                      onClick={() => { downloadOriginalResume(); setShowDownloadMenu(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                    >
                      下载原始简历 (PDF)
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => handlePreview('report')}
                className="border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-white dark:bg-gray-800 flex items-center"
                title="预览简历和评估报告"
              >
                <Eye className="w-4 h-4 mr-1.5" />
                预览
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 w-full">
              {[
                { key: 'profile' as const, label: '档案信息' },
                { key: 'fit' as const, label: 'Fit Score' },
                { key: 'outreach' as const, label: '外联记录' },
                { key: 'notes' as const, label: '备注' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-[#1a4bc4] text-[#1a4bc4]'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'profile' && (
              <div className="space-y-8 pb-4">

                {/* Basic Info & Radar */}
                <div className="flex flex-col md:flex-row gap-8">
                  <div className="flex-1 space-y-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">基本信息</h3>
                    <div className="grid grid-cols-[100px_1fr] gap-y-3 text-sm">
                      <div className="text-gray-500 dark:text-gray-400">姓名</div>
                      <div className="text-gray-900 dark:text-white font-medium">{parsedInfo?.name || candidate?.name || '未知'}</div>

                      <div className="text-gray-500 dark:text-gray-400">年龄</div>
                      <div className="text-gray-900 dark:text-white">{parsedInfo?.ageOrBirth || '未知'}</div>

                      <div className="text-gray-500 dark:text-gray-400">性别</div>
                      <div className="text-gray-900 dark:text-white">{parsedInfo?.gender || '未知'}</div>

                      <div className="text-gray-500 dark:text-gray-400">电话</div>
                      <div className="text-gray-900 dark:text-white">{displayPhone}</div>

                      <div className="text-gray-500 dark:text-gray-400">邮箱</div>
                      <div className="text-gray-900 dark:text-white">{displayEmail}</div>

                      <div className="text-gray-500 dark:text-gray-400">所在地</div>
                      <div className="text-gray-900 dark:text-white">{displayLocation}</div>

                      <div className="text-gray-500 dark:text-gray-400">在职状态</div>
                      <div className={`text-gray-900 ${parsedInfo?.currentlyEmployed === '在职' ? 'text-emerald-600' : 'text-amber-600'}`}>{parsedInfo?.currentlyEmployed || '未知'}</div>

                      {(parsedInfo?.school || parsedInfo?.highestEducation || parsedInfo?.major) && (
                        <>
                          <div className="text-gray-500 dark:text-gray-400">教育背景</div>
                          <div className="text-gray-900 dark:text-white">
                            {[
                              parsedInfo?.school,
                              parsedInfo?.highestEducation,
                              parsedInfo?.major,
                            ].filter(Boolean).join(' · ')}
                            {parsedInfo?.educationTime && <span className="text-gray-400 dark:text-gray-500 ml-2">({parsedInfo.educationTime})</span>}
                          </div>
                        </>
                      )}

                      {parsedInfo?.expectedSalary && (
                        <>
                          <div className="text-gray-500 dark:text-gray-400">期望薪资</div>
                          <div className="text-gray-900 dark:text-white">{parsedInfo.expectedSalary}</div>
                        </>
                      )}
                    </div>

                    {candidate?.honors && candidate.honors.length > 0 && (
                      <div className="mt-4">
                        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">证书荣誉</div>
                        <div className="flex flex-wrap gap-2">
                          {candidate.honors.map((h, i) => (
                            <span key={i} className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-xs">{h}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="w-[180px] flex flex-col items-center">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white w-full text-center">综合评分</h3>
                    <div className="h-[140px] w-[140px] -mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="60%" data={radarData}>
                          <PolarGrid gridType="polygon" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} />
                          <Radar name="Candidate" dataKey="A" stroke="#1a4bc4" fill="#1a4bc4" fillOpacity={0.3} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-center mt-0">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{totalScore}<span className="text-gray-500 dark:text-gray-400 text-xs font-normal">/100</span></div>
                      <div className="text-2xl font-bold text-[#1a4bc4] leading-none">{grade}</div>
                    </div>
                  </div>
                </div>

                {/* Background & Skills */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">专业技能</h3>
                  <div className="flex flex-wrap gap-2">
                    {displaySkills.map((skill, i) => (
                      <span key={i} className="px-3 py-1.5 bg-[#1a4bc4] text-white rounded-full text-xs font-medium">
                        {skill}
                      </span>
                    ))}
                    {displaySkills.length === 0 && (
                      <span className="text-gray-500 dark:text-gray-400 text-sm">暂无技能信息</span>
                    )}
                  </div>
                </div>

                {/* Experience */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">工作经验</h3>
                  {displayExperience.length > 0 ? (
                    <div className="space-y-4 pl-2">
                      {displayExperience.map((exp, i) => {
                        if (typeof exp === 'object') {
                          const e = exp as {period: string; company: string; role: string; desc: string};
                          return (
                            <div key={i} className="relative pl-6 border-l-2 border-[#1a4bc4]/30">
                              <div className="absolute w-3 h-3 bg-[#1a4bc4] rounded-full -left-[7px] top-1.5 ring-4 ring-white"></div>
                              <div className="text-sm text-gray-900 dark:text-white font-medium">{e.company}</div>
                              {e.role && <div className="text-sm text-[#1a4bc4] font-medium mt-0.5">{e.role}</div>}
                              {e.period && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{e.period}</div>}
                              {e.desc && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{e.desc}</div>}
                            </div>
                          );
                        }
                        return (
                          <div key={i} className="relative pl-6 border-l-2 border-[#1a4bc4]/30">
                            <div className="absolute w-3 h-3 bg-[#1a4bc4] rounded-full -left-[7px] top-1.5 ring-4 ring-white"></div>
                            <div className="text-sm text-gray-900 dark:text-white font-medium">{exp as string}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-gray-500 dark:text-gray-400 text-sm">暂无工作经验信息</div>
                  )}
                </div>

                              </div>
            )}

            {activeTab === 'fit' && (
              <div className="space-y-6 pb-4">
                {/* Score Overview */}
                <div className="flex items-center gap-6">
                  <div className="flex flex-col items-center">
                    <div className={`w-24 h-24 rounded-full border-4 ${candidate?.scoreColor || 'border-[#0EA5E9]'} flex items-center justify-center`}>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalScore}</div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400">/100</div>
                      </div>
                    </div>
                    <div className="mt-2 text-lg font-bold text-[#1a4bc4]">{grade}</div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Fit Score 综合评分</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      基于岗位「{candidate?.positionName || '未关联'}」的标准配置自动评分
                    </p>
                    <div className="mt-3 flex gap-2">
                      <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded">
                        {candidate?.positionName || '未关联岗位'}
                      </span>
                      <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded">
                        {candidate?.source}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Radar Chart */}
                {radarData.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 flex flex-col items-center">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4">评分维度雷达图</h4>
                    <div className="h-[200px] w-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                          <PolarGrid gridType="polygon" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} />
                          <Radar name="Score" dataKey="A" stroke="#1a4bc4" fill="#1a4bc4" fillOpacity={0.3} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Dimension Details */}
                {scoreResult && scoreResult.dimensionScores.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">维度得分详情</h4>
                    <div className="space-y-3">
                      {scoreResult.dimensionScores.map((ds, i) => {
                        const pct = ds.maxScore > 0 ? Math.round((ds.score / ds.maxScore) * 100) : 0;
                        return (
                          <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{ds.dimension}</span>
                              <span className="text-sm text-gray-600 dark:text-gray-300">
                                {ds.score}/{ds.maxScore}
                                <span className="text-gray-400 dark:text-gray-500 ml-1">(权重 {ds.weight}%)</span>
                              </span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-[#3B82F6]' : pct >= 40 ? 'bg-[#0EA5E9]' : 'bg-gray-400'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 画像匹配关键词 */}
                {scoreResult?.debugInfo?.profileDimension && (
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold text-blue-900">画像匹配</h4>
                      <span className="text-sm font-bold text-blue-700">{scoreResult.debugInfo.profileDimension.score} 分</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {/* Matched profile keywords */}
                      {scoreResult.debugInfo.profileDimension.matched.map((kw, i) => (
                        <span key={`m${i}`} className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                          ✓ {kw}
                        </span>
                      ))}
                      {/* Unmatched profile keywords */}
                      {scoreResult.debugInfo.profileDimension.unmatched.map((kw, i) => (
                        <span key={`u${i}`} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-medium line-through">
                          ✗ {kw}
                        </span>
                      ))}
                      {scoreResult.debugInfo.profileDimension.matched.length === 0 && scoreResult.debugInfo.profileDimension.unmatched.length === 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">暂无画像关键词</span>
                      )}
                    </div>
                  </div>
                )}

                {/* 各维度关键词细项 */}
                {scoreResult?.debugInfo?.dimensionDetails && scoreResult.debugInfo.dimensionDetails.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">各维度关键词</h4>
                    <div className="space-y-3">
                      {scoreResult.debugInfo.dimensionDetails.map((dd, i) => (
                        <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{dd.dimension}</span>
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{dd.score} 分</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {dd.keywords.map((kw, j) => {
                              const isMatched = dd.matched.includes(kw);
                              return (
                                <span key={j} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  isMatched ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
                                }`}>
                                  {isMatched ? '✓' : '✗'} {kw}
                                </span>
                              );
                            })}
                            {dd.keywords.length === 0 && (
                              <span className="text-xs text-gray-400 dark:text-gray-500">无关键词配置</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!scoreResult && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-8 text-center">
                    <AlertCircle className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">该候选人未关联岗位配置，无法计算 Fit Score。</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">请导入简历时选择岗位，或在人才库中关联岗位。</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'outreach' && (
              <div className="py-6 space-y-6">
                {outreachLoading ? (
                  <div className="py-12 text-center text-gray-500 dark:text-gray-400">加载中...</div>
                ) : outreachRecords.length === 0 && contactRecords.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 dark:text-gray-400">暂无沟通和联系记录</div>
                ) : (
                  <>
                    {/* Outreach records */}
                    {outreachRecords.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">沟通记录</h4>
                        <div className="space-y-3">
                          {outreachRecords.map((record) => (
                            <div key={record.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  record.channel === 'phone' ? 'bg-blue-100 text-blue-700' :
                                  record.channel === 'wechat' ? 'bg-emerald-100 text-emerald-700' :
                                  record.channel === 'email' ? 'bg-indigo-100 text-indigo-700' :
                                  record.channel === 'interview' ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {record.channel === 'phone' ? '电话' : record.channel === 'wechat' ? '微信' : record.channel === 'email' ? '邮件' : record.channel === 'interview' ? '面试' : '其他'}
                                </span>
                                <span className={`text-xs ${
                                  record.status === 'contacted' ? 'text-blue-600' :
                                  record.status === 'responded' ? 'text-emerald-600' :
                                  record.status === 'pending' ? 'text-amber-600' : 'text-red-600'
                                }`}>
                                  {record.status === 'contacted' ? '已联系' : record.status === 'responded' ? '已回复' : record.status === 'pending' ? '待联系' : '未接通'}
                                </span>
                              </div>
                              {record.content && (
                                <div className="text-sm text-gray-600 dark:text-gray-300 mb-2 line-clamp-2">{record.content}</div>
                              )}
                              <div className="text-xs text-gray-400 dark:text-gray-500">{new Date(record.createdAt).toLocaleString('zh-CN')}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Contact tracking records */}
                    {contactRecords.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">联系推进记录</h4>
                        <div className="space-y-3">
                          {contactRecords.map((contact) => {
                            const statusOpt = [
                              {value: 'pending', label: '待联系', color: 'bg-amber-100 text-amber-700'},
                              {value: 'contacted', label: '已联系', color: 'bg-blue-100 text-blue-700'},
                              {value: 'responded', label: '已回复', color: 'bg-emerald-100 text-emerald-700'},
                              {value: 'interview_scheduled', label: '已安排面试', color: 'bg-purple-100 text-purple-700'},
                              {value: 'hired', label: '已入职', color: 'bg-green-100 text-green-700'},
                              {value: 'rejected', label: '已拒绝', color: 'bg-gray-100 text-gray-500'},
                            ].find(s => s.value === contact.status);
                            const channelLabel: Record<string, string> = {wechat: '微信', email: '邮件', phone: '电话'};
                            return (
                              <div key={contact.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusOpt?.color ?? 'bg-gray-100 text-gray-700'}`}>
                                      {statusOpt?.label ?? contact.status}
                                    </span>
                                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                      {channelLabel[contact.channel] ?? contact.channel}
                                    </span>
                                  </div>
                                  <span className="text-xs text-gray-400">{new Date(contact.createdAt).toLocaleString('zh-CN')}</span>
                                </div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">
                                  {contact.positionName && <span>岗位：{contact.positionName}</span>}
                                  {contact.projectName && <span className="ml-3 text-gray-500">项目：{contact.projectName}</span>}
                                </div>
                                {contact.reason && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{contact.reason}</div>
                                )}
                                {contact.outreachPerson && (
                                  <div className="text-xs text-gray-400 mt-1">推进人：{contact.outreachPerson}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                此标签页内容尚未实现
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Outreach Modal */}
      {showOutreachModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[420px] max-w-[90vw] p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">发起外联</h3>
              <button onClick={() => setShowOutreachModal(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">邮箱地址</label>
                <input
                  type="email"
                  value={outreachEmail}
                  onChange={e => setOutreachEmail(e.target.value)}
                  placeholder="请输入候选人邮箱"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">附件选项</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={outreachIncludeResume}
                      onChange={e => setOutreachIncludeResume(e.target.checked)}
                      className="w-4 h-4 accent-[#1a4bc4]"
                    />
                    原始简历
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={outreachIncludeReport}
                      onChange={e => setOutreachIncludeReport(e.target.checked)}
                      className="w-4 h-4 accent-[#1a4bc4]"
                    />
                    匹配评估报告
                  </label>
                </div>
                {(outreachIncludeResume || outreachIncludeReport) && (
                  <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-[11px] text-blue-700 leading-relaxed">
                    附件将以 .eml 格式保存到本地，双击用 Foxmail 打开即可带附件发送。
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowOutreachModal(false)}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSendOutreach}
                className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a] transition-colors"
              >
                发送邮件
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {previewType === 'resume' ? '原始简历' : '匹配评估报告'}
              </h3>
              <div className="flex items-center gap-3">
                {previewType === 'resume' ? (
                  <button onClick={downloadOriginalResume} className="text-sm text-[#1a4bc4] hover:underline flex items-center gap-1">
                    <Download className="w-4 h-4" />
                    下载简历
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={downloadEvaluationPDF} className="text-sm text-[#1a4bc4] hover:underline">
                      下载 PDF
                    </button>
                    <span className="text-gray-300">|</span>
                    <button onClick={downloadEvaluationPNG} className="text-sm text-[#1a4bc4] hover:underline">
                      下载 PNG
                    </button>
                  </div>
                )}
                <button onClick={() => setShowPreviewModal(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {previewType === 'resume' ? (
                <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {parsedInfo?.rawText || '暂无简历内容'}
                </div>
              ) : (
                <div ref={evaluationRef} className="bg-white dark:bg-gray-800">
                  {/* Full evaluation report — always rendered for preview & download */}
                  <div className="space-y-6">
                    {/* Score Overview */}
                    <div className="flex items-center gap-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex flex-col items-center">
                        <div className={`w-24 h-24 rounded-full border-4 ${candidate?.scoreColor || 'border-[#0EA5E9]'} flex items-center justify-center`}>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalScore}</div>
                            <div className="text-[10px] text-gray-500 dark:text-gray-400">/100</div>
                          </div>
                        </div>
                        <div className="mt-2 text-lg font-bold text-[#1a4bc4]">{grade}</div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Fit Score 综合评分</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          基于岗位「{candidate?.positionName || '未关联'}」的标准配置自动评分
                        </p>
                        <div className="mt-3 flex gap-2">
                          <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded">
                            {candidate?.positionName || '未关联岗位'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Radar chart */}
                    {radarData.length > 0 && (
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4">评分维度雷达图</h4>
                        <ResponsiveContainer width="100%" height={280}>
                          <RadarChart data={radarData}>
                            <PolarGrid gridType="polygon" />
                            <PolarAngleAxis dataKey="subject" tick={{fontSize: 12, fill: '#6B7280'}} />
                            <Radar name="匹配得分" dataKey="A" stroke="#1a4bc4" fill="#1a4bc4" fillOpacity={0.25} />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Dimension score details with progress bars */}
                    {scoreResult && scoreResult.dimensionScores.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">维度得分详情</h4>
                        <div className="space-y-3">
                          {scoreResult.dimensionScores.map((ds, i) => {
                            const pct = ds.maxScore > 0 ? Math.round((ds.score / ds.maxScore) * 100) : 0;
                            return (
                              <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">{ds.dimension}</span>
                                  <span className="text-sm text-gray-600 dark:text-gray-300">
                                    {ds.score}/{ds.maxScore}
                                    <span className="text-gray-400 dark:text-gray-500 ml-1">(权重 {ds.weight}%)</span>
                                  </span>
                                </div>
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-[#3B82F6]' : pct >= 40 ? 'bg-[#0EA5E9]' : 'bg-gray-400'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Profile matching */}
                    {scoreResult?.debugInfo?.profileDimension && (() => {
                      const pd = scoreResult.debugInfo.profileDimension;
                      const kwList = [...pd.matched.map(k => ({keyword: k, matched: true})), ...pd.unmatched.map(k => ({keyword: k, matched: false}))];
                      return kwList.length > 0 ? (
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-bold text-blue-900">画像匹配</h4>
                            <span className="text-sm font-bold text-blue-700">{pd.score} 分</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {pd.matched.map((kw, i) => (
                              <span key={`m${i}`} className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                                ✓ {kw}
                              </span>
                            ))}
                            {pd.unmatched.map((kw, i) => (
                              <span key={`u${i}`} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-medium line-through">
                                ✗ {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}

                    {/* Per-dimension keyword chips */}
                    {scoreResult?.debugInfo?.dimensionDetails && scoreResult.debugInfo.dimensionDetails.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3">各维度关键词</h4>
                        <div className="space-y-3">
                          {scoreResult.debugInfo.dimensionDetails.map((dim, i) => (
                            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">{dim.dimension}</span>
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{dim.score} 分</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {dim.keywords.map((kw, j) => {
                                  const isMatched = dim.matched.includes(kw);
                                  return (
                                    <span key={j} className={`text-xs px-2 py-0.5 rounded-full font-medium ${isMatched ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                                      {isMatched ? '✓' : '✗'} {kw}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No score result fallback */}
                    {!scoreResult && (
                      <div className="text-center text-gray-400 dark:text-gray-500 py-12">
                        该候选人未关联岗位配置，无法生成评估报告。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
