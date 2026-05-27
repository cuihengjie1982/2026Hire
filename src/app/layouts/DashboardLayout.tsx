import {AnimatePresence, motion} from 'motion/react';
import {Bot, Briefcase, ChevronRight, Folder, LogOut, Menu, Moon, Search, Sunrise, User, Users} from 'lucide-react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {NavLink, Outlet, useLocation, useNavigate} from 'react-router-dom';
import {navigationItems, type NavigationItem} from '../navigation';
import {getPageFromPathname, getRouteForPage, isNavigationEvent, NAVIGATE_EVENT} from '../../navigation';
import {useProject} from '../contexts/ProjectContext';
import {NotificationBell} from '../../shared/components/NotificationProvider';
import {Breadcrumbs} from '../../shared/components/Breadcrumbs';
import {useSidebarCounts} from '../hooks/useSidebarCounts';
import {getUserName, USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';

// ---------------------------------------------------------------------------
// Search types & helpers
// ---------------------------------------------------------------------------

type SearchGroup = {
  label: string;
  icon: typeof Search;
  items: {id: string; title: string; subtitle?: string; path: string}[];
};

type SearchResult = {
  candidates: {id: string; title: string; path: string}[];
  positions: {id: string; title: string; path: string}[];
  projects: {id: string; title: string; path: string}[];
  agents: {id: string; title: string; path: string}[];
};

// Debounced server-side search
let searchTimer: ReturnType<typeof setTimeout> | null = null;

async function searchBackend(q: string): Promise<SearchResult | null> {
  if (USE_MOCK_API) {
    // Mock mode: return empty (no backend available)
    return {candidates: [], positions: [], projects: [], agents: []};
  }
  try {
    const resp = await fetch(`${API_BASE_URL}/api/stats/search?q=${encodeURIComponent(q)}`, {
      headers: {'Authorization': `Bearer ${getAuthToken() ?? ''}`},
    });
    if (resp.ok) return await resp.json() as SearchResult;
  } catch (e) {
    console.warn('[Search] Backend search failed:', e);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const DashboardLayout = ({onLogout}: {onLogout: () => void}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('em-box.theme') as 'light' | 'dark') || 'light'; } catch { return 'light'; }
  });
  const {counts} = useSidebarCounts();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
      root.classList.add('dark');
    } else {
      root.removeAttribute('data-theme');
      root.classList.remove('dark');
    }
    try { localStorage.setItem('em-box.theme', theme); } catch { /* noop */ }
  }, [theme]);
  const location = useLocation();
  const navigate = useNavigate();
  const {selectedProject, setSelectedProject, projects, loading} = useProject();
  const currentPageId = getPageFromPathname(location.pathname);
  const currentPage = useMemo(
    () => navigationItems.find((item) => item.id === currentPageId) ?? navigationItems[0],
    [currentPageId],
  );
  const isPreviewPage = currentPageId === 'ai-interview-preview';

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      if (!isNavigationEvent(event)) return;
      navigate(getRouteForPage(event.detail.page));
      setIsSidebarOpen(false);
    };

    window.addEventListener(NAVIGATE_EVENT, handleNavigate);
    return () => window.removeEventListener(NAVIGATE_EVENT, handleNavigate);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#0f172a] font-sans overflow-hidden flex">
      {/* Skip-link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-[#1a4bc4] focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium"
      >
        跳转到主要内容
      </a>
      <AnimatePresence>
        {isSidebarOpen && !isPreviewPage && (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-[#1a4bc4]/20 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {!isPreviewPage && (
        <motion.aside
          role="navigation"
          aria-label="主导航"
          initial={false}
          animate={{x: isSidebarOpen ? 0 : '-100%'}}
          className="fixed inset-y-0 left-0 w-[248px] bg-[#0c2b7a] shadow-2xl flex flex-col z-50 md:relative md:translate-x-0 transition-transform duration-300 ease-in-out text-[#e2e8f0]"
          style={{x: isSidebarOpen ? 0 : undefined}}
        >
          <div className="p-5 flex flex-col space-y-5">
            <div className="flex items-center justify-between">
              <h1 className="text-[22px] font-bold tracking-wide text-white font-display">EM-BOX</h1>
              <div className="w-2 h-2 bg-[#A78BFA] rounded-full shadow-[0_0_10px_#A78BFA]"></div>
            </div>

                      </div>

          <div className="flex-1 overflow-y-auto py-2 px-3.5 space-y-1 custom-scrollbar-dark">
            {navigationItems.map((page) => {
              const Icon = page.icon;
              const isActive = currentPage.id === page.id;
              return (
                <NavLink
                  key={page.id}
                  to={page.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`relative w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-[#1a4bc4] text-white'
                      : 'text-[#e2e8f0] hover:bg-[#1a4bc4]/50 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-[#cbd5e1] group-hover:text-white'}`} strokeWidth={1.5} />
                    <span className="font-medium text-[13px]">{page.title}</span>
                  </div>
                  {page.badge && (
                    <span className={`${page.badgeColor} text-white text-[10px] font-medium px-2 py-0.5 rounded-full`}>
                      {page.id === 'agents' ? `${counts.runningAgents} 运行中` : page.id === 'shortlist' ? String(counts.shortlistCount) : page.id === 'approvals' ? String(counts.pendingApprovals) : page.badge}
                    </span>
                  )}
                  {page.subtext && isActive && (
                    <div className="absolute bottom-1 right-3 text-[10px] text-[#cbd5e1]">{page.subtext}</div>
                  )}
                </NavLink>
              );
            })}
          </div>

          <div className="p-3.5 space-y-3.5">
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#cbd5e1] z-10" />
              <input
                type="text"
                placeholder="快速查找..."
                aria-label="快速查找"
                value={searchQuery}
                onChange={(e) => {
                  const q = e.target.value;
                  setSearchQuery(q);
                  if (!q.trim()) {
                    setSearchGroups([]);
                    return;
                  }
                  // Search pages locally (instant)
                  const lower = q.toLowerCase();
                  const pages = navigationItems.filter(item =>
                    item.title.toLowerCase().includes(lower),
                  ).map(item => ({id: item.id, title: item.title, path: item.path}));

                  // Debounced server-side search for business data
                  if (searchTimer) clearTimeout(searchTimer);
                  searchTimer = setTimeout(async () => {
                    const result = await searchBackend(q);
                    const groups: SearchGroup[] = [];

                    if (pages.length > 0) {
                      groups.push({label: '页面', icon: Search, items: pages.slice(0, 3)});
                    }
                    if (result) {
                      if (result.candidates.length > 0) {
                        groups.push({label: '候选人', icon: Users, items: result.candidates});
                      }
                      if (result.positions.length > 0) {
                        groups.push({label: '岗位', icon: Briefcase, items: result.positions});
                      }
                      if (result.projects.length > 0) {
                        groups.push({label: '项目', icon: Folder, items: result.projects});
                      }
                      if (result.agents.length > 0) {
                        groups.push({label: 'AI 代理', icon: Bot, items: result.agents});
                      }
                    }

                    setSearchGroups(groups);
                  }, 200);
                }}
                className="w-full bg-[#05122e] border border-[#1a4bc4] text-sm text-white rounded-xl pl-9 pr-10 py-2 focus:outline-none focus:border-[#1a4bc4] transition-colors"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                <kbd className="bg-[#1a4bc4] text-[#cbd5e1] px-1.5 py-0.5 rounded text-[10px] font-mono">⌘K</kbd>
              </div>
              {searchQuery.trim() && searchGroups.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#0c2b7a] border border-[#1a4bc4] rounded-xl overflow-hidden shadow-lg z-20 max-h-[360px] overflow-y-auto custom-scrollbar-dark">
                  {searchGroups.map((group) => {
                    const GIcon = group.icon;
                    return (
                      <div key={group.label}>
                        <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider bg-[#05122e]">
                          <GIcon className="w-3 h-3" />
                          {group.label}
                        </div>
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              navigate(item.path);
                              setSearchQuery('');
                              setSearchGroups([]);
                              setIsSidebarOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#e2e8f0] hover:bg-[#1a4bc4] transition-colors"
                          >
                            <span>{item.title}</span>
                            {item.subtitle && <span className="text-[#64748b] text-xs">{item.subtitle}</span>}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1 bg-[#05122e] p-1 rounded-xl border border-[#1a4bc4]">
              <button
                onClick={() => setTheme('light')} aria-label="浅色模式"
                className={`flex items-center justify-center py-1.5 rounded-lg transition-colors ${theme === 'light' ? 'bg-[#1a4bc4] text-white shadow' : 'text-[#cbd5e1] hover:text-white'}`}
              >
                <Sunrise className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTheme('dark')} aria-label="深色模式"
                className={`flex items-center justify-center py-1.5 rounded-lg transition-colors ${theme === 'dark' ? 'bg-[#1a4bc4] text-white shadow' : 'text-[#cbd5e1] hover:text-white'}`}
              >
                <Moon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#1a4bc4]">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-[#cbd5e1]">
                  <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Felix&backgroundColor=fcd5ce" alt="User avatar" />
                </div>
                <span className="font-medium text-sm text-white">{getUserName() ?? '用户'}</span>
              </div>
              <div className="flex items-center space-x-1">
                <NotificationBell />
                <button onClick={onLogout} aria-label="退出登录" className="p-1.5 text-[#cbd5e1] hover:text-white hover:bg-[#1a4bc4] rounded-lg transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.aside>
      )}

      <main id="main-content" role="main" aria-label="主要内容" className={`flex-1 flex flex-col h-screen overflow-hidden text-[14px] ${isPreviewPage ? 'bg-[#0c2b7a]' : 'bg-white/50 dark:bg-gray-900/50 backdrop-blur-3xl'}`}>
        {!isPreviewPage && (
          <header role="banner" aria-label="页面头部" className="md:hidden h-16 px-4 flex items-center justify-between bg-white/60 dark:bg-gray-800/60 backdrop-blur-md border-b border-[#e0f2fe] dark:border-gray-700 z-10 shadow-sm shadow-[#1a4bc4]/5">
            <button aria-label="打开导航菜单" className="p-2 -ml-2 text-[#1a4bc4] dark:text-blue-300 hover:bg-[#e0f2fe] dark:hover:bg-gray-700 rounded-xl" onClick={() => setIsSidebarOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <span className="font-semibold text-[#0f172a] dark:text-white">{currentPage.title}</span>
            <div className="w-8 h-8 rounded-full bg-[#e0f2fe] dark:bg-gray-700 flex items-center justify-center cursor-pointer" role="button" aria-label="打开菜单" onClick={() => setIsSidebarOpen(true)}>
              <User className="w-5 h-5 text-[#1a4bc4] dark:text-blue-300 mt-1" />
            </div>
          </header>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-transparent">
          {!isPreviewPage && <Breadcrumbs />}
          <Outlet />
        </div>
      </main>

      <style>{`
        @media (min-width: 768px) {
          aside { transform: translateX(0) !important; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
        .custom-scrollbar-dark::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: #1e3a8a; border-radius: 10px; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover { background: #0f172a; }
      `}</style>
    </div>
  );
};
