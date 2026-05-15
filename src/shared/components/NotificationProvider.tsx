import {AnimatePresence, motion} from 'motion/react';
import {
  Bell,
  Check,
  Clock,
  FileText,
  MessageSquare,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {useNavigate} from 'react-router-dom';
import {fetchJson} from '../lib/apiClient';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../lib/runtime';

// ---------------------------------------------------------------------------
// Edge Function notification API (production)
// ---------------------------------------------------------------------------

const EF_BASE = `${API_BASE_URL}/functions/v1/index`;

async function efFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${EF_BASE}${path}`, {...init, headers});
  if (!res.ok) throw new Error(`Notification API error: ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'interview'
  | 'approval'
  | 'candidate'
  | 'system'
  | 'outreach';

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string; // ISO string
  read: boolean;
  link?: string; // route to navigate on click
};

type NotificationContextValue = {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Omit<Notification, 'id' | 'time' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismissNotification: (id: string) => void;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'em-box.notifications';
const MAX_NOTIFICATIONS = 50;
const POLL_INTERVAL = 30_000; // 30s

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  interview: Trophy,
  approval: Check,
  candidate: UserPlus,
  system: Clock,
  outreach: MessageSquare,
};

const TYPE_COLOR: Record<NotificationType, string> = {
  interview: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
  approval: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
  candidate: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  system: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  outreach: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 0;
const generateId = (): string => `n-${Date.now()}-${nextId++}`;

function loadFromStorage(): Notification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* noop */ }
  return [];
}

function saveToStorage(notifications: Notification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
  } catch { /* noop */ }
}

/** Map snake_case API row to camelCase Notification */
function mapApiNotification(raw: Record<string, unknown>): Notification {
  return {
    id: String(raw.id),
    type: (raw.type as NotificationType) ?? 'system',
    title: String(raw.title ?? ''),
    message: String(raw.message ?? ''),
    time: String(raw.created_at ?? new Date().toISOString()),
    read: Boolean(raw.read),
    link: raw.link ? String(raw.link) : undefined,
  };
}

function formatRelativeTime(isoTime: string): string {
  const diff = Date.now() - new Date(isoTime).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(isoTime).toLocaleDateString('zh-CN');
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useNotifications = (): NotificationContextValue => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within <NotificationProvider>');
  return ctx;
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const NotificationProvider = ({children}: {children: ReactNode}) => {
  const [notifications, setNotifications] = useState<Notification[]>(loadFromStorage);
  const isRealApi = !USE_MOCK_API;

  // Fetch notifications from server
  const fetchNotifications = useCallback(async () => {
    if (!isRealApi) return;
    try {
      const data = await efFetch<{notifications: Record<string, unknown>[]; unreadCount: number}>(
        '/notifications',
      );
      const mapped = (data.notifications ?? []).map(mapApiNotification);
      setNotifications(mapped);
      saveToStorage(mapped);
    } catch { /* silent — fall back to cached data */ }
  }, [isRealApi]);

  // Initial fetch + polling
  useEffect(() => {
    if (!isRealApi) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [isRealApi, fetchNotifications]);

  // Persist to localStorage on change (for mock mode)
  useEffect(() => {
    if (!isRealApi) saveToStorage(notifications);
  }, [notifications, isRealApi]);

  const addNotification = useCallback(
    (input: Omit<Notification, 'id' | 'time' | 'read'>) => {
      // Local-only: server creates notifications via business triggers
      const n: Notification = {
        ...input,
        id: generateId(),
        time: new Date().toISOString(),
        read: false,
      };
      setNotifications((prev) => [n, ...prev].slice(0, MAX_NOTIFICATIONS));
    },
    [],
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? {...n, read: true} : n)),
    );
    if (isRealApi) {
      efFetch('/notifications/mark-read', {
        method: 'PATCH',
        body: JSON.stringify({id}),
      }).catch(() => {});
    }
  }, [isRealApi]);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({...n, read: true})));
    if (isRealApi) {
      efFetch('/notifications/mark-read', {
        method: 'PATCH',
        body: JSON.stringify({}),
      }).catch(() => {});
    }
  }, [isRealApi]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (isRealApi) {
      efFetch(`/notifications/${id}`, {method: 'DELETE'}).catch(() => {});
    }
  }, [isRealApi]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    dismissNotification,
  };

  return (
    <NotificationContext value={value}>
      {children}
    </NotificationContext>
  );
};

// ---------------------------------------------------------------------------
// Bell dropdown (used in DashboardLayout)
// ---------------------------------------------------------------------------

export const NotificationBell = () => {
  const {notifications, unreadCount, markAsRead, markAllAsRead, dismissNotification} = useNotifications();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleNotificationClick = (n: Notification) => {
    markAsRead(n.id);
    if (n.link) {
      navigate(n.link);
      setOpen(false);
    }
  };

  const recentNotifications = notifications.slice(0, 10);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 text-[#cbd5e1] hover:text-white hover:bg-[#1a4bc4] rounded-lg transition-colors"
        aria-label="通知"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{opacity: 0, y: 8, scale: 0.95}}
            animate={{opacity: 1, y: 0, scale: 1}}
            exit={{opacity: 0, x: -8, scale: 0.95}}
            transition={{duration: 0.15}}
            className="absolute left-full ml-2 bottom-0 w-[360px] max-h-[70vh] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                通知 <span className="text-gray-400 font-normal">({unreadCount} 条未读)</span>
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
                >
                  全部已读
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-[380px] custom-scrollbar">
              {recentNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <FileText className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm">暂无通知</p>
                </div>
              ) : (
                recentNotifications.map((n) => {
                  const Icon = TYPE_ICON[n.type];
                  const colorClass = TYPE_COLOR[n.type];
                  return (
                    <div
                      key={n.id}
                      className={`
                        flex items-start gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-700/50 cursor-pointer
                        transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50
                        ${!n.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}
                      `}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-medium truncate ${!n.read ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                            {n.title}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNotification(n.id);
                            }}
                            className="shrink-0 p-0.5 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                          {formatRelativeTime(n.time)}
                        </p>
                      </div>
                      {!n.read && (
                        <div className="shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
              <button
                onClick={() => {
                  // Navigate to a notifications view (for now, just close)
                  setOpen(false);
                }}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium transition-colors"
              >
                查看全部通知
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
