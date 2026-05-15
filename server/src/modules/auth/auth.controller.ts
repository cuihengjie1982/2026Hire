import type {Request, Response, NextFunction} from 'express';
import * as authService from './auth.service.js';

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (e) { next(e); }
}

export async function registerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.register(req.body);
    res.status(201).json(user);
  } catch (e) { next(e); }
}

export async function meHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getCurrentUser(req.user!.userId);
    res.json(user);
  } catch (e) { next(e); }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const {refreshToken} = req.body;
    const result = await authService.refreshToken(refreshToken);
    res.json(result);
  } catch (e) { next(e); }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await authService.logout(req.user!.userId, req.user!.jti);
    res.json({success: true});
  } catch (e) { next(e); }
}

export async function changePasswordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const {oldPassword, newPassword} = req.body;
    if (!oldPassword || !newPassword) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'oldPassword and newPassword are required'}});
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters'}});
      return;
    }
    await authService.changePassword(req.user!.userId, oldPassword, newPassword);
    res.json({success: true});
  } catch (e) { next(e); }
}
