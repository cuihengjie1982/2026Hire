import {Router} from 'express';
import {loginHandler, registerHandler, meHandler, refreshHandler, logoutHandler, changePasswordHandler} from './auth.controller.js';
import {authMiddleware} from '../../middleware/auth.js';
import {requireRole} from '../../middleware/requireRole.js';
import {validate} from '../../middleware/validate.js';
import {passwordLimiter, tokenRefreshLimiter} from '../../middleware/security.js';

const router = Router();

// Public
router.post('/login', validate([
  {field: 'email', required: true, type: 'email'},
  {field: 'password', required: true, type: 'string', minLength: 1},
]), loginHandler);

// Token 刷新限流
router.post('/refresh', tokenRefreshLimiter, refreshHandler);

// Authenticated
router.get('/me', authMiddleware, meHandler);
router.post('/logout', authMiddleware, logoutHandler);
// 密码修改限流
router.post('/change-password', passwordLimiter, authMiddleware, changePasswordHandler);

// Admin only
router.post('/register', authMiddleware, requireRole('admin'), validate([
  {field: 'name', required: true, type: 'string', maxLength: 255},
  {field: 'email', required: true, type: 'email'},
  {field: 'password', required: true, type: 'string', minLength: 8},
  {field: 'role', required: false, type: 'string', maxLength: 50},
]), registerHandler);

export default router;
