import React, {useEffect, useState} from 'react';
import {motion} from 'motion/react';
import {Search, Plus, Box, X, Trash2, Edit2} from 'lucide-react';
import {listPositions, createPosition, updatePosition, deletePosition, getPositionDetail, savePositionDetail} from './modules/positions/api';
import {listProjects} from './modules/projects/api';
import {type PositionSummary, type PositionCategory, type ProfileRule, type ScoringRule, type GradeRule, type BaseScoreConfig} from './modules/positions/types';
import type {Project} from './modules/projects/types';
import {ConfirmDialog} from './shared/components/ConfirmDialog';

const CATEGORY_OPTIONS = [
  {label: '全部', value: ''},
  {label: 'ITF', value: 'ITF'},
  {label: 'ITW', value: 'ITW'},
  {label: 'MWV', value: 'MWV'},
];

const CATEGORY_SELECT_OPTIONS = ['ITF', 'ITW', 'MWV', '自定义'];

export const PositionConfigPage = () => {
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [activePositionId, setActivePositionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PositionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'MWV' as PositionCategory,
    customCategory: '',
    status: 'active' as 'active' | 'inactive',
    projectId: '',
    description: '',
    requiredCount: '',
    deliveryDays: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{type: 'success' | 'error'; text: string} | null>(null);

  // Pre-select position from URL query param (e.g. ?positionId=xxx from project card)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const positionId = params.get('positionId');
    if (positionId) {
      setActivePositionId(positionId);
    }
  }, []);

  // Delete confirmation dialog
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // editable profile rules state
  const [profileRules, setProfileRules] = useState<ProfileRule[]>([]);
  // editable scoring rules state
  const [scoringRules, setScoringRules] = useState<ScoringRule[]>([]);
  // editable grade rules state
  const [gradeRules, setGradeRules] = useState<GradeRule[]>([]);
  // editable base score config state
  const [baseScoreConfig, setBaseScoreConfig] = useState<BaseScoreConfig | null>(null);
  // editable AI prompt
  const [aiPrompt, setAiPrompt] = useState('');

  // projects list for project dropdown
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    loadPositions();
    listProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (activePositionId) {
      loadPositionDetail(activePositionId);
    }
  }, [activePositionId]);

  const loadPositions = async () => {
    setLoading(true);
    try {
      const data = await listPositions();
      setPositions(data);
      if (data.length > 0 && !activePositionId) {
        setActivePositionId(data[0].id);
      }
    } catch (e) {
      console.error('Failed to load positions:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadPositionDetail = async (id: string) => {
    try {
      const detail = await getPositionDetail(id);
      console.log('[DEBUG] loadPositionDetail id:', id);
      console.log('[DEBUG] profileRules loaded:', detail?.profileRules);
      console.log('[DEBUG] scoringRules loaded:', detail?.scoringRules);
      if (detail) {
        // Handle profileRules
        setProfileRules(detail.profileRules || []);
        console.log('[DEBUG] setProfileRules called with:', detail.profileRules);
        // Handle scoringRules - check if new structured format or legacy criteria text format
        if (detail.scoringRules.length > 0 && 'keywords' in detail.scoringRules[0]) {
          setScoringRules(detail.scoringRules as ScoringRule[]);
        } else {
          // Legacy format - convert to structured
          const convertedRules: ScoringRule[] = detail.scoringRules.map(r => ({
            dimension: r.dimension,
            weight: r.weight,
            keywords: ((r as any).criteria || '').split(/[,/、\s]+/).filter(Boolean),
            matchMode: 'any' as const,
          }));
          setScoringRules(convertedRules);
        }
        setGradeRules(detail.gradeRules);
        setBaseScoreConfig(detail.baseScoreConfig ?? null);
        setAiPrompt(detail.aiPrompt || '');
      }
    } catch (e) {
      console.error('Failed to load position detail:', e);
    }
  };

  const handleOpenCreate = () => {
    setEditingPosition(null);
    setFormData({name: '', category: 'MWV', customCategory: '', status: 'active', projectId: '', description: '', requiredCount: '', deliveryDays: ''});
    setProfileRules([]);
    setScoringRules([{dimension: '', weight: 0, keywords: [], matchMode: 'any'}]);
    setGradeRules([]);
    setBaseScoreConfig(null);
    setAiPrompt('');
    setShowDialog(true);
  };

  const handleOpenEdit = (position: PositionSummary) => {
    setEditingPosition(position);
    setFormData({
      name: position.name,
      category: position.category as PositionCategory,
      customCategory: '',
      status: position.status,
      projectId: position.projectId || '',
      description: position.description || '',
      requiredCount: position.requiredCount?.toString() ?? '',
      deliveryDays: position.deliveryDays?.toString() ?? '',
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePosition(id);
      if (activePositionId === id) {
        setActivePositionId(null);
      }
      await loadPositions();
    } catch (e) {
      console.error('Failed to delete position:', e);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    setSubmitting(true);
    try {
      const finalCategory = formData.category === '自定义' ? formData.customCategory : formData.category;
      if (editingPosition) {
        await updatePosition(editingPosition.id, {
          name: formData.name,
          category: finalCategory,
          status: formData.status,
          projectId: formData.projectId || null,
          description: formData.description,
          requiredCount: formData.requiredCount ? parseInt(formData.requiredCount) : undefined,
          deliveryDays: formData.deliveryDays ? parseInt(formData.deliveryDays) : undefined,
        });
      } else {
        const newPosition = await createPosition({
          name: formData.name,
          category: finalCategory,
          projectId: formData.projectId || null,
          description: formData.description,
          requiredCount: formData.requiredCount ? parseInt(formData.requiredCount) : undefined,
          deliveryDays: formData.deliveryDays ? parseInt(formData.deliveryDays) : undefined,
        });
        // Initialize empty detail for the new position
        await savePositionDetail(newPosition.id, {
          profileRules: [],
          scoringRules: [],
          gradeRules: [],
          baseScoreConfig: null,
        });
        // Auto-select the new position
        setActivePositionId(newPosition.id);
      }
      setShowDialog(false);
      await loadPositions();
    } catch (e) {
      console.error('Failed to save position:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!activePositionId) {
      console.log('[DEBUG] handleSaveConfig - no activePositionId, returning');
      return;
    }
    console.log('[DEBUG] handleSaveConfig - starting, activePositionId:', activePositionId);

    // Validate scoring rules weights sum to (100 - baseScore) (only when rules exist)
    const validRules = scoringRules.filter(r => r.dimension.trim());
    const dimensionBudget = 100 - (baseScoreConfig?.baseScore ?? 50);
    if (validRules.length > 0) {
      const totalWeight = validRules.reduce((sum, r) => sum + r.weight, 0);
      if (totalWeight !== dimensionBudget) {
        setSaveMessage({type: 'error', text: `技能与经验匹配权重总和必须为${dimensionBudget}%，当前为${totalWeight}%`});
        return;
      }
    }

    setSavingConfig(true);
    setSaveMessage(null);
    console.log('[DEBUG] handleSaveConfig - profileRules before save:', JSON.stringify(profileRules));
    const filteredProfileRules = profileRules.filter(r => r.keyword.trim());
    console.log('[DEBUG] handleSaveConfig - filteredProfileRules:', JSON.stringify(filteredProfileRules));
    try {
      await savePositionDetail(activePositionId, {
        profileRules: filteredProfileRules,
        scoringRules: scoringRules.filter(r => r.dimension.trim()),
        gradeRules: gradeRules.filter(g => g.grade.trim()),
        baseScoreConfig: baseScoreConfig,
        aiPrompt: aiPrompt,
      });
      console.log('[DEBUG] handleSaveConfig - savePositionDetail completed');
      setSaveMessage({type: 'success', text: '配置保存成功'});
      setIsEditing(false);
      // Reload detail to reflect saved state
      await loadPositionDetail(activePositionId);
      // Auto-dismiss success message
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (e) {
      console.error('Failed to save config:', e);
      setSaveMessage({type: 'error', text: '保存失败，请重试'});
    } finally {
      setSavingConfig(false);
    }
  };

  // Profile rule handlers
  const handleProfileRuleChange = (index: number, field: keyof ProfileRule, value: string | string[]) => {
    setProfileRules(prev => prev.map((rule, i) => {
      if (i === index) {
        if (field === 'synonyms') {
          return {...rule, synonyms: String(value).split(',').map(s => s.trim()).filter(Boolean)};
        }
        return {...rule, [field]: value};
      }
      return rule;
    }));
  };

  const handleAddProfileRule = () => {
    setProfileRules(prev => [...prev, {keyword: '', synonyms: [], category: ''}]);
  };

  const handleRemoveProfileRule = (index: number) => {
    setProfileRules(prev => prev.filter((_, i) => i !== index));
  };

  // Scoring rule handlers - structured
  const handleScoringRuleChange = (index: number, field: keyof ScoringRule, value: string | number | string[]) => {
    setScoringRules(prev => prev.map((rule, i) => {
      if (i === index) {
        if (field === 'keywords') {
          return {...rule, keywords: String(value).split(',').map(k => k.trim()).filter(Boolean)};
        }
        return {...rule, [field]: value};
      }
      return rule;
    }));
  };

  const handleAddScoringRule = () => {
    setScoringRules(prev => [...prev, {dimension: '', weight: 0, keywords: [], matchMode: 'any'}]);
  };

  const handleRemoveScoringRule = (index: number) => {
    setScoringRules(prev => prev.filter((_, i) => i !== index));
  };

  // Grade rule handlers
  const handleGradeChange = (index: number, field: keyof GradeRule, value: string | number) => {
    setGradeRules(prev => prev.map((g, i) => {
      if (i === index) return {...g, [field]: value};
      return g;
    }));
  };

  const handleAddGrade = () => {
    setGradeRules(prev => [...prev, {grade: '', minScore: 0, maxScore: 0, label: '', action: ''}]);
  };

  const handleRemoveGrade = (index: number) => {
    setGradeRules(prev => prev.filter((_, i) => i !== index));
  };

  // Base score config handler — simplified to just profileWeight
  const handleBaseScoreChange = (value: number) => {
    setBaseScoreConfig({baseScore: value});
  };

  // Import/Export handlers
  const parseImportFile = (content: string): {
    profileRules: ProfileRule[];
    scoringRules: ScoringRule[];
    gradeRules: GradeRule[];
    baseScoreConfig: BaseScoreConfig | null;
  } => {
    const profileRules: ProfileRule[] = [];
    const scoringRules: ScoringRule[] = [];
    const gradeRules: GradeRule[] = [];
    let baseScoreConfig: BaseScoreConfig | null = null;

    // Section 1: 画像配置
    const profileSectionMatch = content.match(/##\s*1[.。]\s*画像配置\s*[\n\r]([\s\S]*?)(?=##\s*2[.。]\s*评分标准配置|##\s*2[.。]\s*评分标准配置)/);
    if (profileSectionMatch) {
      const profileText = profileSectionMatch[1];
      const lines = profileText.split('\n');
      for (const line of lines) {
        if (line.includes('---') || line.includes('#') || !line.includes('|') || line.includes('关键词') || line.includes('#')) continue;
        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length >= 2 && cells[0] && !isNaN(parseInt(cells[0]))) {
          const keyword = cells[1];
          const synonyms = cells.length >= 3 ? cells[2].split(/[,，、]/).map(s => s.trim()).filter(Boolean) : [];
          const category = cells.length >= 4 ? cells[3] : '';
          profileRules.push({keyword, synonyms, category});
        }
      }
    }

    // Section 2: 评分标准配置
    const scoringSectionMatch = content.match(/##\s*2[.。]\s*评分标准配置\s*[\n\r]([\s\S]*?)(?=##\s*3[.。]\s*Grade Rules|##\s*Grade Rules)/);
    if (scoringSectionMatch) {
      const scoringText = scoringSectionMatch[1];
      const dimensionBlocks = scoringText.split(/(?=###\s*维度)/);
      for (const block of dimensionBlocks) {
        if (!block.trim()) continue;
        const dimNameMatch = block.match(/###\s*维度\s*\d+[：:]\s*(.+)/);
        if (!dimNameMatch) continue;
        const dimensionName = dimNameMatch[1].replace(/[*_]/g, '').trim();
        const weightMatch = block.match(/\*\*权重\*\*[：:]\s*(\d+)%/);
        if (!weightMatch) continue;
        const weight = parseInt(weightMatch[1]);
        const keywordMatch = block.match(/\*\*关键字标签\*\*[：:]\s*(.+?)(?=\n)/);
        if (!keywordMatch) continue;
        const keywords = keywordMatch[1].split(/[,，、]/).map(k => k.trim()).filter(Boolean);
        const matchModeMatch = block.match(/匹配模式[：:]\s*(any|all)/);
        scoringRules.push({
          dimension: dimensionName,
          weight,
          keywords,
          matchMode: (matchModeMatch ? matchModeMatch[1] : 'any') as 'any' | 'all',
        });
      }
    }

    // Section 3: Grade Rules
    const gradeSectionMatch = content.match(/##\s*3[.。]\s*Grade Rules[^]*?\|[^|]*档位[^|]*\|[\s\S]*?(?=##|$)/);
    if (gradeSectionMatch) {
      const lines = gradeSectionMatch[0].split('\n');
      for (const line of lines) {
        if (line.includes('---') || line.includes('#') || !line.includes('|') || line.includes('档位') || line.includes('最低分')) continue;
        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length >= 4 && cells[0]) {
          const gradeStr = cells[0];
          const minScore = parseInt(cells[1]) || 0;
          const maxScore = parseInt(cells[2]) || 0;
          const action = cells[3] || '';
          const grade = gradeStr.replace('档', '').trim();
          gradeRules.push({grade, minScore, maxScore, label: gradeStr, action});
        }
      }
    }

    // Section 4: 画像匹配权重
    const baseSectionMatch = content.match(/##\s*4[.。]\s*(?:基础分配置|画像匹配权重)\s*[\n\r]([\s\S]*?)(?=##|$)/);
    if (baseSectionMatch) {
      const baseText = baseSectionMatch[1];
      const baseScoreMatch = baseText.match(/\*\*(?:基础分值|画像匹配分值)\*\*[：:]\s*(\d+)/);
      if (baseScoreMatch) {
        baseScoreConfig = {baseScore: parseInt(baseScoreMatch[1])};
      }
    }

    return {profileRules, scoringRules, gradeRules, baseScoreConfig};
  };

  const handleImportStructuredFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      console.log('[DEBUG] handleImportStructuredFile - content length:', content.length);
      const parsed = parseImportFile(content);
      console.log('[DEBUG] handleImportStructuredFile - parsed.profileRules:', JSON.stringify(parsed.profileRules));
      setProfileRules(parsed.profileRules);
      setScoringRules(parsed.scoringRules);
      setGradeRules(parsed.gradeRules);
      setBaseScoreConfig(parsed.baseScoreConfig);
      console.log('[DEBUG] handleImportStructuredFile - profileRules set');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportConfig = () => {
    if (!activePosition) return;

    let content = `# ${activePosition.name} — 系统配置结构\n\n`;

    // Section 1: 画像配置
    content += `## 1. 画像配置\n\n`;
    content += `| # | 关键词 | 同义词（逗号分隔） | 类别 |\n`;
    content += `|---|--------|------------------|------|\n`;
    let idx = 1;
    for (const rule of profileRules) {
      content += `| ${idx++} | ${rule.keyword} | ${rule.synonyms.join(', ')} | ${rule.category} |\n`;
    }
    content += '\n---\n\n';

    // Section 3: 评分标准配置（画像匹配权重 + 技能与经验匹配）
    if (baseScoreConfig) {
      content += `## 3. 评分标准配置（满分100分）\n\n`;
      content += `### 3.1 画像匹配权重\n`;
      content += `- **画像匹配分值**：${baseScoreConfig.baseScore}分\n`;
      content += `- **技能与经验匹配分值**：${100 - baseScoreConfig.baseScore}分\n\n`;
      content += `### 3.2 技能与经验匹配（维度配置）\n`;
      for (let i = 0; i < scoringRules.length; i++) {
        const rule = scoringRules[i];
        content += `#### 维度${i + 1}：${rule.dimension}\n`;
        content += `- **权重**：${rule.weight}%\n`;
        content += `- **关键字标签**：${rule.keywords.join(', ')}\n`;
        content += `- **匹配模式**：${rule.matchMode}\n\n`;
      }
    }
    content += '\n---\n\n';

    // Section 4: Grade Rules
    content += `## 4. Grade Rules（分数区间）\n\n`;
    content += `| 档位 | 最低分 | 最高分 | 操作建议 |\n`;
    content += `|------|--------|--------|---------|\n`;
    for (const rule of gradeRules) {
      content += `| ${rule.grade}档 | ${rule.minScore} | ${rule.maxScore} | ${rule.action} |\n`;
    }
    content += '\n---\n\n';

    const blob = new Blob([content], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activePosition.name}-系统配置.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredPositions = positions.filter((pos) => {
    const matchesSearch = pos.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = !activeTab || activeTab === '全部' || pos.category === activeTab;
    return matchesSearch && matchesTab;
  });

  const activePosition = positions.find((p) => p.id === activePositionId);

  return (
    <div className="min-h-screen bg-[#EEF2F6] p-8 flex flex-col font-sans">
      <div className="text-center mb-8 pt-4">
        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">岗位筛选标准配置</h1>
        <p className="text-xl text-gray-600 dark:text-gray-300">配置AI评分规则与岗位画像</p>
      </div>

      <div className="max-w-[1400px] w-full mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 dark:border-gray-700 flex flex-col flex-1 min-h-[850px] overflow-hidden">
        {/* Top Header */}
        <div className="h-16 flex justify-between items-center px-6 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center text-xl font-bold text-gray-900 dark:text-white">
            <div className="w-8 h-8 bg-gradient-to-br from-[#1a4bc4] to-[#6366F1] rounded flex items-center justify-center mr-3">
              <Box className="w-5 h-5 text-white" />
            </div>
            EM-BOX
          </div>
          <div className="flex gap-3">
            {activePosition && !isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-[#6366F1] hover:bg-[#4F46E5] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors"
                >
                  <Edit2 className="w-4 h-4 mr-1.5" />
                  编辑配置
                </button>
                <button
                  onClick={handleExportConfig}
                  className="border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors"
                >
                  📤 导出配置
                </button>
              </>
            )}
            <button onClick={handleOpenCreate} className="bg-[#6366F1] hover:bg-[#4F46E5] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors">
              <Plus className="w-4 h-4 mr-1.5" />
              新建岗位配置
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Column - Directory */}
          <div className="w-[280px] bg-white dark:bg-gray-800 border-r border-[#E2E8F0] flex flex-col">
            <div className="p-4 border-b border-[#E2E8F0]">
              <div className="font-bold text-gray-900 dark:text-white mb-3 text-[15px]">岗位选择</div>
              <div className="relative mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索岗位..."
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] transition-all"
                />
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute right-3 top-2.5" />
              </div>
              <div className="flex items-center space-x-1.5">
                {CATEGORY_OPTIONS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${activeTab === tab.value ? 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]' : 'text-gray-500 hover:bg-gray-50 border border-transparent'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">加载中...</div>
              ) : filteredPositions.length === 0 ? (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">暂无岗位</div>
              ) : (
                filteredPositions.map((pos) => (
                  <div key={pos.id} className="group relative">
                    <button
                      onClick={() => {
                        setActivePositionId(pos.id);
                        setIsEditing(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${activePositionId === pos.id ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      <div className="flex-1 text-left">
                        <div className="font-medium">{pos.name}</div>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${pos.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    </button>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleOpenEdit(pos)} className="p-1 hover:bg-gray-200 rounded">
                        <Edit2 className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                      </button>
                      <button onClick={() => setDeleteConfirmId(pos.id)} className="p-1 hover:bg-red-100 rounded">
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Middle Column - Main Content */}
          <div className="flex-1 bg-white dark:bg-gray-800 overflow-y-auto custom-scrollbar relative">
            {activePosition ? (
              <>
                <div className="p-8 pb-32">
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#E2E8F0]">
                    <div className="flex items-center gap-4">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{activePosition.name}</h2>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${activePosition.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {activePosition.status === 'active' ? '启用' : '关闭'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <span>创建人：{activePosition.createdBy || '未知'}</span>
                      <span>|</span>
                      <span>创建时间：{activePosition.createdAt ? new Date(activePosition.createdAt).toLocaleDateString() : '-'}</span>
                    </div>
                  </div>

                  {/* Section 1 - 岗位基本信息 */}
                  <div className="mb-6">
                    <div className="flex items-center text-[#4F46E5] font-bold text-[15px] mb-4 bg-[#EEF2FF] px-3 py-1.5 rounded-md inline-flex w-full">
                      1. 岗位基本信息
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-4 px-1">
                      <div className="flex items-center">
                        <span className="w-24 text-gray-700 dark:text-gray-300 font-medium text-sm text-right mr-3">岗位名称:</span>
                        <span className="border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm flex-1 bg-gray-50 dark:bg-gray-800">{activePosition.name}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-24 text-gray-700 dark:text-gray-300 font-medium text-sm text-right mr-3">所属项目:</span>
                        <span className="border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm flex-1 bg-gray-50 dark:bg-gray-800">{projects.find(p => p.id === activePosition.projectId)?.name || '-'}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-24 text-gray-700 dark:text-gray-300 font-medium text-sm text-right mr-3">岗位状态:</span>
                        <span className={`border border-gray-200 rounded px-2.5 py-1.5 text-sm flex-1 ${activePosition.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}`}>
                          {activePosition.status === 'active' ? '启用' : '关闭'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center mt-4 px-1">
                      <span className="w-24 text-gray-700 dark:text-gray-300 font-medium text-sm text-right mr-3">岗位描述:</span>
                      <span className="border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm flex-1 bg-gray-50 dark:bg-gray-800 min-h-[40px]">{activePosition.description || '-'}</span>
                    </div>
                  </div>

                  {/* Section 2 - 画像配置 */}
                  <div className="mb-6">
                    <div className="flex items-center text-[#4F46E5] font-bold text-[15px] mb-4 bg-[#EEF2FF] px-3 py-1.5 rounded-md inline-flex w-full">
                      <span>2. 画像配置</span>
                      {isEditing && (
                        <div className="ml-auto flex gap-2">
                          <label className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-[#6366F1] cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 font-normal">
                            <input type="file" accept=".md,.txt" className="hidden" onChange={handleImportStructuredFile} />
                            导入MD文件
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 px-1">
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-bold text-gray-900 dark:text-white text-sm">画像配置</h4>
                          {isEditing && (
                            <button
                              onClick={handleAddProfileRule}
                              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-[#6366F1] hover:bg-gray-50 dark:hover:bg-gray-700/30"
                            >
                              + 添加配置
                            </button>
                          )}
                        </div>
                        {/* Column Headers */}
                        <div className="grid grid-cols-12 gap-3 mb-2 px-1">
                          <div className="col-span-4 text-xs font-medium text-gray-500 dark:text-gray-400">关键词</div>
                          <div className="col-span-4 text-xs font-medium text-gray-500 dark:text-gray-400">同义词（逗号分隔）</div>
                          <div className="col-span-3 text-xs font-medium text-gray-500 dark:text-gray-400">类别</div>
                          <div className="col-span-1"></div>
                        </div>
                        {profileRules.length === 0 ? (
                          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">暂无画像配置</div>
                        ) : (
                          <div className="space-y-3">
                            {profileRules.map((rule, idx) => (
                              <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                <div className="grid grid-cols-12 gap-3">
                                  <div className="col-span-4">
                                    <input
                                      type="text"
                                      value={rule.keyword}
                                      onChange={(e) => handleProfileRuleChange(idx, 'keyword', e.target.value)}
                                      disabled={!isEditing}
                                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50"
                                      placeholder="关键词"
                                    />
                                  </div>
                                  <div className="col-span-4">
                                    <input
                                      type="text"
                                      value={rule.synonyms.join(', ')}
                                      onChange={(e) => handleProfileRuleChange(idx, 'synonyms', e.target.value)}
                                      disabled={!isEditing}
                                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50"
                                      placeholder="同义词（逗号分隔）"
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <input
                                      type="text"
                                      value={rule.category}
                                      onChange={(e) => handleProfileRuleChange(idx, 'category', e.target.value)}
                                      disabled={!isEditing}
                                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50"
                                      placeholder="类别"
                                    />
                                  </div>
                                  {isEditing && (
                                    <button
                                      onClick={() => handleRemoveProfileRule(idx)}
                                      className="col-span-1 p-2 text-red-500 hover:bg-red-50 rounded flex items-center justify-center"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section 3 - 评分标准配置 */}
                  <div className="mb-6">
                    <div className="flex items-center text-[#4F46E5] font-bold text-[15px] mb-4 bg-[#EEF2FF] px-3 py-1.5 rounded-md inline-flex w-full">
                      <span>3. 评分标准配置（满分100分）</span>
                      {isEditing && (
                        <div className="ml-auto flex gap-2">
                          <label className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-[#6366F1] cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 font-normal">
                            <input type="file" accept=".md,.txt" className="hidden" onChange={handleImportStructuredFile} />
                            导入MD文件
                          </label>
                        </div>
                      )}
                    </div>
                    <div className="space-y-6 px-1">
                      {/* 3.1 画像匹配权重 */}
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-bold text-gray-900 dark:text-white text-sm">3.1 画像匹配权重</h4>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-700 dark:text-gray-300">画像匹配分值：</label>
                            <input
                              type="number"
                              value={baseScoreConfig?.baseScore ?? 50}
                              onChange={(e) => handleBaseScoreChange(parseInt(e.target.value) || 0)}
                              disabled={!isEditing}
                              className="w-20 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50"
                              min="0"
                              max="100"
                            />
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">分</span>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-300">
                            技能与经验匹配 = <span className="font-bold text-[#4F46E5]">{100 - (baseScoreConfig?.baseScore ?? 50)}</span> 分
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                          总分 = 画像匹配分 + 技能与经验匹配分 = 100分。画像匹配按上方配置的画像规则逐一匹配简历，匹配比例 × 此分值得出画像匹配分。剩余分数由技能与经验匹配的各维度按权重分配。
                        </p>
                      </div>

                      {/* 3.2 技能与经验匹配 */}
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-bold text-gray-900 dark:text-white text-sm">3.2 技能与经验匹配（满分 {100 - (baseScoreConfig?.baseScore ?? 50)} 分）</h4>
                          {isEditing && (
                            <button
                              onClick={handleAddScoringRule}
                              className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-[#6366F1] hover:bg-gray-50 dark:hover:bg-gray-700/30"
                            >
                              + 添加维度
                            </button>
                          )}
                        </div>
                        {scoringRules.length === 0 ? (
                          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">暂无评分维度</div>
                        ) : (
                          <div className="space-y-4">
                            {scoringRules.map((rule, idx) => (
                              <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                <div className="grid grid-cols-12 gap-3">
                                  <div className="col-span-4">
                                    <input
                                      type="text"
                                      value={rule.dimension}
                                      onChange={(e) => handleScoringRuleChange(idx, 'dimension', e.target.value)}
                                      disabled={!isEditing}
                                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50"
                                      placeholder="维度名称，如：专业技能"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <input
                                      type="number"
                                      value={rule.weight}
                                      onChange={(e) => handleScoringRuleChange(idx, 'weight', parseFloat(e.target.value) || 0)}
                                      disabled={!isEditing}
                                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50"
                                      placeholder="权重"
                                      min="0"
                                      max="100"
                                    />
                                  </div>
                                  <div className="col-span-4">
                                    <input
                                      type="text"
                                      value={rule.keywords.join(', ')}
                                      onChange={(e) => handleScoringRuleChange(idx, 'keywords', e.target.value)}
                                      disabled={!isEditing}
                                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50"
                                      placeholder="关键字（逗号分隔）：舞蹈,表演"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    <select
                                      value={rule.matchMode}
                                      onChange={(e) => handleScoringRuleChange(idx, 'matchMode', e.target.value)}
                                      disabled={!isEditing}
                                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] bg-white dark:bg-gray-800 disabled:bg-gray-50"
                                    >
                                      <option value="any">匹配任意</option>
                                      <option value="all">匹配全部</option>
                                    </select>
                                  </div>
                                  {isEditing && (
                                    <button
                                      onClick={() => handleRemoveScoringRule(idx)}
                                      className="col-span-1 p-2 text-red-500 hover:bg-red-50 rounded flex items-center justify-center"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {scoringRules.length > 0 && (
                          <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                            权重总和：<span className={`font-bold ${scoringRules.reduce((sum, r) => sum + r.weight, 0) === (100 - (baseScoreConfig?.baseScore ?? 50)) ? 'text-emerald-600' : 'text-red-600'}`}>
                              {scoringRules.reduce((sum, r) => sum + r.weight, 0)}%
                            </span>
                            {scoringRules.reduce((sum, r) => sum + r.weight, 0) !== (100 - (baseScoreConfig?.baseScore ?? 50)) && <span className="text-red-500 ml-2">（必须等于 {100 - (baseScoreConfig?.baseScore ?? 50)}%）</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section 4 - Grade Rules */}
                  <div className="mb-6">
                    <div className="flex items-center text-[#4F46E5] font-bold text-[15px] mb-4 bg-[#EEF2FF] px-3 py-1.5 rounded-md inline-flex w-full">
                      4. Grade Rules 分数档位
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold text-gray-900 dark:text-white text-sm">Grade Rules</h4>
                        {isEditing && (
                          <button
                            onClick={handleAddGrade}
                            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-[#6366F1] hover:bg-gray-50 dark:hover:bg-gray-700/30"
                          >
                            + 添加档位
                          </button>
                        )}
                      </div>
                      {gradeRules.length === 0 ? (
                        <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">暂无档位配置</div>
                      ) : (
                        <div className="space-y-3">
                          {gradeRules.map((rule, idx) => (
                            <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                              <div className="grid grid-cols-12 gap-3">
                                <div className="col-span-2">
                                  <input
                                    type="text"
                                    value={rule.grade}
                                    onChange={(e) => handleGradeChange(idx, 'grade', e.target.value)}
                                    disabled={!isEditing}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50"
                                    placeholder="A级"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <input
                                    type="number"
                                    value={rule.minScore}
                                    onChange={(e) => handleGradeChange(idx, 'minScore', parseInt(e.target.value) || 0)}
                                    disabled={!isEditing}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50"
                                    placeholder="最低分"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <input
                                    type="number"
                                    value={rule.maxScore}
                                    onChange={(e) => handleGradeChange(idx, 'maxScore', parseInt(e.target.value) || 0)}
                                    disabled={!isEditing}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50"
                                    placeholder="最高分"
                                  />
                                </div>
                                <div className="col-span-5">
                                  <input
                                    type="text"
                                    value={rule.action}
                                    onChange={(e) => handleGradeChange(idx, 'action', e.target.value)}
                                    disabled={!isEditing}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50"
                                    placeholder="操作建议：如 优先录用"
                                  />
                                </div>
                                {isEditing && (
                                  <button
                                    onClick={() => handleRemoveGrade(idx)}
                                    className="col-span-1 p-2 text-red-500 hover:bg-red-50 rounded flex items-center justify-center"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 5 - AI 智能筛选提示词 */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold border border-purple-200">
                        6
                      </div>
                      <h4 className="font-bold text-[16px] text-gray-900 dark:text-white">AI 智能筛选提示词</h4>
                      <span className="text-[11px] text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full font-medium">AI</span>
                    </div>
                    <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-3">
                      在此输入给 AI 大模型的系统提示词，描述你期望的候选人画像、筛选标准和评估维度。启用 AI 搜索时将使用此提示词。
                    </p>
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      disabled={!isEditing}
                      placeholder={`请评估候选人是否适合此岗位。

评分体系（总分100分）：
• 画像匹配（占 ${baseScoreConfig?.baseScore ?? 50} 分）：按画像规则匹配关键词（同义词匹配）
• 技能与经验匹配（占 ${(baseScoreConfig?.baseScore ?? 50) === 50 ? 50 : 100 - (baseScoreConfig?.baseScore ?? 50)} 分）：按评分维度（经验对口度、技术技能、教育背景、证书资质、综合素质）匹配

要求：
1. 综合评价候选人与岗位的匹配度
2. 参考各维度权重给出合理评分（0-100）
3. 说明录用建议和理由`}
                      rows={6}
                      className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366F1] disabled:bg-gray-50 resize-y font-mono"
                    />
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      该提示词将作为 AI 模型的 System Prompt 发送。请确保已在「AI 代理 → 模型配置」中配置可用的 AI 大模型。
                    </p>
                  </div>

                </div>

                {/* Bottom Actions Fixed */}
                <div className="absolute bottom-0 left-0 w-full bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 p-4 px-8 flex items-center space-x-4 shadow-[0_-4px_10px_rgb(0,0,0,0.02)]">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => {
                          alert('保存按钮被点击了！');
                          console.log('[DEBUG] Save button clicked, savingConfig:', savingConfig);
                          handleSaveConfig();
                        }}
                        disabled={savingConfig}
                        className="bg-[#6366F1] hover:bg-[#4F46E5] text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
                      >
                        {savingConfig ? '保存中...' : '保存配置'}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setSaveMessage(null);
                          if (activePositionId) loadPositionDetail(activePositionId);
                        }}
                        className="border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-lg font-bold text-sm transition-colors"
                      >
                        取消
                      </button>
                      {saveMessage && (
                        <span className={`text-sm font-medium ${saveMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {saveMessage.text}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          alert(
                            `【${activePosition.name}】评分预览\n\n` +
                            `=== 画像匹配 ===\n${baseScoreConfig ? `${baseScoreConfig.baseScore}分（技能与经验匹配占${100 - baseScoreConfig.baseScore}分）` : '未配置'}\n\n` +
                            `=== 技能与经验匹配 ===\n${scoringRules.map(r => `${r.dimension}: ${r.weight}% - ${r.keywords.join(', ')} (${r.matchMode})`).join('\n') || '暂无'}\n\n` +
                            `=== 档位配置 ===\n${gradeRules.map(g => `${g.grade}档: ${g.minScore}-${g.maxScore}分`).join('\n') || '暂无'}\n\n` +
                            `=== 画像规则 ===\n${profileRules.map(r => `${r.keyword}${r.synonyms.length ? ` (同义词: ${r.synonyms.join(', ')})` : ''}`).join('\n') || '暂无'}`
                          );
                        }}
                        className="border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-lg font-bold text-sm transition-colors"
                      >
                        预览评分效果
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                请选择一个岗位查看配置
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editingPosition ? '编辑岗位' : '新建岗位'}</h3>
              <button onClick={() => setShowDialog(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">岗位名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                  placeholder="如：MWV-全身动捕演员"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">岗位类别</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value as PositionCategory})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366F1] bg-white dark:bg-gray-800"
                >
                  {CATEGORY_SELECT_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">所属项目</label>
                <select
                  value={formData.projectId}
                  onChange={(e) => setFormData({...formData, projectId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366F1] bg-white dark:bg-gray-800"
                >
                  <option value="">未关联</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">岗位状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value as 'active' | 'inactive'})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                >
                  <option value="active">启用</option>
                  <option value="inactive">关闭</option>
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">需求人数</label>
                <input
                  type="number"
                  value={formData.requiredCount}
                  onChange={(e) => setFormData({...formData, requiredCount: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                  placeholder="如：5"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">交付周期（天）</label>
                <input
                  type="number"
                  value={formData.deliveryDays}
                  onChange={(e) => setFormData({...formData, deliveryDays: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366F1]"
                  placeholder="如：30"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">岗位描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366F1] min-h-[80px]"
                  placeholder="请输入岗位描述..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDialog(false)}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !formData.name.trim()}
                className="flex-1 px-4 py-2 bg-[#6366F1] text-white rounded-lg text-[13px] font-medium hover:bg-[#4F46E5] transition-colors disabled:opacity-50"
              >
                {submitting ? '保存中...' : '保存'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Position Confirmation */}
      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="删除岗位配置"
        message="确定要删除这个岗位配置吗？删除后将无法恢复。"
        confirmText="删除"
        variant="danger"
        onConfirm={() => {
          if (deleteConfirmId) handleDelete(deleteConfirmId);
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
};