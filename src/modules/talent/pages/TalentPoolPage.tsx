import {motion, AnimatePresence} from 'motion/react';
import {useEffect, useState, useMemo} from 'react';
import {Search, Users, UserPlus, Clock, Star, ChevronRight, LayoutGrid, List, ChevronLeft, ChevronLast, ChevronsLeft, ChevronsRight, X, MapPin, Briefcase, Mail, Phone, GraduationCap, Banknote, UserCheck, Award, Building2, Trash2, Tag, CheckSquare} from 'lucide-react';
import {getTalentStats, listCandidates, deleteCandidate, updateCandidateTags} from '../api';
import {ResumeImportModal} from '../components/ResumeImportModal';
import {CandidateDetailModal} from '../../../CandidateDetailModal';
import {navigateToPage} from '../../../navigation';
import {type CandidateCard, type TalentStats} from '../types';

const TABS = ['全部', '按项目', '按岗位', '来源'] as const;
type Tab = (typeof TABS)[number];
const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export const TalentPoolPage = () => {
  const [stats, setStats] = useState<TalentStats | null>(null);
  const [candidates, setCandidates] = useState<CandidateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateCard | null>(null);

  // Tags management modal
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [tagsModalCandidate, setTagsModalCandidate] = useState<CandidateCard | null>(null);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  // View mode and pagination
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [pageSize, setPageSize] = useState<PageSize>(30);
  const [currentPage, setCurrentPage] = useState(1);

  // Batch processing
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagsModalBatch, setTagsModalBatch] = useState(false);
  const [savingTags, setSavingTags] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab, pageSize]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, candidatesRes] = await Promise.all([getTalentStats(), listCandidates()]);
      setStats(statsRes);
      setCandidates(candidatesRes);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenTagsModal = (candidate: CandidateCard) => {
    setTagsModalCandidate(candidate);
    setTagsModalBatch(false);
    setCustomTags([...candidate.tags]);
    setNewTagInput('');
    setShowTagsModal(true);
  };

  const handleOpenBatchTagsModal = () => {
    if (selectedIds.size === 0) return;
    setTagsModalCandidate(null);
    setTagsModalBatch(true);
    setCustomTags([]);
    setNewTagInput('');
    setShowTagsModal(true);
  };

  const toggleBatchMode = () => {
    if (batchMode) {
      setBatchMode(false);
      setSelectedIds(new Set());
    } else {
      setBatchMode(true);
      setViewMode('list');
      setSelectedIds(new Set());
    }
  };

  const toggleCandidateSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确定要删除选中的 ${selectedIds.size} 位候选人吗？此操作不可撤销。`)) return;
    const toDelete = candidates.filter((c) => selectedIds.has(c.id));
    const deletedIds: string[] = [];
    let failed = 0;
    for (const candidate of toDelete) {
      try {
        await deleteCandidate(candidate.id);
        deletedIds.push(candidate.id);
      } catch (e) {
        console.error('Failed to delete candidate:', e);
        failed += 1;
      }
    }
    if (deletedIds.length > 0) {
      setCandidates((prev) => prev.filter((c) => !deletedIds.includes(c.id)));
      try { setStats(await getTalentStats()); } catch { /* ignore */ }
    }
    setSelectedIds(new Set());
    if (deletedIds.length > 0) setToastMessage(`已删除 ${deletedIds.length} 位候选人`);
    if (failed > 0) setToastMessage(`删除完成：成功 ${deletedIds.length} 位，失败 ${failed} 位`);
  };

  const closeTagsModal = () => {
    setShowTagsModal(false);
    setTagsModalCandidate(null);
    setTagsModalBatch(false);
    setCustomTags([]);
    setNewTagInput('');
  };

  const handleAddTag = () => {
    const tag = newTagInput.trim();
    if (tag && !customTags.includes(tag)) {
      setCustomTags([...customTags, tag]);
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setCustomTags(customTags.filter((t) => t !== tagToRemove));
  };

  const handleSaveTags = async () => {
    setSavingTags(true);
    try {
      if (tagsModalBatch) {
        const targets = candidates.filter((c) => selectedIds.has(c.id));
        const updates = targets.map((c) => ({
          id: c.id,
          tags: [...new Set([...c.tags, ...customTags])],
        }));
        await Promise.all(updates.map(({id, tags}) => updateCandidateTags(id, tags)));
        const updateMap = new Map(updates.map((u) => [u.id, u.tags]));
        setCandidates((prev) =>
          prev.map((c) => (updateMap.has(c.id) ? {...c, tags: updateMap.get(c.id)!} : c)),
        );
        setToastMessage(`已为 ${targets.length} 位候选人添加标签`);
      } else if (tagsModalCandidate) {
        const saved = await updateCandidateTags(tagsModalCandidate.id, customTags);
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === tagsModalCandidate.id ? {...c, tags: saved} : c,
          ),
        );
        setToastMessage(`已保存 ${tagsModalCandidate.name} 的标签`);
      }
      closeTagsModal();
    } catch (e) {
      console.error('Failed to save tags:', e);
      setToastMessage('标签保存失败，请重试');
    } finally {
      setSavingTags(false);
    }
  };

  const handleDeleteCandidate = async (candidate: CandidateCard) => {
    if (!window.confirm(`确定要删除候选人「${candidate.name}」吗？此操作不可撤销。`)) return;
    try {
      await deleteCandidate(candidate.id);
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
      // Refresh stats after deletion
      try { setStats(await getTalentStats()); } catch { /* ignore */ }
      setToastMessage(`已删除候选人：${candidate.name}`);
    } catch (e) {
      console.error('Failed to delete candidate:', e);
      setToastMessage('删除失败，请重试');
    }
  };

  const filteredCandidates = useMemo(() => {
    if (!searchQuery) return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [candidates, searchQuery]);

  const groupedData = useMemo(() => {
    if (activeTab === '全部') return [];

    const groups: Record<string, {label: string; candidates: CandidateCard[]}> = {};

    filteredCandidates.forEach((candidate) => {
      let key = '';
      let label = '';

      if (activeTab === '按项目') {
        key = candidate.projectId || 'unknown';
        label = candidate.projectName || '未分配项目';
      } else if (activeTab === '按岗位') {
        key = candidate.positionId || 'unknown';
        label = candidate.positionName || '未分配岗位';
      } else if (activeTab === '来源') {
        key = candidate.source;
        label = candidate.source;
      }

      if (!groups[key]) {
        groups[key] = {label, candidates: []};
      }
      groups[key].candidates.push(candidate);
    });

    return Object.entries(groups).map(([groupKey, {label, candidates: cands}]) => ({
      key: groupKey,
      label,
      count: cands.length,
      candidates: cands,
    }));
  }, [filteredCandidates, activeTab]);

  // Pagination calculations
  const totalCount = filteredCandidates.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);
  const paginatedCandidates = filteredCandidates.slice(startIndex, endIndex);

  // Page number buttons to show
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('ellipsis');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  const toggleGroup = (key: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  // Extract last job info (company + role) from rawText — more reliable than workExperience array
  const extractLastJob = (rawText?: string): {company: string; role: string} => {
    if (!rawText) return {company: '', role: ''};
    // Find "工作经历" section, then look for company names (lines with 公司/科技/有限/集团)
    const workSection = rawText.split(/工作经历/).pop() || '';
    const workLines = workSection.split('\n').map(l => l.trim()).filter(Boolean);
    // Find company lines (contain company indicators or are standalone org names followed by a role)
    const companyIndicators = /(?:公司|集团|科技|有限|股份|研究院|事务所|实验室|工作室|iconvey)/i;
    for (let i = 0; i < workLines.length; i++) {
      const line = workLines[i];
      if (companyIndicators.test(line) && line.length >= 4 && line.length <= 40) {
        // Found a company; next non-empty line that's not a date is likely the role
        let role = '';
        for (let j = i + 1; j < Math.min(i + 4, workLines.length); j++) {
          const next = workLines[j];
          if (/^\d{4}[.\-]/.test(next)) continue; // skip date lines
          if (companyIndicators.test(next)) break; // next company
          if (next.length >= 2 && next.length <= 20 && !/^(内容|业绩|项目)/.test(next)) {
            role = next;
            break;
          }
        }
        return {company: line, role};
      }
    }
    return {company: '', role: ''};
  };

  // Extract skill keywords from rawText — clean, concise tags only
  const extractSkillTags = (rawText?: string, fallbackTags?: string[]): string[] => {
    if (!rawText) return fallbackTags?.filter(t => t.length > 1 && !/^\d/.test(t) && !/%/.test(t)) || [];
    // Look for "专业技能" or "技能" section
    const skillsSection = rawText.match(/(?:专业技能|技能特长|职业技能)[：:\s]*([\s\S]*?)(?=(?:语言|工作经历|教育|项目|实习|自我评价|荣誉|\f|$))/i);
    if (!skillsSection) return fallbackTags?.filter(t => t.length > 1 && !/^\d/.test(t) && !/%/.test(t)) || [];
    const text = skillsSection[1];
    // Extract tool/software names and short skill phrases
    const keywords: string[] = [];
    // Match patterns like "精通XXX、YYY", "熟练使用XXX、YYY", "熟悉XXX、YYY"
    const toolMatches = text.matchAll(/(?:精通|熟练[使用掌握]*|熟悉|了解|掌握)\s*([A-Za-z0-9\u4e00-\u9fa5、,，\s]+?)(?:[，,。；;等]|\n|$)/g);
    for (const m of toolMatches) {
      const items = m[1].split(/[、,，\s]+/).filter(s => s.length >= 2 && s.length <= 15);
      keywords.push(...items);
    }
    // Also match explicit skill labels like "三维数据处理"
    const labelMatches = text.matchAll(/([\u4e00-\u9fa5]{2,8}(?:能力|处理|操作|分析|设计|开发|管理|编程|技术))/g);
    for (const m of labelMatches) {
      if (m[1].length <= 10) keywords.push(m[1]);
    }
    // Dedupe, filter out noise, limit to 6
    const clean = [...new Set(keywords)]
      .filter(k => k.length >= 2 && !/^\d+$/.test(k) && !/%/.test(k) && !/[：:]/.test(k))
      .slice(0, 6);
    if (clean.length > 0) return clean;
    return fallbackTags?.filter(t => t.length > 1 && !/^\d/.test(t) && !/%/.test(t)) || [];
  };

  const renderCandidateCard = (candidate: CandidateCard) => {
    const p = candidate.resumeParsedInfo;
    const photoUrl = p?.photoBase64 || '';
    const statusColor = p?.currentlyEmployed === '在职' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50';

    // Extract last job from rawText (more reliable)
    const {company: lastCompany, role: lastRole} = extractLastJob(p?.rawText);
    // Extract clean skill keywords
    // 专业技能：仅从简历解析，不含用户标签
    const skillTags = extractSkillTags(p?.rawText, p?.skills);
    const candidateTags = candidate.tags ?? [];

    const v = (val: string | undefined) => val || '—';

    return (
      <div key={candidate.id} className="bg-surface rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        {/* ===== 模块1: 基本信息 ===== */}
        <div className="p-4">
          <div className="text-[10px] text-fg-faint font-medium mb-2 tracking-wider">基本信息</div>
          <div className="flex gap-3">
            {/* Photo */}
            <div className="flex-shrink-0">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-[56px] h-[68px] rounded-lg object-cover border border-border" />
              ) : (
                <div className="w-[56px] h-[68px] rounded-lg bg-[#1a4bc4]/10 flex items-center justify-center border border-border">
                  <span className="text-[#1a4bc4] text-lg font-bold">
                    {candidate.name ? candidate.name.slice(0, 2) : '?'}
                  </span>
                </div>
              )}
            </div>

            {/* Basic info fields */}
            <div className="flex-1 min-w-0 space-y-1">
              {/* Name + source badge + grade + score */}
              <div className="flex items-center gap-2">
                <span className="font-bold text-fg text-[15px]">{candidate.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${candidate.sourceColor}`}>{candidate.source}</span>
                {candidate.grade && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white ${candidate.gradeColor || 'bg-gray-400'}`}>
                    {candidate.grade}
                  </span>
                )}
                {candidate.fitScore?.[0] != null && candidate.fitScore[0] > 0 && (
                  <span className="text-[10px] text-fg-muted font-medium tabular-nums">
                    {candidate.fitScore[0]}分
                  </span>
                )}
              </div>
              {/* Age */}
              <div className="flex items-center gap-1 text-[11px] text-fg-secondary">
                <span className="text-fg-faint w-10 flex-shrink-0">年龄</span>
                <span>{v(p?.ageOrBirth)}</span>
              </div>
              {/* Phone */}
              <div className="flex items-center gap-1 text-[11px] text-fg-secondary">
                <Phone className="w-3 h-3 text-fg-faint flex-shrink-0" />
                <span className="truncate">{v(p?.phone)}</span>
              </div>
              {/* Email */}
              <div className="flex items-center gap-1 text-[11px] text-fg-secondary">
                <Mail className="w-3 h-3 text-fg-faint flex-shrink-0" />
                <span className="truncate">{v(p?.email)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border-subtle" />

        {/* ===== 模块2: 教育信息 ===== */}
        <div className="px-4 py-3">
          <div className="text-[10px] text-fg-faint font-medium mb-2 tracking-wider">教育信息</div>
          <div className="space-y-1 text-[11px]">
            {/* School */}
            <div className="flex items-center gap-1 text-fg-secondary">
              <GraduationCap className="w-3 h-3 text-fg-faint flex-shrink-0" />
              <span className="text-fg-faint w-10 flex-shrink-0">学校</span>
              <span className="truncate">{v(p?.school)}</span>
            </div>
            {/* Degree */}
            <div className="flex items-center gap-1 text-fg-secondary">
              <Award className="w-3 h-3 text-fg-faint flex-shrink-0" />
              <span className="text-fg-faint w-10 flex-shrink-0">学历</span>
              <span>{v(p?.highestEducation)}</span>
            </div>
            {/* Major */}
            <div className="flex items-center gap-1 text-fg-secondary">
              <span className="text-fg-faint w-[52px] flex-shrink-0 text-[11px]">专业</span>
              <span className="truncate">{v(p?.major)}</span>
            </div>
            {/* Education time */}
            <div className="flex items-center gap-1 text-fg-secondary">
              <Clock className="w-3 h-3 text-fg-faint flex-shrink-0" />
              <span className="text-fg-faint w-10 flex-shrink-0">时间</span>
              <span>{v(p?.education)}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-border-subtle" />

        {/* ===== 模块3: 相关信息 ===== */}
        <div className="px-4 py-3">
          <div className="text-[10px] text-fg-faint font-medium mb-2 tracking-wider">相关信息</div>
          <div className="space-y-1.5 text-[11px]">
            {/* Work experience */}
            <div className="flex items-start gap-1">
              <Building2 className="w-3 h-3 text-fg-faint flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-fg-secondary truncate block">{v(lastCompany)}{lastRole ? ` · ${lastRole}` : ''}</span>
              </div>
            </div>
            {/* 专业技能 */}
            {skillTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <Briefcase className="w-3 h-3 text-fg-faint flex-shrink-0 mt-0.5" />
                <div className="flex flex-wrap gap-1">
                  {skillTags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 bg-surface-muted text-fg-secondary rounded text-[10px]">{tag}</span>
                  ))}
                </div>
              </div>
            )}
            {/* Salary + Location + Employment status */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1 text-fg-secondary">
                <Banknote className="w-3 h-3 text-fg-faint flex-shrink-0" />
                {v(p?.expectedSalary)}
              </span>
              <span className="flex items-center gap-1 text-fg-secondary">
                <MapPin className="w-3 h-3 text-fg-faint flex-shrink-0" />
                {v(p?.location)}
              </span>
              {p?.currentlyEmployed && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor}`}>{p.currentlyEmployed}</span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border-subtle" />

        {/* ===== 模块4: 标签 ===== */}
        <div className="px-4 py-3">
          <div className="text-[10px] text-fg-faint font-medium mb-2 tracking-wider">标签</div>
          {candidateTags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {candidateTags.map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-[#1a4bc4] rounded text-[10px]">{tag}</span>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-fg-faint">暂无标签</span>
          )}
        </div>

        <div className="border-t border-border-subtle" />

        {/* Action buttons */}
        <div className="px-4 py-2.5 flex gap-2">
          <button onClick={() => setSelectedCandidate(candidate)} className="flex-1 px-3 py-1.5 border border-border text-fg-secondary rounded-lg text-[12px] font-medium hover:bg-surface-muted transition-colors">
            查看详情
          </button>
          <button onClick={() => handleOpenTagsModal(candidate)} className="flex-1 px-3 py-1.5 border border-border text-fg-secondary rounded-lg text-[12px] font-medium hover:bg-surface-muted transition-colors">
            增加标签
          </button>
          <button
            onClick={() => handleDeleteCandidate(candidate)}
            className="px-2 py-1.5 border border-red-200 text-red-500 rounded-lg text-[12px] font-medium hover:bg-red-50 transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderCandidateListItem = (candidate: CandidateCard) => {
    const p = candidate.resumeParsedInfo;
    const photoUrl = p?.photoBase64 || '';
    const statusColor = p?.currentlyEmployed === '在职' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50';

    // Extract last job from rawText
    const {company: lastCompany, role: lastRole} = extractLastJob(p?.rawText);
    const lastWorkDisplay = [lastCompany, lastRole].filter(Boolean).join(' · ') || '—';
    // 专业技能：仅从简历解析，不含用户标签
    const skillTags = extractSkillTags(p?.rawText, p?.skills);
    const candidateTags = candidate.tags ?? [];

    const v = (val: string | undefined) => val || '—';

    return (
      <div key={candidate.id} className="bg-surface rounded-xl border border-border shadow-sm p-3 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3">
          {/* Photo thumbnail or batch checkbox */}
          <div className="flex-shrink-0">
            {batchMode ? (
              <input
                type="checkbox"
                checked={selectedIds.has(candidate.id)}
                onChange={() => toggleCandidateSelection(candidate.id)}
                className="w-4 h-4 rounded border-border text-[#1a4bc4] focus:ring-[#1a4bc4] cursor-pointer"
                aria-label={`选择 ${candidate.name}`}
              />
            ) : photoUrl ? (
              <img src={photoUrl} alt="" className="w-9 h-11 rounded object-cover border border-border" />
            ) : (
              <div className="w-9 h-11 rounded bg-[#1a4bc4]/10 flex items-center justify-center border border-border">
                <span className="text-[#1a4bc4] text-[11px] font-bold">{candidate.name ? candidate.name.slice(0, 1) : '?'}</span>
              </div>
            )}
          </div>

          {/* Info columns - three sections inline */}
          <div className="flex-1 min-w-0 flex items-center gap-6 flex-wrap text-[12px]">
            {/* === 基本信息 === */}
            <span className="font-bold text-fg whitespace-nowrap">{candidate.name}</span>
            {candidate.grade && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white whitespace-nowrap ${candidate.gradeColor || 'bg-gray-400'}`}>
                {candidate.grade}
              </span>
            )}
            {candidate.fitScore?.[0] != null && candidate.fitScore[0] > 0 && (
              <span className="text-fg-muted whitespace-nowrap font-medium tabular-nums">
                {candidate.fitScore[0]}分
              </span>
            )}
            <span className="text-fg-muted whitespace-nowrap">{v(p?.ageOrBirth)}</span>
            <span className="text-fg-muted whitespace-nowrap flex items-center gap-0.5">
              <Phone className="w-3 h-3 text-fg-faint" />
              {v(p?.phone)}
            </span>
            <span className="text-fg-muted whitespace-nowrap flex items-center gap-0.5">
              <Mail className="w-3 h-3 text-fg-faint" />
              {v(p?.email)}
            </span>

            {/* === 教育信息 === */}
            <span className="text-fg-muted whitespace-nowrap flex items-center gap-0.5">
              <GraduationCap className="w-3 h-3 text-fg-faint" />
              {v(p?.school)}
            </span>
            <span className="text-fg-muted whitespace-nowrap">{v(p?.highestEducation)}</span>
            <span className="text-fg-muted whitespace-nowrap">{v(p?.major)}</span>

            {/* === 相关信息 === */}
            <span className="text-fg-muted truncate max-w-[200px] flex items-center gap-0.5">
              <Building2 className="w-3 h-3 text-fg-faint flex-shrink-0" />
              {lastWorkDisplay}
            </span>
            <span className="text-fg-muted whitespace-nowrap flex items-center gap-0.5">
              <Banknote className="w-3 h-3 text-fg-faint" />
              {v(p?.expectedSalary)}
            </span>
            <span className="text-fg-muted whitespace-nowrap flex items-center gap-0.5">
              <MapPin className="w-3 h-3 text-fg-faint" />
              {v(p?.location)}
            </span>
            {p?.currentlyEmployed && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor}`}>{p.currentlyEmployed}</span>
            )}

            {/* === 标签 === */}
            {candidateTags.length > 0 && (
              <span className="flex items-center gap-1 flex-wrap">
                <Tag className="w-3 h-3 text-fg-faint flex-shrink-0" />
                {candidateTags.map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-[#1a4bc4] rounded text-[10px] whitespace-nowrap">{tag}</span>
                ))}
              </span>
            )}
          </div>

          {/* Actions */}
          {!batchMode && (
            <div className="flex-shrink-0 flex items-center gap-2">
              <button onClick={() => setSelectedCandidate(candidate)} className="px-3 py-1.5 border border-border text-fg-secondary rounded-lg text-[12px] font-medium hover:bg-surface-muted transition-colors">
                查看详情
              </button>
              <button onClick={() => handleOpenTagsModal(candidate)} className="px-3 py-1.5 border border-border text-fg-secondary rounded-lg text-[12px] font-medium hover:bg-surface-muted transition-colors">
                增加标签
              </button>
              <button
                onClick={() => handleDeleteCandidate(candidate)}
                className="px-2 py-1.5 border border-red-200 text-red-500 rounded-lg text-[12px] font-medium hover:bg-red-50 transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <AnimatePresence>
        {selectedCandidate && <CandidateDetailModal isOpen={!!selectedCandidate} onClose={() => setSelectedCandidate(null)} candidate={selectedCandidate} />}
      </AnimatePresence>
      {/* Toast Notification */}
      {toastMessage && (
        <motion.div
          initial={{opacity: 0, y: -20}}
          animate={{opacity: 1, y: 0}}
          exit={{opacity: 0, y: -20}}
          className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-[13px] font-medium flex items-center gap-2"
        >
          {toastMessage}
          <button onClick={() => setToastMessage(null)}><X className="w-4 h-4" /></button>
        </motion.div>
      )}
    <motion.div
      initial={{opacity: 0, y: 10}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -10}}
      className="max-w-[1500px] mx-auto w-full p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-fg mb-1">人才库</h1>
          <p className="text-[13px] text-fg-muted">管理所有候选人，集中查看和导入简历。</p>
        </div>
        <button
          onClick={() => setShowImportModal(true)}
          className="bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white px-4 py-2 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          导入简历
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-fg-muted">总人才数</span>
            <Users className="w-4 h-4 text-[#1a4bc4]" />
          </div>
          <div className="text-[28px] leading-none font-bold text-fg">
            {loading ? '-' : stats?.totalCount}
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-fg-muted">本月新增</span>
            <UserPlus className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-[28px] leading-none font-bold text-fg">
            {loading ? '-' : stats?.monthlyNew}
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-fg-muted">待审核</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-[28px] leading-none font-bold text-fg">
            {loading ? '-' : stats?.pendingReview}
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-fg-muted">A 级人才</span>
            <Star className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-[28px] leading-none font-bold text-fg">
            {loading ? '-' : stats?.gradeDistribution.A}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setExpandedGroups(new Set());
            }}
            className={`px-4 py-2 text-[13px] font-medium transition-colors relative ${
              activeTab === tab ? 'text-[#1a4bc4]' : 'text-fg-muted hover:text-fg-secondary'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-[-9px] left-0 right-0 h-0.5 bg-[#1a4bc4]"
              />
            )}
          </button>
        ))}
      </div>

      {/* Search and View Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索候选人..."
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
          />
        </div>
        {batchMode && (
          <>
            <button
              onClick={handleOpenBatchTagsModal}
              disabled={selectedIds.size === 0}
              className="flex-shrink-0 px-3 py-2 border border-border text-fg-secondary rounded-lg text-[13px] font-medium hover:bg-surface-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              增加标签
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
              className="flex-shrink-0 px-2 py-2 border border-red-200 text-red-500 rounded-lg text-[13px] font-medium hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="删除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
        <button
          onClick={toggleBatchMode}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 border rounded-lg text-[13px] font-medium transition-colors ${
            batchMode
              ? 'border-[#1a4bc4] bg-[#1a4bc4]/10 text-[#1a4bc4]'
              : 'border-border text-fg-secondary hover:bg-surface-muted'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          批量处理
          {batchMode && selectedIds.size > 0 && (
            <span className="text-[11px] opacity-80">({selectedIds.size})</span>
          )}
        </button>
        {/* View Toggle */}
        <div className="flex-shrink-0 flex items-center border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => !batchMode && setViewMode('grid')}
            disabled={batchMode}
            className={`p-2 transition-colors ${viewMode === 'grid' && !batchMode ? 'bg-[#1a4bc4] text-white' : 'bg-surface text-fg-muted hover:bg-surface-muted'} disabled:opacity-50 disabled:cursor-not-allowed`}
            title="网格视图"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 transition-colors ${viewMode === 'list' || batchMode ? 'bg-[#1a4bc4] text-white' : 'bg-surface text-fg-muted hover:bg-surface-muted'}`}
            title="列表视图"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === '全部' ? (
        viewMode === 'grid' && !batchMode ? (
          // Grid view
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedCandidates.map((candidate) => renderCandidateCard(candidate))}
            </div>
          </>
        ) : (
          // List view
          <div className="space-y-3">
            {paginatedCandidates.map((candidate) => renderCandidateListItem(candidate))}
          </div>
        )
      ) : (
        // Grouped view
        <div className="space-y-3">
          {groupedData.map((group) => (
            <div key={group.key} className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-surface-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[16px] font-bold text-fg">{group.label}</span>
                  <span className="text-[12px] text-fg-muted bg-surface-muted px-2 py-0.5 rounded">{group.count} 人</span>
                </div>
                <ChevronRight
                  className={`w-5 h-5 text-fg-faint transition-transform ${expandedGroups.has(group.key) ? 'rotate-90' : ''}`}
                />
              </button>
              {expandedGroups.has(group.key) && (
                viewMode === 'grid' && !batchMode ? (
                  <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.candidates.map((candidate) => renderCandidateCard(candidate))}
                  </div>
                ) : (
                  <div className="px-6 pb-6 space-y-3">
                    {group.candidates.map((candidate) => renderCandidateListItem(candidate))}
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {filteredCandidates.length === 0 && !loading && (
        <div className="text-center py-12 text-fg-muted">
          {searchQuery ? '未找到匹配的候选人' : '暂无候选人数据'}
        </div>
      )}

      {/* Pagination */}
      {activeTab === '全部' && totalCount > 0 && (
        <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
          <div className="flex items-center gap-4">
            <span className="text-sm text-fg-muted">
              显示 {startIndex + 1}-{endIndex}，共 {totalCount} 条
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
              className="px-3 py-1.5 border border-border rounded-lg text-sm text-fg-secondary focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}条/页
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            {/* First page */}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg text-fg-muted hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            {/* Previous page */}
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg text-fg-muted hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page numbers */}
            {getPageNumbers().map((page, idx) =>
              page === 'ellipsis' ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-fg-faint">
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === page
                      ? 'bg-[#1a4bc4] text-white'
                      : 'text-fg-secondary hover:bg-surface-muted'
                  }`}
                >
                  {page}
                </button>
              )
            )}

            {/* Next page */}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg text-fg-muted hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {/* Last page */}
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg text-fg-muted hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <ResumeImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} onComplete={loadData} />

      {/* Tags Management Modal */}
      {showTagsModal && (tagsModalCandidate || tagsModalBatch) && (
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeTagsModal}
        >
          <motion.div
            initial={{scale: 0.95, opacity: 0}}
            animate={{scale: 1, opacity: 1}}
            exit={{scale: 0.95, opacity: 0}}
            className="bg-surface rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-fg">
                  {tagsModalBatch ? '批量增加标签' : '管理技能标签'}
                </h3>
                <p className="text-sm text-fg-muted mt-1">
                  {tagsModalBatch
                    ? `已选 ${selectedIds.size} 位候选人`
                    : tagsModalCandidate?.name}
                </p>
              </div>
              <button onClick={closeTagsModal} className="p-2 text-fg-faint hover:text-fg-secondary hover:bg-surface-muted rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Existing tags */}
            <div className="flex flex-wrap gap-2 mb-4 min-h-[40px] p-3 bg-surface-muted rounded-lg">
              {customTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-[#1a4bc4]/10 text-[#1a4bc4] rounded-full text-sm font-medium"
                >
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="hover:bg-[#1a4bc4]/20 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {customTags.length === 0 && (
                <span className="text-sm text-fg-faint">暂无标签，请添加</span>
              )}
            </div>

            {/* Add new tag */}
            <div className="flex gap-2 mb-6">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="输入新标签，按回车添加"
                className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
              />
              <button
                onClick={handleAddTag}
                disabled={!newTagInput.trim()}
                className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a] disabled:opacity-50"
              >
                添加
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleSaveTags}
                disabled={savingTags}
                className="flex-1 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a] disabled:opacity-50"
              >
                {savingTags ? '保存中...' : '保存'}
              </button>
              <button
                onClick={closeTagsModal}
                className="px-4 py-2 border border-border text-fg-secondary rounded-lg text-sm font-medium hover:bg-surface-muted"
              >
                取消
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
    </>
  );
};
