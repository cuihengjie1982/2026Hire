import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({page, pageSize, total, onChange}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <nav className="flex items-center justify-center gap-1 mt-6" aria-label="分页">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="上一页"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`dots-${i}`} className="px-2 text-gray-400 text-sm">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`min-w-[32px] h-8 rounded-lg text-sm font-medium transition-colors ${
              p === page
                ? 'bg-[#1a4bc4] text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="下一页"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
      <span className="ml-3 text-xs text-gray-400">共 {total} 条</span>
    </nav>
  );
};
