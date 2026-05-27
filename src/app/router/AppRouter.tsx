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
const ProjectManagePage = lazy(() =>
  import('../../modules/projects/pages/ProjectManagePage').then((module) => ({
    default: module.ProjectManagePage,
  })),
);
const CandidateCenterPage = lazy(() =>
  import('../../modules/candidates/pages/CandidateCenterPage').then((module) => ({
    default: module.CandidateCenterPage,
  })),
);
const PipelinePage = lazy(() =>
  import('../../modules/pipeline/pages/PipelinePage').then((module) => ({
    default: module.PipelinePage,
  })),
);
const InterviewCenterPage = lazy(() =>
  import('../../modules/interviews/pages/InterviewCenterPage').then((module) => ({
    default: module.InterviewCenterPage,
  })),
);
const ApprovalsRoute = lazy(() =>
  import('../../modules/approvals/pages/ApprovalsRoute').then((module) => ({
    default: module.ApprovalsRoute,
  })),
);
const TrainingAcademyPage = lazy(() =>
  import('../../modules/training/pages/TrainingAcademyPage').then((module) => ({
    default: module.TrainingAcademyPage,
  })),
);
const SystemAdminPage = lazy(() =>
  import('../../modules/admin/pages/SystemAdminPage').then((module) => ({
    default: module.SystemAdminPage,
  })),
);
const CandidateTrainingPortal = lazy(() =>
  import('../../modules/training/pages/CandidateTrainingPortal').then((module) => ({
    default: module.CandidateTrainingPortal,
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
          <Route path="/projects" element={withSuspense(<ProjectManagePage />)} />
          <Route path="/candidates" element={withSuspense(<CandidateCenterPage />)} />
          <Route path="/pipeline" element={withSuspense(<PipelinePage />)} />
          <Route path="/interviews" element={withSuspense(<InterviewCenterPage />)} />
          <Route path="/approvals" element={withSuspense(<ApprovalsRoute />)} />
          <Route path="/training" element={withSuspense(<TrainingAcademyPage />)} />
          <Route path="/admin" element={withSuspense(<SystemAdminPage />)} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
        <Route path="/training/portal" element={withSuspense(<CandidateTrainingPortal />)} />
      </Routes>
    </ProjectProvider>
  </BrowserRouter>
);
