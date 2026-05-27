import {
  BarChart2,
  Bot,
  Folder,
  GraduationCap,
  Home,
  Lock,
  Settings,
  Target,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';
import {type AppPageId} from '../navigation';

export type NavigationItem = {
  id: AppPageId;
  title: string;
  icon: LucideIcon;
  path: string;
  badge?: string;
  badgeColor?: string;
  subtext?: string;
};

export const navigationItems: NavigationItem[] = [
  // 总览
  {id: 'dashboard', title: '工作台', icon: Home, path: '/'},
  // 准备
  {id: 'projects', title: '项目管理', icon: Folder, path: '/projects'},
  // 候选人
  {id: 'candidates', title: '候选人中心', icon: Users, path: '/candidates'},
  // 推进
  {id: 'pipeline', title: '招聘推进', icon: Target, path: '/pipeline'},
  // 评估
  {id: 'interviews', title: 'AI 面试中心', icon: Video, path: '/interviews'},
  // 决策
  {id: 'approvals', title: '审批中心', icon: Lock, path: '/approvals', badge: '待审批', badgeColor: 'bg-orange-500'},
  // 发展
  {id: 'training', title: '培训学堂', icon: GraduationCap, path: '/training'},
  // 管理
  {id: 'admin', title: '系统管理', icon: Settings, path: '/admin'},
];
