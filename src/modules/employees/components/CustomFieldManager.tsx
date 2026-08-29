import React, {useState, useEffect, useCallback} from 'react';
import {Plus, Trash2, Edit3, Save, X, GripVertical, Tag, Hash, Calendar, List, ToggleLeft, Type} from 'lucide-react';
import {listCustomFields, createCustomField, updateCustomField, deleteCustomField, type CustomFieldDef} from '../api';

const FIELD_TYPES: {value: CustomFieldDef['fieldType']; label: string; icon: React.ElementType}[] = [
  {value: 'text', label: '文本', icon: Type},
  {value: 'number', label: '数字', icon: Hash},
  {value: 'date', label: '日期', icon: Calendar},
  {value: 'select', label: '单选', icon: List},
  {value: 'multiselect', label: '多选', icon: Tag},
  {value: 'boolean', label: '是否', icon: ToggleLeft},
];

export default function CustomFieldManager() {
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    fieldKey: '',
    fieldLabel: '',
    fieldType: 'text' as CustomFieldDef['fieldType'],
    options: '' as string, // comma-separated
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFields(await listCustomFields());
    } catch (e) {
      console.error('Failed to load custom fields', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({fieldKey: '', fieldLabel: '', fieldType: 'text', options: ''});
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.fieldKey.trim() || !form.fieldLabel.trim()) return;

    try {
      if (editingId) {
        await updateCustomField(editingId, {
          fieldLabel: form.fieldLabel.trim(),
          fieldType: form.fieldType,
          options: form.fieldType === 'select' || form.fieldType === 'multiselect'
            ? form.options.split(',').map((s, i) => ({label: s.trim(), value: s.trim()})).filter(o => o.value)
            : [],
        });
      } else {
        await createCustomField({
          fieldKey: form.fieldKey.trim().replace(/\s+/g, '_').toLowerCase(),
          fieldLabel: form.fieldLabel.trim(),
          fieldType: form.fieldType,
          options: form.fieldType === 'select' || form.fieldType === 'multiselect'
            ? form.options.split(',').map((s, i) => ({label: s.trim(), value: s.trim()})).filter(o => o.value)
            : [],
        });
      }
      resetForm();
      await load();
    } catch (e) {
      console.error('Failed to save custom field', e);
    }
  };

  const handleEdit = (field: CustomFieldDef) => {
    setEditingId(field.id);
    setForm({
      fieldKey: field.fieldKey,
      fieldLabel: field.fieldLabel,
      fieldType: field.fieldType,
      options: field.options?.map(o => o.label).join(', ') ?? '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCustomField(id);
      await load();
    } catch (e) {
      console.error('Failed to delete custom field', e);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-fg">字段管理</h3>
          <p className="text-sm text-fg-muted mt-0.5">自定义员工档案字段，支持多种类型</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a] transition-colors"
          >
            <Plus className="w-4 h-4" /> 新增字段
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-surface border border-border rounded-xl p-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-fg-muted mb-1">字段标识 *</label>
              <input
                value={form.fieldKey}
                onChange={e => setForm({...form, fieldKey: e.target.value})}
                disabled={!!editingId}
                placeholder="如 blood_type"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] disabled:bg-surface-muted"
              />
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-1">字段名称 *</label>
              <input
                value={form.fieldLabel}
                onChange={e => setForm({...form, fieldLabel: e.target.value})}
                placeholder="如 血型"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
              />
            </div>
            <div>
              <label className="block text-xs text-fg-muted mb-1">字段类型</label>
              <select
                value={form.fieldType}
                onChange={e => setForm({...form, fieldType: e.target.value as CustomFieldDef['fieldType']})}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
              >
                {FIELD_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {(form.fieldType === 'select' || form.fieldType === 'multiselect') && (
              <div>
                <label className="block text-xs text-fg-muted mb-1">选项（逗号分隔）</label>
                <input
                  value={form.options}
                  onChange={e => setForm({...form, options: e.target.value})}
                  placeholder="选项1, 选项2, 选项3"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a]"
            >
              <Save className="w-3.5 h-3.5" /> {editingId ? '保存' : '创建'}
            </button>
            <button
              onClick={resetForm}
              className="flex items-center gap-1 px-3 py-2 border border-border rounded-lg text-sm text-fg-secondary hover:bg-surface-muted"
            >
              <X className="w-3.5 h-3.5" /> 取消
            </button>
          </div>
        </div>
      )}

      {/* Field List */}
      {loading ? (
        <div className="text-center py-8 text-sm text-fg-faint">加载中...</div>
      ) : fields.length === 0 ? (
        <div className="text-center py-12 bg-surface-muted rounded-xl">
          <Tag className="w-8 h-8 text-fg-faint mx-auto mb-2" />
          <p className="text-sm text-fg-faint">暂无自定义字段</p>
          <p className="text-xs text-fg-faint mt-1">点击「新增字段」或导入 Excel 自动生成</p>
        </div>
      ) : (
        <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-faint border-b border-border-subtle bg-surface-muted/50">
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">字段标识</th>
                <th className="px-4 py-3 font-medium">字段名称</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">选项</th>
                <th className="px-4 py-3 font-medium">来源</th>
                <th className="px-4 py-3 font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(field => {
                const typeInfo = FIELD_TYPES.find(t => t.value === field.fieldType);
                const TypeIcon = typeInfo?.icon ?? Type;
                return (
                  <tr key={field.id} className="border-b border-gray-50 hover:bg-surface-muted/50 transition-colors">
                    <td className="px-4 py-3 text-fg-faint">
                      <GripVertical className="w-4 h-4" />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-fg-muted">{field.fieldKey}</td>
                    <td className="px-4 py-3 font-medium text-fg-secondary">{field.fieldLabel}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs">
                        <TypeIcon className="w-3 h-3" /> {typeInfo?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-fg-muted text-xs">
                      {field.options?.length ? field.options.map(o => o.label).join(', ') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${field.source === 'excel_import' ? 'bg-green-50 text-green-600' : 'bg-surface-muted text-fg-muted'}`}>
                        {field.source === 'excel_import' ? 'Excel导入' : '手动创建'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleEdit(field)} className="p-1 text-fg-faint hover:text-blue-500">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(field.id)} className="p-1 text-fg-faint hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
