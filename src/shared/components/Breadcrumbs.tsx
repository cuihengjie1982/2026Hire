import {ChevronRight, Home} from 'lucide-react';
import {useLocation, useNavigate} from 'react-router-dom';
import {navigationItems} from '../../app/navigation';
import {PAGE_ROUTE_BY_ID, type AppPageId} from '../../navigation';

// Breadcrumb hierarchy: child -> parent
const BREADCRUMB_PARENT: Partial<Record<AppPageId, AppPageId>> = {
  'ai-interview-preview': 'ai-interview',
  'ai-interview-management': 'ai-interview',
  'ai-interview-results': 'ai-interview',
  'ai-interview-analytics': 'ai-interview',
  'position-config': 'projects',
};

function getPageIdForPath(pathname: string): AppPageId | undefined {
  for (const [id, route] of Object.entries(PAGE_ROUTE_BY_ID)) {
    if (route === '/' ? pathname === route : pathname === route || pathname.startsWith(`${route}/`)) {
      return id as AppPageId;
    }
  }
  return undefined;
}

function getPageTitle(pageId: AppPageId): string {
  const item = navigationItems.find((n) => n.id === pageId);
  return item?.title ?? '';
}

export const Breadcrumbs = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const currentId = getPageIdForPath(location.pathname);
  if (!currentId || currentId === 'dashboard') return null; // Home page — no breadcrumbs

  // Build trail: [parent?, current]
  const trail: AppPageId[] = [];
  const parentId = BREADCRUMB_PARENT[currentId];
  if (parentId) trail.push(parentId);
  trail.push(currentId);

  return (
    <nav className="flex items-center gap-1.5 text-xs px-6 pt-4 pb-0 text-gray-500 dark:text-gray-400">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        <Home className="w-3.5 h-3.5" />
        <span>首页</span>
      </button>
      {trail.map((pageId, idx) => {
        const isLast = idx === trail.length - 1;
        const title = getPageTitle(pageId);
        const route = PAGE_ROUTE_BY_ID[pageId];

        return (
          <span key={pageId} className="flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 text-gray-300 dark:text-gray-600" />
            {isLast ? (
              <span className="font-medium text-gray-900 dark:text-white">{title}</span>
            ) : (
              <button
                onClick={() => navigate(route)}
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {title}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
};
