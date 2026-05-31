import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Loader2, AlertCircle, MessageCircle, Clock, Bot, ArrowRight } from 'lucide-react';
import { fetchPublicInterview } from '../api';

/**
 * Candidate interview entry page — accessed via /interview/:token (no login required).
 * Validates the access token and shows interview info before the candidate enters.
 */
const CandidateInterviewEntry = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interviewInfo, setInterviewInfo] = useState<{
    sessionId: string;
    candidate: { id: string | null; name: string; email: string };
    template: { id: string | null; name: string };
    config: { maxDurationMinutes: number; allowCandidateQuestions: boolean; candidateQuestionPrompt: string };
  } | null>(null);

  useEffect(() => {
    if (!token) {
      setError('缺少面试链接参数');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchPublicInterview(token);
        if (cancelled) return;
        setInterviewInfo(data);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '无法加载面试信息');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token]);

  const handleEnter = () => {
    if (!token || !interviewInfo) return;
    navigate(`/interview/${token}/chat`, { state: { sessionId: interviewInfo.sessionId } });
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF] px-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 text-[#1a4bc4] animate-spin mx-auto" />
          <p className="text-sm text-gray-500">正在验证面试链接...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF] p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-6"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">链接无效</h1>
            <p className="text-sm text-gray-500 mt-2">{error}</p>
          </div>
          <p className="text-xs text-gray-400">
            请联系招聘方获取有效的面试链接
          </p>
        </motion.div>
      </div>
    );
  }

  // Success state — show interview info card
  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF] p-4 sm:p-6" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg w-full space-y-4 sm:space-y-6"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1a4bc4] to-purple-500 flex items-center justify-center shadow-lg">
              <Bot className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {interviewInfo?.template.name || 'AI 面试'}
          </h1>
          <p className="text-sm text-gray-500">
            你好，{interviewInfo?.candidate.name || '候选人'}
          </p>
        </div>

        {/* Info card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <MessageCircle className="w-5 h-5 text-[#1a4bc4]" />
            <div>
              <span className="text-gray-500">面试形式：</span>
              <span className="font-medium text-gray-900">AI 对话式面试</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock className="w-5 h-5 text-[#1a4bc4]" />
            <div>
              <span className="text-gray-500">预计时长：</span>
              <span className="font-medium text-gray-900">
                {interviewInfo?.config.maxDurationMinutes || 30} 分钟
              </span>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 leading-relaxed">
            <p>本面试由 AI 面试官主持，将通过文字对话的方式与你交流。</p>
            <ul className="mt-2 space-y-1 text-xs text-gray-500">
              <li>· 请确保网络畅通，环境安静</li>
              <li>· 如实回答，展示真实的自己</li>
              <li>· 面试结束后将自动生成评估报告</li>
            </ul>
          </div>
        </div>

        {/* Enter button */}
        <button
          onClick={handleEnter}
          className="w-full py-3.5 rounded-xl text-base font-semibold text-white bg-gradient-to-r from-[#1a4bc4] to-purple-500 hover:from-[#1e3a8a] hover:to-purple-600 transition-all shadow-lg shadow-purple-200 flex items-center justify-center gap-2"
        >
          进入面试
          <ArrowRight className="w-5 h-5" />
        </button>

        <p className="text-center text-xs text-gray-400">
          点击进入即表示你同意本次面试的录音和文字记录将被保存用于评估
        </p>
      </motion.div>
    </div>
  );
};

export default CandidateInterviewEntry;
