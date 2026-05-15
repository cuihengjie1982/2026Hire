// User and Role types
export type UserRole = 'admin' | 'recruiter' | 'hiring_manager' | 'viewer';

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  department?: string;
  phone?: string;
  status: 'active' | 'inactive';
  lastLoginAt?: string;
  createdAt: string;
};

export type Permission = {
  id: string;
  name: string;
  description: string;
  category: 'position' | 'candidate' | 'interview' | 'approval' | 'settings' | 'data';
};

export type RolePermission = {
  role: UserRole;
  permissions: string[]; // Permission IDs
};

// Notification settings
export type NotificationSetting = {
  id: string;
  type: 'email' | 'in_app' | 'sms';
  category: string;
  enabled: boolean;
};

// Team member invitation
export type TeamMemberInvite = {
  email: string;
  role: UserRole;
  status: 'pending' | 'accepted' | 'expired';
  invitedAt: string;
  invitedBy: string;
};
