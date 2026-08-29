import React, {useState, useEffect} from 'react';
import {Loader2, Sparkles, Clock} from 'lucide-react';
import {summarizeContent} from '../../../api';

interface AISummaryTabProps {
  content: string;   // transcript or section text
  courseTitle: string;
}

export const AISummaryTab: React.FC<AISummaryTabProps> = ({content, courseTitle}) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSummarize = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await summarizeContent(content, courseTitle);
      setSummary(result);
    } catch (e) {
      setError('生成摘要失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {!summary && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-indigo-500" />
          </div>
          <div>
            <p className="font-semibold text-fg">AI 智能摘要</p>
            <p className="text-sm text-fg-muted mt-1">基于视频内容自动生成学习摘要</p>
          </div>
          <button
            onClick={handleSummarize}
            disabled={!content}
            className="px-5 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            生成摘要
          </button>
          {!content && <p className="text-xs text-fg-faint">暂无文字稿内容</p>}
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
            <p className="text-sm text-fg-muted">AI 正在生成摘要...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-500 text-sm">{error}</p>
        </div>
      )}

      {summary && (
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-600">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">AI 摘要</span>
            </div>
            <button onClick={handleSummarize} className="text-xs text-fg-faint hover:text-fg-secondary">
              重新生成
            </button>
          </div>
          <div className="prose prose-sm max-w-none text-fg-secondary whitespace-pre-wrap text-sm leading-relaxed
            bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
            {summary}
          </div>
        </div>
      )}
    </div>
  );
};

export default AISummaryTab;