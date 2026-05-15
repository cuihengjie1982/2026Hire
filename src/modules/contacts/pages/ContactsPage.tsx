import {useEffect, useState, useMemo} from 'react';
import {motion} from 'motion/react';
import {Loader2, MessageSquare, Search, UserCheck} from 'lucide-react';
import {listContacts, updateContactStatus} from '../api';
import {type Contact} from '../types';
import {useProject} from '../../../app/contexts/ProjectContext';
import {CandidateDetailModal} from '../../../CandidateDetailModal';
import type {CandidateCard} from '../../talent/types';

const STATUS_OPTIONS = [
  {value: 'pending', label: '待联系', color: 'bg-amber-100 text-amber-700'},
  {value: 'contacted', label: '已联系', color: 'bg-blue-100 text-blue-700'},
  {value: 'responded', label: '已回复', color: 'bg-emerald-100 text-emerald-700'},
  {value: 'interview_scheduled', label: '已安排面试', color: 'bg-purple-100 text-purple-700'},
  {value: 'hired', label: '已入职', color: 'bg-green-100 text-green-700'},
  {value: 'rejected', label: '已拒绝', color: 'bg-gray-100 text-gray-500'},
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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 dark:text-white mb-1">联系人管理</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">管理所有已推进的候选人，追踪联系状态和漏斗转化。</p>
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
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300"
        >
          <option value="">全部项目</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索候选人、岗位、项目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
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
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          正在加载联系人...
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-10 flex items-center justify-center text-gray-500 dark:text-gray-400">
          {searchQuery ? '没有找到匹配的联系人' : '暂无联系人，请在入围名单中推进候选人'}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              <tr className="text-left text-[12px] text-gray-500 dark:text-gray-400 font-medium">
                <th className="px-6 py-3">候选人</th>
                <th className="px-6 py-3">岗位</th>
                <th className="px-6 py-3">推进人</th>
                <th className="px-6 py-3">渠道</th>
                <th className="px-6 py-3">推进理由</th>
                <th className="px-6 py-3">状态</th>
                <th className="px-6 py-3">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {filteredContacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleCandidateClick(contact)}
                      className="font-bold text-gray-900 dark:text-white text-[14px] hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left"
                    >
                      {contact.candidateName}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[13px] text-gray-700 dark:text-gray-300">{contact.positionName}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">{contact.projectName}</div>
                  </td>
                  <td className="px-6 py-4 text-[13px] text-gray-700 dark:text-gray-300">{contact.outreachPerson}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-[11px] font-medium">
                      {CHANNEL_LABELS[contact.channel] ?? contact.channel}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[12px] text-gray-600 dark:text-gray-300 max-w-[200px] line-clamp-2">{contact.reason}</div>
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
                  <td className="px-6 py-4 text-[12px] text-gray-500 dark:text-gray-400">
                    {new Date(contact.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
