import {useMemo, useState} from 'react';
import {ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X} from 'lucide-react';
import type {VideoPolarity, VideoTaxonomy, VideoTaxonomyOption} from '../types';

type TaxonomySection = 'task' | 'scene' | 'positive' | 'negative';

interface VideoTaxonomyManagerProps {
  taxonomy: VideoTaxonomy;
  onClose: () => void;
  onCreate: (input: {kind: 'task' | 'scene' | 'quality'; name: string; polarity?: VideoPolarity}) => Promise<void>;
  onUpdate: (id: string, updates: {name?: string; sortOrder?: number; isActive?: boolean}) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const sectionMeta: Record<TaxonomySection, {label: string; placeholder: string}> = {
  task: {label: '任务分类', placeholder: '新增任务分类'},
  scene: {label: '场景', placeholder: '新增场景'},
  positive: {label: '正向标签', placeholder: '新增正向标签'},
  negative: {label: '负向标签', placeholder: '新增负向标签'},
};

export const VideoTaxonomyManager = ({
  taxonomy,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: VideoTaxonomyManagerProps) => {
  const [activeSection, setActiveSection] = useState<TaxonomySection>('task');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const options = useMemo(() => {
    if (activeSection === 'task') return taxonomy.taskCategories;
    if (activeSection === 'scene') return taxonomy.scenes;
    return activeSection === 'positive' ? taxonomy.positiveTags : taxonomy.negativeTags;
  }, [activeSection, taxonomy]);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const input = activeSection === 'task'
      ? {kind: 'task' as const, name}
      : activeSection === 'scene'
        ? {kind: 'scene' as const, name}
      : {kind: 'quality' as const, name, polarity: activeSection as VideoPolarity};
    await run('create', async () => {
      await onCreate(input);
      setNewName('');
    });
  };

  const startEditing = (option: VideoTaxonomyOption) => {
    setEditingId(option.id);
    setEditingName(option.name);
  };

  const saveEditing = async (option: VideoTaxonomyOption) => {
    const name = editingName.trim();
    if (!name || name === option.name) {
      setEditingId(null);
      return;
    }
    await run(option.id, async () => {
      await onUpdate(option.id, {name});
      setEditingId(null);
    });
  };

  const moveOption = async (option: VideoTaxonomyOption, direction: -1 | 1) => {
    const index = options.findIndex(item => item.id === option.id);
    const neighbor = options[index + direction];
    if (!neighbor) return;
    const sortOrder = direction < 0 ? neighbor.sortOrder - 1 : neighbor.sortOrder + 1;
    await run(option.id, () => onUpdate(option.id, {sortOrder}));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-taxonomy-title"
        className="w-full max-w-2xl max-h-[86vh] overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 id="video-taxonomy-title" className="text-base font-semibold text-fg">视频分类管理</h2>
            <p className="mt-1 text-xs text-fg-muted">停用不会影响已分类的视频；已使用的项目不能删除。</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-fg-muted hover:bg-surface-muted" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="border-b border-border px-5 pt-4">
          <div className="inline-flex border border-border bg-surface-muted p-1" role="tablist">
            {(Object.keys(sectionMeta) as TaxonomySection[]).map(section => {
              const count = section === 'task'
                ? taxonomy.taskCategories.length
                : section === 'scene'
                  ? taxonomy.scenes.length
                  : section === 'positive' ? taxonomy.positiveTags.length : taxonomy.negativeTags.length;
              return (
                <button
                  key={section}
                  type="button"
                  role="tab"
                  aria-selected={activeSection === section}
                  onClick={() => { setActiveSection(section); setEditingId(null); setNewName(''); }}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    activeSection === section ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {sectionMeta[section].label} {count}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={event => setNewName(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') void handleCreate(); }}
              placeholder={sectionMeta[activeSection].placeholder}
              maxLength={100}
              className="min-w-0 flex-1 border border-border px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!newName.trim() || busyId === 'create'}
              className="inline-flex items-center gap-1.5 bg-[#1a4bc4] px-3 py-2 text-sm font-medium text-white hover:bg-[#153da0] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> 添加
            </button>
          </div>

          {error && <p className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="mt-4 divide-y divide-border border-y border-border">
            {options.map((option, index) => (
              <div key={option.id} className="flex min-h-14 items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  {editingId === option.id ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={editingName}
                        onChange={event => setEditingName(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter') void saveEditing(option); }}
                        className="min-w-0 flex-1 border border-border px-2 py-1.5 text-sm"
                      />
                      <button type="button" onClick={() => void saveEditing(option)} aria-label="保存名称" className="p-2 text-emerald-600 hover:bg-emerald-50">
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 ${option.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      <span className={`truncate text-sm font-medium ${option.isActive ? 'text-fg' : 'text-fg-faint'}`}>{option.name}</span>
                      {!option.isActive && <span className="text-xs text-fg-faint">已停用</span>}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void moveOption(option, -1)}
                  disabled={index === 0 || busyId === option.id}
                  aria-label={`上移${option.name}`}
                  title="上移"
                  className="p-2 text-fg-muted hover:bg-surface-muted disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void moveOption(option, 1)}
                  disabled={index === options.length - 1 || busyId === option.id}
                  aria-label={`下移${option.name}`}
                  title="下移"
                  className="p-2 text-fg-muted hover:bg-surface-muted disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => startEditing(option)} aria-label={`编辑${option.name}`} title="改名" className="p-2 text-fg-muted hover:bg-surface-muted">
                  <Pencil className="h-4 w-4" />
                </button>
                <label className="inline-flex cursor-pointer items-center" title={option.isActive ? '停用' : '启用'}>
                  <input
                    type="checkbox"
                    checked={option.isActive}
                    disabled={busyId === option.id}
                    onChange={() => void run(option.id, () => onUpdate(option.id, {isActive: !option.isActive}))}
                    className="h-4 w-4 accent-[#1a4bc4]"
                    aria-label={`${option.isActive ? '停用' : '启用'}${option.name}`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`确定删除“${option.name}”吗？已使用的分类会被系统拒绝删除。`)) {
                      void run(option.id, () => onDelete(option.id));
                    }
                  }}
                  disabled={busyId === option.id}
                  aria-label={`删除${option.name}`}
                  title="删除"
                  className="p-2 text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {options.length === 0 && <p className="py-8 text-center text-sm text-fg-faint">暂无分类，先添加一个。</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoTaxonomyManager;
