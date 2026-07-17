import React from 'react';
import {Box, CheckCircle2, Hand, MousePointer2, Timer} from 'lucide-react';
import type {TrainingActionCaption} from '../../../types';

const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(value / 60);
  const secs = value % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const getCaptionTitle = (caption: TrainingActionCaption) => caption.title || caption.text;

export const getActiveActionCaption = (
  captions: TrainingActionCaption[],
  currentVideoTime: number,
): TrainingActionCaption | null => captions.find(caption =>
  currentVideoTime >= caption.start && currentVideoTime < caption.end,
) ?? null;

export const ActionCaptionLiveCard: React.FC<{
  captions: TrainingActionCaption[];
  currentVideoTime: number;
  onOpenActions?: () => void;
}> = ({captions, currentVideoTime, onOpenActions}) => {
  const active = getActiveActionCaption(captions, currentVideoTime);
  if (!active) return null;

  return (
    <button
      type="button"
      onClick={onOpenActions}
      className="w-full text-left rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 hover:bg-blue-100 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
            <MousePointer2 className="w-3.5 h-3.5" />
            当前动作 · {formatTime(active.start)} - {formatTime(active.end)}
          </p>
          <p className="mt-1 text-base font-bold text-gray-950">{getCaptionTitle(active)}</p>
          <p className="mt-1 text-sm leading-6 text-fg-secondary">{active.description || active.text}</p>
        </div>
        {typeof active.confidence === 'number' && (
          <span className="shrink-0 rounded-full bg-surface px-2 py-1 text-xs font-semibold text-blue-700">
            {Math.round(active.confidence * 100)}%
          </span>
        )}
      </div>
    </button>
  );
};

export const ActionCaptionsTab: React.FC<{
  captions: TrainingActionCaption[];
  currentVideoTime: number;
  onSeek: (time: number) => void;
}> = ({captions, currentVideoTime, onSeek}) => {
  if (!captions.length) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="rounded-xl border border-border bg-surface-muted p-5 text-sm leading-6 text-fg-muted">
          暂无动作流。管理员可在视频分享资料库中点击“动作流”生成。
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-fg">实时动作流</p>
            <p className="mt-0.5 text-xs text-fg-muted">{captions.length} 个动作片段，点击可跳转</p>
          </div>
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-fg-secondary">
            {formatTime(currentVideoTime)}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {captions.map((caption, index) => {
          const active = currentVideoTime >= caption.start && currentVideoTime < caption.end;
          return (
            <button
              key={`${caption.start}-${caption.end}-${index}`}
              type="button"
              onClick={() => onSeek(caption.start)}
              className={`w-full text-left rounded-xl border p-4 transition-colors ${
                active
                  ? 'border-blue-300 bg-blue-50 shadow-sm'
                  : 'border-border bg-surface hover:bg-surface-muted'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  active ? 'bg-blue-600 text-white' : 'bg-surface-muted text-fg-muted'
                }`}>
                  <Timer className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-fg-muted">
                      {formatTime(caption.start)} - {formatTime(caption.end)}
                    </span>
                    {typeof caption.confidence === 'number' && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                        置信度 {Math.round(caption.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-bold text-gray-950">{getCaptionTitle(caption)}</p>
                  <p className="mt-1 text-sm leading-6 text-fg-secondary">{caption.description || caption.text}</p>

                  {(caption.handAction || caption.result || caption.objects?.length) && (
                    <div className="mt-3 grid gap-2 text-xs text-fg-secondary">
                      {caption.handAction && (
                        <p className="flex items-start gap-2">
                          <Hand className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                          <span>{caption.handAction}</span>
                        </p>
                      )}
                      {caption.objects?.length ? (
                        <p className="flex items-start gap-2">
                          <Box className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span>{caption.objects.join('、')}</span>
                        </p>
                      ) : null}
                      {caption.result && (
                        <p className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span>{caption.result}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ActionCaptionsTab;
