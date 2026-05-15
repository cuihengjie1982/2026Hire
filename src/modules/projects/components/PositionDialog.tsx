import {motion} from 'motion/react';
import {Plus, X} from 'lucide-react';
import {useState, useEffect} from 'react';
import {createPosition} from '../../positions/api';
import {listProjects} from '../api';
import {type PositionCategory} from '../../positions/types';
import type {Project} from '../types';

const CATEGORY_OPTIONS: {label: string; value: PositionCategory | 'custom'}[] = [
  {label: 'ITF 实验室采集', value: 'ITF'},
  {label: 'ITW 野外采集', value: 'ITW'},
  {label: 'MWV 动捕演员', value: 'MWV'},
  {label: '自定义', value: 'custom'},
];

export const PositionDialog = ({
  isOpen,
  onClose,
  selectedProjectId,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedProjectId?: string | null;
  onSuccess?: () => void;
}) => {
  const [formData, setFormData] = useState({
    name: '',
    category: 'MWV' as PositionCategory | 'custom',
    customCategory: '',
    projectId: selectedProjectId ?? '',
    description: '',
    requiredCount: '',
    deliveryDays: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (selectedProjectId) {
      setFormData((prev) => ({...prev, projectId: selectedProjectId}));
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (!isOpen) return;
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.projectId) return;
    const finalCategory = formData.category === 'custom' ? formData.customCategory : formData.category;
    if (!finalCategory.trim()) return;
    setSubmitting(true);
    try {
      await createPosition({
        name: formData.name,
        category: finalCategory as PositionCategory,
        projectId: formData.projectId || null,
        description: formData.description,
        requiredCount: formData.requiredCount ? parseInt(formData.requiredCount) : undefined,
        deliveryDays: formData.deliveryDays ? parseInt(formData.deliveryDays) : undefined,
      });
      onSuccess?.();
      onClose();
      setFormData({name: '', category: 'MWV', customCategory: '', projectId: '', description: '', requiredCount: '', deliveryDays: ''});
    } catch (e) {
      console.error('Failed to create position:', e);
      alert('创建失败: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{opacity: 0, scale: 0.95}}
        animate={{opacity: 1, scale: 1}}
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">新建岗位</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">岗位名称 *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
              placeholder="如：MWV-全身动捕演员"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">关联项目 *</label>
            {selectedProjectId ? (
              <div className="px-3 py-2 border border-gray-200 rounded-lg text-[13px] bg-gray-50 text-gray-700">
                已选择项目（项目ID：{selectedProjectId}）
              </div>
            ) : (
              <select
                value={formData.projectId}
                onChange={(e) => setFormData({...formData, projectId: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white"
              >
                <option value="">请选择项目</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1">需求人数</label>
              <input
                type="number"
                value={formData.requiredCount}
                onChange={(e) => setFormData({...formData, requiredCount: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                placeholder="如：5"
                min="0"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-700 mb-1">交付周期（天）</label>
              <input
                type="number"
                value={formData.deliveryDays}
                onChange={(e) => setFormData({...formData, deliveryDays: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                placeholder="如：30"
                min="0"
              />
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">岗位类型</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${
                    formData.category === opt.value
                      ? 'border-[#1a4bc4] bg-[#EBF5FF] text-[#1a4bc4]'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    value={opt.value}
                    checked={formData.category === opt.value}
                    onChange={(e) => setFormData({...formData, category: e.target.value as PositionCategory | 'custom'})}
                    className="sr-only"
                  />
                  <span className="text-[13px] font-medium">{opt.label}</span>
                  {opt.value === 'custom' && <Plus className="w-3 h-3" />}
                </label>
              ))}
            </div>
            {formData.category === 'custom' && (
              <input
                type="text"
                value={formData.customCategory}
                onChange={(e) => setFormData({...formData, customCategory: e.target.value})}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] mt-2"
                placeholder="请输入自定义岗位类型"
              />
            )}
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">描述</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] resize-none"
              rows={3}
              placeholder="岗位要求描述..."
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-[13px] font-medium hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !formData.name.trim() || !formData.projectId || (formData.category === 'custom' && !formData.customCategory.trim())}
            className="flex-1 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-[13px] font-medium hover:bg-[#0c2b7a] transition-colors disabled:opacity-50"
          >
            {submitting ? '创建中...' : '创建'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
