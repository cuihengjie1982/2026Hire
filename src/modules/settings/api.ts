import {fetchJson} from '../../shared/lib/apiClient';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';
import {permissionsFixture, rolePermissionsFixture, notificationSettingsFixture, currentUserFixture} from './fixtures';
import {type User, type Permission, type RolePermission, type NotificationSetting, type TeamMemberInvite, type UserRole} from './types';

const USER_ROLES: UserRole[] = ['admin', 'recruiter', 'hiring_manager', 'viewer', 'video_viewer'];

const efetch = async <T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const token = getAuthToken();
  const res = await fetch(`${base}/functions/v1/embox-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};

// --- localStorage-backed mock stores ---
const STORAGE_KEYS = {
  users: 'em-box.mock.users',
  invites: 'em-box.mock.invites',
} as const;

const loadFromStorage = <T>(key: string, fallback: T[]): T[] => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const saveToStorage = <T>(key: string, data: T[]) => {
  localStorage.setItem(key, JSON.stringify(data));
};

let mockUsers: User[] = loadFromStorage(STORAGE_KEYS.users, []);
let mockInvites: TeamMemberInvite[] = loadFromStorage(STORAGE_KEYS.invites, []);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeRole = (value: unknown): UserRole =>
  USER_ROLES.includes(value as UserRole) ? value as UserRole : 'viewer';

const mapUser = (raw: unknown): User => {
  if (!isRecord(raw)) throw new Error('Invalid user payload');
  const email = String(raw.email ?? '');
  const name = String(raw.name ?? '').trim() || email.split('@')[0] || '未命名账号';
  return {
    id: String(raw.id ?? ''),
    name,
    email,
    role: normalizeRole(raw.role),
    avatar: raw.avatar ? String(raw.avatar) : undefined,
    department: raw.department ? String(raw.department) : undefined,
    phone: raw.phone ? String(raw.phone) : undefined,
    status: raw.status === 'inactive' ? 'inactive' : 'active',
    lastLoginAt: raw.last_login_at || raw.lastLoginAt ? String(raw.last_login_at ?? raw.lastLoginAt) : undefined,
    createdAt: String(raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
  };
};

export const getCurrentUser = async (): Promise<User> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return currentUserFixture;
  }
  return mapUser(await efetch<unknown>('/settings/users/me', 'GET'));
};

export const listUsers = async (): Promise<User[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return [...mockUsers];
  }
  const rows = await efetch<unknown[]>('/settings/users', 'GET');
  return rows.filter(isRecord).map(mapUser).filter(user => user.id && user.email);
};

export const updateUser = async (userId: string, data: Partial<User>): Promise<User> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const user = mockUsers.find(u => u.id === userId);
    if (!user) throw new Error('User not found');
    Object.assign(user, data);
    saveToStorage(STORAGE_KEYS.users, mockUsers);
    return user;
  }
  return mapUser(await efetch<unknown>(`/settings/users/${userId}`, 'PATCH', data));
};

export const createUser = async (data: {name: string; email: string; role: string; department?: string; password: string}): Promise<User> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const user: User = {
      id: `user-${Date.now()}`,
      name: data.name,
      email: data.email,
      role: data.role as UserRole,
      department: data.department,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    mockUsers.push(user);
    saveToStorage(STORAGE_KEYS.users, mockUsers);
    return user;
  }
  return mapUser(await efetch<unknown>('/settings/users/', 'POST', data));
};

export const deleteUser = async (userId: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    mockUsers = mockUsers.filter(u => u.id !== userId);
    saveToStorage(STORAGE_KEYS.users, mockUsers);
    return;
  }
  return efetch<void>(`/settings/users/${userId}`, 'DELETE');
};

export const resetUserPassword = async (userId: string, newPassword: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return;
  }
  return efetch<void>('/settings/users/reset-password', 'POST', { userId, newPassword });
};

export const listPermissions = async (): Promise<Permission[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return permissionsFixture;
  }
  return efetch<Permission[]>('/settings/permissions', 'GET');
};

export const listRolePermissions = async (): Promise<RolePermission[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return rolePermissionsFixture;
  }
  return efetch<RolePermission[]>('/settings/role-permissions', 'GET');
};

export const updateRolePermissions = async (role: UserRole, permissions: string[]): Promise<RolePermission> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const rolePerm = rolePermissionsFixture.find(r => r.role === role);
    if (!rolePerm) throw new Error('Role not found');
    rolePerm.permissions = permissions;
    return rolePerm;
  }
  return efetch<RolePermission>('/settings/role-permissions', 'PATCH', { role, permissions });
};

export const listNotificationSettings = async (): Promise<NotificationSetting[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return notificationSettingsFixture;
  }
  return efetch<NotificationSetting[]>('/settings/notification-settings', 'GET');
};

export const updateNotificationSetting = async (settingId: string, enabled: boolean): Promise<NotificationSetting> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const setting = notificationSettingsFixture.find(s => s.id === settingId);
    if (!setting) throw new Error('Setting not found');
    setting.enabled = enabled;
    return setting;
  }
  return efetch<NotificationSetting>(`/settings/notification-settings/${settingId}`, 'PATCH', { enabled });
};

export const listInvites = async (): Promise<TeamMemberInvite[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return [...mockInvites];
  }
  return efetch<TeamMemberInvite[]>('/settings/invites', 'GET');
};

export const inviteTeamMember = async (email: string, role: UserRole): Promise<TeamMemberInvite> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const newInvite: TeamMemberInvite = {
      email,
      role,
      status: 'pending',
      invitedAt: new Date().toISOString(),
      invitedBy: currentUserFixture.name,
    };
    mockInvites.push(newInvite);
    saveToStorage(STORAGE_KEYS.invites, mockInvites);
    return newInvite;
  }
  return efetch<TeamMemberInvite>('/settings/invites/', 'POST', { email, role, invitedBy: currentUserFixture.name });
};

export const cancelInvite = async (email: string, role: UserRole): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    mockInvites = mockInvites.filter(i => i.email !== email);
    saveToStorage(STORAGE_KEYS.invites, mockInvites);
    return;
  }
  return efetch<void>(`/settings/invites/${encodeURIComponent(email)}?role=${encodeURIComponent(role)}`, 'DELETE');
};
