import {motion} from 'motion/react';
import {lazy, Suspense, type ReactNode} from 'react';
import {BrowserRouter, Route, Routes} from 'react-router-dom';
import {DashboardLayout} from '../layouts/DashboardLayout';
import {ProjectProvider} from '../contexts/ProjectContext';
import {NotFoundPage} from '../../shared/pages/NotFoundPage';

const DashboardPage = lazy(() =>
  import('../../modules/dashboard/pages/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
const CandidateSearchPage = lazy(() =>
  import('../../modules/candidates/pages/CandidateSearchPage').then((module) => ({
    default: module.CandidateSearchPage,
  })),
);
const AgentsPage = lazy(() =>
  import('../../modules/agents/pages/AgentsPage').then((module) => ({
    default: module.AgentsPage,
  })),
);
const ShortlistPage = lazy(() =>
  import('../../modules/shortlist/pages/ShortlistPage').then((module) => ({
    default: module.ShortlistPage,
  })),
);
const ProjectsPage = lazy(() =>
  import('../../modules/projects/pages/ProjectsPage').then((module) => ({
    default: module.ProjectsPage,
  })),
);
const OutreachPage = lazy(() =>
  import('../../modules/outreach/pages/OutreachPage').then((module) => ({
    default: module.OutreachPage,
  })),
);
const InsightsPage = lazy(() =>
  import('../../modules/analytics/pages/InsightsPage').then((module) => ({
    default: module.InsightsPage,
  })),
);
const IntegrationsPage = lazy(() =>
  import('../../modules/integrations/pages/IntegrationsPage').then((module) => ({
    default: module.IntegrationsPage,
  })),
);
const PositionConfigRoute = lazy(() =>
  import('../../modules/positions/pages/PositionConfigRoute').then((module) => ({
    default: module.PositionConfigRoute,
  })),
);
const InterviewTemplatesPage = lazy(() =>
  import('../../modules/interviews/pages/InterviewTemplatesPage').then((module) => ({
    default: module.InterviewTemplatesPage,
  })),
);
const InterviewPreviewPage = lazy(() =>
  import('../../modules/interviews/pages/InterviewPreviewPage').then((module) => ({
    default: module.InterviewPreviewPage,
  })),
);
const InterviewManagementPage = lazy(() =>
  import('../../modules/interviews/pages/InterviewManagementPage').then((module) => ({
    default: module.InterviewManagementPage,
  })),
);
const InterviewResultsPage = lazy(() =>
  import('../../modules/interviews/pages/InterviewResultsPage').then((module) => ({
    default: module.InterviewResultsPage,
  })),
);
const InterviewAnalyticsPage = lazy(() =>
  import('../../modules/interviews/pages/InterviewAnalyticsPage').then((module) => ({
    default: module.InterviewAnalyticsPage,
  })),
);
const ApprovalsRoute = lazy(() =>
  import('../../modules/approvals/pages/ApprovalsRoute').then((module) => ({
    default: module.ApprovalsRoute,
  })),
);
const TalentPoolPage = lazy(() =>
  import('../../modules/talent/pages/TalentPoolPage').then((module) => ({
    default: module.TalentPoolPage,
  })),
);
const ContactsPage = lazy(() =>
  import('../../modules/contacts/pages/ContactsPage').then((module) => ({
    default: module.ContactsPage,
  })),
);
const SettingsPage = lazy(() =>
  import('../../modules/settings/pages/SettingsPage').then((module) => ({
    default: module.SettingsPage,
  })),
);

const RouteLoadingFallback = () => (
  <motion.div
    initial={{opacity: 0, y: 8}}
    animate={{opacity: 1, y: 0}}
    className="max-w-[1500px] mx-auto w-full p-6"
  >
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div className="h-7 w-44 rounded-lg bg-gray-100 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-28 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-28 rounded-xl bg-gray-100 animate-pulse delay-75" />
        <div className="h-28 rounded-xl bg-gray-100 animate-pulse delay-150" />
      </div>
      <div className="h-72 rounded-2xl bg-gray-100 animate-pulse" />
    </div>
  </motion.div>
);

const withSuspense = (node: ReactNode) => (
  <Suspense fallback={<RouteLoadingFallback />}>{node}</Suspense>
);

export const AppRouter = ({onLogout}: {onLogout: () => void}) => (
  <BrowserRouter>
    <ProjectProvider>
      <Routes>
        <Route element={<DashboardLayout onLogout={onLogout} />}>
        <Route path="/" element={withSuspense(<DashboardPage />)} />
        <Route path="/search" element={withSuspense(<CandidateSearchPage />)} />
        <Route path="/agents" element={withSuspense(<AgentsPage />)} />
        <Route path="/shortlist" element={withSuspense(<ShortlistPage />)} />
        <Route path="/projects" element={withSuspense(<ProjectsPage />)} />
        <Route path="/outreach" element={withSuspense(<OutreachPage />)} />
        <Route path="/insights" element={withSuspense(<InsightsPage />)} />
        <Route path="/integrations" element={withSuspense(<IntegrationsPage />)} />
        <Route path="/positions/config" element={withSuspense(<PositionConfigRoute />)} />
        <Route path="/interviews/templates" element={withSuspense(<InterviewTemplatesPage />)} />
        <Route path="/interviews/preview" element={withSuspense(<InterviewPreviewPage />)} />
        <Route path="/interviews/management" element={withSuspense(<InterviewManagementPage />)} />
        <Route path="/interviews/results" element={withSuspense(<InterviewResultsPage />)} />
        <Route path="/interviews/analytics" element={withSuspense(<InterviewAnalyticsPage />)} />
        <Route path="/approvals" element={withSuspense(<ApprovalsRoute />)} />
        <Route path="/talent" element={withSuspense(<TalentPoolPage />)} />
        <Route path="/contacts" element={withSuspense(<ContactsPage />)} />
        <Route path="/settings" element={withSuspense(<SettingsPage />)} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ProjectProvider>
  </BrowserRouter>
);
