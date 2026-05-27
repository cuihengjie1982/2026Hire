import {motion} from 'motion/react';
import {lazy, Suspense, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Loader2, Search, Users, MessageSquare} from 'lucide-react';

const TalentPoolPage = lazy(() =>
  import('../../talent/pages/TalentPoolPage').then(m => ({default: m.TalentPoolPage})),
);
const CandidateSearchPage = lazy(() =>
  import('../../candidates/pages/CandidateSearchPage').then(m => ({default: m.CandidateSearchPage})),
);
const ContactsPage = lazy(() =>
  import('../../contacts/pages/ContactsPage').then(m => ({default: m.ContactsPage})),
);

type TabId = 'talent' | 'search' | 'contacts';

const TABS: {id: TabId; label: string; icon: typeof Users}[] = [
  {id: 'talent', label: '人才库', icon: Users},
  {id: 'search', label: '简历搜索', icon: Search},
  {id: 'contacts', label: '联系人', icon: MessageSquare},
];

const TabFallback = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
  </div>
);

export const CandidateCenterPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some(t => t.id === tabFromUrl) ? tabFromUrl! : 'talent',
  );

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams({tab}, {replace: true});
  };

  return (
    <div>
      {/* Tab bar */}
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
        {activeTab === 'talent' ? <TalentPoolPage /> :
         activeTab === 'search' ? <CandidateSearchPage /> :
         <ContactsPage />}
      </Suspense>
    </div>
  );
};
