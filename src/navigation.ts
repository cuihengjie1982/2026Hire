export const NAVIGATE_EVENT = 'navigate';

export type AppPageId =
  | 'dashboard'
  | 'projects'
  | 'candidates'
  | 'pipeline'
  | 'interviews'
  | 'approvals'
  | 'training'
  | 'admin';

export type AppNavigationDetail = {
  page: AppPageId;
};

export const PAGE_ROUTE_BY_ID: Record<AppPageId, string> = {
  dashboard: '/',
  projects: '/projects',
  candidates: '/candidates',
  pipeline: '/pipeline',
  interviews: '/interviews',
  approvals: '/approvals',
  training: '/training',
  admin: '/admin',
};

export const isNavigationEvent = (
  event: Event,
): event is CustomEvent<AppNavigationDetail> =>
  event instanceof CustomEvent && typeof event.detail?.page === 'string';

export const getRouteForPage = (page: AppPageId) => PAGE_ROUTE_BY_ID[page];

export const getPageFromPathname = (pathname: string): AppPageId => {
  // Order matters: match more specific prefixes first
  const routes: {page: AppPageId; route: string}[] = [
    {page: 'dashboard', route: '/'},
    {page: 'training', route: '/training'},
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
