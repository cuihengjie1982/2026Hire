import { useState, useRef, useCallback, useEffect } from 'react';

type VoiceState = 'idle' | 'listening' | 'error' | 'unsupported';

interface UseVoiceInputReturn {
  state: VoiceState;
  transcript: string;       // final transcript accumulated
  interim: string;           // current interim result
  isListening: boolean;
  errorMessage: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Voice input hook using Web Speech API (SpeechRecognition).
 * Works in Chrome, Safari, Edge. Falls back gracefully on unsupported browsers.
 * Optimized for Chinese (zh-CN) with continuous recognition.
 */
export const useVoiceInput = (lang = 'zh-CN'): UseVoiceInputReturn => {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalRef = useRef('');  // accumulated final transcript

  // Check support — use browser-prefixed constructor if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SpeechRecognitionCtor = typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as { new(): SpeechRecognition } | undefined
    : undefined;
  const isSupported = typeof SpeechRecognitionCtor !== 'undefined';

  useEffect(() => {
    if (!isSupported || !SpeechRecognitionCtor) {
      setState('unsupported');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;      // keep listening after pauses
    recognition.interimResults = true;  // get real-time partial results
    recognition.lang = lang;

    recognition.onstart = () => {
      setState('listening');
      setInterim('');
    };

    recognition.onresult = (event) => {
      let interimText = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0]?.transcript ?? '';
        } else {
          interimText += result[0]?.transcript ?? '';
        }
      }

      if (finalText) {
        finalRef.current += finalText;
        setTranscript(finalRef.current);
        setInterim('');
      } else {
        setInterim(interimText);
      }
    };

    recognition.onerror = () => {
      console.warn('[VoiceInput] Speech recognition error');
      setErrorMessage('语音识别出错，请重试');
      setState('error');
    };

    recognition.onend = () => {
      setInterim('');
      setState(prev => prev === 'error' ? 'error' : 'idle');
    };

    recognitionRef.current = recognition;

    return () => {
      try { recognition.abort(); } catch { /* ignore */ }
    };
  }, [isSupported, lang, SpeechRecognitionCtor]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setErrorMessage('');
    finalRef.current = '';
    setTranscript('');
    setInterim('');
    try {
      recognitionRef.current.start();
    } catch {
      // Already started — restart
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      try { recognitionRef.current.start(); } catch { /* ignore */ }
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch { /* ignore */ }
    // Merge interim into final
    if (interim) {
      finalRef.current += interim;
      setTranscript(finalRef.current);
      setInterim('');
    }
  }, [interim]);

  const reset = useCallback(() => {
    finalRef.current = '';
    setTranscript('');
    setInterim('');
    setErrorMessage('');
    setState('idle');
  }, []);

  return {
    state,
    transcript,
    interim,
    isListening: state === 'listening',
    errorMessage,
    start,
    stop,
    reset,
  };
};
