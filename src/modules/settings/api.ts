import {fetchJson} from '../../shared/lib/apiClient';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';
import {permissionsFixture, rolePermissionsFixture, notificationSettingsFixture, currentUserFixture} from './fixtures';
import {type User, type Permission, type RolePermission, type NotificationSetting, type TeamMemberInvite, type UserRole} from './types';

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

export const getCurrentUser = async (): Promise<User> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return currentUserFixture;
  }
  return efetch<User>('/settings/users/me', 'GET');
};

export const listUsers = async (): Promise<User[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return [...mockUsers];
  }
  return efetch<User[]>('/settings/users', 'GET');
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
  return efetch<User>(`/settings/users/${userId}`, 'PATCH', data);
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
  return efetch<User>('/settings/users/', 'POST', data);
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

export const cancelInvite = async (email: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    mockInvites = mockInvites.filter(i => i.email !== email);
    saveToStorage(STORAGE_KEYS.invites, mockInvites);
    return;
  }
  return efetch<void>(`/settings/invites/${encodeURIComponent(email)}?role=recruiter`, 'DELETE');
};
