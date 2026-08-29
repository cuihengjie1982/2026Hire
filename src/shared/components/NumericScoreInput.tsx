import {useCallback, useEffect, useRef, useState} from 'react';
import {ChevronDown, ChevronUp} from 'lucide-react';

type NumericScoreInputProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  wheelStep?: number;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const normalizeDraft = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length > 1 && digits.startsWith('0')) {
    return digits.replace(/^0+/, '');
  }
  return digits;
};

export const NumericScoreInput = ({
  value,
  onChange,
  min = 0,
  max = 100,
  disabled = false,
  className = '',
  placeholder,
  wheelStep = 1,
}: NumericScoreInputProps) => {
  const [draft, setDraft] = useState(() => String(value));
  const focused = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused.current) {
      setDraft(String(value));
    }
  }, [value]);

  const applyStep = useCallback((delta: number) => {
    const current = draft === '' ? min : parseInt(draft, 10);
    if (Number.isNaN(current)) return;
    const next = clamp(current + delta, min, max);
    onChange(next);
    setDraft(String(next));
  }, [draft, min, max, onChange]);

  const commitDraft = (raw: string) => {
    if (raw === '') {
      onChange(min);
      setDraft(String(min));
      return;
    }
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = clamp(parsed, min, max);
    onChange(next);
    setDraft(String(next));
  };

  // Non-passive wheel listener — React onWheel cannot reliably prevent page scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    const handleWheel = (e: WheelEvent) => {
      if (!focused.current) return;
      e.preventDefault();
      e.stopPropagation();
      applyStep(e.deltaY < 0 ? wheelStep : -wheelStep);
    };

    el.addEventListener('wheel', handleWheel, {passive: false});
    return () => el.removeEventListener('wheel', handleWheel);
  }, [disabled, applyStep, wheelStep]);

  const atMax = (draft === '' ? min : parseInt(draft, 10)) >= max;
  const atMin = (draft === '' ? min : parseInt(draft, 10)) <= min;
  const containerClass = className.includes('w-full')
    ? 'relative inline-flex w-full min-w-0'
    : 'relative inline-flex w-fit min-w-0';

  return (
    <div ref={containerRef} className={containerClass}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        title={disabled ? undefined : '聚焦后可用滚轮或右侧箭头微调'}
        className={`${className} pr-7`}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur={() => {
          focused.current = false;
          commitDraft(draft);
        }}
        onChange={(e) => {
          const raw = normalizeDraft(e.target.value);
          setDraft(raw);
          if (raw !== '') {
            const parsed = parseInt(raw, 10);
            if (!Number.isNaN(parsed)) {
              onChange(clamp(parsed, min, max));
            }
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            applyStep(wheelStep);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            applyStep(-wheelStep);
          }
        }}
      />
      {!disabled && (
        <div className="absolute right-1 top-1 bottom-1 flex flex-col justify-center border-l border-border pl-0.5">
          <button
            type="button"
            tabIndex={-1}
            aria-label="增加"
            disabled={atMax}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              inputRef.current?.focus();
              applyStep(wheelStep);
            }}
            className="flex items-center justify-center w-4 h-3.5 text-fg-faint hover:text-[#6366F1] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronUp className="w-3 h-3" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="减少"
            disabled={atMin}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              inputRef.current?.focus();
              applyStep(-wheelStep);
            }}
            className="flex items-center justify-center w-4 h-3.5 text-fg-faint hover:text-[#6366F1] disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronDown className="w-3 h-3" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
};
