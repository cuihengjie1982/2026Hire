import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCircle, Send, AlertCircle, Clock, Bot, User, Loader2 } from 'lucide-react';
import { useConversationInterview } from '../hooks/useConversationInterview';
import type { ConversationMessage } from '../types';

// Relative imports for the page wrapper
import { ErrorBoundary } from '../../../shared/components/ErrorBoundary';

// ---------------------------------------------------------------------------
// Time formatter
// ---------------------------------------------------------------------------
const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Sub-components (defined inline to keep file count manageable)
// ---------------------------------------------------------------------------

/** AI interviewer avatar area — static for Phase 1, will be video for Phase 2 */
const InterviewerAvatar = ({ name = 'AI 面试官' }: { name?: string }) => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1a4bc4] to-purple-500 flex items-center justify-center">
      <Bot className="w-5 h-5 text-white" />
    </div>
    <div>
      <span className="font-medium text-gray-900 text-sm">{name}</span>
      <span className="ml-2 inline-block w-2 h-2 rounded-full bg-green-400" title="在线" />
    </div>
  </div>
);

/** Message bubble */
const MessageBubble = ({
  msg, isStreaming,
}: {
  msg: ConversationMessage;
  isStreaming: boolean;
}) => {
  const isInterviewer = msg.role === 'interviewer';

  return (
    <div className={`flex gap-3 ${isInterviewer ? '' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isInterviewer
          ? 'bg-gradient-to-br from-[#1a4bc4] to-purple-500'
          : 'bg-gray-300'
      }`}>
        {isInterviewer
          ? <Bot className="w-4 h-4 text-white" />
          : <User className="w-4 h-4 text-gray-600" />
        }
      </div>

      {/* Content */}
      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
        isInterviewer
          ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
          : 'bg-[#1a4bc4] text-white rounded-tr-sm'
      }`}>
        <div className="whitespace-pre-wrap break-words">
          {msg.content}
          {isStreaming && msg.id === '__streaming__' && (
            <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle" />
          )}
        </div>
        {!isStreaming && msg.createdAt && (
          <div className={`text-xs mt-1 ${isInterviewer ? 'text-gray-400' : 'text-blue-200'}`}>
            {new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
};

/** Typing indicator shown while AI is generating */
const TypingIndicator = () => (
  <div className="flex gap-3">
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#1a4bc4] to-purple-500 flex items-center justify-center">
      <Bot className="w-4 h-4 text-white" />
    </div>
    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
      <div className="flex gap-1.5">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
);

/** Completion overlay — shown when interview is done */
const CompletionOverlay = ({
  score, timeLeft, onClose,
}: {
  score: import('../types').ConversationScore | null;
  timeLeft: number;
  onClose: () => void;
}) => (
  <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-50 flex items-center justify-center p-6">
    <div className="max-w-md w-full text-center space-y-6">
      {/* Icon */}
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <MessageCircle className="w-10 h-10 text-green-500" />
        </div>
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-gray-900">面试完成</h2>
      <p className="text-sm text-gray-500">
        总用时 {formatTime(timeLeft > 0 ? timeLeft : 0)}，感谢你的参与！
      </p>

      {/* Score preview */}
      {score && (
        <div className="bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF] rounded-2xl p-5 space-y-3">
          <div className="text-4xl font-bold text-[#1a4bc4]">{score.overallScore}<span className="text-lg text-gray-400 font-normal">/100</span></div>
          <div className="inline-block px-3 py-1 rounded-full bg-white text-sm font-medium text-gray-700">
            {score.gradeLabel}
          </div>
          <p className="text-sm text-gray-600">{score.summary}</p>
        </div>
      )}

      {!score && (
        <div className="flex justify-center">
          <Loader2 className="w-8 h-8 text-[#1a4bc4] animate-spin" />
        </div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-[#1a4bc4] hover:bg-[#1e3a8a] transition-colors"
      >
        返回面试中心
      </button>
    </div>
  </div>
);

// ============================================================================
// Main page component
// ============================================================================
const ConversationInterviewPageInner = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? '';

  const {
    state, subState, messages, currentTopic, topicsCovered,
    config, score, error, isStreaming, timeLeft, shouldClose,
    sendMessage, completeInterview, askQuestion, retry,
  } = useConversationInterview(sessionId);

  const [input, setInput] = useState('');
  const [showCandidateQuestion, setShowCandidateQuestion] = useState(false);
  const [candidateQuestion, setCandidateQuestion] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAskQuestion = () => {
    if (!candidateQuestion.trim()) return;
    askQuestion(candidateQuestion.trim());
    setCandidateQuestion('');
    setShowCandidateQuestion(false);
  };

  const handleClose = () => {
    window.history.back();
  };

  // Error state
  if (error) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF] p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">连接失败</h2>
          <p className="text-sm text-gray-500">{error}</p>
          <button onClick={retry} className="px-5 py-2 rounded-xl text-sm font-medium text-white bg-[#1a4bc4]">
            重试
          </button>
        </div>
      </div>
    );
  }

  // Connecting state
  if (state === 'connecting') {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF]">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-[#1a4bc4] animate-spin mx-auto" />
          <p className="text-sm text-gray-500">正在连接面试会话...</p>
        </div>
      </div>
    );
  }

  const canAskQuestion = config.allowCandidateQuestions && shouldClose;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF] flex flex-col relative">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <InterviewerAvatar />
        <div className="flex items-center gap-4">
          {/* Topic progress */}
          {currentTopic && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              当前话题：{currentTopic}
            </span>
          )}
          {topicsCovered > 0 && (
            <span className="text-xs text-gray-400">
              已覆盖 {topicsCovered} 个话题
            </span>
          )}
          {/* Timer */}
          <div className={`flex items-center gap-1.5 text-sm font-mono ${
            timeLeft < 120 ? 'text-red-500' : 'text-gray-500'
          }`}>
            <Clock className="w-4 h-4" />
            {formatTime(timeLeft)}
          </div>
        </div>
      </header>

      {/* Messages area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-3xl mx-auto w-full">
        {messages.map((msg, idx) => (
          <React.Fragment key={String(msg.id || idx)}>
            <MessageBubble
              msg={msg}
              isStreaming={isStreaming && msg.id === '__streaming__'}
            />
          </React.Fragment>
        ))}

        {/* Typing indicator for non-streaming AI thinking */}
        {subState === 'ai_thinking' && !messages.some(m => m.id === '__streaming__') && (
          <TypingIndicator />
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input area */}
      <footer className="flex-shrink-0 bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Candidate question panel */}
          {showCandidateQuestion && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <p className="text-xs text-gray-500">
                {config.candidateQuestionPrompt || '你有什么问题想问吗？'}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={candidateQuestion}
                  onChange={(e) => setCandidateQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
                  placeholder="输入你的问题..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={handleAskQuestion}
                  disabled={!candidateQuestion.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#1a4bc4] hover:bg-[#1e3a8a] disabled:opacity-50 transition-colors"
                >
                  提问
                </button>
              </div>
            </div>
          )}

          {/* Main input row */}
          <div className="flex items-end gap-3">
            {/* Candidate question button */}
            {canAskQuestion && (
              <button
                onClick={() => setShowCandidateQuestion(!showCandidateQuestion)}
                className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium text-[#1a4bc4] bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                我要提问
              </button>
            )}

            {/* Text input */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? 'AI 正在输入...' : '输入你的回答...（Enter 发送，Shift+Enter 换行）'}
              disabled={isStreaming || state === 'completed'}
              rows={2}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]/20 focus:border-[#1a4bc4] disabled:bg-gray-50 disabled:text-gray-400"
            />

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming || state === 'completed'}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#1a4bc4] text-white flex items-center justify-center hover:bg-[#1e3a8a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>

            {/* End interview button */}
            <button
              onClick={completeInterview}
              disabled={state !== 'active'}
              className="flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              结束面试
            </button>
          </div>
        </div>
      </footer>

      {/* Completion overlay */}
      {state === 'completed' && (
        <CompletionOverlay score={score} timeLeft={timeLeft} onClose={handleClose} />
      )}
    </div>
  );
};

// Wrap in ErrorBoundary for production resilience
const ConversationInterviewPage = () => (
  <ErrorBoundary>
    <ConversationInterviewPageInner />
  </ErrorBoundary>
);

export default ConversationInterviewPage;
