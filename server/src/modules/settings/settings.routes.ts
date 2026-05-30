import {Router} from 'express';
import bcrypt from 'bcryptjs';
import {query, queryOne} from '../../config/database.js';

// ---------------------------------------------------------------------------
// User routes (mounted at /api/users)
// ---------------------------------------------------------------------------

export const usersRouter = Router();

// POST /api/users — create user (admin only)
usersRouter.post('/', async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({error: {code: 'FORBIDDEN', message: 'Admin only'}});
      return;
    }
    const {name, email, password, role = 'viewer', department} = req.body;
    if (!name || !email || !password) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'name, email, and password are required'}});
      return;
    }
    if (password.length < 6) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'Password must be at least 6 characters'}});
      return;
    }
    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      res.status(409).json({error: {code: 'CONFLICT', message: 'Email already registered'}});
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    const row = await queryOne<{id: string; name: string; email: string; role: string; department: string | null; status: string; created_at: string}>(
      `INSERT INTO users (name, email, password_hash, role, department) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, department, status, created_at`,
      [name, email, hash, role, department || null],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// GET /api/users/me — current user info from DB
usersRouter.get('/me', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({error: {code: 'UNAUTHORIZED', message: 'Not authenticated'}});
      return;
    }
    const row = await queryOne(
      `SELECT id, name, email, role, phone, department, avatar, status, last_login_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user.userId],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'User not found'}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// GET /api/users — list users
usersRouter.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, name, email, role, phone, department, avatar, status, last_login_at, created_at, updated_at
       FROM users ORDER BY created_at DESC`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// PATCH /api/users/:id — update user
usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const allowed = ['name', 'email', 'role', 'phone', 'department', 'avatar', 'status'];
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        params.push(req.body[key]);
      }
    }

    if (sets.length === 0) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'No fields to update'}});
      return;
    }

    sets.push(`updated_at = now()`);
    params.push(id);

    const row = await queryOne(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, name, email, role, phone, department, avatar, status, last_login_at, created_at, updated_at`,
      params,
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `User (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// DELETE /api/users/:id — delete user
usersRouter.delete('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const row = await queryOne(
      `DELETE FROM users WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `User (${id}) not found`}});
      return;
    }
    res.json({deleted: true, id: row.id});
  } catch (e) { next(e); }
});

// POST /api/users/reset-password — admin resets user password
usersRouter.post('/reset-password', async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({error: {code: 'FORBIDDEN', message: 'Admin only'}});
      return;
    }

    const {userId: id, newPassword} = req.body;

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: '新密码至少 6 位'}});
      return;
    }

    const user = await queryOne<{id: string; name: string}>('SELECT id, name FROM users WHERE id = $1', [id]);
    if (!user) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `User (${id}) not found`}});
      return;
    }

    // Cannot reset own password here (use /api/auth/change-password for that)
    if (id === req.user.userId) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: '不能重置自己的密码，请使用修改密码功能'}});
      return;
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, id]);

    res.json({success: true, message: `${user.name} 的密码已重置`});
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Permission routes (mounted at /api/permissions)
// ---------------------------------------------------------------------------

export const permissionsRouter = Router();

// GET /api/permissions — return static permission list
permissionsRouter.get('/', async (_req, res, next) => {
  try {
    res.json([
      {key: 'projects:view', label: 'View Projects'},
      {key: 'projects:manage', label: 'Manage Projects'},
      {key: 'positions:view', label: 'View Positions'},
      {key: 'positions:manage', label: 'Manage Positions'},
      {key: 'candidates:view', label: 'View Candidates'},
      {key: 'candidates:manage', label: 'Manage Candidates'},
      {key: 'interviews:view', label: 'View Interviews'},
      {key: 'interviews:manage', label: 'Manage Interviews'},
      {key: 'approvals:view', label: 'View Approvals'},
      {key: 'approvals:decide', label: 'Decide Approvals'},
      {key: 'shortlist:view', label: 'View Shortlist'},
      {key: 'shortlist:manage', label: 'Manage Shortlist'},
      {key: 'outreach:view', label: 'View Outreach'},
      {key: 'outreach:manage', label: 'Manage Outreach'},
      {key: 'agents:view', label: 'View Agents'},
      {key: 'agents:manage', label: 'Manage Agents'},
      {key: 'settings:view', label: 'View Settings'},
      {key: 'settings:manage', label: 'Manage Settings'},
      {key: 'contacts:view', label: 'View Contacts'},
      {key: 'contacts:manage', label: 'Manage Contacts'},
      {key: 'analytics:view', label: 'View Analytics'},
      {key: 'integrations:manage', label: 'Manage Integrations'},
      {key: 'training:view', label: 'View Training'},
      {key: 'training:manage', label: 'Manage Training'},
    ]);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Role-permission routes (mounted at /api/role-permissions)
// ---------------------------------------------------------------------------

export const rolePermissionsRouter = Router();

// GET /api/role-permissions — return static role-permission mapping
rolePermissionsRouter.get('/', async (_req, res, next) => {
  try {
    res.json([
      {
        role: 'admin',
        label: 'Administrator',
        permissions: [
          'projects:view', 'projects:manage',
          'positions:view', 'positions:manage',
          'candidates:view', 'candidates:manage',
          'interviews:view', 'interviews:manage',
          'approvals:view', 'approvals:decide',
          'shortlist:view', 'shortlist:manage',
          'outreach:view', 'outreach:manage',
          'agents:view', 'agents:manage',
          'settings:view', 'settings:manage',
          'contacts:view', 'contacts:manage',
          'analytics:view',
          'integrations:manage',
          'training:view', 'training:manage',
        ],
      },
      {
        role: 'recruiter',
        label: 'Recruiter',
        permissions: [
          'projects:view',
          'positions:view',
          'candidates:view', 'candidates:manage',
          'interviews:view', 'interviews:manage',
          'approvals:view',
          'shortlist:view', 'shortlist:manage',
          'outreach:view', 'outreach:manage',
          'agents:view',
          'contacts:view', 'contacts:manage',
          'analytics:view',
          'training:view', 'training:manage',
        ],
      },
      {
        role: 'interviewer',
        label: 'Interviewer',
        permissions: [
          'projects:view',
          'positions:view',
          'candidates:view',
          'interviews:view', 'interviews:manage',
          'approvals:view',
          'analytics:view',
          'training:view',
        ],
      },
      {
        role: 'viewer',
        label: 'Viewer',
        permissions: [
          'projects:view',
          'positions:view',
          'candidates:view',
          'interviews:view',
          'approvals:view',
          'shortlist:view',
          'outreach:view',
          'agents:view',
          'contacts:view',
          'analytics:view',
          'training:view',
        ],
      },
    ]);
  } catch (e) { next(e); }
});

// PUT /api/role-permissions/:role — update role permissions (stub)
rolePermissionsRouter.put('/:role', async (req, res, next) => {
  try {
    const {role} = req.params;
    const {permissions} = req.body;
    res.json({role, permissions, updated: true});
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Notification settings (mounted at /api/notification-settings)
// ---------------------------------------------------------------------------

export const notificationSettingsRouter = Router();

// GET /api/notification-settings — list settings for current user
notificationSettingsRouter.get('/', async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({error: {code: 'UNAUTHORIZED', message: 'Not authenticated'}});
      return;
    }
    const rows = await query(
      `SELECT * FROM notification_settings WHERE user_id = $1 ORDER BY type, category`,
      [req.user.userId],
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// PATCH /api/notification-settings/:id — toggle enabled
notificationSettingsRouter.patch('/:id', async (req, res, next) => {
  try {
    const {id} = req.params;
    const {enabled} = req.body;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'enabled (boolean) is required'}});
      return;
    }
    const row = await queryOne(
      `UPDATE notification_settings SET enabled = $1 WHERE id = $2 RETURNING *`,
      [enabled, id],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Notification setting (${id}) not found`}});
      return;
    }
    res.json(row);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Team invites (mounted at /api/invites)
// ---------------------------------------------------------------------------

export const invitesRouter = Router();

// GET /api/invites — list team invites
invitesRouter.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT * FROM team_invites ORDER BY invited_at DESC`,
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/invites — create invite
invitesRouter.post('/', async (req, res, next) => {
  try {
    const {email, role, invitedBy} = req.body;
    if (!email || !role) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'email and role are required'}});
      return;
    }
    const row = await queryOne(
      `INSERT INTO team_invites (email, role, status, invited_by)
       VALUES ($1, $2, 'pending', $3)
       ON CONFLICT (email, role) DO UPDATE SET status = 'pending', invited_at = now(), invited_by = EXCLUDED.invited_by
       RETURNING *`,
      [email, role, invitedBy ?? null],
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

// DELETE /api/invites/:email — delete invite
invitesRouter.delete('/:email', async (req, res, next) => {
  try {
    const {email} = req.params;
    const {role} = req.query;
    if (!role) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'role query parameter is required (composite PK)'}});
      return;
    }
    const row = await queryOne(
      `DELETE FROM team_invites WHERE email = $1 AND role = $2 RETURNING email`,
      [email, role],
    );
    if (!row) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: `Invite for (${email}, ${role}) not found`}});
      return;
    }
    res.json({deleted: true, email: row.email});
  } catch (e) { next(e); }
});
