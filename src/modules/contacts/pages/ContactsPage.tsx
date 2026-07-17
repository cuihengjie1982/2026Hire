import {useEffect, useState, useMemo} from 'react';
import {motion} from 'motion/react';
import {Loader2, MessageSquare, Pencil, Search, Trash2, UserCheck, X} from 'lucide-react';
import {listContacts, updateContact, updateContactStatus, deleteContact} from '../api';
import {type Contact, type ContactChannel} from '../types';
import {useProject} from '../../../app/contexts/ProjectContext';
import {CandidateDetailModal} from '../../../CandidateDetailModal';
import type {CandidateCard} from '../../talent/types';

const STATUS_OPTIONS = [
  {value: 'pending', label: '待联系', color: 'bg-amber-100 text-amber-700'},
  {value: 'contacted', label: '已联系', color: 'bg-blue-100 text-blue-700'},
  {value: 'responded', label: '已回复', color: 'bg-emerald-100 text-emerald-700'},
  {value: 'interview_scheduled', label: '已安排面试', color: 'bg-purple-100 text-purple-700'},
  {value: 'hired', label: '已入职', color: 'bg-green-100 text-green-700'},
  {value: 'rejected', label: '已拒绝', color: 'bg-surface-muted text-fg-muted'},
];

const CHANNEL_LABELS: Record<string, string> = {
  wechat: '微信',
  email: '邮件',
  phone: '电话',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '待联系',
  contacted: '已联系',
  responded: '已回复',
  interview_scheduled: '已安排面试',
  hired: '已入职',
  rejected: '已拒绝',
};

export const ContactsPage = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateCard | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState({outreachPerson: '', channel: 'wechat' as ContactChannel, reason: ''});
  const [submitting, setSubmitting] = useState(false);
  const {selectedProject, projects} = useProject();
  const loadContacts = async (projectId?: string) => {
    setLoading(true);
    try {
      const data = await listContacts(projectId);
      setContacts(data);
    } catch (e) {
      console.error('Failed to load contacts:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts(selectedProject?.id);
  }, [selectedProject]);

  const handleStatusChange = async (id: string, newStatus: Contact['status']) => {
    try {
      const updated = await updateContactStatus(id, newStatus);
      setContacts((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e) {
      console.error('Failed to update status:', e);
      setToastMessage('状态更新失败，请重试');
    }
  };

  const handleDeleteContact = async (contact: Contact) => {
    if (!window.confirm(`确定要删除联系人「${contact.candidateName}」吗？`)) return;
    try {
      await deleteContact(contact.id);
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      setToastMessage(`已删除联系人：${contact.candidateName}`);
    } catch (e) {
      console.error('Failed to delete contact:', e);
      setToastMessage(e instanceof Error ? e.message : '删除失败，请重试');
    }
  };

  const openEditDialog = (contact: Contact) => {
    setEditingContact(contact);
    setEditForm({
      outreachPerson: contact.outreachPerson,
      channel: contact.channel,
      reason: contact.reason,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingContact || !editForm.reason.trim()) return;
    setSubmitting(true);
    try {
      const updated = await updateContact(editingContact.id, {
        outreachPerson: editForm.outreachPerson.trim(),
        channel: editForm.channel,
        reason: editForm.reason.trim(),
      });
      setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingContact(null);
      setToastMessage(`已更新联系人：${updated.candidateName}`);
    } catch (e) {
      console.error('Failed to update contact:', e);
      setToastMessage(e instanceof Error ? e.message : '更新失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCandidateClick = (contact: Contact) => {
    const card: CandidateCard = {
      id: contact.candidateId,
      name: contact.candidateName,
      location: '',
      source: '',
      sourceColor: '',
      roles: [],
      tags: [],
      fitScore: [],
      scoreColor: '',
      grade: '',
      gradeColor: '',
      reason: '',
      projectId: contact.projectId,
      projectName: contact.projectName,
      positionId: contact.positionId,
      positionName: contact.positionName,
    };
    setSelectedCandidate(card);
  };

  // Client-side search filter
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(c =>
      c.candidateName.toLowerCase().includes(q) ||
      c.positionName.toLowerCase().includes(q) ||
      c.projectName.toLowerCase().includes(q) ||
      c.outreachPerson.toLowerCase().includes(q),
    );
  }, [contacts, searchQuery]);

  const stats = useMemo(() => ({
    total: filteredContacts.length,
    pending: filteredContacts.filter((c) => c.status === 'pending').length,
    contacted: filteredContacts.filter((c) => c.status === 'contacted').length,
    responded: filteredContacts.filter((c) => c.status === 'responded').length,
  }), [filteredContacts]);

  return (
    <motion.div
      initial={{opacity: 0, y: 10}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: -10}}
      className="max-w-[1500px] mx-auto w-full p-6 space-y-5"
    >
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-[13px] font-medium flex items-center gap-2">
          {toastMessage}
          <button onClick={() => setToastMessage(null)} className="ml-2 text-fg-faint hover:text-white">×</button>
        </div>
      )}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-fg mb-1">联系人管理</h1>
          <p className="text-[13px] text-fg-muted">管理所有已推进的候选人，追踪联系状态和漏斗转化。</p>
        </div>
      </div>

      {/* Project filter + Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedProject?.id ?? ''}
          onChange={(e) => {
            const project = projects.find(p => p.id === e.target.value);
            // Use the ProjectContext setter indirectly by selecting project
            // The parent component handles this via the sidebar project selector
          }}
          className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-fg-secondary"
        >
          <option value="">全部项目</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-faint" />
          <input
            type="text"
            placeholder="搜索候选人、岗位、项目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-fg-secondary placeholder-fg-faint focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          {label: '联系人总数', value: loading ? '-' : stats.total, icon: MessageSquare},
          {label: '待联系', value: loading ? '-' : stats.pending, icon: Loader2},
          {label: '已联系', value: loading ? '-' : stats.contacted, icon: UserCheck},
          {label: '已回复', value: loading ? '-' : stats.responded, icon: MessageSquare},
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="bg-surface rounded-xl border border-border shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-fg-muted">{item.label}</span>
                <Icon className="w-4 h-4 text-[#1a4bc4]" />
              </div>
              <div className="text-[28px] leading-none font-bold text-fg">{item.value}</div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="bg-surface rounded-xl border border-border shadow-sm p-10 flex items-center justify-center text-fg-muted">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          正在加载联系人...
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border shadow-sm p-10 flex items-center justify-center text-fg-muted">
          {searchQuery ? '没有找到匹配的联系人' : '暂无联系人，请在入围名单中推进候选人'}
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-muted/50 border-b border-border">
              <tr className="text-left text-[12px] text-fg-muted font-medium">
                <th className="px-6 py-3">候选人</th>
                <th className="px-6 py-3">岗位</th>
                <th className="px-6 py-3">推进人</th>
                <th className="px-6 py-3">渠道</th>
                <th className="px-6 py-3">推进理由</th>
                <th className="px-6 py-3">状态</th>
                <th className="px-6 py-3">时间</th>
                <th className="px-6 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredContacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-surface-muted transition-colors">
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleCandidateClick(contact)}
                      className="font-bold text-fg text-[14px] hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left"
                    >
                      {contact.candidateName}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[13px] text-fg-secondary">{contact.positionName}</div>
                    <div className="text-[11px] text-fg-muted">{contact.projectName}</div>
                  </td>
                  <td className="px-6 py-4 text-[13px] text-fg-secondary">{contact.outreachPerson}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-surface-muted text-fg-secondary rounded text-[11px] font-medium">
                      {CHANNEL_LABELS[contact.channel] ?? contact.channel}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[12px] text-fg-secondary max-w-[200px] line-clamp-2">{contact.reason}</div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={contact.status}
                      onChange={(e) => handleStatusChange(contact.id, e.target.value as Contact['status'])}
                      className={`px-2 py-1 rounded text-[11px] font-medium border-0 ${STATUS_OPTIONS.find((s) => s.value === contact.status)?.color}`}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-[12px] text-fg-muted">
                    {new Date(contact.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditDialog(contact)}
                        className="px-2 py-1.5 border border-border text-fg-secondary rounded-lg hover:bg-surface-muted transition-colors"
                        title="编辑推进信息"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteContact(contact)}
                        className="px-2 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                        title="删除联系人"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Contact Dialog */}
      {editingContact && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{opacity: 0, scale: 0.95}}
            animate={{opacity: 1, scale: 1}}
            className="bg-surface rounded-xl shadow-xl w-full max-w-md p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-fg">编辑推进信息</h3>
              <button
                onClick={() => setEditingContact(null)}
                className="text-fg-faint hover:text-fg-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-fg-secondary mb-1">候选人</label>
                <div className="px-3 py-2 border border-border rounded-lg text-[13px] bg-surface-muted text-fg">
                  {editingContact.candidateName}
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-fg-secondary mb-1">岗位</label>
                <div className="px-3 py-2 border border-border rounded-lg text-[13px] bg-surface-muted text-fg">
                  {editingContact.positionName} · {editingContact.projectName}
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-fg-secondary mb-1">推进人</label>
                <input
                  type="text"
                  value={editForm.outreachPerson}
                  onChange={(e) => setEditForm({...editForm, outreachPerson: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-surface-muted text-fg"
                  placeholder="请输入推进人"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-fg-secondary mb-1">联系渠道</label>
                <div className="flex gap-2">
                  {(['wechat', 'email', 'phone'] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setEditForm({...editForm, channel: ch})}
                      className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                        editForm.channel === ch
                          ? 'bg-[#1a4bc4] text-white'
                          : 'bg-surface-muted text-fg-secondary hover:bg-surface-muted'
                      }`}
                    >
                      {CHANNEL_LABELS[ch]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-fg-secondary mb-1">推进理由</label>
                <textarea
                  value={editForm.reason}
                  onChange={(e) => setEditForm({...editForm, reason: e.target.value})}
                  className="w-full px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] resize-none bg-surface-muted text-fg"
                  rows={3}
                  placeholder="请输入推进理由..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingContact(null)}
                className="flex-1 px-4 py-2 border border-border text-fg-secondary rounded-lg text-[13px] font-medium hover:bg-surface-muted transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={submitting || !editForm.reason.trim()}
                className="flex-1 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-[13px] font-medium hover:bg-[#0c2b7a] transition-colors disabled:opacity-50"
              >
                {submitting ? '保存中...' : '保存'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Candidate Detail Modal */}
      <CandidateDetailModal
        isOpen={!!selectedCandidate}
        onClose={() => setSelectedCandidate(null)}
        candidate={selectedCandidate ?? undefined}
      />
    </motion.div>
  );
};
