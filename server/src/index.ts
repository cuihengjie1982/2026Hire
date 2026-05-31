import express from 'express';
import cors from 'cors';
import {env} from './config/env.js';
import {testConnection, query, queryOne} from './config/database.js';
import {authMiddleware, cleanupExpiredTokens} from './middleware/auth.js';
import {errorHandler} from './middleware/errorHandler.js';
import {auditLogMiddleware} from './middleware/auditLog.js';
import {securityMiddleware, apiLimiter, authLimiter, passwordLimiter, tokenRefreshLimiter} from './middleware/security.js';
import {csrfMiddleware} from './middleware/csrf.js';
import {logger} from './middleware/logger.js';
import pdfProxy from './shared/pdfProxy.js';
import authRoutes from './modules/auth/auth.routes.js';
import projectsRoutes from './modules/projects/projects.routes.js';
import positionsRoutes from './modules/positions/positions.routes.js';
import candidatesRoutes from './modules/candidates/candidates.routes.js';
import interviewsRoutes from './modules/interviews/interviews.routes.js';
import approvalsRoutes from './modules/approvals/approvals.routes.js';
import shortlistRoutes from './modules/shortlist/shortlist.routes.js';
import outreachRoutes from './modules/outreach/outreach.routes.js';
import agentsRoutes from './modules/agents/agents.routes.js';
import {usersRouter, permissionsRouter, rolePermissionsRouter, notificationSettingsRouter, invitesRouter} from './modules/settings/settings.routes.js';
import contactsRoutes from './modules/contacts/contacts.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import integrationsRoutes from './modules/integrations/integrations.routes.js';
import aiConfigRoutes from './modules/ai/aiConfig.routes.js';
import aiProxyRoutes from './modules/ai/aiProxy.routes.js';
import scoringRoutes from './modules/interviews/scoring.routes.js';
import statsRoutes from './modules/stats/stats.routes.js';
import employeesRoutes from './modules/employees/employees.routes.js';
import trainingRoutes from './modules/training/training.routes.js';
import conversationalRoutes from './modules/interviews/conversational.routes.js';

const app = express();

// Global middleware
const allowedOrigins = env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    const isLocalhostOrigin = typeof origin === 'string' && /^http:\/\/localhost:\d+$/.test(origin);
    if (!origin || allowedOrigins.includes(origin) || isLocalhostOrigin) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(express.json({limit: '100mb'}));
app.use(securityMiddleware);
app.use(csrfMiddleware);

// Request logging
app.use((req, _res, next) => {
  logger.info('request', {method: req.method, path: req.path});
  next();
});

// ---------------------------------------------------------------------------
// API Versioning Strategy
// ---------------------------------------------------------------------------
// All routes are available under both /api/<path> and /api/v1/<path>.
//
// - /api/<path>     : backward-compatible mount, retained for existing clients.
// - /api/v1/<path>  : versioned mount, identical behaviour in v1.
//
// When a breaking change is needed in the future, introduce /api/v2/<path>
// and leave /api/v1/<path> untouched.  The unversioned /api/<path> prefix
// should eventually be deprecated once all consumers migrate to an explicit
// version prefix.
// ---------------------------------------------------------------------------

// ── Public routes (no auth) ──────────────────────────────────────────────

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use(pdfProxy);

// Webhook (no auth)
app.post('/api/webhooks/mis/onboarding-complete', (req, res) => {
  console.log('MIS webhook received:', req.body);
  res.json({received: true});
});
app.post('/api/v1/webhooks/mis/onboarding-complete', (req, res) => {
  console.log('MIS webhook received:', req.body);
  res.json({received: true});
});

// Candidate training portal (public — candidates don't have app accounts)
const handleTrainingPortal = async (req: import('express').Request, res: import('express').Response) => {
  try {
    const {candidateId} = req.params;
    const {token} = req.query;

    // Simple token verification (optional; UUID is already hard to guess)
    const secret = env.JWT_SECRET.slice(0, 16);
    const expected = Buffer.from(candidateId + secret).toString('base64').slice(0, 8);
    if (token && token !== expected) {
      res.status(403).json({error: {code: 'FORBIDDEN', message: 'Invalid access token'}});
      return;
    }

    const enrollments = await query(
      `SELECT te.*, tc.title AS course_title, tc.category AS course_category,
              tc.description AS course_description, tc.difficulty,
              tc.duration_minutes, tc.content, tc.materials
       FROM training_enrollments te
       JOIN training_courses tc ON tc.id = te.course_id
       WHERE te.candidate_id = $1
       ORDER BY te.enrolled_at DESC`,
      [candidateId],
    );

    const result = [];
    for (const e of enrollments) {
      const assessments = await query(
        `SELECT * FROM training_assessments WHERE enrollment_id = $1 ORDER BY created_at DESC`,
        [e.id],
      );
      result.push({...e, assessments});
    }

    const candidate = await queryOne(
      `SELECT id, name, email, phone FROM candidates WHERE id = $1`,
      [candidateId],
    );

    res.json({candidate: candidate ?? null, enrollments: result});
  } catch (e) {
    res.status(500).json({error: {code: 'INTERNAL_ERROR', message: 'Failed to load portal data'}});
  }
};
app.get('/api/training/portal/:candidateId', handleTrainingPortal);
app.get('/api/v1/training/portal/:candidateId', handleTrainingPortal);

// Health check (public)
app.get('/api/health', (_req, res) => res.json({status: 'ok', timestamp: new Date().toISOString()}));
app.get('/api/v1/health', (_req, res) => res.json({status: 'ok', timestamp: new Date().toISOString()}));

// ── Authenticated routes ──────────────────────────────────────────────────

app.use('/api', apiLimiter, authMiddleware);
app.use('/api/v1', apiLimiter, authMiddleware);

// Audit logging for all mutating requests (after auth so req.user is available)
app.use(auditLogMiddleware);

// Projects
app.use('/api/projects', projectsRoutes);
app.use('/api/v1/projects', projectsRoutes);

// Positions
app.use('/api/positions', positionsRoutes);
app.use('/api/v1/positions', positionsRoutes);

// Candidates (aliased under three prefixes)
app.use('/api/candidates', candidatesRoutes);
app.use('/api/v1/candidates', candidatesRoutes);
app.use('/api/talent-pool', candidatesRoutes);
app.use('/api/v1/talent-pool', candidatesRoutes);
app.use('/api/talent', candidatesRoutes);
app.use('/api/v1/talent', candidatesRoutes);

// Interviews (aliased under four prefixes)
app.use('/api/interview-templates', interviewsRoutes);
app.use('/api/v1/interview-templates', interviewsRoutes);
app.use('/api/interview-sessions', interviewsRoutes);
app.use('/api/v1/interview-sessions', interviewsRoutes);
app.use('/api/interview-results', interviewsRoutes);
app.use('/api/v1/interview-results', interviewsRoutes);
app.use('/api/interview-analytics', interviewsRoutes);
app.use('/api/v1/interview-analytics', interviewsRoutes);

// Approvals (aliased under three prefixes)
app.use('/api/interview-approvals', approvalsRoutes);
app.use('/api/v1/interview-approvals', approvalsRoutes);
app.use('/api/interview-approval-history', approvalsRoutes);
app.use('/api/v1/interview-approval-history', approvalsRoutes);
app.use('/api/approval-requests', approvalsRoutes);
app.use('/api/v1/approval-requests', approvalsRoutes);

// Shortlist
app.use('/api/shortlist', shortlistRoutes);
app.use('/api/v1/shortlist', shortlistRoutes);

// Outreach (沟通记录)
app.use('/api/outreach-records', outreachRoutes);
app.use('/api/v1/outreach-records', outreachRoutes);
app.use('/api/outreach', outreachRoutes);
app.use('/api/v1/outreach', outreachRoutes);

// Agents
app.use('/api/agents', agentsRoutes);
app.use('/api/v1/agents', agentsRoutes);

// Settings sub-routers
app.use('/api/users', usersRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/v1/permissions', permissionsRouter);
app.use('/api/role-permissions', rolePermissionsRouter);
app.use('/api/v1/role-permissions', rolePermissionsRouter);
app.use('/api/notification-settings', notificationSettingsRouter);
app.use('/api/v1/notification-settings', notificationSettingsRouter);
app.use('/api/invites', invitesRouter);
app.use('/api/v1/invites', invitesRouter);

// Contacts
app.use('/api/contacts', contactsRoutes);
app.use('/api/v1/contacts', contactsRoutes);

// Analytics / Insights
app.use('/api/insights', analyticsRoutes);
app.use('/api/v1/insights', analyticsRoutes);

// Integrations
app.use('/api/integrations', integrationsRoutes);
app.use('/api/v1/integrations', integrationsRoutes);

// AI configuration & proxy
app.use('/api/ai-configs', aiConfigRoutes);
app.use('/api/v1/ai-configs', aiConfigRoutes);
app.use('/api/ai', aiProxyRoutes);
app.use('/api/v1/ai', aiProxyRoutes);

// Interview scoring pipeline
app.use('/api/interview-scoring', scoringRoutes);
app.use('/api/v1/interview-scoring', scoringRoutes);

// Stats (lightweight aggregated endpoints)
app.use('/api/stats', statsRoutes);
app.use('/api/v1/stats', statsRoutes);

// Employee profiles, performance, competency models
app.use('/api/employees', employeesRoutes);
app.use('/api/v1/employees', employeesRoutes);

// Training Academy (courses, enrollments, assessments, analytics)
app.use('/api/training', trainingRoutes);
app.use('/api/v1/training', trainingRoutes);

// Conversational Interview
app.use('/api', conversationalRoutes);
app.use('/api/v1', conversationalRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start
const server = await (async () => {
  logger.info('EM-BOX API Server starting...');
  await testConnection();
  return app.listen(env.PORT, () => {
    logger.info('Server running', {port: env.PORT, cors: env.CORS_ORIGIN, auth: 'JWT + refresh + blacklist'});
  });
})();

// Periodic cleanup: expired tokens every hour
const cleanupInterval = setInterval(() => {
  cleanupExpiredTokens().catch(() => {});
}, 3600000);

// Graceful shutdown
function shutdown(signal: string) {
  logger.info('Shutting down gracefully', {signal});
  clearInterval(cleanupInterval);
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
  // Force shutdown after 10s if connections don't close
  setTimeout(() => {
    logger.error('Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
