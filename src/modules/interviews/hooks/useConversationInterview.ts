import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  ConversationSession, ConversationMessage, ConversationSubState,
  ConversationScore, ConversationalConfig,
} from '../types';
import {
  createConvSession, sendConversationMessage, streamConversationMessage,
  completeConversation, scoreConversation, askCandidateQuestion,
} from '../api';

type InterviewState = 'connecting' | 'active' | 'completed';

export const useConversationInterview = (sessionId: string) => {
  const [state, setState] = useState<InterviewState>('connecting');
  const [subState, setSubState] = useState<ConversationSubState>('idle');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);
  const [topicsCovered, setTopicsCovered] = useState<number>(0);
  const [shouldClose, setShouldClose] = useState(false);
  const [config, setConfig] = useState<ConversationalConfig>({
    maxDurationMinutes: 30, icebreakerMessage: '', closingMessage: '',
    allowCandidateQuestions: false, candidateQuestionPrompt: '',
    maxFollowUpsPerTopic: 2, transcriptLanguage: 'zh-CN',
  });
  const [convSessionId, setConvSessionId] = useState<string>('');
  const [score, setScore] = useState<ConversationScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const totalTimeRef = useRef(30 * 60); // seconds
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timeLeft, setTimeLeft] = useState(30 * 60);
  const cancelStreamRef = useRef<(() => void) | null>(null);

  // Start the conversation session on mount
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const conv = await createConvSession(sessionId, 'start');
        if (cancelled) return;
        setConvSessionId(conv.convSessionId);
        setMessages(conv.messages ?? []);
        setCurrentTopic(conv.currentTopic);
        setConfig(conv.config);
        setState('active');
        if (conv.config.maxDurationMinutes) {
          totalTimeRef.current = conv.config.maxDurationMinutes * 60;
          setTimeLeft(conv.config.maxDurationMinutes * 60);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '创建面试会话失败');
      }
    };
    init();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Timer
  useEffect(() => {
    if (state !== 'active') return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Time's up — auto-complete
          completeInterview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  const addMessage = useCallback((msg: ConversationMessage) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || state !== 'active') return;

    // Add candidate message immediately (optimistic)
    const candidateMsg: ConversationMessage = {
      id: `temp-${Date.now()}`, convSessionId, role: 'candidate',
      content: content.trim(), messageType: 'text', questionId: null,
      createdAt: new Date().toISOString(),
    };
    addMessage(candidateMsg);
    setSubState('ai_thinking');
    setIsStreaming(true);

    // Cancel any existing stream
    if (cancelStreamRef.current) cancelStreamRef.current();

    let fullContent = '';
    cancelStreamRef.current = streamConversationMessage(
      convSessionId, content.trim(),
      (token) => {
        fullContent += token;
        // Update the streaming message
        setMessages(prev => {
          const idx = prev.findIndex(m => m.id === '__streaming__');
          const streamingMsg: ConversationMessage = {
            id: '__streaming__', convSessionId, role: 'interviewer',
            content: fullContent, messageType: 'text', questionId: null,
            createdAt: new Date().toISOString(),
          };
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = streamingMsg;
            return next;
          }
          return [...prev, streamingMsg];
        });
      },
      (done) => {
        // Replace streaming placeholder with final message
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== '__streaming__');
          return [...filtered, {
            id: done.messageId ?? `ai-${Date.now()}`, convSessionId,
            role: 'interviewer' as const, content: fullContent,
            messageType: 'text', questionId: null,
            createdAt: new Date().toISOString(),
          }];
        });
        setCurrentTopic(done.conversationState.currentTopic);
        setShouldClose(done.conversationState.shouldClose);
        setIsStreaming(false);
        setSubState(done.conversationState.shouldClose ? 'candidate_asking' : 'idle');
      },
      (err) => {
        setMessages(prev => prev.filter(m => m.id !== '__streaming__'));
        setError(err);
        setIsStreaming(false);
        setSubState('idle');
      },
    );
  }, [convSessionId, state, addMessage]);

  const completeInterview = useCallback(async () => {
    if (state !== 'active') return;
    try {
      if (cancelStreamRef.current) cancelStreamRef.current();
      await completeConversation(convSessionId);
      // Score the conversation
      const result = await scoreConversation(convSessionId);
      setScore(result);
      setState('completed');
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : '结束面试失败');
    }
  }, [convSessionId, state]);

  const askQuestion = useCallback(async (question: string) => {
    if (!question.trim() || state !== 'active') return;
    try {
      const result = await askCandidateQuestion(convSessionId, question.trim());
      addMessage({
        id: `candq-${Date.now()}`, convSessionId, role: 'candidate',
        content: question.trim(), messageType: 'candidate_question',
        questionId: null, createdAt: new Date().toISOString(),
      });
      if (result.message) addMessage(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : '提问失败');
    }
  }, [convSessionId, state, addMessage]);

  const retry = useCallback(async () => {
    setError(null);
    setSubState('idle');
  }, []);

  return {
    state, subState, messages, currentTopic, topicsCovered,
    config, convSessionId, score, error, isStreaming, timeLeft, shouldClose,
    sendMessage, completeInterview, askQuestion, retry,
  };
};
