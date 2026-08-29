import {useState, useEffect, useCallback} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {Clock, User, ChevronDown, ChevronUp, Filter} from 'lucide-react';
import {getEmployeeHistory, type ProfileHistoryEntry} from '../api';

interface VersionTimelineProps {
  employeeId: string;
}

// Group entries by date
function groupByDate(entries: ProfileHistoryEntry[]): Record<string, ProfileHistoryEntry[]> {
  const groups: Record<string, ProfileHistoryEntry[]> = {};
  for (const entry of entries) {
    const date = entry.changedAt.slice(0, 10);
    if (!groups[date]) groups[date] = [];
    groups[date].push(entry);
  }
  return groups;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === today.toISOString().slice(0, 10)) return '今天';
  if (dateStr === yesterday.toISOString().slice(0, 10)) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const actionLabels: Record<string, {label: string; color: string}> = {
  create: {label: '创建', color: 'bg-blue-100 text-blue-700'},
  update: {label: '更新', color: 'bg-amber-100 text-amber-700'},
  delete: {label: '删除', color: 'bg-red-100 text-red-700'},
  status_change: {label: '状态变更', color: 'bg-purple-100 text-purple-700'},
};

function formatValue(val: string | null): string {
  if (val === null || val === '') return '(空)';
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed.map((p: Record<string, unknown>) => p.name ?? p).join(', ') || '(空)';
    return JSON.stringify(parsed);
  } catch {
    return val;
  }
}

export default function VersionTimeline({employeeId}: VersionTimelineProps) {
  const [entries, setEntries] = useState<ProfileHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fieldFilter, setFieldFilter] = useState<string>('all');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getEmployeeHistory(employeeId, page, 20);
      setEntries(prev => page === 1 ? res.items : [...prev, ...res.items]);
      setTotal(res.total);
    } catch (e) {
      console.error('Failed to load history', e);
    } finally {
      setLoading(false);
    }
  }, [employeeId, page]);

  useEffect(() => {
    setPage(1);
    setEntries([]);
  }, [employeeId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Extract unique field labels for filter
  const fieldLabels = [...new Set(entries.map(e => e.fieldLabel).filter(Boolean) as string[])];

  const filteredEntries = fieldFilter === 'all'
    ? entries
    : entries.filter(e => e.fieldLabel === fieldFilter);

  const grouped = groupByDate(filteredEntries);

  const hasMore = entries.length < total;

  return (
    <div className="space-y-3">
      {/* Header with filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Clock className="w-4 h-4" />
          <span>共 {total} 条变更记录</span>
        </div>
        {fieldLabels.length > 1 && (
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-fg-faint" />
            <select
              value={fieldFilter}
              onChange={e => setFieldFilter(e.target.value)}
              className="text-xs border border-border rounded px-2 py-1 bg-surface"
            >
              <option value="all">全部字段</option>
              {fieldLabels.map(label => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-2.5 top-0 bottom-0 w-px bg-gray-200" />

        <AnimatePresence>
          {Object.entries(grouped).map(([date, dateEntries]) => (
            <div key={date} className="mb-4">
              {/* Date header */}
              <div className="flex items-center gap-2 mb-2 -ml-6">
                <div className="w-5 h-5 rounded-full bg-surface-muted border-2 border-white shadow-sm flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                </div>
                <span className="text-xs font-medium text-fg-muted bg-surface-muted px-2 py-0.5 rounded">
                  {formatDate(date)}
                </span>
              </div>

              {/* Entries for this date */}
              {dateEntries.map((entry, i) => {
                const actionInfo = actionLabels[entry.action] ?? actionLabels.update;
                const isExpanded = expanded[entry.id];
                const isCreate = entry.action === 'create';
                const isDelete = entry.action === 'delete';

                return (
                  <motion.div
                    key={entry.id}
                    initial={{opacity: 0, x: -10}}
                    animate={{opacity: 1, x: 0}}
                    transition={{delay: i * 0.03}}
                    className="relative ml-0 mb-2"
                  >
                    {/* Timeline dot */}
                    <div className="absolute -left-3.5 top-3 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm bg-blue-300" />

                    <div className="bg-surface border border-border-subtle rounded-lg p-3 shadow-sm hover:shadow transition-shadow">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${actionInfo.color}`}>
                            {actionInfo.label}
                          </span>
                          {entry.fieldLabel && (
                            <span className="text-sm font-medium text-fg-secondary">{entry.fieldLabel}</span>
                          )}
                          {isCreate && (
                            <span className="text-sm text-fg-secondary">创建了员工档案</span>
                          )}
                        </div>
                        <span className="text-[11px] text-fg-faint">{formatTime(entry.changedAt)}</span>
                      </div>

                      {/* Show diff for update actions */}
                      {entry.action === 'update' && entry.fieldName && (
                        <div className="mt-1.5">
                          <div className="flex items-center gap-1 text-xs">
                            <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded line-through max-w-[200px] truncate">
                              {formatValue(entry.oldValue)}
                            </span>
                            <span className="text-fg-faint">→</span>
                            <span className="bg-green-50 text-green-600 px-1.5 py-0.5 rounded max-w-[200px] truncate">
                              {formatValue(entry.newValue)}
                            </span>
                          </div>
                          {/* Show full values for long content */}
                          {((entry.oldValue && entry.oldValue.length > 30) || (entry.newValue && entry.newValue.length > 30)) && (
                            <button
                              onClick={() => setExpanded(prev => ({...prev, [entry.id]: !isExpanded}))}
                              className="text-[11px] text-blue-500 hover:text-blue-600 mt-1 flex items-center gap-0.5"
                            >
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              {isExpanded ? '收起' : '展开详情'}
                            </button>
                          )}
                          {isExpanded && (
                            <div className="mt-2 text-xs space-y-1 bg-surface-muted rounded p-2">
                              <div><span className="text-fg-muted">原值：</span>{formatValue(entry.oldValue)}</div>
                              <div><span className="text-fg-muted">新值：</span>{formatValue(entry.newValue)}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Changed by */}
                      {entry.changedByEmail && (
                        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-fg-faint">
                          <User className="w-3 h-3" />
                          <span>{entry.changedByEmail}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ))}
        </AnimatePresence>

        {filteredEntries.length === 0 && !loading && (
          <div className="text-center py-6 text-sm text-fg-faint">
            暂无变更记录
          </div>
        )}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={loading}
            className="text-sm text-blue-500 hover:text-blue-600 disabled:opacity-50"
          >
            {loading ? '加载中...' : '加载更多'}
          </button>
        </div>
      )}
    </div>
  );
}
