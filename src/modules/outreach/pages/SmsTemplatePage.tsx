import {useEffect, useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {Plus, Trash2, Check, X, MessageSquare, Copy} from 'lucide-react';
import {listSmsTemplates, sendSms} from '../../outreach/api';
import {type SmsTemplate} from '../../outreach/types';
import {API_BASE_URL, getAuthToken, USE_MOCK_API} from '../../../shared/lib/runtime';

export const SmsTemplatePage = () => {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    templateId: '',
    signName: '',
    content: '',
    parameters: '',
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadTemplates = async () => {
    try {
      const data = await listSmsTemplates();
      setTemplates(data);
    } catch (e) {
      console.error('Failed to load SMS templates', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.templateId.trim()) return;
    setSubmitting(true);
    try {
      if (USE_MOCK_API) {
        // Mock: add to fixture-based localStorage
        const newTpl: SmsTemplate = {
          id: Date.now().toString(),
          name: form.name.trim(),
          templateId: form.templateId.trim(),
          signName: form.signName.trim() || undefined,
          content: form.content.trim() || undefined,
          parameters: form.parameters ? form.parameters.split(',').map(s => s.trim()) : [],
        };
        setTemplates(prev => [newTpl, ...prev]);
      } else {
        const base = API_BASE_URL || '';
        const res = await fetch(`${base}/api/sms-gateway/templates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken() ?? ''}`,
          },
          body: JSON.stringify({
            name: form.name.trim(),
            templateId: form.templateId.trim(),
            signName: form.signName.trim() || undefined,
            content: form.content.trim() || undefined,
            parameters: form.parameters ? form.parameters.split(',').map(s => s.trim()) : [],
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }
        await loadTemplates();
      }
      setShowCreateForm(false);
      setForm({name: '', templateId: '', signName: '', content: '', parameters: ''});
    } catch (e) {
      console.error('Failed to create SMS template', e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    // Note: Edge Function doesn't have a DELETE endpoint yet, but we handle mock
    setTemplates(prev => prev.filter(t => t.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">短信模板管理</h3>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">
            管理腾讯云短信模板，在发送短信时选择使用
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[13px] font-medium transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-1" />
          新建模板
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 animate-pulse">
              <div className="h-5 w-32 bg-gray-100 dark:bg-gray-700 rounded mb-3" />
              <div className="h-4 w-48 bg-gray-100 dark:bg-gray-700 rounded mb-2" />
              <div className="h-4 w-24 bg-gray-100 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
          <MessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-[13px] text-gray-500 dark:text-gray-400">暂无短信模板</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-3 px-4 py-2 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[13px] font-medium transition-colors"
          >
            创建第一个模板
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((tpl) => (
            <motion.div
              key={tpl.id}
              initial={{opacity: 0, y: 8}}
              animate={{opacity: 1, y: 0}}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-[14px] font-semibold text-gray-900 dark:text-white">{tpl.name}</h4>
                  {tpl.signName && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                      【{tpl.signName}】
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setDeleteId(tpl.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="text-[12px] text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-3 font-mono whitespace-pre-wrap break-all">
                {tpl.content || '(无内容)'}
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
                <span>模板ID: {tpl.templateId}</span>
                {tpl.parameters.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Copy className="w-3 h-3" />
                    {tpl.parameters.length} 个参数: {tpl.parameters.join(', ')}
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Template Modal */}
      <AnimatePresence>
        {showCreateForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <motion.div
              initial={{opacity: 0, scale: 0.95}}
              animate={{opacity: 1, scale: 1}}
              exit={{opacity: 0, scale: 0.95}}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">新建短信模板</h3>
                <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                    模板名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.name}
                    onChange={e => setForm(p => ({...p, name: e.target.value}))}
                    placeholder="例如：面试邀请通知"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                    腾讯云模板ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.templateId}
                    onChange={e => setForm(p => ({...p, templateId: e.target.value}))}
                    placeholder="例如：1234567"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">短信签名</label>
                  <input
                    value={form.signName}
                    onChange={e => setForm(p => ({...p, signName: e.target.value}))}
                    placeholder="例如：EM-BOX"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                    模板内容
                  </label>
                  <textarea
                    value={form.content}
                    onChange={e => setForm(p => ({...p, content: e.target.value}))}
                    placeholder="例如：您好{1}，您已进入{2}岗位面试环节..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">使用 {'{0}'}, {'{1}'} 等作为变量占位符</p>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                    参数列表（逗号分隔）
                  </label>
                  <input
                    value={form.parameters}
                    onChange={e => setForm(p => ({...p, parameters: e.target.value}))}
                    placeholder="候选人姓名, 岗位名称"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!form.name.trim() || !form.templateId.trim() || submitting}
                  className="flex-1 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-[13px] font-medium hover:bg-[#0c2b7a] transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  <Check className="w-4 h-4 mr-1" />
                  {submitting ? '创建中...' : '创建模板'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <motion.div
              initial={{opacity: 0, scale: 0.95}}
              animate={{opacity: 1, scale: 1}}
              exit={{opacity: 0, scale: 0.95}}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6"
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">确认删除</h3>
              <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-6">
                删除后将无法恢复。确定要删除此短信模板吗？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-[13px] font-medium hover:bg-red-700 transition-colors"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
