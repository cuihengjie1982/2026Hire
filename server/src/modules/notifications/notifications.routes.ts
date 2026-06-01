import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';

const router = Router();

// GET / — list current user's notifications
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 100);
    const unreadOnly = req.query.unread === 'true';

    let sql = 'SELECT * FROM notifications WHERE user_id = $1';
    const params: unknown[] = [userId];

    if (unreadOnly) {
      sql += ' AND read = false';
    }

    sql += ' ORDER BY created_at DESC LIMIT $2';
    params.push(limit);

    const notifications = await query(sql, params);

    const unreadResult = await query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read = false',
      [userId],
    );
    const unreadCount = unreadResult[0]?.count ?? 0;

    res.json({notifications, unreadCount});
  } catch (e) {
    next(e);
  }
});

// PATCH /mark-read — mark one or all as read
router.patch('/mark-read', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const {id} = req.body;

    if (id) {
      const row = await queryOne(
        `UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, userId],
      );
      res.json(row);
    } else {
      await query(
        `UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
        [userId],
      );
      res.json({success: true});
    }
  } catch (e) {
    next(e);
  }
});

// DELETE /:id — dismiss a notification
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId],
    );
    res.json({success: true});
  } catch (e) {
    next(e);
  }
});

export default router;
