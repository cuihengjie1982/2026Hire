import {motion} from 'motion/react';
import {lazy, Suspense, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Loader2, FileText, PlayCircle, BarChart2, ClipboardList} from 'lucide-react';

const InterviewTemplatesPage = lazy(() =>
  import('../../interviews/pages/InterviewTemplatesPage').then(m => ({default: m.InterviewTemplatesPage})),
);
const InterviewManagementPage = lazy(() =>
  import('../../interviews/pages/InterviewManagementPage').then(m => ({default: m.InterviewManagementPage})),
);
const InterviewResultsPage = lazy(() =>
  import('../../interviews/pages/InterviewResultsPage').then(m => ({default: m.InterviewResultsPage})),
);
const InterviewAnalyticsPage = lazy(() =>
  import('../../interviews/pages/InterviewAnalyticsPage').then(m => ({default: m.InterviewAnalyticsPage})),
);
const InterviewPreviewPage = lazy(() =>
  import('../../interviews/pages/InterviewPreviewPage').then(m => ({default: m.InterviewPreviewPage})),
);

type TabId = 'templates' | 'management' | 'results' | 'analytics' | 'preview';

const TABS: {id: TabId; label: string; icon: typeof FileText}[] = [
  {id: 'templates', label: '面试模板', icon: FileText},
  {id: 'management', label: '会话管理', icon: ClipboardList},
  {id: 'results', label: '面试结果', icon: BarChart2},
  {id: 'analytics', label: '数据分析', icon: BarChart2},
  {id: 'preview', label: '面试体验', icon: PlayCircle},
];

const TabFallback = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
  </div>
);

export const InterviewCenterPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some(t => t.id === tabFromUrl) ? tabFromUrl! : 'templates',
  );

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams({tab}, {replace: true});
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'templates':
        return <InterviewTemplatesPage />;
      case 'management':
        return <InterviewManagementPage isEmbedded onTabChange={handleTabChange} />;
      case 'results':
        return <InterviewResultsPage isEmbedded onTabChange={handleTabChange} />;
      case 'analytics':
        return <InterviewAnalyticsPage isEmbedded onTabChange={handleTabChange} />;
      case 'preview':
        return <InterviewPreviewPage />;
    }
  };

  return (
    <div>
      <motion.div
        initial={{opacity: 0, y: -4}}
        animate={{opacity: 1, y: 0}}
        className="max-w-[1500px] mx-auto w-full px-6 pt-5 pb-2"
      >
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit flex-wrap">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </motion.div>

      <Suspense fallback={<TabFallback />}>{renderTab()}</Suspense>
    </div>
  );
};
