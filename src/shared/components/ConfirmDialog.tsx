import React, { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

export type ConfirmDialogVariant = 'danger' | 'warning' | 'info';

export interface ConfirmDialogProps {
  /** Whether the dialog is visible */
  open: boolean;
  /** Dialog title */
  title: string;
  /** Dialog message */
  message: string;
  /** Label for the confirm button (default: "确认") */
  confirmText?: string;
  /** Label for the cancel button (default: "取消") */
  cancelText?: string;
  /** Visual variant controlling icon and button color (default: "danger") */
  variant?: ConfirmDialogVariant;
  /** Callback when user confirms */
  onConfirm: () => void;
  /** Callback when user cancels or closes */
  onCancel: () => void;
}

const variantConfig: Record<
  ConfirmDialogVariant,
  {
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
    buttonBg: string;
    buttonHoverBg: string;
  }
> = {
  danger: {
    icon: AlertTriangle,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-100',
    buttonBg: 'bg-red-600',
    buttonHoverBg: 'hover:bg-red-700',
  },
  warning: {
    icon: AlertCircle,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    buttonBg: 'bg-amber-600',
    buttonHoverBg: 'hover:bg-amber-700',
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    buttonBg: 'bg-blue-600',
    buttonHoverBg: 'hover:bg-blue-700',
  },
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the cancel button when dialog opens (safe default)
  useEffect(() => {
    if (open) {
      // Small delay to let animation start
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Trap focus inside dialog and handle Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === 'Tab') {
        const confirmEl = confirmButtonRef.current;
        const cancelEl = cancelButtonRef.current;
        if (!confirmEl || !cancelEl) return;

        // If shift+tab on cancel, wrap to confirm
        if (e.shiftKey && document.activeElement === cancelEl) {
          e.preventDefault();
          confirmEl.focus();
          return;
        }

        // If tab on confirm, wrap to cancel
        if (!e.shiftKey && document.activeElement === confirmEl) {
          e.preventDefault();
          cancelEl.focus();
          return;
        }
      }
    },
    [open, onCancel]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  const config = variantConfig[variant];
  const IconComponent = config.icon;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/50"
            onClick={onCancel}
            aria-hidden="true"
          />

          {/* Dialog panel */}
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4"
          >
            {/* Icon */}
            <div className={`flex items-center justify-center w-12 h-12 rounded-full ${config.iconBg} mb-4`}>
              <IconComponent className={`w-6 h-6 ${config.iconColor}`} />
            </div>

            {/* Title */}
            <h3
              id="confirm-dialog-title"
              className="text-lg font-bold text-gray-900 mb-2"
            >
              {title}
            </h3>

            {/* Message */}
            <p
              id="confirm-dialog-message"
              className="text-sm text-gray-600 leading-relaxed mb-6"
            >
              {message}
            </p>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                ref={cancelButtonRef}
                onClick={onCancel}
                className="px-4 py-2 border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-colors"
              >
                {cancelText}
              </button>
              <button
                ref={confirmButtonRef}
                onClick={onConfirm}
                className={`px-4 py-2 ${config.buttonBg} ${config.buttonHoverBg} text-white rounded-lg text-sm font-medium transition-colors`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmDialog;
