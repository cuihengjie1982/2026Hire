import {type User, type Permission, type RolePermission, type NotificationSetting, type TeamMemberInvite} from './types';

export const usersFixture: User[] = [];
export const permissionsFixture: Permission[] = [];
export const rolePermissionsFixture: RolePermission[] = [];
export const notificationSettingsFixture: NotificationSetting[] = [];
export const teamMemberInvitesFixture: TeamMemberInvite[] = [];
export const currentUserFixture: User = {
  id: '', name: '', email: '', role: 'viewer', status: 'active', createdAt: '',
};
export const roleLabels: Record<string, {label: string; description: string}> = {
  admin: {label: '管理员', description: '拥有所有权限，可管理系统设置和用户'},
  recruiter: {label: '招聘运营', description: '管理候选人、面试、外联和短名单'},
  hiring_manager: {label: '用人经理', description: '参与面试评估，做出审批决策'},
  viewer: {label: '访客', description: '仅查看数据，不可编辑或操作'},
};
