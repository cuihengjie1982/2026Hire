// Main Edge Function entry - handles routing to sub-functions
// Deploy: supabase functions deploy (production)

import { requireAuth, requireAdmin, requireRecruiterOrAbove, requireHiringManagerOrAbove } from './_shared/auth.ts';
import { getCorsHeaders } from './_shared/cors.ts';

interface RouteHandler {
  pattern: string; // e.g. '/candidate-ops/import'
  methods: string[];
  auth: 'none' | 'any' | 'recruiter+' | 'admin' | 'hiring_manager+';
  handler: (req: Request, userId: string, userRole: string) => Promise<Response>;
}

function jsonRes(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

const loadHandlers = async (): Promise<RouteHandler[]> => {
  // AI Proxy
  const { proxy } = await import('./ai-proxy/index.ts');
  // AI Config
  const { handleAiConfig } = await import('./ai-config/index.ts');
  // Interview Scoring
  const { transcribeAndScore, aggregate } = await import('./interview-scoring/index.ts');
  // Candidate Ops
  const { importCandidates, deleteCandidate, exportCsv, getStats, updateTags, listCandidates } = await import('./candidate-ops/index.ts');
  // Analytics
  const { overview, projectStats, interviewSummary, interviewScoreDistribution, interviewDimensionAnalysis, interviewExportCsv } = await import('./analytics/index.ts');
  // Settings
  const {
    listUsers, getMe, createUser, updateUser, deleteUser, resetPassword,
    getPermissions, getRolePermissions, updateRolePermissions,
    listNotificationSettings, updateNotificationSetting,
    listInvites, createInvite, deleteInvite,
  } = await import('./settings/index.ts');
  // Agent Executor
  const { runAgent, handleAgents } = await import('./agent-executor/index.ts');
  // Cross-table Ops
  const { shortlistInterviewInvite, shortlistPromote, approvalDecide, hireCandidate } = await import('./cross-table-ops/index.ts');
  // MinerU Proxy
  const { parseFile, pollResult } = await import('./mineru-proxy/index.ts');
  // Notifications
  const { listNotifications, markRead, dismissNotification } = await import('./notifications/index.ts');
  // SMS Gateway
  const { sendSmsHandler, listTemplates, createTemplate } = await import('./sms-gateway/index.ts');
  // Training Academy
  const { handleCourses, handleEnrollments, handleAnalytics, getTrainingStats, exportEnrollmentsCsv, portalHandler, handlePaths } = await import('./training/index.ts');
  // Stats (sidebar counts + unified search)
  const { sidebarStats, searchStats, dashboardStats } = await import('./stats/index.ts');
  // Shortlist (pipeline)
  const { handleShortlist } = await import('./shortlist/index.ts');
  // Employees
  const { handleEmployees } = await import('./employees/index.ts');
  // Projects
  const { handleProjects } = await import('./projects/index.ts');
  // Positions
  const { handlePositions } = await import('./positions/index.ts');
  // Interviews (CRUD for templates, questions, sessions, results)
  const { handleInterviews } = await import('./interviews/index.ts');
  // Approvals
  const { handleApprovals } = await import('./approvals/index.ts');
  // Outreach
  const { handleOutreach } = await import('./outreach/index.ts');
  // Contacts
  const { handleContacts } = await import('./contacts/index.ts');
  // Integrations
  const { handleIntegrations } = await import('./integrations/index.ts');

  return [
    // AI Proxy — any authenticated user
    { pattern: '/ai-proxy', methods: ['POST'], auth: 'any', handler: proxy },
    // AI Config — admin only (contains API keys)
    { pattern: '/ai-config', methods: ['GET', 'POST', 'PATCH', 'DELETE'], auth: 'admin', handler: handleAiConfig },
    // Interview Scoring — recruiter+
    { pattern: '/interview-scoring/transcribe-and-score', methods: ['POST'], auth: 'recruiter+', handler: transcribeAndScore },
    { pattern: '/interview-scoring/aggregate/', methods: ['POST'], auth: 'recruiter+', handler: aggregate },
    // Candidate Ops — recruiter+ for mutations, any for reads
    { pattern: '/candidate-ops/import', methods: ['POST'], auth: 'recruiter+', handler: importCandidates },
    { pattern: '/candidate-ops/export/csv', methods: ['GET'], auth: 'recruiter+', handler: exportCsv },
    { pattern: '/candidate-ops/stats', methods: ['GET'], auth: 'any', handler: getStats },
    { pattern: '/candidate-ops', methods: ['GET'], auth: 'any', handler: listCandidates },
    { pattern: '/candidate-ops/', methods: ['POST'], auth: 'recruiter+', handler: updateTags },
    { pattern: '/candidate-ops/', methods: ['DELETE'], auth: 'recruiter+', handler: deleteCandidate },
    // Analytics — any authenticated
    { pattern: '/analytics/overview', methods: ['GET'], auth: 'any', handler: overview },
    { pattern: '/analytics/project-stats', methods: ['GET'], auth: 'any', handler: projectStats },
    // Interview Analytics
    { pattern: '/analytics/interview/summary', methods: ['GET'], auth: 'any', handler: interviewSummary },
    { pattern: '/analytics/interview/score-distribution', methods: ['GET'], auth: 'any', handler: interviewScoreDistribution },
    { pattern: '/analytics/interview/dimension-analysis', methods: ['GET'], auth: 'any', handler: interviewDimensionAnalysis },
    { pattern: '/analytics/interview/export-csv', methods: ['GET'], auth: 'any', handler: interviewExportCsv },
    // Settings - Users
    { pattern: '/settings/users/me', methods: ['GET'], auth: 'any', handler: getMe },
    { pattern: '/settings/users/reset-password', methods: ['POST'], auth: 'admin', handler: resetPassword },
    { pattern: '/settings/users/', methods: ['POST'], auth: 'admin', handler: createUser },
    { pattern: '/settings/users/', methods: ['PATCH'], auth: 'admin', handler: updateUser },
    { pattern: '/settings/users/', methods: ['DELETE'], auth: 'admin', handler: deleteUser },
    { pattern: '/settings/users', methods: ['GET'], auth: 'any', handler: listUsers },
    // Settings - Permissions (read-only, any authenticated)
    { pattern: '/settings/permissions', methods: ['GET'], auth: 'any', handler: getPermissions },
    { pattern: '/settings/role-permissions', methods: ['GET'], auth: 'any', handler: getRolePermissions },
    { pattern: '/settings/role-permissions', methods: ['PATCH'], auth: 'admin', handler: updateRolePermissions },
    // Settings - Notifications (own user, checked in handler)
    { pattern: '/settings/notification-settings/', methods: ['PATCH'], auth: 'any', handler: updateNotificationSetting },
    { pattern: '/settings/notification-settings', methods: ['GET'], auth: 'any', handler: listNotificationSettings },
    // Settings - Invites — admin only
    { pattern: '/settings/invites/', methods: ['DELETE'], auth: 'admin', handler: deleteInvite },
    { pattern: '/settings/invites/', methods: ['POST'], auth: 'admin', handler: createInvite },
    { pattern: '/settings/invites', methods: ['GET'], auth: 'admin', handler: listInvites },
    // Agent Executor — recruiter+
    { pattern: '/agent-executor/run', methods: ['POST'], auth: 'recruiter+', handler: runAgent },
    // Agent CRUD — recruiter+
    { pattern: '/agents', methods: ['GET', 'POST', 'PATCH', 'DELETE'], auth: 'recruiter+', handler: handleAgents },
    // Cross-table Ops
    { pattern: '/cross-table-ops/shortlist-interview-invite', methods: ['POST'], auth: 'recruiter+', handler: shortlistInterviewInvite },
    { pattern: '/cross-table-ops/shortlist-promote', methods: ['POST'], auth: 'recruiter+', handler: shortlistPromote },
    { pattern: '/cross-table-ops/approval-decide', methods: ['POST'], auth: 'hiring_manager+', handler: approvalDecide },
    { pattern: '/cross-table-ops/hire-candidate', methods: ['POST'], auth: 'hiring_manager+', handler: hireCandidate },
    // MinerU Proxy (recruiter+ — needs to parse resumes)
    { pattern: '/mineru-proxy/parse', methods: ['POST'], auth: 'recruiter+', handler: parseFile },
    { pattern: '/mineru-proxy/poll', methods: ['POST'], auth: 'recruiter+', handler: pollResult },
    // Notifications (own user, ownership checked in handler)
    { pattern: '/notifications/mark-read', methods: ['PATCH'], auth: 'any', handler: markRead },
    { pattern: '/notifications/', methods: ['DELETE'], auth: 'any', handler: dismissNotification },
    { pattern: '/notifications', methods: ['GET'], auth: 'any', handler: listNotifications },
    // SMS Gateway
    { pattern: '/sms-gateway/send', methods: ['POST'], auth: 'recruiter+', handler: sendSmsHandler },
    { pattern: '/sms-gateway/templates', methods: ['GET'], auth: 'any', handler: listTemplates },
    { pattern: '/sms-gateway/templates', methods: ['POST'], auth: 'admin', handler: createTemplate },
    // Training Academy — Courses (admin/recruiter manage, all authenticated read)
    { pattern: '/training/courses', methods: ['GET'], auth: 'any', handler: handleCourses },
    { pattern: '/training/courses', methods: ['POST'], auth: 'recruiter+', handler: handleCourses },
    { pattern: '/training/courses', methods: ['PATCH'], auth: 'recruiter+', handler: handleCourses },
    { pattern: '/training/courses', methods: ['DELETE'], auth: 'admin', handler: handleCourses },
    // Training Academy — Enrollments
    { pattern: '/training/enrollments', methods: ['GET'], auth: 'any', handler: handleEnrollments },
    { pattern: '/training/enrollments', methods: ['POST'], auth: 'recruiter+', handler: handleEnrollments },
    { pattern: '/training/enrollments', methods: ['PATCH'], auth: 'recruiter+', handler: handleEnrollments },
    { pattern: '/training/enrollments', methods: ['DELETE'], auth: 'recruiter+', handler: handleEnrollments },
    // Training Academy — Analytics
    { pattern: '/training/analytics', methods: ['GET'], auth: 'any', handler: handleAnalytics },
    { pattern: '/training/analytics/', methods: ['POST'], auth: 'any', handler: handleAnalytics },
    // Training Academy — Stats
    { pattern: '/training/stats', methods: ['GET'], auth: 'any', handler: getTrainingStats },
    // Training Academy — CSV Export
    { pattern: '/training/export', methods: ['GET'], auth: 'recruiter+', handler: exportEnrollmentsCsv },
    // Training Academy — Learning Paths (CRUD + courses + enrollments)
    { pattern: '/training/paths', methods: ['GET', 'POST', 'PATCH', 'DELETE'], auth: 'recruiter+', handler: handlePaths },
    // Training Academy — Public Candidate Portal (no auth)
    { pattern: '/training/portal', methods: ['GET'], auth: 'none', handler: portalHandler },
    // Stats — dashboard/sidebar/search (any authenticated)
    { pattern: '/stats/dashboard', methods: ['GET'], auth: 'any', handler: dashboardStats },
    { pattern: '/stats/sidebar', methods: ['GET'], auth: 'any', handler: sidebarStats },
    { pattern: '/stats/search', methods: ['GET'], auth: 'any', handler: searchStats },
    // Shortlist (pipeline) — recruiter+
    { pattern: '/api/shortlist', methods: ['GET', 'POST', 'PATCH', 'DELETE'], auth: 'recruiter+', handler: handleShortlist },
    // Employees — recruiter+
    { pattern: '/api/employees', methods: ['GET', 'POST', 'PATCH', 'DELETE'], auth: 'recruiter+', handler: handleEmployees },
    // Insights — any authenticated
    { pattern: '/api/insights', methods: ['GET'], auth: 'any', handler: overview },
    // Projects — recruiter+
    { pattern: '/projects', methods: ['GET', 'POST', 'PATCH', 'DELETE'], auth: 'recruiter+', handler: handleProjects },
    // Positions — recruiter+
    { pattern: '/positions', methods: ['GET', 'POST', 'PATCH', 'DELETE'], auth: 'recruiter+', handler: handlePositions },
    // Interviews — recruiter+ (templates, questions, sessions, results CRUD)
    { pattern: '/interviews/', methods: ['GET', 'POST', 'PATCH', 'DELETE'], auth: 'recruiter+', handler: handleInterviews },
    // Approvals — recruiter+
    { pattern: '/approvals', methods: ['GET', 'POST', 'PATCH'], auth: 'recruiter+', handler: handleApprovals },
    // Outreach — recruiter+
    { pattern: '/outreach', methods: ['GET', 'POST', 'PATCH', 'DELETE'], auth: 'recruiter+', handler: handleOutreach },
    // Contacts — recruiter+
    { pattern: '/contacts', methods: ['GET', 'POST', 'PATCH'], auth: 'recruiter+', handler: handleContacts },
    // Integrations — any authenticated
    { pattern: '/integrations', methods: ['GET'], auth: 'any', handler: handleIntegrations },
  ];
};

let handlers: RouteHandler[] | null = null;

function withCors(response: Response, corsH: Record<string, string>): Promise<Response> {
  const resHeaders = new Headers(response.headers);
  Object.entries(corsH).forEach(([k, v]) => resHeaders.set(k, v));
  return response.text().then(body =>
    new Response(body, { status: response.status, headers: resHeaders })
  );
}

const serverHandler = async (req: Request): Promise<Response> => {
  const corsH = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsH });
  }

  try {
    if (!handlers) {
      try {
        handlers = await loadHandlers();
      } catch (loadErr) {
        console.error('[embox-api] Failed to load handlers:', loadErr);
        const msg = loadErr instanceof Error ? `${loadErr.message} | stack: ${loadErr.stack?.slice(0, 500)}` : String(loadErr);
        return jsonRes(
          { error: { code: 'BOOT_ERROR', message: `Failed to initialize: ${msg}` } },
          503,
          corsH,
        );
      }
    }

    const url = new URL(req.url);
    const rawPath = url.pathname;
    // Supabase strips /functions/v1/ but keeps the function name as prefix
    const path = rawPath.replace(/^\/embox-api/, '') || '/';
    const method = req.method;
    console.log('[embox-api]', method, 'raw:', rawPath, 'stripped:', path);

    // Match routes: longest pattern first, then check method
    const matched = handlers.find(h => {
      if (!h.methods.includes(method)) return false;
      if (h.pattern.endsWith('/')) return path.startsWith(h.pattern);
      return path === h.pattern || path.startsWith(h.pattern + '/');
    });

    if (!matched) {
      return jsonRes({ error: { code: 'NOT_FOUND', message: `Route ${method} ${path} not found (raw: ${rawPath})` } }, 404, corsH);
    }

    // Auth check
    if (matched.auth !== 'none') {
      let authResult;
      switch (matched.auth) {
        case 'admin':
          authResult = await requireAdmin(req);
          break;
        case 'recruiter+':
          authResult = await requireRecruiterOrAbove(req);
          break;
        case 'hiring_manager+':
          authResult = await requireHiringManagerOrAbove(req);
          break;
        case 'any':
        default:
          authResult = await requireAuth(req);
          break;
      }

      if ('error' in authResult) {
        const errResp = authResult.error;
        return new Response(errResp.body, {
          status: errResp.status,
          headers: { ...corsH, 'Content-Type': 'application/json' },
        });
      }

      const response = await matched.handler(req, authResult.data.user.id, authResult.data.user.role);
      return await withCors(response, corsH);
    }

    const response = await matched.handler(req, '', '');
    return await withCors(response, corsH);
  } catch (err) {
    console.error('[embox-api] Unhandled error:', err);
    return jsonRes(
      { error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Internal server error' } },
      500,
      corsH,
    );
  }
};

Deno.serve(serverHandler);
