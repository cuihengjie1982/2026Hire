import {useEffect, useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {CheckCircle2, Mail, Star, X, Send, Link2} from 'lucide-react';
import {listShortlist, promoteShortlistEntry, sendShortlistInterviewInvite} from '../api';
import {type ShortlistEntry} from '../types';
import {type ContactChannel} from '../../contacts/types';
import {createContact} from '../../contacts/api';
import {CandidateDetailModal} from '../../../CandidateDetailModal';
import type {CandidateCard} from '../../talent/types';
import type {PositionDetail} from '../../positions/types';
import {navigateToPage} from '../../../navigation';
import {getUserName} from '../../../shared/lib/runtime';
import {listCandidates} from '../../candidates/api';
import {getPositionDetail} from '../../positions/api';

export const ShortlistPage = () => {
  const [entries, setEntries] = useState<ShortlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateCard | null>(null);
  const [selectedPositionDetail, setSelectedPositionDetail] = useState<PositionDetail | null>(null);
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ShortlistEntry | null>(null);
  const [promoteForm, setPromoteForm] = useState({
    channel: 'wechat' as ContactChannel,
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [promoteSuccess, setPromoteSuccess] = useState(false);
  const [showInterviewInviteDialog, setShowInterviewInviteDialog] = useState(false);
  const [inviteEntry, setInviteEntry] = useState<ShortlistEntry | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteEmailError, setInviteEmailError] = useState('');
  // Cache candidate data to avoid repeated API calls
  const [candidatesCache, setCandidatesCache] = useState<Record<string, CandidateCard>>({});

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  // Fetch full candidate data by ID (with cache)
  const fetchCandidate = async (candidateId: string): Promise<CandidateCard | null> => {
    if (candidatesCache[candidateId]) return candidatesCache[candidateId];
    try {
      const allCandidates = await listCandidates();
      const found = allCandidates.find(c => c.id === candidateId) || null;
      if (found) {
        setCandidatesCache(prev => ({...prev, [candidateId]: found}));
      }
      return found;
    } catch {
      return null;
    }
  };

  // Handle "查看详情" click: load full candidate data + position detail
  const handleViewDetail = async (item: ShortlistEntry) => {
    // Show modal immediately with basic info, then enrich
    setSelectedCandidate({
      id: item.candidateId,
      name: item.candidateName,
      location: '',
      source: '',
      sourceColor: '',
      roles: [item.positionName],
      tags: [],
      fitScore: [item.fitScore],
      scoreColor: '',
      grade: item.grade,
      gradeColor: '',
      reason: '',
      positionId: item.positionId,
      positionName: item.positionName,
    });

    // Load full candidate data in parallel with position detail
    const [candidate, posDetail] = await Promise.all([
      fetchCandidate(item.candidateId),
      getPositionDetail(item.positionId).catch(() => null),
    ]);

    if (candidate) {
      setSelectedCandidate({
        ...candidate,
        positionId: item.positionId,
        positionName: item.positionName,
      });
    }
    if (posDetail) {
      setSelectedPositionDetail(posDetail);
    }
  };

  // Clear position detail when modal closes
  const handleCloseDetail = () => {
    setSelectedCandidate(null);
    setSelectedPositionDetail(null);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await listShortlist();
      setEntries(data);
    } catch (e) {
      console.error('Failed to load shortlist:', e);
    } finally {
      setLoading(false);
    }
  };

  // Group entries by position
  const groupedByPosition = entries.reduce(
    (acc, entry) => {
      if (!acc[entry.positionId]) {
        acc[entry.positionId] = {
          positionName: entry.positionName,
          projectName: entry.projectName,
          entries: [],
        };
      }
      acc[entry.positionId].entries.push(entry);
      return acc;
    },
    {} as Record<string, {positionName: string; projectName: string; entries: ShortlistEntry[]}>,
  );

  const stats = {
    total: entries.length,
    interview: entries.filter((e) => e.nextStep === '安排面试').length,
    outreach: entries.filter((e) => e.nextStep === '发起外联').length,
  };

  const handlePromote = async () => {
    if (!selectedEntry || !promoteForm.reason.trim()) return;
    setSubmitting(true);
    try {
      await createContact({
        candidateId: selectedEntry.candidateId,
        candidateName: selectedEntry.candidateName,
        positionId: selectedEntry.positionId,
        positionName: selectedEntry.positionName,
        projectId: selectedEntry.projectId,
        projectName: selectedEntry.projectName,
        outreachPerson: getUserName() ?? '未知用户',
        channel: promoteForm.channel,
        reason: promoteForm.reason,
      });
      await promoteShortlistEntry(selectedEntry.id, '发起外联');
      await loadData();
      setShowPromoteDialog(false);
      setSelectedEntry(null);
      setPromoteForm({channel: 'wechat', reason: ''});
      setPromoteSuccess(true);
      setTimeout(() => setPromoteSuccess(false), 5000);
    } catch (e) {
      console.error('Failed to promote:', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {selectedCandidate && <CandidateDetailModal isOpen={!!selectedCandidate} onClose={handleCloseDetail} candidate={selectedCandidate} positionDetail={selectedPositionDetail} />}
      </AnimatePresence>
    <motion.div
      initial={{opacity: 0, y: 10}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -10}}
      className="max-w-[1500px] mx-auto w-full p-6 space-y-5"
    >
      {/* Success banner */}
      {promoteSuccess && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm text-emerald-700 dark:text-emerald-300">候选人已推进到联系人</span>
          <button
            onClick={() => { setPromoteSuccess(false); navigateToPage('contacts'); }}
            className="text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 underline"
          >
            查看联系人管理
          </button>
          <button onClick={() => setPromoteSuccess(false)} className="ml-auto text-emerald-400 hover:text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 dark:text-white mb-1">入围名单</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">集中处理高优先级候选人，减少在搜索页和面试页之间来回切换。</p>
        </div>
        <button
          onClick={() => {
            const csvContent = [
              ['候选人', '岗位', '项目', '匹配度', '等级', '下一步'].join(','),
              ...entries.map(e => [
                e.candidateName,
                e.positionName,
                e.projectName,
                e.fitScore,
                e.grade,
                e.nextStep,
              ].join(','))
            ].join('\n');
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `shortlist_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
          }}
          className="bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
        >
          导出名单
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {label: '候选人总数', value: loading ? '-' : stats.total, icon: Star},
          {label: '待安排面试', value: loading ? '-' : stats.interview, icon: CheckCircle2},
          {label: '待发起外联', value: loading ? '-' : stats.outreach, icon: Mail},
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-gray-500 dark:text-gray-400">{item.label}</span>
                <Icon className="w-4 h-4 text-[#1a4bc4]" />
              </div>
              <div className="text-[28px] leading-none font-bold text-gray-900 dark:text-white">{item.value}</div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-10 flex items-center justify-center text-gray-500 dark:text-gray-400">
          正在加载入围名单...
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-10 flex items-center justify-center text-gray-500 dark:text-gray-400">
          暂无入围候选人，请在候选人搜索页添加
        </div>
      ) : (
        Object.entries(groupedByPosition).map(([positionId, group]) => {
          const typedGroup = group as {positionName: string; projectName: string; entries: ShortlistEntry[]};
          return (
            <div key={positionId} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50">
                <div>
                  <h2 className="text-[16px] font-bold text-gray-900 dark:text-white">{typedGroup.positionName}</h2>
                  <span className="text-[12px] text-gray-500 dark:text-gray-400">{typedGroup.projectName}</span>
                </div>
                <div className="text-[12px] text-gray-500 dark:text-gray-400">{typedGroup.entries.length} 人</div>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {typedGroup.entries.map((item) => (
                <div key={item.id} className="px-6 py-4 grid grid-cols-1 xl:grid-cols-[1.2fr_1fr_0.5fr_0.8fr_0.9fr] gap-4 items-center">
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white mb-1">{item.candidateName}</div>
                    <div className="text-[12px] text-gray-500 dark:text-gray-400">{item.role}</div>
                  </div>
                  <div className="text-[13px] text-gray-700 dark:text-gray-300">下一步：<span className="font-medium text-gray-900 dark:text-white">{item.nextStep}</span></div>
                  <div className="text-[13px] text-gray-900 dark:text-white font-medium">{item.fitScore}</div>
                  <div>
                    <span className={`inline-flex w-7 h-7 items-center justify-center rounded text-[12px] font-bold text-white ${item.grade === 'A' ? 'bg-[#10B981]' : 'bg-[#1a4bc4]'}`}>
                      {item.grade}
                    </span>
                  </div>
                  <div className="flex justify-start xl:justify-end space-x-2">
                    <button onClick={() => handleViewDetail(item)} className="px-3 py-2 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-[12px] font-medium text-gray-700 dark:text-gray-300 transition-colors">
                      查看详情
                    </button>
                    <button
                      onClick={() => {
                        setInviteEntry(item);
                        setInviteEmail('');
                        setInviteEmailError('');
                        setShowInterviewInviteDialog(true);
                      }}
                      className="px-3 py-2 bg-[#22d3ee] hover:bg-[#06b6d4] text-white rounded-lg text-[12px] font-medium transition-colors flex items-center"
                    >
                      <Send className="w-3 h-3 mr-1" />
                      发送面试邀请
                    </button>
                    <button
                      onClick={() => {
                        setSelectedEntry(item);
                        setShowPromoteDialog(true);
                      }}
                      className="px-3 py-2 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[12px] font-medium transition-colors"
                    >
                      推进
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          );
        })
      )}
    </motion.div>

    {/* Promote Dialog */}
    {showPromoteDialog && selectedEntry && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <motion.div
          initial={{opacity: 0, scale: 0.95}}
          animate={{opacity: 1, scale: 1}}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">推进候选人</h3>
            <button onClick={() => setShowPromoteDialog(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">候选人</label>
              <div className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white">
                {selectedEntry.candidateName}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">推进人</label>
              <div className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white">
                {getUserName() ?? '未知用户'}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">联系渠道</label>
              <div className="flex gap-2">
                {(['wechat', 'email', 'phone'] as const).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setPromoteForm({...promoteForm, channel: ch})}
                    className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                      promoteForm.channel === ch
                        ? 'bg-[#1a4bc4] text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {ch === 'wechat' ? '微信' : ch === 'email' ? '邮件' : '电话'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">推进理由</label>
              <textarea
                value={promoteForm.reason}
                onChange={(e) => setPromoteForm({...promoteForm, reason: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                rows={3}
                placeholder="请输入推进理由..."
              />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setShowPromoteDialog(false)}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handlePromote}
              disabled={submitting || !promoteForm.reason.trim()}
              className="flex-1 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-[13px] font-medium hover:bg-[#0c2b7a] transition-colors disabled:opacity-50"
            >
              {submitting ? '提交中...' : '提交'}
            </button>
          </div>
        </motion.div>
      </div>
    )}

    {/* Interview Invite Dialog */}
    {showInterviewInviteDialog && inviteEntry && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <motion.div
          initial={{opacity: 0, scale: 0.95}}
          animate={{opacity: 1, scale: 1}}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">发送面试邀请</h3>
            <button onClick={() => setShowInterviewInviteDialog(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">候选人</label>
              <div className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white">
                {inviteEntry.candidateName}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">岗位</label>
              <div className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white">
                {inviteEntry.positionName}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                候选人邮箱 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setInviteEmail(nextValue);
                  if (inviteEmailError) {
                    setInviteEmailError('');
                  }
                }}
                placeholder="请输入候选人邮箱地址"
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#22d3ee] resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              {inviteEmailError && (
                <div className="mt-1 text-[12px] text-red-600 dark:text-red-400">{inviteEmailError}</div>
              )}
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">面试链接</label>
              <div className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] bg-[#cffafe] dark:bg-cyan-900/30 text-[#0c2b7a] dark:text-cyan-300 flex items-center">
                <Link2 className="w-4 h-4 mr-2" />
                /interviews/preview?candidate={inviteEntry.candidateId}&position={inviteEntry.positionId}
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-[12px] text-amber-800 dark:text-amber-300">
              点击"发送邀请"后，系统将生成面试邀请邮件并发送至候选人邮箱。候选人可通过邮件中的链接直接进入AI面试系统进行面试。本次邀请将记录至外联序列。
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => {
                setShowInterviewInviteDialog(false);
                setInviteEmail('');
                setInviteEmailError('');
              }}
              className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              取消
            </button>
            <button
              onClick={async () => {
                const email = inviteEmail.trim();
                if (!email) {
                  setInviteEmailError('请输入候选人邮箱地址');
                  return;
                }
                if (!isValidEmail(email)) {
                  setInviteEmailError('请输入有效的邮箱地址');
                  return;
                }
                setSubmitting(true);
                try {
                  await sendShortlistInterviewInvite(inviteEntry.id, {
                    candidateEmail: email,
                    type: 'interview_invite',
                    subject: `AI面试邀请 - ${inviteEntry.positionName}岗位`,
                    content: `您好 ${inviteEntry.candidateName}，您已被邀请参加${inviteEntry.positionName}的AI面试，请点击以下链接完成面试：/interviews/preview?candidate=${inviteEntry.candidateId}&position=${inviteEntry.positionId}`,
                  });
                  await loadData();
                  // Navigate to interview preview page
                  navigateToPage('ai-interview-preview');
                  setShowInterviewInviteDialog(false);
                  setInviteEmail('');
                  setInviteEmailError('');
                } catch (e) {
                  console.error('Failed to send interview invite:', e);
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={!inviteEmail.trim() || submitting}
              className="flex-1 px-4 py-2 bg-[#22d3ee] text-white rounded-lg text-[13px] font-medium hover:bg-[#06b6d4] transition-colors flex items-center justify-center disabled:opacity-50"
            >
              <Send className="w-4 h-4 mr-2" />
              {submitting ? '发送中...' : '发送邀请'}
            </button>
          </div>
        </motion.div>
      </div>
    )}
    </>
  );
};
