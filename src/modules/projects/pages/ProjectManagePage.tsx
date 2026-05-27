import {motion} from 'motion/react';
import {lazy, Suspense, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Loader2, Folder, FileText} from 'lucide-react';

const ProjectsPage = lazy(() =>
  import('../../projects/pages/ProjectsPage').then(m => ({default: m.ProjectsPage})),
);
const PositionConfigRoute = lazy(() =>
  import('../../positions/pages/PositionConfigRoute').then(m => ({default: m.PositionConfigRoute})),
);

type TabId = 'projects' | 'positions';

const TABS: {id: TabId; label: string; icon: typeof Folder}[] = [
  {id: 'projects', label: '项目列表', icon: Folder},
  {id: 'positions', label: '岗位配置', icon: FileText},
];

const TabFallback = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
  </div>
);

export const ProjectManagePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some(t => t.id === tabFromUrl) ? tabFromUrl! : 'projects',
  );

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams({tab}, {replace: true});
  };

  return (
    <div>
      <motion.div
        initial={{opacity: 0, y: -4}}
        animate={{opacity: 1, y: 0}}
        className="max-w-[1500px] mx-auto w-full px-6 pt-5 pb-2"
      >
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
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

      <Suspense fallback={<TabFallback />}>
        {activeTab === 'projects' ? <ProjectsPage /> : <PositionConfigRoute />}
      </Suspense>
    </div>
  );
};
