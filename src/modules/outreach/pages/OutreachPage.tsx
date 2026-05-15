import {motion} from 'motion/react';
import {AlertCircle, CheckCircle, Loader2, MessageSquare, Plus, Send, Trash2, X} from 'lucide-react';
import {useState, useEffect} from 'react';
import {useOutreachRecords} from '../hooks';
import {createOutreachRecord, deleteOutreachRecord, updateOutreachRecordStatus, sendSms, listSmsTemplates} from '../api';
import {type CommChannel, type CommStatus, type OutreachRecord, type SmsTemplate} from '../types';
import {listCandidates} from '../../candidates/api';
import {type CandidateCard} from '../../candidates/types';

const CHANNEL_OPTIONS: {value: CommChannel; label: string; color: string}[] = [
  {value: 'phone', label: '电话', color: 'bg-blue-100 text-blue-700'},
  {value: 'wechat', label: '微信', color: 'bg-emerald-100 text-emerald-700'},
  {value: 'email', label: '邮件', color: 'bg-indigo-100 text-indigo-700'},
  {value: 'sms', label: '短信', color: 'bg-purple-100 text-purple-700'},
  {value: 'interview', label: '面试', color: 'bg-amber-100 text-amber-700'},
  {value: 'other', label: '其他', color: 'bg-gray-100 text-gray-600'},
];

const STATUS_OPTIONS: {value: CommStatus; label: string; color: string}[] = [
  {value: 'pending', label: '待联系', color: 'bg-amber-100 text-amber-700'},
  {value: 'contacted', label: '已联系', color: 'bg-blue-100 text-blue-700'},
  {value: 'responded', label: '已回复', color: 'bg-emerald-100 text-emerald-700'},
  {value: 'failed', label: '未接通', color: 'bg-red-100 text-red-700'},
];

export const OutreachPage = () => {
  const {
    data: records,
    error: recordsError,
    isLoading: isRecordsLoading,
    setData: setRecords,
  } = useOutreachRecords();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [candidates, setCandidates] = useState<CandidateCard[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [newChannel, setNewChannel] = useState<CommChannel>('phone');
  const [newContent, setNewContent] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  // SMS state
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});
  const [smsError, setSmsError] = useState<string | null>(null);

  const selectedCandidate = candidates.find(c => c.id === selectedCandidateId);
  const selectedTemplate = smsTemplates.find(t => t.id === selectedTemplateId);
  const isSmsMode = newChannel === 'sms';

  const pending = records.filter(r => r.status === 'pending').length;
  const contacted = records.filter(r => r.status === 'contacted').length;
  const responded = records.filter(r => r.status === 'responded').length;

  // Load SMS templates when SMS mode is activated
  useEffect(() => {
    if (isSmsMode && smsTemplates.length === 0) {
      listSmsTemplates().then(setSmsTemplates).catch(() => {});
    }
  }, [isSmsMode, smsTemplates.length]);

  const handleOpenCreate = async () => {
    setShowCreateDialog(true);
    setSmsError(null);
    if (candidates.length === 0) {
      try {
        const all = await listCandidates();
        setCandidates(all);
      } catch {
        // ignore
      }
    }
  };

  const handleCreate = async () => {
    const candidate = candidates.find(c => c.id === selectedCandidateId);
    if (!candidate) return;
    setCreating(true);
    setSmsError(null);

    try {
      if (isSmsMode) {
        // SMS send path
        if (!selectedTemplateId) {
          setSmsError('请选择短信模板');
          setCreating(false);
          return;
        }
        const paramValues = selectedTemplate
          ? selectedTemplate.parameters.map(p => templateParams[p] ?? '').filter(Boolean)
          : [];
        if (paramValues.length === 0) {
          setSmsError('请填写模板参数');
          setCreating(false);
          return;
        }

        const created = await sendSms({
          candidateId: candidate.id,
          templateId: selectedTemplateId,
          templateParamSet: paramValues,
        });
        setRecords([created, ...records]);
        resetDialog();
      } else {
        // Standard outreach record
        const created = await createOutreachRecord({
          candidateId: candidate.id,
          candidateName: candidate.name,
          channel: newChannel,
          content: newContent.trim() || undefined,
        });
        setRecords([created, ...records]);
        resetDialog();
      }
    } catch (e) {
      if (isSmsMode) {
        setSmsError(e instanceof Error ? e.message : '短信发送失败');
      } else {
        console.error('Failed to create record:', e);
      }
    } finally {
      setCreating(false);
    }
  };

  const resetDialog = () => {
    setShowCreateDialog(false);
    setSelectedCandidateId('');
    setNewChannel('phone');
    setNewContent('');
    setSelectedTemplateId('');
    setTemplateParams({});
    setSmsError(null);
  };

  const handleDeleteRecord = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteOutreachRecord(id);
      setRecords(records.filter((r) => (r.id === id)));
    } catch (e) {
      console.error('Failed to delete record:', e);
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (id: string, newStatus: CommStatus) => {
    setUpdatingStatusId(id);
    try {
      const updated = await updateOutreachRecordStatus(id, newStatus);
      setRecords(records.map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      console.error('Failed to update status:', e);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  // SMS preview text
  const smsPreview = selectedTemplate
    ? selectedTemplate.content?.replace(/\{(\d+)\}/g, (_m, idx: string) => templateParams[selectedTemplate.parameters[parseInt(idx, 10)]] ?? `{${idx}}`) ?? ''
    : '';

  const canSend = isSmsMode
    ? !!selectedCandidateId && !!selectedTemplateId && selectedTemplate && selectedTemplate.parameters.every(p => templateParams[p]?.trim())
    : !!selectedCandidateId;

  return (
    <motion.div
      initial={{opacity: 0, y: 10}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -10}}
      className="max-w-[1500px] mx-auto w-full p-6 space-y-5"
    >
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 dark:text-white mb-1">沟通记录</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">记录与候选人的每次沟通，追踪联系状态。</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white px-4 py-2 rounded-lg text-[13px] font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增记录
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {label: '总记录', value: records.length, icon: MessageSquare},
          {label: '待联系', value: pending, icon: MessageSquare},
          {label: '已联系', value: contacted, icon: MessageSquare},
          {label: '已回复', value: responded, icon: MessageSquare},
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[12px] text-gray-500 dark:text-gray-400">{item.label}</div>
                <Icon className="w-4 h-4 text-[#1a4bc4]" />
              </div>
              <div className="text-[28px] leading-none font-bold text-gray-900 dark:text-white">{item.value}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {isRecordsLoading ? (
          <div className="p-10 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            正在加载沟通记录...
          </div>
        ) : recordsError ? (
          <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-2xl">
            沟通记录加载失败：{recordsError}
          </div>
        ) : records.length === 0 ? (
          <div className="p-10 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 text-[13px]">
            <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-3" />
            暂无沟通记录，点击右上角按钮新增
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr className="text-left text-[12px] text-gray-500 dark:text-gray-400 font-medium">
                  <th className="px-5 py-3">候选人</th>
                  <th className="px-5 py-3">岗位</th>
                  <th className="px-5 py-3">渠道</th>
                  <th className="px-5 py-3">内容</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">时间</th>
                  <th className="px-5 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-5 py-4">
                      <span className="font-medium text-gray-900 dark:text-white text-[13px]">{record.candidateName || '-'}</span>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-gray-600 dark:text-gray-300">{record.positionName || '-'}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${CHANNEL_OPTIONS.find(c => c.value === record.channel)?.color ?? 'bg-gray-100 text-gray-600'}`}>
                        {CHANNEL_OPTIONS.find(c => c.value === record.channel)?.label ?? record.channel}
                      </span>
                      {record.channel === 'sms' && record.smsStatus && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${record.smsStatus === 'sent' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                          {record.smsStatus === 'sent' ? '已送达' : '发送失败'}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-[12px] text-gray-600 dark:text-gray-300 max-w-[240px] truncate">{record.content || '-'}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        {updatingStatusId === record.id && (
                          <Loader2 className="w-3 h-3 animate-spin text-gray-400 dark:text-gray-500" />
                        )}
                        <select
                          value={record.status}
                          onChange={(e) => handleStatusChange(record.id, e.target.value as CommStatus)}
                          disabled={updatingStatusId === record.id}
                          className={`px-2 py-1 rounded text-[11px] font-medium border-0 cursor-pointer disabled:opacity-50 ${STATUS_OPTIONS.find((s) => s.value === record.status)?.color ?? 'bg-gray-100 text-gray-600'}`}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[12px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(record.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleDeleteRecord(record.id)}
                        disabled={deletingId === record.id}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:opacity-50"
                        title="删除记录"
                      >
                        {deletingId === record.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Record Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[18px] font-bold text-gray-900 dark:text-white">
                {isSmsMode ? '发送短信' : '新增沟通记录'}
              </h3>
              <button onClick={resetDialog} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {/* Candidate selector */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">候选人</label>
                <select
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">请选择候选人</option>
                  {candidates.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {isSmsMode && selectedCandidate && (
                  <div className="mt-1.5 text-[12px] text-gray-500 dark:text-gray-400">
                    手机号：{selectedCandidate.phone || <span className="text-red-500">未填写</span>}
                  </div>
                )}
                {isSmsMode && selectedCandidateId && selectedCandidate && !selectedCandidate.phone && (
                  <div className="mt-1 flex items-center gap-1 text-[12px] text-red-500">
                    <AlertCircle className="w-3.5 h-3.5" />
                    该候选人未填写手机号码，无法发送短信
                  </div>
                )}
              </div>

              {/* Channel selector */}
              <div>
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">沟通渠道</label>
                <div className="flex flex-wrap gap-2">
                  {CHANNEL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setNewChannel(opt.value); setSmsError(null); }}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                        newChannel === opt.value
                          ? 'border-[#1a4bc4] bg-[#1a4bc4]/5 text-[#1a4bc4]'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* SMS-specific UI */}
              {isSmsMode ? (
                <>
                  {/* Template selector */}
                  <div>
                    <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">短信模板</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => { setSelectedTemplateId(e.target.value); setTemplateParams({}); setSmsError(null); }}
                      className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">请选择模板</option>
                      {smsTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Dynamic template parameters */}
                  {selectedTemplate && selectedTemplate.parameters.length > 0 && (
                    <div className="space-y-2.5">
                      <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300">模板参数</label>
                      {selectedTemplate.parameters.map((param, idx) => (
                        <div key={idx}>
                          <input
                            type="text"
                            value={templateParams[param] ?? ''}
                            onChange={(e) => setTemplateParams(prev => ({...prev, [param]: e.target.value}))}
                            placeholder={param}
                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* SMS preview */}
                  {smsPreview && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                      <div className="text-[11px] text-purple-600 dark:text-purple-400 font-medium mb-1">预览</div>
                      <div className="text-[13px] text-gray-700 dark:text-gray-300">{smsPreview}</div>
                    </div>
                  )}

                  {/* SMS error */}
                  {smsError && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <div className="text-[13px] text-red-600 dark:text-red-400">{smsError}</div>
                    </div>
                  )}
                </>
              ) : (
                /* Standard content textarea */
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">沟通内容</label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="简要记录沟通内容..."
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] resize-none placeholder:text-gray-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={resetDialog}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-[13px] font-medium text-gray-700 dark:text-gray-300 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!canSend || creating || (isSmsMode && !!selectedCandidate && !selectedCandidate.phone)}
                className="flex-1 px-4 py-2.5 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isSmsMode ? (
                  <Send className="w-4 h-4" />
                ) : null}
                {isSmsMode ? '发送短信' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
