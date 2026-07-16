import { useCallback, useEffect, useMemo, useState } from 'react';
import { listCandidates } from '../../candidates/api';
import type { CandidateCard } from '../../candidates/types';

/** Minimal template shape required by the create form */
export type InterviewCreateTemplateOption = {
  id: string;
  name: string;
  questionCount?: number;
};

/** Optional pre-loaded data to avoid duplicate fetches when opening a dialog */
export type PrepareOpenOptions = {
  candidateList?: CandidateCard[];
  templateList?: InterviewCreateTemplateOption[];
};

type UseInterviewCreateFormOptions = {
  /** Whether the create dialog/modal is open — enables selection sync */
  open: boolean;
  /** Templates available in the form (caller loads & filters before passing in) */
  templates: InterviewCreateTemplateOption[];
  /** Hint when templates array is empty (wording differs per page) */
  emptyTemplatesHint?: string;
};

/**
 * Shared state for "发起面试" dialogs in InterviewManagementPage and
 * ConversationInterviewManagementPage.
 *
 * Handles: candidate preload, search/filter, default selection, and
 * keeping selected ids valid when the filter changes.
 */
export const useInterviewCreateForm = ({
  open,
  templates,
  emptyTemplatesHint = '暂无面试模板，请先创建模板',
}: UseInterviewCreateFormOptions) => {
  const [allCandidates, setAllCandidates] = useState<CandidateCard[]>([]);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  /** Client-side filter — empty search shows all candidates */
  const filteredCandidates = useMemo(() => {
    const q = candidateSearch.toLowerCase();
    return allCandidates.filter(
      (c) =>
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.resumeParsedInfo?.email ?? '').toLowerCase().includes(q),
    );
  }, [allCandidates, candidateSearch]);

  const reloadCandidates = useCallback(async () => {
    try {
      const list = await listCandidates();
      setAllCandidates(list);
      return list;
    } catch {
      setAllCandidates([]);
      return [];
    }
  }, []);

  // Pre-load on mount so the picker is populated before the dialog opens
  useEffect(() => {
    void reloadCandidates();
  }, [reloadCandidates]);

  // When search narrows the list, fall back to the first visible candidate
  useEffect(() => {
    if (!open) return;
    const stillVisible = filteredCandidates.some((c) => c.id === selectedCandidateId);
    if (!stillVisible) {
      setSelectedCandidateId(filteredCandidates[0]?.id ?? '');
    }
  }, [filteredCandidates, open, selectedCandidateId]);

  // When templates load/change while dialog is open, ensure a valid selection
  useEffect(() => {
    if (!open || templates.length === 0) return;
    const stillValid = templates.some((t) => t.id === selectedTemplateId);
    if (!stillValid) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, open, selectedTemplateId]);

  /**
   * Reset form fields before showing the create dialog.
   * Await this before setting dialog `open` to avoid stale-selection flicker.
   * Pass pre-loaded lists when the caller already fetched them in parallel.
   */
  const prepareOpen = useCallback(async (options?: PrepareOpenOptions) => {
    setIsPreparing(true);
    setError('');
    setCandidateSearch('');
    try {
      const list = options?.candidateList ?? await reloadCandidates();
      if (options?.candidateList) {
        setAllCandidates(options.candidateList);
      }
      setSelectedCandidateId(list[0]?.id ?? '');
      const tpls = options?.templateList ?? templates;
      setSelectedTemplateId(tpls[0]?.id ?? '');
    } finally {
      setIsPreparing(false);
    }
  }, [reloadCandidates, templates]);

  /** Human-readable reason when the create button stays disabled */
  const createDisabledReason = useMemo(() => {
    if (!selectedCandidateId) {
      return allCandidates.length === 0
        ? '暂无候选人，请先在候选人中心导入'
        : '请先选择候选人';
    }
    if (!selectedTemplateId) {
      return templates.length === 0 ? emptyTemplatesHint : '请选择面试模板';
    }
    return '';
  }, [selectedCandidateId, selectedTemplateId, allCandidates.length, templates.length, emptyTemplatesHint]);

  const canCreate = Boolean(selectedCandidateId && selectedTemplateId) && !creating;

  return {
    allCandidates,
    filteredCandidates,
    candidateSearch,
    setCandidateSearch,
    selectedCandidateId,
    setSelectedCandidateId,
    selectedTemplateId,
    setSelectedTemplateId,
    error,
    setError,
    creating,
    setCreating,
    reloadCandidates,
    prepareOpen,
    isPreparing,
    createDisabledReason,
    canCreate,
  };
};
