import React, {useState} from 'react';
import {BookOpen, FileText, Edit3, MessageCircle, Sparkles} from 'lucide-react';

type TabId = 'summary' | 'transcript' | 'notes' | 'qa';

interface LearningTabPanelProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  summaryTab: React.ReactNode;
  transcriptTab: React.ReactNode;
  notesTab: React.ReactNode;
  qaTab: React.ReactNode;
  onAISummary?: () => void;
}

const TABS: {id: TabId; label: string; icon: React.ElementType}[] = [
  {id: 'summary', label: 'AI摘要', icon: Sparkles},
  {id: 'transcript', label: '文字稿', icon: FileText},
  {id: 'notes', label: '笔记', icon: Edit3},
  {id: 'qa', label: 'AI问答', icon: MessageCircle},
];

export const LearningTabPanel: React.FC<LearningTabPanelProps> = ({
  activeTab,
  onTabChange,
  summaryTab,
  transcriptTab,
  notesTab,
  qaTab,
  onAISummary,
}) => {
  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
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
        {activeTab === 'transcript' && transcriptTab}
        {activeTab === 'notes' && notesTab}
        {activeTab === 'qa' && qaTab}
      </div>
    </div>
  );
};

export default LearningTabPanel;