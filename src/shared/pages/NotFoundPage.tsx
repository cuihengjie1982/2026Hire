import { motion } from 'motion/react';
import { navigateToPage } from '../../navigation';

export const NotFoundPage = () => {
  const handleGoHome = () => {
    navigateToPage('search');
  };

  const handleGoBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-gradient-to-br from-[#F5F3FF] to-[#EBE0FF]">
      {/* EM-BOX logo - top left */}
      <div className="p-6">
        <span className="text-xl font-bold tracking-wide text-[#0c2b7a] font-display">
          EM-BOX
        </span>
      </div>

      {/* Centered content */}
      <div className="flex-1 flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="max-w-md w-full text-center space-y-6"
        >
          {/* Large 404 number */}
          <h1 className="text-[120px] font-extrabold leading-none select-none text-transparent bg-clip-text bg-gradient-to-r from-[#1a4bc4] to-[#6366F1]">
            404
          </h1>

          {/* Title */}
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            页面未找到
          </p>

          {/* Description */}
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            您访问的页面不存在或已被移除
          </p>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              onClick={handleGoHome}
              className="
                px-5 py-2.5 rounded-xl text-sm font-medium text-white
                bg-[#1a4bc4] hover:bg-[#1e3a8a] transition-colors
                shadow-sm shadow-[#1a4bc4]/20
              "
            >
              返回首页
            </button>
            <button
              onClick={handleGoBack}
              className="
                px-5 py-2.5 rounded-xl text-sm font-medium text-gray-700
                bg-white hover:bg-gray-50 transition-colors
                border border-gray-200 shadow-sm
                dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300
              "
            >
              返回上一页
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
