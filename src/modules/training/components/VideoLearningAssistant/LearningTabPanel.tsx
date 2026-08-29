import React from 'react';
import {FileText, Edit3, MessageCircle, MousePointer2, Sparkles} from 'lucide-react';

export type LearningTabId = 'summary' | 'actions' | 'transcript' | 'notes' | 'qa';

interface LearningTabPanelProps {
  activeTab: LearningTabId;
  onTabChange: (tab: LearningTabId) => void;
  summaryTab: React.ReactNode;
  actionsTab?: React.ReactNode;
  transcriptTab: React.ReactNode;
  notesTab: React.ReactNode;
  qaTab: React.ReactNode;
  onAISummary?: () => void;
  visibleTabs?: LearningTabId[];
}

const TABS: {id: LearningTabId; label: string; icon: React.ElementType}[] = [
  {id: 'summary', label: 'AI摘要', icon: Sparkles},
  {id: 'actions', label: '动作流', icon: MousePointer2},
  {id: 'transcript', label: '文字稿', icon: FileText},
  {id: 'notes', label: '笔记', icon: Edit3},
  {id: 'qa', label: 'AI问答', icon: MessageCircle},
];

export const LearningTabPanel: React.FC<LearningTabPanelProps> = ({
  activeTab,
  onTabChange,
  summaryTab,
  actionsTab,
  transcriptTab,
  notesTab,
  qaTab,
  visibleTabs,
}) => {
  const tabs = visibleTabs ? TABS.filter(tab => visibleTabs.includes(tab.id)) : TABS;

  return (
    <div className="flex flex-col h-full bg-surface rounded-xl border border-border overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50'
                  : 'border-transparent text-fg-muted hover:text-fg-secondary hover:bg-surface-muted'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'summary' && summaryTab}
        {activeTab === 'actions' && actionsTab}
        {activeTab === 'transcript' && transcriptTab}
        {activeTab === 'notes' && notesTab}
        {activeTab === 'qa' && qaTab}
      </div>
    </div>
  );
};

export default LearningTabPanel;
