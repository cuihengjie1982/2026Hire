import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {query, queryOne} from '../../config/database.js';
import {env} from '../../config/env.js';
import {UnauthorizedError, ValidationError} from '../../shared/errors.js';
import {generateTokenPair, revokeToken, revokeAllUserTokens} from '../../middleware/auth.js';
import type {JwtPayload} from '../../middleware/auth.js';
import type {LoginInput, LoginResponse, RegisterInput} from './auth.types.js';

export async function login(input: LoginInput): Promise<LoginResponse> {
  const {email, password} = input;
  if (!email || !password) throw new ValidationError('Email and password are required');

  const user = await queryOne<{id: string; name: string; email: string; password_hash: string; role: string; avatar: string | null; status: string}>(
    'SELECT id, name, email, password_hash, role, avatar, status FROM users WHERE email = $1',
    [email],
  );

  if (!user) throw new UnauthorizedError('Invalid email or password');
  if (user.status !== 'active') throw new UnauthorizedError('Account is inactive');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new UnauthorizedError('Invalid email or password');

  // Update last login
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  const {accessToken, refreshToken} = generateTokenPair({
    userId: user.id, email: user.email, role: user.role,
  });

  return {
    token: accessToken,
    refreshToken,
    user: {id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar},
  };
}

export async function refreshToken(refreshTokenStr: string) {
  if (!refreshTokenStr) throw new UnauthorizedError('Refresh token required');

  let decoded: any;
  try {
    decoded = jwt.verify(refreshTokenStr, env.JWT_SECRET);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  if (decoded.type !== 'refresh') throw new UnauthorizedError('Not a refresh token');

  // Check if refresh token is blacklisted
  const blacklisted = await queryOne<{id: string}>(
    `SELECT id FROM token_blacklist WHERE jti = $1 AND expires_at > now()`,
    [decoded.jti],
  );
  if (blacklisted) throw new UnauthorizedError('Refresh token has been revoked');

  // Blacklist the used refresh token (rotation)
  const decodedExp = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 86400000);
  await revokeToken(decoded.jti, decoded.userId, decodedExp, 'refresh_rotation');

  // Issue new token pair
  const {accessToken, refreshToken: newRefresh} = generateTokenPair({
    userId: decoded.userId, email: decoded.email, role: decoded.role,
  });

  return {token: accessToken, refreshToken: newRefresh};
}

export async function logout(userId: string, jti: string) {
  // Revoke the current access token
  const expiresAt = new Date(Date.now() + 2 * 3600000); // max 2h remaining
  await revokeToken(jti, userId, expiresAt, 'logout');
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const user = await queryOne<{id: string; password_hash: string}>(
    'SELECT id, password_hash FROM users WHERE id = $1',
    [userId],
  );
  if (!user) throw new UnauthorizedError('User not found');

  const valid = await bcrypt.compare(oldPassword, user.password_hash);
  if (!valid) throw new ValidationError('Current password is incorrect');

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);

  // Revoke all existing tokens for this user
  await revokeAllUserTokens(userId, 'password_change');
}

export async function register(input: RegisterInput) {
  const {name, email, password, role = 'viewer'} = input;
  if (!name || !email || !password) throw new ValidationError('Name, email, and password are required');

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) throw new ValidationError('Email already registered');

  const hash = await bcrypt.hash(password, 12);
  const user = await queryOne<{id: string; name: string; email: string; role: string; avatar: string | null}>(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, avatar',
    [name, email, hash, role],
  );

  return user;
}

export async function getCurrentUser(userId: string) {
  const user = await queryOne<{id: string; name: string; email: string; role: string; phone: string | null; department: string | null; avatar: string | null; status: string}>(
    'SELECT id, name, email, role, phone, department, avatar, status FROM users WHERE id = $1',
    [userId],
  );
  if (!user) throw new UnauthorizedError('User not found');
  return user;
}
