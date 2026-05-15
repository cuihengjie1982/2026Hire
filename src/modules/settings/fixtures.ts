import {type User, type Permission, type RolePermission, type NotificationSetting, type TeamMemberInvite} from './types';

export const usersFixture: User[] = [];
export const permissionsFixture: Permission[] = [];
export const rolePermissionsFixture: RolePermission[] = [];
export const notificationSettingsFixture: NotificationSetting[] = [];
export const teamMemberInvitesFixture: TeamMemberInvite[] = [];
export const currentUserFixture: User = {
  id: '', name: '', email: '', role: 'viewer', status: 'active', createdAt: '',
};
export const roleLabels: Record<string, {label: string; description: string}> = {};
