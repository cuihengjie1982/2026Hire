export const NAVIGATE_EVENT = 'navigate';

export type AppPageId =
  | 'dashboard'
  | 'projects'
  | 'candidates'
  | 'pipeline'
  | 'interviews'
  | 'approvals'
  | 'training'
  | 'videoShare'
  | 'employees'
  | 'admin';

export type AppNavigationDetail = {
  page: AppPageId;
  search?: string;
};

export const PAGE_ROUTE_BY_ID: Record<AppPageId, string> = {
  dashboard: '/',
  projects: '/projects',
  candidates: '/candidates',
  pipeline: '/pipeline',
  interviews: '/interviews',
  approvals: '/approvals',
  training: '/training',
  videoShare: '/video-sharing/manage',
  employees: '/employees',
  admin: '/admin',
};

export const getRouteForPage = (page: AppPageId) => PAGE_ROUTE_BY_ID[page];

/** Navigate to AI 面试中心 with a specific tab selected. */
export const navigateToInterviewTab = (
  tab: 'templates' | 'management' | 'results' | 'analytics' | 'preview' | 'conversational',
): void => {
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, {
    detail: {page: 'interviews', search: `tab=${tab}`},
  }));
};

export const isNavigationEvent = (
  event: Event,
): event is CustomEvent<AppNavigationDetail> =>
  event instanceof CustomEvent && typeof event.detail?.page === 'string';

/**
 * Navigate to a page by dispatching a NAVIGATE_EVENT.
 * Accepts legacy page IDs (e.g. 'ai-interview', 'search', 'talent') and maps them
 * to the current AppPageId values.
 */
export const navigateToPage = (to: string): void => {
  const LEGACY_MAP: Record<string, AppPageId> = {
    search: 'candidates',
    talent: 'candidates',
    contacts: 'candidates',
    'ai-interview': 'interviews',
    'ai-interview-preview': 'interviews',
    'ai-interview-management': 'interviews',
    'ai-interview-results': 'interviews',
    'ai-interview-analytics': 'interviews',
    shortlist: 'pipeline',
    'position-config': 'projects',
    agents: 'admin',
    insights: 'admin',
    integrations: 'admin',
    settings: 'admin',
  };
  const LEGACY_TAB_MAP: Record<string, string> = {
    'ai-interview': 'tab=management',
    'ai-interview-management': 'tab=management',
    'ai-interview-results': 'tab=results',
    'ai-interview-analytics': 'tab=analytics',
    'ai-interview-preview': 'tab=preview',
  };
  const page = LEGACY_MAP[to] ?? (to as AppPageId);
  const search = LEGACY_TAB_MAP[to];
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, {detail: {page, search}}));
};

export const getPageFromPathname = (pathname: string): AppPageId => {
  // Order matters: match more specific prefixes first
  const routes: {page: AppPageId; route: string}[] = [
    {page: 'dashboard', route: '/'},
    {page: 'videoShare', route: '/video-sharing/manage'},
    {page: 'training', route: '/training'},
    {page: 'employees', route: '/employees'},
    {page: 'interviews', route: '/interviews'},
    {page: 'candidates', route: '/candidates'},
    {page: 'pipeline', route: '/pipeline'},
    {page: 'projects', route: '/projects'},
    {page: 'approvals', route: '/approvals'},
    {page: 'admin', route: '/admin'},
  ];

  for (const {page, route} of routes) {
    if (route === '/') {
      if (pathname === '/') return page;
    } else if (pathname === route || pathname.startsWith(`${route}/`)) {
      return page;
    }
  }
  return 'dashboard';
};
