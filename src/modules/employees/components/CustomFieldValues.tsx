import {useState, useEffect, useCallback} from 'react';
import {Save, Loader2} from 'lucide-react';
import {listCustomFields, getCustomValues, updateCustomValues, type CustomFieldDef, type CustomFieldValue} from '../api';

interface CustomFieldValuesProps {
  employeeId: string;
}

export default function CustomFieldValues({employeeId}: CustomFieldValuesProps) {
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fieldDefs, currentValues] = await Promise.all([
        listCustomFields(),
        getCustomValues(employeeId),
      ]);
      setFields(fieldDefs);

      // Build value map from current values
      const valMap: Record<string, unknown> = {};
      for (const cv of currentValues) {
        if (cv.valueText != null) valMap[cv.fieldId] = cv.valueText;
        else if (cv.valueNum != null) valMap[cv.fieldId] = cv.valueNum;
        else if (cv.valueDate != null) valMap[cv.fieldId] = cv.valueDate;
        else if (cv.valueJson != null) valMap[cv.fieldId] = cv.valueJson;
      }
      setValues(valMap);
    } catch (e) {
      console.error('Failed to load custom values', e);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = Object.entries(values)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([fieldId, value]) => ({fieldId, value}));
      if (updates.length > 0) {
        await updateCustomValues(employeeId, updates);
      }
    } catch (e) {
      console.error('Failed to save custom values', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-xs text-fg-faint py-2">加载自定义字段...</div>;
  if (fields.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-fg-secondary">自定义字段</h4>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 text-xs text-[#1a4bc4] hover:underline disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          保存
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {fields.map(field => (
          <div key={field.id}>
            <label className="block text-[12px] text-fg-muted mb-1">{field.fieldLabel}</label>
            {field.fieldType === 'select' ? (
              <select
                value={String(values[field.id] ?? '')}
                onChange={e => setValues({...values, [field.id]: e.target.value})}
                className="w-full px-2 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#1a4bc4]"
              >
                <option value="">-</option>
                {field.options?.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : field.fieldType === 'boolean' ? (
              <label className="flex items-center gap-2 py-1.5">
                <input
                  type="checkbox"
                  checked={!!values[field.id]}
                  onChange={e => setValues({...values, [field.id]: e.target.checked})}
                  className="rounded border-border text-[#1a4bc4] focus:ring-[#1a4bc4]"
                />
                <span className="text-sm text-fg-secondary">{values[field.id] ? '是' : '否'}</span>
              </label>
            ) : (
              <input
                type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
                value={String(values[field.id] ?? '')}
                onChange={e => setValues({...values, [field.id]: field.fieldType === 'number' ? Number(e.target.value) : e.target.value})}
                placeholder={field.fieldLabel}
                className="w-full px-2 py-1.5 border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#1a4bc4]"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
