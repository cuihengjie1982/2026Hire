import {Router} from 'express';
import templateRoutes from './template.routes.js';
import sessionRoutes from './session.routes.js';
import analyticsRoutes from './analytics.routes.js';

const router = Router();

// Mount session routes first — /results must match before /:id in templateRoutes
router.use(sessionRoutes);
router.use(templateRoutes);
router.use('/analytics', analyticsRoutes);

export default router;
