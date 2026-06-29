import {motion} from 'motion/react';
import {lazy, Suspense, useEffect, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {Loader2, Bot, BarChart2, Settings, Plug, MessageSquare} from 'lucide-react';
import {getCurrentUser} from '../../settings/api';

const AgentsPage = lazy(() =>
  import('../../agents/pages/AgentsPage').then(m => ({default: m.AgentsPage})),
);
const InsightsPage = lazy(() =>
  import('../../analytics/pages/InsightsPage').then(m => ({default: m.InsightsPage})),
);
const IntegrationsPage = lazy(() =>
  import('../../integrations/pages/IntegrationsPage').then(m => ({default: m.IntegrationsPage})),
);
const SettingsPage = lazy(() =>
  import('../../settings/pages/SettingsPage').then(m => ({default: m.SettingsPage})),
);
const SmsTemplatePage = lazy(() =>
  import('../../outreach/pages/SmsTemplatePage').then(m => ({default: m.SmsTemplatePage})),
);

type TabId = 'agents' | 'insights' | 'integrations' | 'settings' | 'sms-templates';

const TABS: {id: TabId; label: string; icon: typeof Bot}[] = [
  {id: 'agents', label: 'AI 代理', icon: Bot},
  {id: 'insights', label: '数据洞察', icon: BarChart2},
  {id: 'integrations', label: '集成管理', icon: Plug},
  {id: 'settings', label: '系统设置', icon: Settings},
  {id: 'sms-templates', label: '短信模板', icon: MessageSquare},
];

const TabFallback = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
  </div>
);

export const SystemAdminPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    TABS.some(t => t.id === tabFromUrl) ? tabFromUrl! : 'agents',
  );
  const [accessState, setAccessState] = useState<'checking' | 'allowed'>('checking');

  useEffect(() => {
    let mounted = true;
    getCurrentUser()
      .then(user => {
        if (!mounted) return;
        if (user.role === 'video_viewer') {
          navigate('/video-sharing', {replace: true});
          return;
        }
        if (user.role !== 'admin') {
          navigate('/', {replace: true});
          return;
        }
        setAccessState('allowed');
      })
      .catch(() => {
        if (mounted) navigate('/', {replace: true});
      });
    return () => { mounted = false; };
  }, [navigate]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams({tab}, {replace: true});
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'agents':
        return <AgentsPage />;
      case 'insights':
        return <InsightsPage />;
      case 'integrations':
        return <IntegrationsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'sms-templates':
        return <SmsTemplatePage />;
    }
  };

  if (accessState === 'checking') {
    return <TabFallback />;
  }

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
