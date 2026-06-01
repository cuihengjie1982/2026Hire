import React, {useState, useEffect} from 'react';
import {MessageSquare, Loader2} from 'lucide-react';
import {askAI} from '../../../api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  videoTime: number;
}

interface AIQAChatTabProps {
  transcript: string;
  courseTitle: string;
  currentVideoTime: number;
}

export const AIQAChatTab: React.FC<AIQAChatTabProps> = ({transcript, courseTitle, currentVideoTime}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [inputFocus, setInputFocus] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      videoTime: currentVideoTime,
    };
    setMessages(prev => [...prev, userMsg]);

    setLoading(true);
    try {
      const answer = await askAI(text, transcript, currentVideoTime, courseTitle);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: answer,
        videoTime: currentVideoTime,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，AI 回答失败，请稍后重试。',
        videoTime: currentVideoTime,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-emerald-500" />
            </div>
            <p className="font-medium text-gray-700">AI 问答助手</p>
            <p className="text-xs text-gray-400 px-8">
              基于视频内容回答您的学习问题。输入问题并发送，AI 将参考文字稿为您提供解答。
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === 'user'
                ? 'bg-indigo-500 text-white rounded-br-md'
                : 'bg-gray-100 text-gray-800 rounded-bl-md'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-indigo-200' : 'text-gray-400'}`}>
                {formatTime(msg.videoTime)}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            AI 思考中...
          </div>
        )}
      </div>

      {/* Input */}
      <div className={`p-3 border-t border-gray-200 transition-colors ${inputFocus ? 'bg-indigo-50' : 'bg-gray-50'}`}>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            onFocus={() => setInputFocus(true)}
            onBlur={() => setInputFocus(false)}
            placeholder="输入问题，按 Enter 发送..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            发送
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1 px-1">
          当前视频时间：{formatTime(currentVideoTime)} · Shift+Enter 换行
        </p>
      </div>
    </div>
  );
};

export default AIQAChatTab;