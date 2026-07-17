import { Mic, MicOff, Loader2 } from 'lucide-react';
import type { FC } from 'react';

interface VoiceInputButtonProps {
  isListening: boolean;
  isSupported: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  className?: string;
}

/**
 * Mic button with recording animation for voice input.
 * Shows pulsing ring when recording, greyed-out when unsupported.
 */
const VoiceInputButton: FC<VoiceInputButtonProps> = ({
  isListening, isSupported, disabled, onStart, onStop, className = '',
}) => {
  // Unsupported — show disabled mic
  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        title="您的浏览器不支持语音输入"
        className={`flex-shrink-0 w-10 h-10 rounded-xl bg-surface-muted text-fg-faint flex items-center justify-center cursor-not-allowed ${className}`}
      >
        <MicOff className="w-4 h-4" />
      </button>
    );
  }

  // Listening — show animated recording button
  if (isListening) {
    return (
      <button
        type="button"
        onClick={onStop}
        disabled={disabled}
        className={`flex-shrink-0 relative w-10 h-10 rounded-xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors ${className}`}
      >
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-xl bg-red-400 animate-ping opacity-40" />
        <Mic className="w-4 h-4 relative z-10" />
      </button>
    );
  }

  // Idle — show ready mic
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      title="语音输入（点击开始，再次点击结束）"
      className={`flex-shrink-0 w-10 h-10 rounded-xl bg-surface-muted text-fg-muted flex items-center justify-center hover:bg-surface-muted hover:text-[#1a4bc4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
    >
      <Mic className="w-4 h-4" />
    </button>
  );
};

export default VoiceInputButton;
