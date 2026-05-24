import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { Search, Plus, Box, PlayCircle, ChevronDown, CheckCircle2, Circle, ChevronRight, Edit2, Trash2, Minus, X, Users, Clock, CheckSquare, Send, FileText, BarChart2, Play, Pause, AlertCircle, Eye, Loader2, Upload } from 'lucide-react';
import { navigateToPage } from './navigation';
import {
  listInterviewTemplates,
  getInterviewTemplateDetail,
  createInterviewTemplate,
  updateInterviewTemplate,
  deleteInterviewTemplate,
  saveInterviewQuestions,
  deleteInterviewQuestion,
} from './modules/interviews/api';
import { type InterviewTemplateSummary, type InterviewTemplateDetail, type InterviewQuestion, type ScoringConfig, type GradeRule, type ScoringDimension } from './modules/interviews/types';
import { ConfirmDialog } from './shared/components/ConfirmDialog';
import { listPositions } from './modules/positions/api';
import { type PositionSummary } from './modules/positions/types';

// Import page components
import { InterviewManagementPage } from './modules/interviews/pages/InterviewManagementPage';
import { InterviewResultsPage } from './modules/interviews/pages/InterviewResultsPage';
import { InterviewAnalyticsPage } from './modules/interviews/pages/InterviewAnalyticsPage';

type TabType = 'config' | 'management' | 'results' | 'analytics';

export const AIInterviewPage = () => {
  const [templates, setTemplates] = useState<InterviewTemplateSummary[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('config');
  const [isEditing, setIsEditing] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InterviewTemplateSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Positions list for template dialog dropdown
  const [positions, setPositions] = useState<PositionSummary[]>([]);

  // Template detail with questions
  const [templateDetail, setTemplateDetail] = useState<InterviewTemplateDetail | null>(null);

  // Delete confirmation dialog
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Editable questions state (local copy for editing)
  const [editQuestions, setEditQuestions] = useState<{
    title: string; prompt: string; timeLimitSeconds: number;
    group: string; followUps: string[];
    scoringGuide: {standard: string; rubric: {label: string; score: string}[]};
    linkedDimensions: string[];
  }[]>([]);

  // Scoring config state
  const [editScoringConfig, setEditScoringConfig] = useState<ScoringConfig>({dimensions: [], baseScore: 50, baseRequirements: []});
  const [editGradeRules, setEditGradeRules] = useState<GradeRule[]>([]);

  const [templateSearch, setTemplateSearch] = useState('');
  const [autoPlayWelcome, setAutoPlayWelcome] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState('您好，欢迎参加EM-BOX动作采集演员AI面试。本次面试约需15分钟，请确保环境安静、光线充足。');
  const [prepTime, setPrepTime] = useState('30');
  const [forceAnswer, setForceAnswer] = useState(true);

  // Hidden file input ref for MD import
  const mdFileInputRef = useRef<HTMLInputElement>(null);

  const [templateFormData, setTemplateFormData] = useState({
    name: '',
    positionId: '',
    duration: '15-20分钟',
    passingScore: '75分',
    status: 'draft' as 'draft' | 'active' | 'inactive',
  });

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
    listPositions().then(setPositions).catch(() => {});
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await listInterviewTemplates();
      setTemplates(data);
      if (data.length > 0 && !activeTemplateId) {
        setActiveTemplateId(data[0].id);
      }
    } catch (e) {
      console.error('Failed to load templates:', e);
    } finally {
      setLoading(false);
    }
  };

  // Load template detail when active changes
  useEffect(() => {
    if (activeTemplateId) {
      loadTemplateDetail(activeTemplateId);
    } else {
      setTemplateDetail(null);
      setEditQuestions([]);
    }
  }, [activeTemplateId]);

  const loadTemplateDetail = async (id: string) => {
    try {
      const detail = await getInterviewTemplateDetail(id);
      setTemplateDetail(detail);
      if (detail) {
        setEditQuestions((detail.questions ?? []).map(q => ({
          title: q.title,
          prompt: q.prompt,
          timeLimitSeconds: q.timeLimitSeconds,
          group: q.group ?? '',
          followUps: q.followUps ?? [],
          scoringGuide: q.scoringGuide ?? {standard: '', rubric: []},
          linkedDimensions: q.linkedDimensions ?? [],
        })));
        setEditScoringConfig(detail.template.scoringConfig ?? {dimensions: [], baseScore: 50, baseRequirements: []});
        setEditGradeRules(detail.template.gradeRules ?? []);
      }
    } catch (e) {
      console.error('Failed to load template detail:', e);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === activeTemplateId) || null;

  // Safe defaults for scoring config (may be undefined before template loads)
  const safeScoringConfig: ScoringConfig = editScoringConfig ?? {dimensions: [], baseScore: 50, baseRequirements: []};
  const safeScoringConfigDims = safeScoringConfig.dimensions ?? [];
  const safeScoringConfigReqs = safeScoringConfig.baseRequirements ?? [];
  const safeGradeRules: GradeRule[] = editGradeRules ?? [];

  // Question handlers
  const handleQuestionChange = (index: number, field: string, value: unknown) => {
    setEditQuestions(prev => prev.map((q, i) => {
      if (i === index) return { ...q, [field]: value };
      return q;
    }));
  };

  const handleFollowUpChange = (qIdx: number, fuIdx: number, value: string) => {
    setEditQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const updated = [...(q.followUps ?? [])];
      updated[fuIdx] = value;
      return {...q, followUps: updated};
    }));
  };

  const handleAddFollowUp = (qIdx: number) => {
    setEditQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      return {...q, followUps: [...(q.followUps ?? []), '']};
    }));
  };

  const handleRemoveFollowUp = (qIdx: number, fuIdx: number) => {
    setEditQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      return {...q, followUps: (q.followUps ?? []).filter((_, fi) => fi !== fuIdx)};
    }));
  };

  const handleRubricChange = (qIdx: number, rIdx: number, field: 'label' | 'score', value: string) => {
    setEditQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const rubric = [...(q.scoringGuide?.rubric ?? [])];
      rubric[rIdx] = {...rubric[rIdx], [field]: value};
      return {...q, scoringGuide: {...(q.scoringGuide ?? {standard: '', rubric: []}), rubric}};
    }));
  };

  const handleAddRubric = (qIdx: number) => {
    setEditQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      return {...q, scoringGuide: {...(q.scoringGuide ?? {standard: '', rubric: []}), rubric: [...(q.scoringGuide?.rubric ?? []), {label: '', score: ''}]}};
    }));
  };

  const handleRemoveRubric = (qIdx: number, rIdx: number) => {
    setEditQuestions(prev => prev.map((q, i) => {
      if (i !== qIdx) return q;
      return {...q, scoringGuide: {...(q.scoringGuide ?? {standard: '', rubric: []}), rubric: (q.scoringGuide?.rubric ?? []).filter((_, ri) => ri !== rIdx)}};
    }));
  };

  const handleAddQuestion = () => {
    setEditQuestions(prev => [...prev, {
      title: '新题目', prompt: '请输入题目内容', timeLimitSeconds: 120,
      group: '', followUps: [], scoringGuide: {standard: '', rubric: []}, linkedDimensions: [],
    }]);
  };

  const handleRemoveQuestion = (index: number) => {
    setEditQuestions(prev => prev.filter((_, i) => i !== index));
  };

  // ---------------------------------------------------------------------------
  // MD Import: Parse structured interview assessment document
  // Supports the format from 面试测评题 documents:
  //   ## 一、专业能力验证（3题）         ← group heading (## 二级标题)
  //   ### Q1 — 数据标注/采集经验深度验证  ← question heading (### 三级标题)
  //   **提问：** > "问题内容"             ← main prompt
  //   **追问：** > "追问内容"             ← follow-ups (multiple allowed)
  //   **对应评分维度：** 维度1(经验对口度)  ← linked dimensions
  //   **评分指引：** + table              ← scoring guide rubric
  //   **答题时限：** 120秒                ← time limit
  //   ## 面试评分汇总表                   ← scoring config section
  //     维度N 名称 | +N分                 ← dimension definitions
  //     档位: A >=80 B+ 70-79 ...         ← grade rules
  //   ## 基础分配置                       ← base score + requirements
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // MD Import: Parse structured interview assessment document
  // Parses a human-readable interview assessment MD into structured data.
  // All output text is cleaned of MD symbols for interviewer readability.
  // ---------------------------------------------------------------------------

  type ParsedImport = {
    questions: {
      title: string; prompt: string; timeLimitSeconds: number;
      group: string; followUps: string[];
      scoringGuide: {standard: string; rubric: {label: string; score: string}[]};
      linkedDimensions: string[];
    }[];
    scoringConfig: {dimensions: {id: string; name: string; maxScore: number}[]; baseScore: number; baseRequirements: string[]};
    gradeRules: {grade: string; minScore: number; maxScore: number; label: string}[];
  };

  // Clean MD symbols from text for human readability
  const cleanMd = (text: string): string => {
    return text
      .replace(/^>\s*/gm, '')           // blockquote markers
      .replace(/\*\*/g, '')             // bold markers
      .replace(/\*/g, '')               // italic markers
      .replace(/[""\u201C\u201D]/g, '') // Chinese/smart quotes
      .replace(/^---+$/gm, '')          // horizontal rules
      .replace(/^\|.*\|$/gm, '')        // table lines
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
      .replace(/`([^`]+)`/g, '$1')     // inline code → text
      .replace(/<[^>]+>/g, '')          // HTML tags
      .replace(/\s{2,}/g, ' ')         // multiple spaces
      .trim();
  };

  // Clean a single line for inline content (prompt, follow-up, etc.)
  const cleanLine = (text: string): string => {
    return text
      .replace(/^>\s*/, '')
      .replace(/\*\*[^*]*\*\*/g, '')   // bold markers with content already extracted
      .replace(/\*\*/g, '')
      .replace(/[""\u201C\u201D]/g, '')
      .trim();
  };

  const parseMdToStructured = (md: string): ParsedImport => {
    const result: ParsedImport = {
      questions: [],
      scoringConfig: {dimensions: [], baseScore: 0, baseRequirements: []},
      gradeRules: [],
    };

    // --- Phase 1: Parse scoring config from summary table ---
    const dimRegex = /\|\s*维度(\d+)\s+(.+?)\s*\|\s*[+]*(\d+)\s*\|/;
    const baseRegex = /\|\s*基础分[（(].*?[)）]\s*\|\s*(\d+)\s*\|/;

    const allLines = md.split('\n');
    let inSummaryTable = false;

    for (const line of allLines) {
      if (line.includes('面试评分汇总表') || line.includes('评分汇总')) {
        inSummaryTable = true;
        continue;
      }

      // Dimensions: | 维度1 经验对口度 | +20 |
      const dimMatch = line.match(dimRegex);
      if (dimMatch) {
        result.scoringConfig.dimensions.push({
          id: `d${dimMatch[1]}`,
          name: dimMatch[2].trim(),
          maxScore: parseInt(dimMatch[3], 10),
        });
        continue;
      }

      // Base score: | 基础分（必备项通过） | 50 |
      const baseMatch = line.match(baseRegex);
      if (baseMatch) {
        result.scoringConfig.baseScore = parseInt(baseMatch[1], 10);
        continue;
      }

      // Base requirements: Q1经验验证 + Q4耐心态度 + Q6排班出勤
      if (line.includes('必备项') && line.includes('Q')) {
        const reqs = line.match(/Q\d+[^\sQ]*/g);
        if (reqs) {
          result.scoringConfig.baseRequirements = reqs.map(r => r.trim().replace(/[，。、]/g, ''));
        }
      }

      // Grade rules: □A ≥80 □B+ 70-79 □B 60-69 □C <60
      if (line.includes('档位') && (line.includes('≥') || line.includes('>=') || /\d+\s*-\s*\d+/.test(line))) {
        const chunks = line.split(/[□■☐]/).filter(c => c.trim());
        for (const chunk of chunks) {
          const m = chunk.match(/([A-Z]+[+]?)\s*([≥>=<≤]*)\s*(\d+)\s*[-–—~]?\s*(\d+)?/);
          if (m) {
            const grade = m[1];
            const op = m[2];
            const num1 = parseInt(m[3], 10);
            const num2 = m[4] ? parseInt(m[4], 10) : undefined;
            let min = 0, max = 100;
            if (num2 !== undefined) { min = num1; max = num2; }
            else if (op === '<' || op === '≤') { min = 0; max = num1 - 1; }
            else { min = num1; max = 100; }
            result.gradeRules.push({grade, minScore: min, maxScore: max, label: ''});
          }
        }
        result.gradeRules.sort((a, b) => b.minScore - a.minScore);
        inSummaryTable = false;
        continue;
      }

      if (inSummaryTable && line.startsWith('#') && !line.includes('评分')) {
        inSummaryTable = false;
      }
    }

    // --- Phase 2: Parse questions ---
    // Pre-scan h2 headings to build group ranges
    const groupRanges: {start: number; end: number; name: string}[] = [];
    const h2Regex = /^##\s+(.+)$/gm;
    let h2Match: RegExpExecArray | null;
    const h2Positions: {pos: number; name: string}[] = [];
    while ((h2Match = h2Regex.exec(md)) !== null) {
      const raw = h2Match[1];
      const name = raw.replace(/^[一二三四五六七八九十]+[、.]\s*/, '').replace(/（.*?）|\(.*?\)/g, '').trim();
      if (name.includes('评分') || name.includes('汇总') || name.includes('流程') || name.includes('差异') || name.includes('建议')) continue;
      h2Positions.push({pos: h2Match.index, name});
    }
    for (let i = 0; i < h2Positions.length; i++) {
      groupRanges.push({
        start: h2Positions[i].pos,
        end: i + 1 < h2Positions.length ? h2Positions[i + 1].pos : md.length,
        name: h2Positions[i].name,
      });
    }

    // Split by ### headings for questions
    const h3Sections = md.split(/^###\s+/m).slice(1);

    for (const section of h3Sections) {
      const secLines = section.split('\n');
      let title = secLines[0].replace(/^#+\s*/, '').trim();
      if (!title) continue;
      // Remove Q-prefix: "Q1 — 数据标注/采集经验深度验证" → "数据标注/采集经验深度验证"
      title = title.replace(/^Q\d+\s*[—\-–]\s*/, '').trim();

      // Find group
      const sectionOffset = md.indexOf(section.substring(0, 30));
      let currentGroup = '';
      for (const gr of groupRanges) {
        if (sectionOffset >= gr.start && sectionOffset < gr.end) { currentGroup = gr.name; break; }
      }

      let prompt = '';
      const promptLines: string[] = [];
      const followUps: string[] = [];
      let timeLimitSeconds = 120;
      const rubric: {label: string; score: string}[] = [];
      let scoringStandard = '';
      let linkedDimIds: string[] = [];

      // State machine for parsing sections
      let mode: 'idle' | 'prompt' | 'followup' | 'scoring' = 'idle';
      let rubricHeadersSkipped = false;

      for (let i = 1; i < secLines.length; i++) {
        const trimmed = secLines[i].trim();

        // --- Section markers ---
        if (trimmed.match(/\*\*提问[：:]\*\*/)) {
          mode = 'prompt';
          // Inline prompt after marker
          const inline = trimmed.replace(/\*\*提问[：:]\*\*\s*/, '');
          if (inline) promptLines.push(cleanLine(inline));
          continue;
        }
        if (trimmed.match(/\*\*追问/)) {
          mode = 'followup';
          const inline = trimmed.replace(/\*\*追问[^*]*\*\*\s*/, '');
          if (inline && inline.startsWith('>')) {
            followUps.push(cleanLine(inline));
          } else if (inline) {
            followUps.push(cleanLine(inline));
          }
          continue;
        }
        if (trimmed.match(/\*\*对应评分维度[：:]\*\*/)) {
          mode = 'idle';
          const dimsText = trimmed.replace(/\*\*对应评分维度[：:]\*\*\s*/, '');
          const dimRefs = dimsText.match(/维度(\d+)/g);
          if (dimRefs) linkedDimIds = dimRefs.map(d => `d${d.replace('维度', '')}`);
          // Also match dimension names in parentheses
          const dimNames = dimsText.match(/[（(](.+?)[)）]/g);
          if (dimNames) {
            for (const name of dimNames) {
              const clean = name.replace(/[()（）]/g, '').trim();
              const existing = result.scoringConfig.dimensions.find(d => clean.includes(d.name) || d.name.includes(clean));
              if (existing && !linkedDimIds.includes(existing.id)) linkedDimIds.push(existing.id);
            }
          }
          continue;
        }
        if (trimmed.match(/\*\*评分指引[：:]\*\*/)) {
          mode = 'scoring'; rubricHeadersSkipped = false;
          continue;
        }
        if (trimmed.match(/\*\*考察目标[：:]\*\*/)) {
          mode = 'idle';
          const text = cleanMd(trimmed.replace(/\*\*考察目标[：:]\*\*\s*/, ''));
          if (text) scoringStandard = text;
          continue;
        }
        if (trimmed.match(/\*\*答题时限[：:]\*\*/) || trimmed.match(/时限[：:]/)) {
          const timeMatch = trimmed.match(/(\d+)\s*(秒|s|Sec|分钟|min)/i);
          if (timeMatch) {
            let val = parseInt(timeMatch[1], 10);
            if (/分钟|min/i.test(timeMatch[2])) val *= 60;
            timeLimitSeconds = val;
          }
          continue;
        }

        // --- Content collection based on mode ---
        if (mode === 'scoring') {
          if (trimmed.startsWith('|') && trimmed.includes('|')) {
            if (trimmed.match(/^\|\s*[-:|]+\s*\|$/)) { rubricHeadersSkipped = true; continue; }
            if (!rubricHeadersSkipped && (trimmed.includes('表现') || trimmed.includes('判定'))) { rubricHeadersSkipped = true; continue; }
            const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
            if (cells.length >= 2) {
              rubric.push({label: cleanMd(cells[0]), score: cleanMd(cells[1])});
            }
            continue;
          }
          if (trimmed === '' || trimmed.startsWith('---')) { mode = 'idle'; continue; }
        }

        if (mode === 'prompt' && trimmed.startsWith('>')) {
          const text = cleanLine(trimmed);
          if (text) promptLines.push(text);
          continue;
        }
        if (mode === 'followup' && trimmed.startsWith('>')) {
          const text = cleanLine(trimmed);
          if (text) followUps.push(text);
          continue;
        }

        // End prompt/followup on non-quote lines
        if ((mode === 'prompt' || mode === 'followup') && !trimmed.startsWith('>') && trimmed !== '') {
          mode = 'idle';
        }
      }

      // Build clean prompt from collected lines
      prompt = promptLines.join('\n').trim() || title;

      result.questions.push({
        title,
        prompt,
        timeLimitSeconds,
        group: currentGroup,
        followUps,
        scoringGuide: {standard: scoringStandard, rubric},
        linkedDimensions: linkedDimIds,
      });
    }

    return result;
  };


  const handleImportMd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;
      const parsed = parseMdToStructured(content);
      if (parsed.questions.length > 0) {
        setEditQuestions(prev => [...prev, ...parsed.questions]);
        // Fill scoring config if parsed
        if (parsed.scoringConfig.dimensions.length > 0) {
          setEditScoringConfig(parsed.scoringConfig);
        }
        if (parsed.gradeRules.length > 0) {
          setEditGradeRules(parsed.gradeRules);
        }
      } else {
        alert('未能从文件中识别出面试题目。\\n请确保使用 ### 作为题目标题（如：### Q1 — 题目名称）。');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = '';
  };


  // Template dialog handlers
  const handleOpenCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateFormData({ name: '', positionId: '', duration: '15-20分钟', passingScore: '75分', status: 'draft' });
    setShowTemplateDialog(true);
  };

  const handleOpenEditTemplate = (tpl: InterviewTemplateSummary) => {
    setEditingTemplate(tpl);
    setTemplateFormData({
      name: tpl.name,
      positionId: tpl.positionId || '',
      duration: `${tpl.durationMinutes}分钟`,
      passingScore: '75分',
      status: tpl.status,
    });
    setShowTemplateDialog(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateFormData.name.trim()) return;
    setSaving(true);
    try {
      if (editingTemplate) {
        await updateInterviewTemplate(editingTemplate.id, {
          name: templateFormData.name,
          positionId: templateFormData.positionId,
          status: templateFormData.status,
        });
      } else {
        const newTpl = await createInterviewTemplate({
          name: templateFormData.name,
          positionId: templateFormData.positionId,
        });
        setActiveTemplateId(newTpl.id);
        setIsEditing(true); // Auto-enter edit mode for new template
      }
      setShowTemplateDialog(false);
      await loadTemplates();
    } catch (e) {
      console.error('Failed to save template:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteInterviewTemplate(id);
      if (activeTemplateId === id) {
        setActiveTemplateId(templates.length > 1 ? templates.find(t => t.id !== id)?.id || null : null);
      }
      await loadTemplates();
    } catch (e) {
      console.error('Failed to delete template:', e);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleSaveQuestions = async () => {
    if (!activeTemplateId) return;
    setSaving(true);
    try {
      await saveInterviewQuestions(activeTemplateId, editQuestions);
      await updateInterviewTemplate(activeTemplateId, {
        scoringConfig: editScoringConfig,
        gradeRules: editGradeRules,
      });
      setIsEditing(false);
      await loadTemplateDetail(activeTemplateId);
      await loadTemplates();
    } catch (e) {
      console.error('Failed to save questions:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleStartPreview = async () => {
    if (!activeTemplateId) return;

    // Auto-save unsaved questions before previewing
    if (isEditing && editQuestions.length > 0) {
      try {
        await saveInterviewQuestions(activeTemplateId, editQuestions);
        setIsEditing(false);
        await loadTemplateDetail(activeTemplateId);
        await loadTemplates();
      } catch (e) {
        console.error('Failed to auto-save questions:', e);
      }
    }

    // Check if template has questions
    const detail = await getInterviewTemplateDetail(activeTemplateId);
    if (!detail || (detail.questions ?? []).length === 0) {
      alert('当前模板暂无面试题目，请先添加题目后再预览。');
      return;
    }

    // Navigate to video interview with template ID
    const route = '/interviews/preview?templateId=' + activeTemplateId;
    window.history.pushState({}, '', route);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Tab configuration
  const tabs = [
    { id: 'config' as TabType, label: '面试配置' },
    { id: 'management' as TabType, label: '面试管理' },
    { id: 'results' as TabType, label: '面试结果' },
    { id: 'analytics' as TabType, label: '数据分析' },
  ];

  // Tab change handler for sub-pages
  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  // Filtered templates based on search
  const filteredTemplates = templates.filter(tpl =>
    tpl.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  // Render different content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'management':
        return <InterviewManagementPage isEmbedded onTabChange={handleTabChange} />;
      case 'results':
        return <InterviewResultsPage isEmbedded onTabChange={handleTabChange} />;
      case 'analytics':
        return <InterviewAnalyticsPage isEmbedded onTabChange={handleTabChange} />;
      default:
        return renderConfigContent();
    }
  };

  const renderConfigContent = () => {
    if (!selectedTemplate) {
      return (
        <div className="flex flex-1">
          {/* Left Column - Template Library */}
          <div className="w-[280px] bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 flex flex-col">
            <div className="p-5 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900 dark:text-white text-lg">面试模板库</h2>
                <button onClick={handleOpenCreateTemplate} className="p-1.5 bg-[#22d3ee] hover:bg-[#06b6d4] text-white rounded-lg transition-colors" title="新建面试模板">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="搜索面试模板..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/20 focus:border-[#22d3ee] transition-all placeholder-gray-400 dark:placeholder-gray-500 dark:text-white"
                />
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute right-3 top-3" />
              </div>
            </div>
            <div className="flex-1" />
          </div>
          <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">暂无面试模板</p>
              <p className="text-sm">请点击左上角 + 按钮创建</p>
            </div>
          </div>
        </div>
      );
    }

    return (
    <div className="flex flex-1">
      {/* Left Column - Template Library */}
      <div className="w-[280px] bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700 flex flex-col">
        <div className="p-5 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 dark:text-white text-lg">面试模板库</h2>
            <button onClick={handleOpenCreateTemplate} className="p-1.5 bg-[#22d3ee] hover:bg-[#06b6d4] text-white rounded-lg transition-colors" title="新建面试模板">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="搜索面试模板..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#22d3ee]/20 focus:border-[#22d3ee] transition-all placeholder-gray-400 dark:placeholder-gray-500 dark:text-white"
            />
            <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute right-3 top-3" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1 pb-20">
          {filteredTemplates.map(tpl => (
            <div key={tpl.id} className="group relative">
              <button
                onClick={() => { setActiveTemplateId(tpl.id); setIsEditing(false); }}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm transition-all ${
                  activeTemplateId === tpl.id
                    ? 'bg-[#cffafe] text-[#22d3ee] font-bold border border-[#a5f3fc]'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 border border-transparent font-medium'
                }`}
              >
                <span className="truncate pr-2 text-left">{tpl.name}</span>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  tpl.status === 'active' ? 'bg-[#10B981]' :
                  tpl.status === 'draft' ? 'bg-[#F59E0B]' : 'bg-gray-300'
                }`}></div>
              </button>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleOpenEditTemplate(tpl)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                  <Edit2 className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                </button>
                <button onClick={() => setDeleteConfirmId(tpl.id)} className="p-1 hover:bg-red-100 rounded">
                  <Trash2 className="w-3 h-3 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right - Editor Area */}
      <div className="flex-1 bg-white dark:bg-gray-800 overflow-y-auto custom-scrollbar relative flex">
        <div className="flex-1 p-8 pb-32">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedTemplate.name}</h2>
            <div className="flex items-center space-x-2">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center px-4 py-2 bg-[#22d3ee] hover:bg-[#06b6d4] text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Edit2 className="w-4 h-4 mr-1.5" />
                  编辑题目
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSaveQuestions}
                    disabled={saving}
                    className="flex items-center px-4 py-2 bg-[#22d3ee] hover:bg-[#06b6d4] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckSquare className="w-4 h-4 mr-1.5" />}
                    {saving ? '保存中...' : '保存题目'}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      // Revert to saved state
                      if (templateDetail) {
                        setEditQuestions((templateDetail.questions ?? []).map(q => ({
                          title: q.title, prompt: q.prompt, timeLimitSeconds: q.timeLimitSeconds,
                          group: q.group ?? '', followUps: q.followUps ?? [],
                          scoringGuide: q.scoringGuide ?? {standard: '', rubric: []},
                          linkedDimensions: q.linkedDimensions ?? [],
                        })));
                        setEditScoringConfig(templateDetail.template.scoringConfig ?? {dimensions: [], baseScore: 50, baseRequirements: []});
                        setEditGradeRules(templateDetail.template.gradeRules ?? []);
                      }
                    }}
                    className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    取消
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-8 pb-4 border-b border-gray-100 dark:border-gray-700">
            面试配置 / {selectedTemplate.name}
            <span className="ml-3 text-gray-400 dark:text-gray-500">| 题目数: {editQuestions.length} | 时长: {selectedTemplate.durationMinutes}分钟</span>
          </div>

          {/* Questions Section */}
          <div className="mb-8">
            <div className="flex items-center text-[#22d3ee] font-bold text-[15px] mb-4">
              <div className="w-5 h-5 bg-[#22d3ee] rounded text-white flex items-center justify-center mr-2 text-xs">1</div>
              面试题库配置
            </div>

            <div className="space-y-4 pr-4">
              {editQuestions.map((q, qIdx) => (
                <div key={qIdx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                    <span className="font-bold text-gray-900 dark:text-white text-sm">题目 {qIdx + 1}: {q.title}</span>
                    {isEditing && (
                      <button onClick={() => handleRemoveQuestion(qIdx)} className="p-1 hover:bg-red-100 rounded">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    )}
                  </div>
                  <div className="p-4 bg-white space-y-2 text-sm">
                    <div className="flex items-center">
                      <span className="text-gray-500 w-24">题目名称:</span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={q.title ?? ""}
                          onChange={(e) => handleQuestionChange(qIdx, 'title', e.target.value)}
                          className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                        />
                      ) : (
                        <span className="text-gray-900 font-medium">{q.title}</span>
                      )}
                    </div>
                    <div className="flex items-start">
                      <span className="text-gray-500 w-24">题目内容:</span>
                      {isEditing ? (
                        <textarea
                          value={q.prompt ?? ""}
                          onChange={(e) => handleQuestionChange(qIdx, 'prompt', e.target.value)}
                          className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm resize-none"
                          rows={2}
                        />
                      ) : (
                        <span className="text-gray-900">{q.prompt}</span>
                      )}
                    </div>
                    <div className="flex items-center">
                      <span className="text-gray-500 w-24">答题时限:</span>
                      {isEditing ? (
                        <div className="flex items-center space-x-1">
                          <input
                            type="number"
                            value={q.timeLimitSeconds}
                            onChange={(e) => handleQuestionChange(qIdx, 'timeLimitSeconds', parseInt(e.target.value) || 60)}
                            className="border border-gray-200 rounded px-2 py-1 text-sm w-20"
                            min={30}
                            max={600}
                          />
                          <span className="text-gray-500 text-xs">秒</span>
                        </div>
                      ) : (
                        <span className="text-gray-900 font-medium">{formatTimeDisplay(q.timeLimitSeconds)}</span>
                      )}
                    </div>
                    {/* Group */}
                    <div className="flex items-center">
                      <span className="text-gray-500 w-24">题目分组:</span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={q.group ?? ""}
                          onChange={(e) => handleQuestionChange(qIdx, 'group', e.target.value)}
                          className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                          placeholder="如：专业能力验证"
                        />
                      ) : (
                        <span className="text-gray-900">{q.group || '\u2014'}</span>
                      )}
                    </div>
                    {/* Linked Dimensions */}
                    <div className="flex items-start">
                      <span className="text-gray-500 w-24">关联维度:</span>
                      {isEditing ? (
                        <div className="flex-1 flex flex-wrap gap-1">
                          {safeScoringConfigDims.map(dim => (
                            <label key={dim.id} className="flex items-center space-x-1 bg-gray-50 rounded px-2 py-0.5 text-xs">
                              <input
                                type="checkbox"
                                checked={(q.linkedDimensions ?? []).includes(dim.id)}
                                onChange={(e) => {
                                  const dims = e.target.checked
                                    ? [...(q.linkedDimensions ?? []), dim.id]
                                    : (q.linkedDimensions ?? []).filter(d => d !== dim.id);
                                  handleQuestionChange(qIdx, 'linkedDimensions', dims);
                                }}
                              />
                              <span>{dim.name}</span>
                            </label>
                          ))}
                          {safeScoringConfigDims.length === 0 && <span className="text-gray-400 text-xs">请先在评分配置中添加评分维度</span>}
                        </div>
                      ) : (
                        <span className="text-gray-900">{(q.linkedDimensions ?? []).map(id => safeScoringConfigDims.find(d => d.id === id)?.name).filter(Boolean).join('\u3001') || '\u2014'}</span>
                      )}
                    </div>
                    {/* Follow-ups */}
                    {(isEditing || (q.followUps?.length ?? 0) > 0) && (
                      <div className="flex items-start">
                        <span className="text-gray-500 w-24">追问:</span>
                        <div className="flex-1 space-y-1">
                          {(q.followUps ?? []).map((fu, fuIdx) => (
                            <div key={fuIdx} className="flex items-center gap-1">
                              {isEditing ? (
                                <>
                                  <input
                                    type="text"
                                    value={fu ?? ""}
                                    onChange={(e) => handleFollowUpChange(qIdx, fuIdx, e.target.value)}
                                    className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                                    placeholder={`追问${fuIdx + 1}`}
                                  />
                                  <button onClick={() => handleRemoveFollowUp(qIdx, fuIdx)} className="p-0.5 hover:bg-red-100 rounded">
                                    <Minus className="w-3 h-3 text-red-400" />
                                  </button>
                                </>
                              ) : (
                                <span className="text-gray-700">{fu}</span>
                              )}
                            </div>
                          ))}
                          {isEditing && (
                            <button onClick={() => handleAddFollowUp(qIdx)} className="text-[#22d3ee] text-xs flex items-center gap-0.5">
                              <Plus className="w-3 h-3" /> 添加追问
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Scoring Guide */}
                    {(isEditing || (q.scoringGuide?.rubric?.length ?? 0) > 0) && (
                      <div className="flex items-start">
                        <span className="text-gray-500 w-24">评分指引:</span>
                        <div className="flex-1 space-y-1">
                          {isEditing && (
                            <input
                              type="text"
                              value={q.scoringGuide?.standard ?? ""}
                              onChange={(e) => handleQuestionChange(qIdx, 'scoringGuide', {...(q.scoringGuide ?? {standard: "", rubric: []}), standard: e.target.value})}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-sm mb-1"
                              placeholder="评分标准说明"
                            />
                          )}
                          {(q.scoringGuide?.rubric ?? []).map((r, rIdx) => (
                            <div key={rIdx} className="flex items-center gap-1 text-xs">
                              {isEditing ? (
                                <>
                                  <input
                                    type="text"
                                    value={r.label ?? ""}
                                    onChange={(e) => handleRubricChange(qIdx, rIdx, 'label', e.target.value)}
                                    className="flex-1 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
                                    placeholder="表现描述"
                                  />
                                  <input
                                    type="text"
                                    value={r.score ?? ""}
                                    onChange={(e) => handleRubricChange(qIdx, rIdx, 'score', e.target.value)}
                                    className="w-24 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
                                    placeholder="判定/分值"
                                  />
                                  <button onClick={() => handleRemoveRubric(qIdx, rIdx)} className="p-0.5 hover:bg-red-100 rounded">
                                    <Minus className="w-3 h-3 text-red-400" />
                                  </button>
                                </>
                              ) : (
                                <span className="text-gray-700">{r.label} \u2192 {r.score}</span>
                              )}
                            </div>
                          ))}
                          {isEditing && (
                            <button onClick={() => handleAddRubric(qIdx)} className="text-[#22d3ee] text-xs flex items-center gap-0.5">
                              <Plus className="w-3 h-3" /> 添加评分项
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isEditing && (
                <>
                  <input
                    ref={mdFileInputRef}
                    type="file"
                    accept=".md,.markdown,.txt"
                    onChange={handleImportMd}
                    className="hidden"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleAddQuestion}
                      className="flex-1 border border-dashed border-[#22d3ee] text-[#22d3ee] rounded-lg py-3 text-sm font-medium flex items-center justify-center hover:bg-[#cffafe] transition-colors"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      添加题目
                    </button>
                    <button
                      onClick={() => mdFileInputRef.current?.click()}
                      className="flex-1 border border-dashed border-[#1a4bc4] text-[#1a4bc4] rounded-lg py-3 text-sm font-medium flex items-center justify-center hover:bg-blue-50 transition-colors"
                    >
                      <Upload className="w-4 h-4 mr-1.5" />
                      导入MD文件
                    </button>
                  </div>
                </>
              )}

              {editQuestions.length === 0 && !isEditing && (
                <div className="text-center py-8 text-gray-400">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">暂无题目，请点击「编辑题目」添加</p>
                </div>
              )}
            </div>
          </div>

          {/* Scoring Config Section */}
          <div className="mb-8">
            <div className="flex items-center text-[#22d3ee] font-bold text-[15px] mb-4">
              <div className="w-5 h-5 bg-[#22d3ee] rounded text-white flex items-center justify-center mr-2 text-xs">2</div>
              面试评分配置
            </div>
            <div className="space-y-6 pr-4">
              {/* Scoring Dimensions */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex justify-between items-center border-b border-gray-200">
                  <span className="font-bold text-gray-900 text-sm">评分维度</span>
                  {isEditing && (
                    <button
                      onClick={() => setEditScoringConfig(prev => ({
                        ...prev,
                        dimensions: [...(prev.dimensions ?? []), {id: `d${Date.now()}`, name: '', maxScore: 10}]
                      }))}
                      className="text-[#22d3ee] text-xs flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> 添加维度
                    </button>
                  )}
                </div>
                <div className="p-4 bg-white">
                  {safeScoringConfigDims.length === 0 ? (
                    <div className="text-center py-4 text-gray-400 text-sm">
                      {isEditing ? '点击上方「添加维度」配置评分维度' : '暂未配置评分维度'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {safeScoringConfigDims.map((dim, dIdx) => (
                        <div key={dim.id} className="flex items-center gap-2">
                          <span className="text-gray-500 text-xs w-8">维度{dIdx + 1}</span>
                          {isEditing ? (
                            <>
                              <input
                                type="text"
                                value={dim.name ?? ""}
                                onChange={(e) => {
                                  const dims = [...safeScoringConfigDims];
                                  dims[dIdx] = {...dims[dIdx], name: e.target.value};
                                  setEditScoringConfig(prev => ({...prev, dimensions: dims}));
                                }}
                                className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                                placeholder="维度名称，如：经验对口度"
                              />
                              <input
                                type="number"
                                value={dim.maxScore}
                                onChange={(e) => {
                                  const dims = [...safeScoringConfigDims];
                                  dims[dIdx] = {...dims[dIdx], maxScore: parseInt(e.target.value) || 0};
                                  setEditScoringConfig(prev => ({...prev, dimensions: dims}));
                                }}
                                className="w-20 border border-gray-200 rounded px-2 py-1 text-sm"
                                min={0}
                              />
                              <span className="text-gray-500 text-xs">分</span>
                              <button
                                onClick={() => setEditScoringConfig(prev => ({
                                  ...prev, dimensions: (prev.dimensions ?? []).filter((_, i) => i !== dIdx)
                                }))}
                                className="p-0.5 hover:bg-red-100 rounded"
                              >
                                <Minus className="w-3 h-3 text-red-400" />
                              </button>
                            </>
                          ) : (
                            <span className="text-gray-900 text-sm">{dim.name}（满分 {dim.maxScore} 分）</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Base Score + Requirements */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <span className="font-bold text-gray-900 text-sm">基础分与必备项</span>
                </div>
                <div className="p-4 bg-white space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-700 text-sm w-20">基础分:</span>
                    {isEditing ? (
                      <input
                        type="number"
                        value={safeScoringConfig.baseScore}
                        onChange={(e) => setEditScoringConfig(prev => ({...prev, baseScore: parseInt(e.target.value) || 0}))}
                        className="w-20 border border-gray-200 rounded px-2 py-1 text-sm"
                        min={0}
                      />
                    ) : (
                      <span className="text-gray-900 font-medium">{safeScoringConfig.baseScore} 分</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-700 text-sm">必备项（通过必备项才获得基础分）:</span>
                    <div className="mt-2 space-y-1">
                      {safeScoringConfigReqs.map((req, rIdx) => (
                        <div key={rIdx} className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <input
                                type="text"
                                value={req}
                                onChange={(e) => {
                                  const reqs = [...safeScoringConfigReqs];
                                  reqs[rIdx] = e.target.value;
                                  setEditScoringConfig(prev => ({...prev, baseRequirements: reqs}));
                                }}
                                className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
                                placeholder="必备项名称"
                              />
                              <button
                                onClick={() => setEditScoringConfig(prev => ({
                                  ...prev, baseRequirements: (prev.baseRequirements ?? []).filter((_, i) => i !== rIdx)
                                }))}
                                className="p-0.5 hover:bg-red-100 rounded"
                              >
                                <Minus className="w-3 h-3 text-red-400" />
                              </button>
                            </>
                          ) : (
                            <span className="text-gray-900 text-sm flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-green-500" /> {req}
                            </span>
                          )}
                        </div>
                      ))}
                      {isEditing && (
                        <button
                          onClick={() => setEditScoringConfig(prev => ({
                            ...prev, baseRequirements: [...(prev.baseRequirements ?? []), '']
                          }))}
                          className="text-[#22d3ee] text-xs flex items-center gap-0.5 mt-1"
                        >
                          <Plus className="w-3 h-3" /> 添加必备项
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Grade Rules */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex justify-between items-center border-b border-gray-200">
                  <span className="font-bold text-gray-900 text-sm">档位规则</span>
                  {isEditing && (
                    <button
                      onClick={() => setEditGradeRules(prev => [...(prev ?? []), {grade: '', minScore: 0, maxScore: 0, label: ''}])}
                      className="text-[#22d3ee] text-xs flex items-center gap-0.5"
                    >
                      <Plus className="w-3 h-3" /> 添加档位
                    </button>
                  )}
                </div>
                <div className="p-4 bg-white">
                  {safeGradeRules.length === 0 ? (
                    <div className="text-center py-4 text-gray-400 text-sm">
                      {isEditing ? '点击上方「添加档位」配置分数档位规则' : '暂未配置档位规则'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {safeGradeRules.map((rule, rIdx) => (
                        <div key={rIdx} className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <span className="text-gray-500 text-xs w-8">档位{rIdx + 1}</span>
                              <input
                                type="text"
                                value={rule.grade ?? ""}
                                onChange={(e) => {
                                  const rules = [...safeGradeRules];
                                  rules[rIdx] = {...rules[rIdx], grade: e.target.value};
                                  setEditGradeRules(rules);
                                }}
                                className="w-16 border border-gray-200 rounded px-2 py-1 text-sm"
                                placeholder="等级"
                              />
                              <input
                                type="number"
                                value={rule.minScore}
                                onChange={(e) => {
                                  const rules = [...safeGradeRules];
                                  rules[rIdx] = {...rules[rIdx], minScore: parseInt(e.target.value) || 0};
                                  setEditGradeRules(rules);
                                }}
                                className="w-16 border border-gray-200 rounded px-2 py-1 text-sm"
                                min={0}
                              />
                              <span className="text-gray-400 text-xs">-</span>
                              <input
                                type="number"
                                value={rule.maxScore}
                                onChange={(e) => {
                                  const rules = [...safeGradeRules];
                                  rules[rIdx] = {...rules[rIdx], maxScore: parseInt(e.target.value) || 0};
                                  setEditGradeRules(rules);
                                }}
                                className="w-16 border border-gray-200 rounded px-2 py-1 text-sm"
                                min={0}
                              />
                              <span className="text-gray-500 text-xs">分</span>
                              <input
                                type="text"
                                value={rule.label ?? ""}
                                onChange={(e) => {
                                  const rules = [...safeGradeRules];
                                  rules[rIdx] = {...rules[rIdx], label: e.target.value};
                                  setEditGradeRules(rules);
                                }}
                                className="w-20 border border-gray-200 rounded px-2 py-1 text-sm"
                                placeholder="标签"
                              />
                              <button
                                onClick={() => setEditGradeRules(prev => (prev ?? []).filter((_, i) => i !== rIdx))}
                                className="p-0.5 hover:bg-red-100 rounded"
                              >
                                <Minus className="w-3 h-3 text-red-400" />
                              </button>
                            </>
                          ) : (
                            <span className="text-gray-900 text-sm">
                              <span className="font-bold">{rule.grade || '\u2014'}</span>
                              {' '}({rule.minScore}-{rule.maxScore}分) {rule.label}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Interview Flow Settings */}
          <div className="mb-8">
            <div className="flex items-center text-[#22d3ee] font-bold text-[15px] mb-4">
              <div className="w-5 h-5 bg-[#22d3ee] rounded text-white flex items-center justify-center mr-2 text-xs">3</div>
              面试流程配置
            </div>
            <div className="grid grid-cols-2 gap-8 px-2">
              <div className="space-y-4">
                <div>
                  <div className="font-bold text-gray-900 text-sm mb-2">开场设置</div>
                  <label className="flex items-center space-x-2 text-sm text-gray-700 mb-3">
                    <input type="checkbox" checked={autoPlayWelcome} onChange={() => setAutoPlayWelcome(!autoPlayWelcome)} className="rounded text-[#22d3ee] focus:ring-[#22d3ee]" />
                    <span>自动播放欢迎视频</span>
                  </label>
                  <div className="flex items-start">
                    <span className="w-16 text-gray-700 font-medium text-sm mt-1">欢迎语:</span>
                    <textarea className="flex-1 border border-gray-200 rounded-md p-2 text-sm text-gray-700 h-20 resize-none bg-gray-50" value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)}></textarea>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className="w-16 text-gray-700 font-medium text-sm">准备时间:</span>
                  <select value={prepTime} onChange={(e) => setPrepTime(e.target.value)} className="border border-gray-200 rounded-md px-3 py-1.5 text-sm w-32 outline-none">
                    <option value="15">15秒/阅读题目</option>
                    <option value="30">30秒/阅读题目</option>
                    <option value="60">60秒/阅读题目</option>
                  </select>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="font-bold text-gray-900 text-sm mb-2">答题设置</div>
                  <div className="flex items-center mb-2">
                    <span className="w-24 text-gray-700 font-medium text-sm">每题答题时长:</span>
                    <span className="text-gray-900 text-sm">按题目设定</span>
                  </div>
                  <div className="flex items-center mb-2">
                    <span className="w-24 text-gray-700 font-medium text-sm">允许重新录制:</span>
                    <span className="text-gray-900 text-sm">是</span>
                  </div>
                  <div className="flex items-center mb-3">
                    <span className="w-24 text-gray-700 font-medium text-sm">最多重录次数:</span>
                    <span className="text-gray-900 text-sm">2次</span>
                  </div>
                  <label className="flex items-center space-x-2 text-sm text-gray-700">
                    <input type="checkbox" checked={forceAnswer} onChange={() => setForceAnswer(!forceAnswer)} className="rounded text-[#22d3ee]" />
                    <span>强制答题: 必须回答所有题目</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF] dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#22d3ee] animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">正在加载面试配置...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF] dark:from-gray-900 dark:to-gray-800 flex flex-col font-sans">
      {/* Top Bar */}
      <div className="p-6 flex items-center">
        <div className="w-8 h-8 bg-gradient-to-br from-[#1a4bc4] to-[#6366F1] rounded flex items-center justify-center mr-3">
          <Box className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold text-gray-900 dark:text-white">EM-BOX recruiting platform</span>
      </div>

      {/* Page Header */}
      <div className="text-center mb-8">
        <h1 className="text-[44px] font-extrabold text-gray-900 dark:text-white tracking-tight mb-4">AI面试中心</h1>
        <p className="text-[20px] text-gray-700 dark:text-gray-300">配置智能面试题库与评分规则</p>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex justify-center space-x-4 mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-2.5 rounded-lg text-lg font-bold transition-colors ${
              activeTab === tab.id
                ? 'bg-[#22d3ee] text-white shadow-md'
                : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-700/50 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="max-w-[1600px] w-full mx-auto bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-xl flex flex-1 mb-8 overflow-hidden border border-white dark:border-gray-700">
        {renderContent()}
      </div>

      {/* Bottom Actions - only show in config mode */}
      {activeTab === 'config' && (
        <div className="absolute bottom-0 left-0 w-full bg-white border-t border-gray-100 p-4 px-8 flex items-center space-x-4 shadow-[0_-4px_10px_rgb(0,0,0,0.02)]">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveQuestions}
                disabled={saving}
                className="bg-[#22d3ee] hover:bg-[#06b6d4] text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存配置'}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  if (templateDetail) {
                    setEditQuestions((templateDetail.questions ?? []).map(q => ({
                      title: q.title, prompt: q.prompt, timeLimitSeconds: q.timeLimitSeconds,
                      group: q.group ?? '', followUps: q.followUps ?? [],
                      scoringGuide: q.scoringGuide ?? {standard: '', rubric: []},
                      linkedDimensions: q.linkedDimensions ?? [],
                    })));
                    setEditScoringConfig(templateDetail.template.scoringConfig ?? {dimensions: [], baseScore: 50, baseRequirements: []});
                    setEditGradeRules(templateDetail.template.gradeRules ?? []);
                  }
                }}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-2 rounded-lg font-bold text-sm transition-colors"
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleStartPreview}
                disabled={!activeTemplateId}
                className="bg-[#22d3ee] hover:bg-[#06b6d4] text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
              >
                预览面试
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-2 rounded-lg font-bold text-sm transition-colors"
              >
                编辑题目
              </button>
            </>
          )}
        </div>
      )}

      {/* Create/Edit Template Dialog */}
      {showTemplateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">{editingTemplate ? '编辑面试模板' : '新建面试模板'}</h3>
              <button onClick={() => setShowTemplateDialog(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1">模板名称 *</label>
                <input
                  type="text"
                  value={templateFormData.name}
                  onChange={(e) => setTemplateFormData({...templateFormData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#22d3ee]"
                  placeholder="如：MWV-全身动捕演员面试"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1">适用岗位</label>
                <select
                  value={templateFormData.positionId}
                  onChange={(e) => setTemplateFormData({...templateFormData, positionId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#22d3ee] bg-white"
                >
                  <option value="">不关联岗位</option>
                  {positions.map(pos => (
                    <option key={pos.id} value={pos.id}>{pos.code ? `${pos.code} - ` : ''}{pos.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 mb-1">模板状态</label>
                <select
                  value={templateFormData.status}
                  onChange={(e) => setTemplateFormData({...templateFormData, status: e.target.value as 'draft' | 'active' | 'inactive'})}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#22d3ee] bg-white"
                >
                  <option value="draft">草稿</option>
                  <option value="active">启用</option>
                  <option value="inactive">停用</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowTemplateDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-[13px] font-medium hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={saving || !templateFormData.name.trim()}
                className="flex-1 px-4 py-2 bg-[#22d3ee] text-white rounded-lg text-[13px] font-medium hover:bg-[#06b6d4] transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : editingTemplate ? '保存' : '创建'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Template Confirmation */}
      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="删除面试模板"
        message="确定要删除此面试模板吗？删除后将无法恢复。"
        confirmText="删除"
        variant="danger"
        onConfirm={() => {
          if (deleteConfirmId) handleDeleteTemplate(deleteConfirmId);
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
};

const formatTimeDisplay = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (s === 0) return `${m}分钟`;
  return `${m}分${s}秒`;
};
