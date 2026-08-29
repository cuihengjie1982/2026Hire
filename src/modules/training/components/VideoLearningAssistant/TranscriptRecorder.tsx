import React, {useState, useRef, useCallback, useEffect} from 'react';
import {Mic, MicOff, Square, Save, Trash2, Edit3, Check, X, Loader2} from 'lucide-react';

interface TranscriptEntry {
  id: string;
  timestamp: number;
  text: string;
}

interface TranscriptRecorderProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTranscriptGenerated: (transcript: string) => void;
  onClose: () => void;
}

const formatTimestamp = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

// Type for browser SpeechRecognition
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: {results: {isFinal: boolean; length: number; [index: number]: {transcript: string}}[]; resultIndex: number}) => void) | null;
  onerror: ((ev: {error: string}) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const getSpeechRecognition = (): (new () => SpeechRecognitionInstance) | null => {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

export const TranscriptRecorder: React.FC<TranscriptRecorderProps> = ({videoRef, onTranscriptGenerated, onClose}) => {
  const [recording, setRecording] = useState(false);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [interimText, setInterimText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setError('您的浏览器不支持语音识别，请使用 Chrome 或 Edge 浏览器');
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({audio: true});
    } catch {
      setError('无法访问麦克风，请授权后重试');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (ev) => {
      const results = ev.results;
      const lastResult = results[ev.resultIndex];
      const text = lastResult[0].transcript.trim();

      if (!text) return;

      if (lastResult.isFinal) {
        const videoTime = videoRef.current?.currentTime ?? 0;
        setEntries(prev => [...prev, {
          id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Math.floor(videoTime),
          text,
        }]);
        setInterimText('');
      } else {
        setInterimText(text);
      }
    };

    recognition.onerror = (ev) => {
      if (ev.error === 'no-speech' || ev.error === 'aborted') return;
      console.error('SpeechRecognition error:', ev.error);
      if (ev.error === 'not-allowed') {
        setError('麦克风权限被拒绝');
        setRecording(false);
        cleanup();
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording (SpeechRecognition stops after silence)
      if (recognitionRef.current) {
        restartTimerRef.current = setTimeout(() => {
          try { recognition.start(); } catch {}
        }, 100);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
    setError(null);

    // Auto-play video
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    }
  }, [videoRef, cleanup]);

  const stopRecording = useCallback(() => {
    cleanup();
    setRecording(false);
    setInterimText('');

    // Pause video
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [videoRef, cleanup]);

  const handleSave = async () => {
    if (entries.length === 0) return;
    setSaving(true);
    try {
      const transcript = entries
        .map(e => `${formatTimestamp(e.timestamp)} - ${e.text}`)
        .join('\n');
      await onTranscriptGenerated(transcript);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleStartEdit = (entry: TranscriptEntry) => {
    setEditingId(entry.id);
    setEditText(entry.text);
  };

  const handleSaveEdit = (id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? {...e, text: editText} : e));
    setEditingId(null);
  };

  const isSupported = !!getSpeechRecognition();

  if (!isSupported) {
    return (
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="text-center space-y-2">
          <p className="text-sm text-red-500">您的浏览器不支持语音识别</p>
          <p className="text-xs text-fg-faint">请使用 Chrome 或 Edge 浏览器</p>
          <button onClick={onClose} className="text-xs text-fg-muted hover:text-fg-secondary">关闭</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface-muted">
        <div className="flex items-center gap-2">
          {recording ? (
            <>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-medium text-red-600">正在录制...</span>
              <span className="text-xs text-fg-faint">{entries.length} 段</span>
            </>
          ) : (
            <span className="text-xs font-medium text-fg-secondary">文字稿录制</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!recording ? (
            <button onClick={startRecording} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs hover:bg-red-600 transition-colors">
              <Mic className="w-3.5 h-3.5" />
              开始录制
            </button>
          ) : (
            <button onClick={stopRecording} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-white rounded-lg text-xs hover:bg-gray-800 transition-colors">
              <Square className="w-3 h-3" />
              停止
            </button>
          )}
          {!recording && entries.length > 0 && (
            <>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs hover:bg-indigo-600 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                保存到课程
              </button>
              <button onClick={onClose} className="p-1.5 text-fg-faint hover:text-fg-secondary hover:bg-surface-muted rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-xs">{error}</div>
      )}

      {/* Entries list */}
      <div className="max-h-[240px] overflow-y-auto">
        {entries.length === 0 && !recording && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-fg-faint">点击「开始录制」，然后播放视频</p>
            <p className="text-xs text-fg-faint mt-1">语音识别会自动记录带时间戳的文字稿</p>
          </div>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2 px-4 py-1.5 hover:bg-surface-muted group border-b border-gray-50 last:border-0">
            <span className="text-xs font-mono text-indigo-500 shrink-0 pt-0.5">{formatTimestamp(entry.timestamp)}</span>
            <span className="text-xs text-fg-faint shrink-0">-</span>
            {editingId === entry.id ? (
              <div className="flex-1 flex items-center gap-1">
                <input
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  className="flex-1 text-xs px-1 py-0.5 border border-border rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
                <button onClick={() => handleSaveEdit(entry.id)} className="p-0.5 text-green-500 hover:bg-green-50 rounded"><Check className="w-3 h-3" /></button>
                <button onClick={() => setEditingId(null)} className="p-0.5 text-fg-faint hover:bg-surface-muted rounded"><X className="w-3 h-3" /></button>
              </div>
            ) : (
              <>
                <span className="text-xs text-fg-secondary flex-1">{entry.text}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => handleStartEdit(entry)} className="p-0.5 text-fg-faint hover:text-indigo-500 rounded"><Edit3 className="w-3 h-3" /></button>
                  <button onClick={() => handleDeleteEntry(entry.id)} className="p-0.5 text-fg-faint hover:text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
                </div>
              </>
            )}
          </div>
        ))}

        {/* Interim result */}
        {interimText && recording && (
          <div className="flex items-start gap-2 px-4 py-1.5 bg-indigo-50">
            <span className="text-xs font-mono text-indigo-400">...</span>
            <span className="text-xs text-fg-faint">-</span>
            <span className="text-xs text-indigo-400 italic">{interimText}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptRecorder;
