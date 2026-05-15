import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastType = 'success' | 'error' | 'warning' | 'info';

type ToastAction = {
  label: string;
  onClick: () => void;
};

type Toast = {
  id: string;
  type: ToastType;
  message: string;
  action?: ToastAction;
};

type ToastInput = {
  type: ToastType;
  message: string;
  action?: ToastAction;
  duration?: number;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  success: (message: string, action?: ToastAction) => void;
  error: (message: string, action?: ToastAction) => void;
  warning: (message: string, action?: ToastAction) => void;
  info: (message: string, action?: ToastAction) => void;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_VISIBLE = 5;
const DEFAULT_DURATION = 3000;

const ICON_MAP: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLOR_MAP: Record<
  ToastType,
  { bg: string; border: string; icon: string; text: string }
> = {
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800',
    icon: 'text-emerald-500',
    text: 'text-emerald-800 dark:text-emerald-200',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    border: 'border-red-200 dark:border-red-800',
    icon: 'text-red-500',
    text: 'text-red-800 dark:text-red-200',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800',
    icon: 'text-amber-500',
    text: 'text-amber-800 dark:text-amber-200',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-500',
    text: 'text-blue-800 dark:text-blue-200',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextId = 0;
const generateId = (): string => `toast-${nextId++}`;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
};

// ---------------------------------------------------------------------------
// Single toast component
// ---------------------------------------------------------------------------

const ToastItem = ({
  item,
  onDismiss,
}: {
  item: Toast;
  onDismiss: (id: string) => void;
}) => {
  const Icon = ICON_MAP[item.type];
  const colors = COLOR_MAP[item.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={`
        pointer-events-auto flex items-start gap-3 w-80 rounded-xl border
        px-4 py-3 shadow-lg backdrop-blur-sm
        ${colors.bg} ${colors.border}
      `}
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${colors.icon}`} />

      <p className={`flex-1 text-sm font-medium leading-snug ${colors.text}`}>
        {item.message}
      </p>

      <div className="flex items-center gap-1 shrink-0">
        {item.action && (
          <button
            onClick={item.action.onClick}
            className={`
              text-xs font-semibold px-2 py-1 rounded-lg transition-colors
              ${colors.icon} hover:bg-black/5 dark:hover:bg-white/10
            `}
          >
            {item.action.label}
          </button>
        )}
        <button
          onClick={() => onDismiss(item.id)}
          className={`
            p-0.5 rounded-lg transition-colors
            text-gray-400 hover:text-gray-600
            dark:text-gray-500 dark:hover:text-gray-300
          `}
          aria-label="关闭通知"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};

// Wrapper to attach React `key` via Fragment, avoiding type inference issues
// with AnimatePresence children in this project's type configuration.
const ToastItemWrapper = ToastItem;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (input: ToastInput) => {
      const id = generateId();
      const { duration = DEFAULT_DURATION } = input;

      const newToast: Toast = {
        id,
        type: input.type,
        message: input.message,
        action: input.action,
      };

      setToasts((prev) => {
        const updated = [...prev, newToast];
        return updated.length > MAX_VISIBLE ? updated.slice(-MAX_VISIBLE) : updated;
      });

      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const success = useCallback(
    (message: string, action?: ToastAction) =>
      addToast({ type: 'success', message, action }),
    [addToast],
  );

  const error = useCallback(
    (message: string, action?: ToastAction) =>
      addToast({ type: 'error', message, action }),
    [addToast],
  );

  const warning = useCallback(
    (message: string, action?: ToastAction) =>
      addToast({ type: 'warning', message, action }),
    [addToast],
  );

  const info = useCallback(
    (message: string, action?: ToastAction) =>
      addToast({ type: 'info', message, action }),
    [addToast],
  );

  const value: ToastContextValue = {
    toast: addToast,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext value={value}>
      {children}

      {/* Toast container - fixed bottom-right */}
      <div
        aria-label="通知区域"
        className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-3 pointer-events-none"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((item) => (
            <motion.div key={item.id} layout initial={false}>
              <ToastItem item={item} onDismiss={dismiss} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext>
  );
};
