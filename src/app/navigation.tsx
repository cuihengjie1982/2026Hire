import {
  BarChart2,
  Bot,
  FileText,
  Folder,
  Home,
  Lock,
  Mail,
  MessageSquare,
  PlayCircle,
  Search,
  Settings,
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
  // ── 总入口 ──
  {id: 'dashboard', title: '工作台', icon: Home, path: '/'},
  // ── 准备阶段：项目 & 岗位配置 ──
  {id: 'projects', title: '项目管理', icon: Folder, path: '/projects'},
  {id: 'position-config', title: '岗位标准配置', icon: FileText, path: '/positions/config'},
  // ── 获取候选人：人才库 & 搜索 ──
  {id: 'talent', title: '人才库', icon: Users, path: '/talent'},
  {id: 'search', title: '候选人搜索', icon: Search, path: '/search'},
  // ── 触达候选人：联系 & 沟通 ──
  {id: 'contacts', title: '联系人管理', icon: MessageSquare, path: '/contacts'},
  {id: 'outreach', title: '沟通记录', icon: MessageSquare, path: '/outreach'},
  // ── 评估候选人：面试 ──
  {id: 'ai-interview', title: 'AI 面试中心', icon: Video, path: '/interviews/templates'},
  {id: 'ai-interview-preview', title: 'AI 面试体验', icon: PlayCircle, path: '/interviews/preview'},
  // ── 决策阶段：代理 / 入围 / 审批 ──
  {id: 'agents', title: 'AI 代理', icon: Bot, path: '/agents', badge: '运行中', badgeColor: 'bg-emerald-500'},
  {id: 'shortlist', title: '入围名单', icon: FileText, path: '/shortlist', badge: '', badgeColor: 'bg-[#1a4bc4]/80'},
  {id: 'approvals', title: '审批中心', icon: Lock, path: '/approvals', badge: '待审批', badgeColor: 'bg-orange-500', subtext: 'Admin-only access'},
  // ── 管理与复盘 ──
  {id: 'insights', title: '数据洞察', icon: BarChart2, path: '/insights'},
  {id: 'integrations', title: '集成管理', icon: Settings, path: '/integrations'},
  {id: 'settings', title: '设置中心', icon: Settings, path: '/settings'},
];
