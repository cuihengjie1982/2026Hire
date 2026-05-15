import {invokeEdgeFunction} from '../../shared/lib/apiClient';
import {USE_MOCK_API} from '../../shared/lib/runtime';
import {usersFixture, permissionsFixture, rolePermissionsFixture, notificationSettingsFixture, teamMemberInvitesFixture, currentUserFixture} from './fixtures';
import {type User, type Permission, type RolePermission, type NotificationSetting, type TeamMemberInvite, type UserRole} from './types';

export const getCurrentUser = async (): Promise<User> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return currentUserFixture;
  }
  return invokeEdgeFunction<User>('settings', {action: 'me'});
};

export const listUsers = async (): Promise<User[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return usersFixture;
  }
  return invokeEdgeFunction<User[]>('settings', {action: 'list-users'});
};

export const updateUser = async (userId: string, data: Partial<User>): Promise<User> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const user = usersFixture.find(u => u.id === userId);
    if (!user) throw new Error('User not found');
    Object.assign(user, data);
    return user;
  }
  return invokeEdgeFunction<User>('settings', {
    action: 'update-user',
    userId,
    ...data,
  });
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
  return invokeEdgeFunction<User>('settings', {
    action: 'create-user',
    ...data,
  });
};

export const deleteUser = async (userId: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return;
  }
  return invokeEdgeFunction<void>('settings', {
    action: 'delete-user',
    userId,
  });
};

export const listPermissions = async (): Promise<Permission[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return permissionsFixture;
  }
  return invokeEdgeFunction<Permission[]>('settings', {action: 'permissions'});
};

export const listRolePermissions = async (): Promise<RolePermission[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return rolePermissionsFixture;
  }
  return invokeEdgeFunction<RolePermission[]>('settings', {action: 'role-permissions'});
};

export const updateRolePermissions = async (role: UserRole, permissions: string[]): Promise<RolePermission> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const rolePerm = rolePermissionsFixture.find(r => r.role === role);
    if (!rolePerm) throw new Error('Role not found');
    rolePerm.permissions = permissions;
    return rolePerm;
  }
  return invokeEdgeFunction<RolePermission>('settings', {
    action: 'update-role-permissions',
    role,
    permissions,
  });
};

export const listNotificationSettings = async (): Promise<NotificationSetting[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return notificationSettingsFixture;
  }
  return invokeEdgeFunction<NotificationSetting[]>('settings', {action: 'notification-settings'});
};

export const updateNotificationSetting = async (settingId: string, enabled: boolean): Promise<NotificationSetting> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const setting = notificationSettingsFixture.find(s => s.id === settingId);
    if (!setting) throw new Error('Setting not found');
    setting.enabled = enabled;
    return setting;
  }
  return invokeEdgeFunction<NotificationSetting>('settings', {
    action: 'update-notification-setting',
    settingId,
    enabled,
  });
};

export const listInvites = async (): Promise<TeamMemberInvite[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return teamMemberInvitesFixture;
  }
  return invokeEdgeFunction<TeamMemberInvite[]>('settings', {action: 'invites'});
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
  return invokeEdgeFunction<TeamMemberInvite>('settings', {
    action: 'invite-team-member',
    email,
    role,
  });
};

export const cancelInvite = async (email: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const idx = teamMemberInvitesFixture.findIndex(i => i.email === email);
    if (idx !== -1) teamMemberInvitesFixture.splice(idx, 1);
    return;
  }
  return invokeEdgeFunction<void>('settings', {
    action: 'cancel-invite',
    email,
  });
};