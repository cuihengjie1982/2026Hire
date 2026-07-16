import type { CandidateCard } from '../../candidates/types';

/** Visual theme — matches parent page accent colors */
export type InterviewCandidatePickerTheme = 'management' | 'conversation';

type InterviewCandidatePickerProps = {
  /** Full candidate list (caller pre-loads via useInterviewCreateForm) */
  candidates: CandidateCard[];
  /** Current search keyword */
  search: string;
  onSearchChange: (value: string) => void;
  /** Selected candidate id */
  selectedId: string;
  onSelectedIdChange: (id: string) => void;
  /** Label above the search input */
  label?: string;
  /** Match parent page styling */
  theme?: InterviewCandidatePickerTheme;
  /** Visible rows in the list box */
  listSize?: number;
};

const themeClasses: Record<InterviewCandidatePickerTheme, { input: string; select: string }> = {
  // InterviewManagementPage — cyan accent, rounded-lg
  management: {
    input: 'rounded-lg focus:ring-[#22d3ee]',
    select: 'rounded-lg focus:ring-[#22d3ee]',
  },
  // ConversationInterviewManagementPage — blue accent, rounded-xl
  conversation: {
    input: 'rounded-xl focus:ring-[#1a4bc4]/20',
    select: 'rounded-xl focus:ring-[#1a4bc4]/20',
  },
};

/**
 * Searchable candidate list used by both interview create dialogs.
 * Search filters client-side; the list is always visible (size={listSize}).
 */
export const InterviewCandidatePicker = ({
  candidates,
  search,
  onSearchChange,
  selectedId,
  onSelectedIdChange,
  label = '选择候选人 *',
  theme = 'management',
  listSize = 5,
}: InterviewCandidatePickerProps) => {
  const classes = themeClasses[theme];

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        placeholder="搜索候选人姓名或邮箱..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className={`w-full border border-gray-200 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 bg-white ${classes.input}`}
      />
      <select
        value={selectedId}
        onChange={(e) => onSelectedIdChange(e.target.value)}
        className={`w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white ${classes.select}`}
        size={listSize}
      >
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.resumeParsedInfo?.email || '无邮箱'})
          </option>
        ))}
        {candidates.length === 0 && <option disabled>无匹配候选人</option>}
      </select>
    </div>
  );
};
