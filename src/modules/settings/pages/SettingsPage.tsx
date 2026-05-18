import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { User, Shield, Bell, Users, Mail, Check, X, ChevronRight, Key, Building, Eye, EyeOff, Trash2, UserCog, ChevronDown } from 'lucide-react';
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  listPermissions,
  listRolePermissions,
  updateRolePermissions,
  listNotificationSettings,
  updateNotificationSetting,
  listInvites,
  inviteTeamMember,
  cancelInvite,
  getCurrentUser,
} from '../api';
import {
  type User as UserType,
  type Permission,
  type RolePermission,
  type NotificationSetting,
  type TeamMemberInvite,
  type UserRole,
} from '../types';
import { roleLabels } from '../fixtures';

type SettingsTab = 'account' | 'permissions' | 'notifications' | 'team';

export const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePerms, setRolePerms] = useState<RolePermission[]>([]);
  const [notifications, setNotifications] = useState<NotificationSetting[]>([]);
  const [invites, setInvites] = useState<TeamMemberInvite[]>([]);
  const [loading, setLoading] = useState(true);

  // Account edit state
  const [editingAccount, setEditingAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', email: '', phone: '', department: '' });
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Invite state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'recruiter' as UserRole });
  const [inviting, setInviting] = useState(false);

  // User management state
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [addUserForm, setAddUserForm] = useState({ name: '', email: '', role: 'recruiter' as UserRole, department: '', password: '' });
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserType | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetting, setResetting] = useState(false);
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [collapsedRoles, setCollapsedRoles] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [user, userList, perms, roleP, notifs, inv] = await Promise.all([
        getCurrentUser(),
        listUsers(),
        listPermissions(),
        listRolePermissions(),
        listNotificationSettings(),
        listInvites(),
      ]);
      setCurrentUser(user);
      setUsers(userList);
      setPermissions(perms);
      setRolePerms(roleP);
      setNotifications(notifs);
      setInvites(inv);
      setAccountForm({
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        department: user.department || '',
      });
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = () => {
    setPasswordError('');

    if (!passwordForm.current) {
      setPasswordError('请输入当前密码');
      return;
    }
    if (!passwordForm.new) {
      setPasswordError('请输入新密码');
      return;
    }
    if (passwordForm.new.length < 8) {
      setPasswordError('新密码至少8位');
      return;
    }
    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    // Simulate password change locally
    alert('密码修改成功');
    setShowPasswordForm(false);
    setPasswordForm({ current: '', new: '', confirm: '' });
  };

  const handleSaveAccount = async () => {
    if (!currentUser) return;
    try {
      const updated = await updateUser(currentUser.id, accountForm);
      setCurrentUser(updated);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      setEditingAccount(false);
    } catch (e) {
      console.error('Failed to save account:', e);
    }
  };

  const handleTogglePermission = async (role: UserRole, permissionId: string, hasPermission: boolean) => {
    const rolePerm = rolePerms.find(r => r.role === role);
    if (!rolePerm) return;

    const newPermissions = hasPermission
      ? rolePerm.permissions.filter(p => p !== permissionId)
      : [...rolePerm.permissions, permissionId];

    try {
      await updateRolePermissions(role, newPermissions);
      setRolePerms(prev => prev.map(r => r.role === role ? { ...r, permissions: newPermissions } : r));
    } catch (e) {
      console.error('Failed to update permission:', e);
    }
  };

  const handleToggleNotification = async (settingId: string, enabled: boolean) => {
    try {
      await updateNotificationSetting(settingId, enabled);
      setNotifications(prev => prev.map(n => n.id === settingId ? { ...n, enabled } : n));
    } catch (e) {
      console.error('Failed to update notification:', e);
    }
  };

  const handleInvite = async () => {
    if (!inviteForm.email.trim()) return;
    setInviting(true);
    try {
      const newInvite = await inviteTeamMember(inviteForm.email, inviteForm.role);
      setInvites(prev => [...prev, newInvite]);
      setInviteForm({ email: '', role: 'recruiter' });
      setShowInviteForm(false);
    } catch (e) {
      console.error('Failed to invite:', e);
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvite = async (email: string) => {
    try {
      await cancelInvite(email);
      setInvites(prev => prev.filter(i => i.email !== email));
    } catch (e) {
      console.error('Failed to cancel invite:', e);
    }
  };

  // User management handlers
  const handleAddUser = async () => {
    if (!addUserForm.name.trim() || !addUserForm.email.trim()) return;
    if (!addUserForm.password.trim()) return;
    if (addUserForm.password.length < 6) {
      alert('密码至少6位');
      return;
    }
    try {
      const newUser = await createUser({
        name: addUserForm.name,
        email: addUserForm.email,
        role: addUserForm.role,
        department: addUserForm.department,
        password: addUserForm.password,
      });
      setUsers(prev => [...prev, newUser]);
      setAddUserForm({ name: '', email: '', role: 'recruiter', department: '', password: '' });
      setShowAddUserForm(false);
      setShowAddPassword(false);
      alert(`账号 ${newUser.name} 添加成功`);
    } catch (e: any) {
      console.error('Failed to add user:', e);
      alert(e?.message || '添加失败');
    }
  };

  const handleEditUser = async () => {
    if (!editingUser) return;
    try {
      const updated = await updateUser(editingUser.id, {
        role: editingUser.role,
        status: editingUser.status,
      });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      setEditingUser(null);
      alert(`账号 ${editingUser.name} 信息已更新`);
    } catch (e) {
      console.error('Failed to edit user:', e);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setShowDeleteConfirm(null);
      alert('账号已删除');
    } catch (e) {
      console.error('Failed to delete user:', e);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser || !resetPasswordValue || resetPasswordValue.length < 6) return;
    setResetting(true);
    try {
      await resetUserPassword(resetPasswordUser.id, resetPasswordValue);
      alert(resetPasswordUser.name + ' 的密码已重置');
      setResetPasswordUser(null);
      setResetPasswordValue('');
    } catch (e) {
      alert(e instanceof Error ? e.message : '重置密码失败');
    } finally {
      setResetting(false);
    }
  };

  const toggleRoleCollapsed = (role: string) => {
    const newCollapsed = new Set(collapsedRoles);
    if (newCollapsed.has(role)) {
      newCollapsed.delete(role);
    } else {
      newCollapsed.add(role);
    }
    setCollapsedRoles(newCollapsed);
  };

  const tabs = [
    { id: 'account' as SettingsTab, label: '账号设置', icon: User },
    { id: 'permissions' as SettingsTab, label: '角色权限', icon: Shield },
    { id: 'notifications' as SettingsTab, label: '通知设置', icon: Bell },
    { id: 'team' as SettingsTab, label: '团队管理', icon: Users },
  ];

  const formatRole = (role: UserRole) => roleLabels[role]?.label || role;

  const getRoleBadgeStyle = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-700';
      case 'recruiter': return 'bg-blue-100 text-blue-700';
      case 'hiring_manager': return 'bg-emerald-100 text-emerald-700';
      case 'viewer': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center h-full">
        <div className="text-gray-500 dark:text-gray-400">加载中...</div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col h-full">
      <div className="max-w-6xl mx-auto w-full p-8">
        <div className="mb-8">
          <h1 className="text-[32px] font-bold text-gray-900 dark:text-white tracking-tight mb-2">设置中心</h1>
          <p className="text-gray-500 dark:text-gray-400 text-base">管理账号信息、权限和通知设置</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 border-b border-gray-200 dark:border-gray-700 mb-8">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#1a4bc4] text-[#1a4bc4]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Account Settings Tab */}
        {activeTab === 'account' && currentUser && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">基本信息</h2>
                <button
                  onClick={() => setEditingAccount(!editingAccount)}
                  className="text-sm text-[#1a4bc4] hover:text-[#0c2b7a] font-medium"
                >
                  {editingAccount ? '取消编辑' : '编辑'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">姓名</label>
                  {editingAccount ? (
                    <input
                      type="text"
                      value={accountForm.name}
                      onChange={(e) => setAccountForm({...accountForm, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                    />
                  ) : (
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-white">{currentUser.name}</div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">邮箱</label>
                  {editingAccount ? (
                    <input
                      type="email"
                      value={accountForm.email}
                      onChange={(e) => setAccountForm({...accountForm, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                    />
                  ) : (
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-white">{currentUser.email}</div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">手机号</label>
                  {editingAccount ? (
                    <input
                      type="text"
                      value={accountForm.phone}
                      onChange={(e) => setAccountForm({...accountForm, phone: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                      placeholder="138****1234"
                    />
                  ) : (
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-white">{currentUser.phone || '-'}</div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">部门</label>
                  {editingAccount ? (
                    <input
                      type="text"
                      value={accountForm.department}
                      onChange={(e) => setAccountForm({...accountForm, department: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                    />
                  ) : (
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-white">{currentUser.department || '-'}</div>
                  )}
                </div>
              </div>

              {editingAccount && (
                <div className="flex justify-end mt-6">
                  <button
                    onClick={handleSaveAccount}
                    className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a]"
                  >
                    保存修改
                  </button>
                </div>
              )}
            </div>

            {/* Password Change */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">账号密码设置</h2>
                </div>
                <button
                  onClick={() => {
                    setShowPasswordForm(!showPasswordForm);
                    setPasswordError('');
                    setPasswordForm({ current: '', new: '', confirm: '' });
                  }}
                  className="text-sm text-[#1a4bc4] hover:text-[#0c2b7a] font-medium"
                >
                  {showPasswordForm ? '取消' : '修改密码'}
                </button>
              </div>

              {showPasswordForm && (
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">当前密码</label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={passwordForm.current}
                        onChange={(e) => setPasswordForm({...passwordForm, current: e.target.value})}
                        className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                        placeholder="请输入当前密码"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">新密码</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={passwordForm.new}
                        onChange={(e) => setPasswordForm({...passwordForm, new: e.target.value})}
                        className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                        placeholder="至少8位"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">确认新密码</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={passwordForm.confirm}
                        onChange={(e) => setPasswordForm({...passwordForm, confirm: e.target.value})}
                        className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                        placeholder="再次输入新密码"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {passwordError && (
                    <div className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                      {passwordError}
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleChangePassword}
                      className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a]"
                    >
                      确认修改
                    </button>
                    <button
                      onClick={() => {
                        setShowPasswordForm(false);
                        setPasswordError('');
                        setPasswordForm({ current: '', new: '', confirm: '' });
                      }}
                      className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Permissions Tab */}
        {activeTab === 'permissions' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">角色权限配置</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">点击权限项可快速切换角色的权限状态</p>

              {rolePerms.map(rolePerm => {
                const roleInfo = roleLabels[rolePerm.role];
                const isCollapsed = collapsedRoles.has(rolePerm.role);
                const groupedPerms = permissions.reduce((acc, perm) => {
                  if (!acc[perm.category]) acc[perm.category] = [];
                  acc[perm.category].push(perm);
                  return acc;
                }, {} as Record<string, Permission[]>);

                return (
                  <div key={rolePerm.role} className="mb-4 last:mb-0 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleRoleCollapsed(rolePerm.role)}
                      className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${getRoleBadgeStyle(rolePerm.role)}`}>
                          {roleInfo?.label}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{roleInfo?.description}</span>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                    </button>

                    {!isCollapsed && (
                      <div className="p-5 space-y-4">
                        {Object.entries(groupedPerms).map(([category, perms]) => (
                          <div key={category} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 uppercase">
                              {category === 'position' ? '岗位' :
                               category === 'candidate' ? '候选人' :
                               category === 'interview' ? '面试' :
                               category === 'approval' ? '审批' :
                               category === 'settings' ? '设置' :
                               category === 'data' ? '数据' : category}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {(perms as Permission[]).map(perm => {
                                const hasPerm = rolePerm.permissions.includes(perm.id);
                                return (
                                  <button
                                    key={perm.id}
                                    onClick={() => handleTogglePermission(rolePerm.role, perm.id, hasPerm)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                                      hasPerm
                                        ? 'bg-white text-gray-900 hover:bg-red-50'
                                        : 'bg-white text-gray-400 hover:bg-gray-100'
                                    }`}
                                  >
                                    {hasPerm ? (
                                      <Check className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                      <X className="w-4 h-4" />
                                    )}
                                    <span className={hasPerm ? 'font-medium' : ''}>{perm.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">通知偏好设置</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">选择您希望接收的通知方式和类型</p>

              {['email', 'in_app'].map(type => (
                <div key={type} className="mb-6 last:mb-0">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    {type === 'email' ? '邮件通知' : '应用内通知'}
                  </div>
                  <div className="space-y-2">
                    {notifications.filter(n => n.type === type).map(notif => (
                      <div key={notif.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <span className="text-sm text-gray-900 dark:text-white">{notif.category}</span>
                        <button
                          onClick={() => handleToggleNotification(notif.id, !notif.enabled)}
                          className={`relative w-10 h-6 rounded-full transition-colors ${
                            notif.enabled ? 'bg-[#1a4bc4]' : 'bg-gray-300'
                          }`}
                        >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                            notif.enabled ? 'translate-x-5' : 'translate-x-1'
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Team Tab */}
        {activeTab === 'team' && (
          <div className="space-y-6">
            {/* Team Members */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">团队成员</h2>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowAddUserForm(true)}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30 flex items-center gap-2"
                  >
                    <UserCog className="w-4 h-4" />
                    添加账号
                  </button>
                  <button
                    onClick={() => setShowInviteForm(true)}
                    className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a] flex items-center gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    邀请成员
                  </button>
                </div>
              </div>

              {/* Add User Form */}
              {showAddUserForm && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-4">添加账号</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">姓名</label>
                      <input
                        type="text"
                        value={addUserForm.name}
                        onChange={(e) => setAddUserForm({...addUserForm, name: e.target.value})}
                        placeholder="请输入姓名"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">邮箱</label>
                      <input
                        type="email"
                        value={addUserForm.email}
                        onChange={(e) => setAddUserForm({...addUserForm, email: e.target.value})}
                        placeholder="user@company.com"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">角色</label>
                      <select
                        value={addUserForm.role}
                        onChange={(e) => setAddUserForm({...addUserForm, role: e.target.value as UserRole})}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-800"
                      >
                        <option value="admin">管理员</option>
                        <option value="recruiter">招聘运营</option>
                        <option value="hiring_manager">用人经理</option>
                        <option value="viewer">访客</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">部门</label>
                      <input
                        type="text"
                        value={addUserForm.department}
                        onChange={(e) => setAddUserForm({...addUserForm, department: e.target.value})}
                        placeholder="请输入部门"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">密码</label>
                      <div className="relative">
                        <input
                          type={showAddPassword ? 'text' : 'password'}
                          value={addUserForm.password}
                          onChange={(e) => setAddUserForm({...addUserForm, password: e.target.value})}
                          placeholder="请设置密码（至少8位）"
                          className="w-full px-3 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAddPassword(!showAddPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600"
                        >
                          {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleAddUser}
                      disabled={!addUserForm.name.trim() || !addUserForm.email.trim()}
                      className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a] disabled:opacity-50"
                    >
                      添加
                    </button>
                    <button
                      onClick={() => {
                        setShowAddUserForm(false);
                        setAddUserForm({ name: '', email: '', role: 'recruiter', department: '', password: '' });
                        setShowAddPassword(false);
                      }}
                      className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* Edit User Form */}
              {editingUser && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-4">编辑账号 - {editingUser.name}</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">角色</label>
                      <select
                        value={editingUser.role}
                        onChange={(e) => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-800"
                      >
                        <option value="admin">管理员</option>
                        <option value="recruiter">招聘运营</option>
                        <option value="hiring_manager">用人经理</option>
                        <option value="viewer">访客</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">状态</label>
                      <select
                        value={editingUser.status}
                        onChange={(e) => setEditingUser({...editingUser, status: e.target.value as 'active' | 'inactive'})}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-800"
                      >
                        <option value="active">启用</option>
                        <option value="inactive">禁用</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleEditUser}
                      className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a]"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingUser(null)}
                      className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* Invite Form */}
              {showInviteForm && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-6">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">邮箱地址</label>
                      <input
                        type="email"
                        value={inviteForm.email}
                        onChange={(e) => setInviteForm({...inviteForm, email: e.target.value})}
                        placeholder="user@company.com"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">角色</label>
                      <select
                        value={inviteForm.role}
                        onChange={(e) => setInviteForm({...inviteForm, role: e.target.value as UserRole})}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-800"
                      >
                        <option value="admin">管理员</option>
                        <option value="recruiter">招聘运营</option>
                        <option value="hiring_manager">用人经理</option>
                        <option value="viewer">访客</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleInvite}
                      disabled={inviting || !inviteForm.email.trim()}
                      className="px-4 py-2 bg-[#1a4bc4] text-white rounded-lg text-sm font-medium hover:bg-[#0c2b7a] disabled:opacity-50"
                    >
                      {inviting ? '发送中...' : '发送邀请'}
                    </button>
                    <button
                      onClick={() => {
                        setShowInviteForm(false);
                        setInviteForm({ email: '', role: 'recruiter' });
                      }}
                      className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* Pending Invites */}
              {invites.filter(i => i.status === 'pending').length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">待接受邀请</h3>
                  <div className="space-y-2">
                    {invites.filter(i => i.status === 'pending').map(invite => (
                      <div key={invite.email} className="flex items-center justify-between py-2 px-3 bg-amber-50 rounded-lg">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{invite.email}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            邀请于 {new Date(invite.invitedAt).toLocaleDateString()} · {roleLabels[invite.role]?.label}
                          </div>
                        </div>
                        <button
                          onClick={() => handleCancelInvite(invite.email)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          取消邀请
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* User List */}
              <div className="space-y-3">
                {users.map(user => (
                  <div key={user.id} className="flex items-center justify-between py-3 px-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-[#1a4bc4] to-[#6366F1] rounded-full flex items-center justify-center">
                        <span className="text-white font-medium">{user.name[0]}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">{user.name}</span>
                          {user.id === currentUser?.id && (
                            <span className="text-xs text-[#1a4bc4] bg-[#1a4bc4]/10 px-2 py-0.5 rounded">当前账号</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${getRoleBadgeStyle(user.role)}`}>
                        {formatRole(user.role)}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${user.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      {user.id !== currentUser?.id && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setResetPasswordUser(user); setResetPasswordValue(''); }}
                            className="p-2 text-gray-500 dark:text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                            title="重置密码"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingUser(user)}
                            className="p-2 text-gray-500 dark:text-gray-400 hover:text-[#1a4bc4] hover:bg-gray-100 rounded-lg"
                            title="编辑"
                          >
                            <UserCog className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(user.id)}
                            className="p-2 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Delete Confirmation */}
                    {showDeleteConfirm === user.id && (
                      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">确认删除</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                            确定要删除账号 <strong>{user.name}</strong> 吗？此操作不可撤销。
                          </p>
                          <div className="flex gap-3">
                            <button
                              onClick={() => setShowDeleteConfirm(null)}
                              className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30"
                            >
                              取消
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
                            >
                              确认删除
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reset Password Dialog */}
      {resetPasswordUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">重置密码</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              为 <strong>{resetPasswordUser.name}</strong>（{resetPasswordUser.email}）设置新密码
            </p>
            <div className="mb-5">
              <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-1.5">新密码</label>
              <input
                type="password"
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                placeholder="至少 6 位"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] placeholder:text-gray-400"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setResetPasswordUser(null); setResetPasswordValue(''); }}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/30"
              >
                取消
              </button>
              <button
                onClick={handleResetPassword}
                disabled={!resetPasswordValue || resetPasswordValue.length < 6 || resetting}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
              >
                {resetting ? '重置中...' : '确认重置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
