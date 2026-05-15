export const NAVIGATE_EVENT = 'navigate';

export type AppPageId =
  | 'dashboard'
  | 'search'
  | 'agents'
  | 'shortlist'
  | 'projects'
  | 'talent'
  | 'contacts'
  | 'outreach'
  | 'insights'
  | 'integrations'
  | 'position-config'
  | 'ai-interview'
  | 'ai-interview-preview'
  | 'ai-interview-management'
  | 'ai-interview-results'
  | 'ai-interview-analytics'
  | 'approvals'
  | 'settings';

export type AppNavigationDetail = {
  page: AppPageId;
};

export const PAGE_ROUTE_BY_ID: Record<AppPageId, string> = {
  dashboard: '/',
  search: '/search',
  agents: '/agents',
  shortlist: '/shortlist',
  projects: '/projects',
  talent: '/talent',
  contacts: '/contacts',
  outreach: '/outreach',
  insights: '/insights',
  integrations: '/integrations',
  'position-config': '/positions/config',
  'ai-interview': '/interviews/templates',
  'ai-interview-preview': '/interviews/preview',
  'ai-interview-management': '/interviews/management',
  'ai-interview-results': '/interviews/results',
  'ai-interview-analytics': '/interviews/analytics',
  approvals: '/approvals',
  settings: '/settings',
};

export const isNavigationEvent = (
  event: Event,
): event is CustomEvent<AppNavigationDetail> =>
  event instanceof CustomEvent && typeof event.detail?.page === 'string';

export const getRouteForPage = (page: AppPageId) => PAGE_ROUTE_BY_ID[page];

export const getPageFromPathname = (pathname: string): AppPageId => {
  const matched = Object.entries(PAGE_ROUTE_BY_ID).find(([, route]) =>
    route === '/'
      ? pathname === route
      : pathname === route || pathname.startsWith(`${route}/`),
  );
  return (matched?.[0] as AppPageId | undefined) ?? 'dashboard';
};

export const navigateToPage = (page: AppPageId) => {
  window.dispatchEvent(
    new CustomEvent<AppNavigationDetail>(NAVIGATE_EVENT, {
      detail: {page},
    }),
  );
};
