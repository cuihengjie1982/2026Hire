import {fetchJson, invokeEdgeFunction} from '../../shared/lib/apiClient';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';
import {usersFixture, permissionsFixture, rolePermissionsFixture, notificationSettingsFixture, teamMemberInvitesFixture, currentUserFixture} from './fixtures';
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
    return usersFixture;
  }
  return efetch<User[]>('/settings/users', 'GET');
};

export const updateUser = async (userId: string, data: Partial<User>): Promise<User> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const user = usersFixture.find(u => u.id === userId);
    if (!user) throw new Error('User not found');
    Object.assign(user, data);
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
    usersFixture.push(user);
    return user;
  }
  return efetch<User>('/settings/users/', 'POST', data);
};

export const deleteUser = async (userId: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return;
  }
  return efetch<void>(`/settings/users/${userId}`, 'DELETE');
};

export const resetUserPassword = async (userId: string, newPassword: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return;
  }
  return efetch<void>(`/settings/users/${userId}/reset-password`, 'POST', { newPassword });
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
    return teamMemberInvitesFixture;
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
    teamMemberInvitesFixture.push(newInvite);
    return newInvite;
  }
  return efetch<TeamMemberInvite>('/settings/invites/', 'POST', { email, role, invitedBy: currentUserFixture.name });
};

export const cancelInvite = async (email: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const idx = teamMemberInvitesFixture.findIndex(i => i.email === email);
    if (idx !== -1) teamMemberInvitesFixture.splice(idx, 1);
    return;
  }
  // Cancel invite requires role param — use recruiter as default for cancel
  return efetch<void>(`/settings/invites/${encodeURIComponent(email)}?role=recruiter`, 'DELETE');
};