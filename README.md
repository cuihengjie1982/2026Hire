# EM-BOX — AI 招聘管理系统

全栈 AI 驱动的招聘管理系统，覆盖候选人搜索、岗位配置、简历智能评分、AI 面试、多维审批、培训学堂和员工档案管理。

**面向用户：** 企业内部招聘团队（约 50 人），角色包括管理员、招聘专员、招聘经理、观察员。

**线上地址：** https://hire.cmbpo.com

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| 路由 | React Router DOM v7 |
| 图表 | Recharts |
| 本地后端 | Express 4 + Node.js (仅开发环境) |
| 生产后端 | Supabase Edge Functions (Deno) |
| 数据库 | PostgreSQL (Supabase) |
| 认证 | Supabase Auth + JWT |
| 测试 | Vitest + Playwright |

## 快速开始

```bash
# 1. 克隆仓库
git clone <repo-url> && cd em-box

# 2. 安装前端依赖
npm install

# 3. 安装后端依赖
cd server && npm install && cd ..

# 4. 配置环境变量
cp .env.example .env          # 前端（VITE_ 前缀）
cp server/.env.example server/.env  # 后端

# 5. 启动开发服务
npm run dev          # 前端 :3000
cd server && npm run dev  # 后端 :4000
```

**Mock 模式（默认）：** `.env` 中 `VITE_USE_MOCK_API=true` 使用内存 mock 数据，无需数据库。适合前端开发。

**真实模式：** 设置 `VITE_USE_MOCK_API=false`，配置 Supabase 项目凭据和数据库连接串。

## 常用命令

### 前端

| 命令 | 说明 |
|------|------|
| `npm run dev` | Vite 开发服务器 (:3000) |
| `npm run build` | 生产构建 |
| `npm run lint` | TypeScript 类型检查 |
| `npm test` | 运行 Vitest 单元测试 |
| `npm run test:watch` | Vitest 监听模式 |
| `npm run test:e2e` | Playwright E2E 测试 (mock 模式) |
| `npm run test:e2e:real` | Playwright E2E 测试 (真实后端) |

运行单个测试：`npx vitest run path/to/test.test.ts`

### 后端

| 命令 | 说明 |
|------|------|
| `cd server && npm run dev` | Express 开发服务器 (:4000) |
| `cd server && npx tsc --noEmit` | 后端类型检查 |
| `cd server && npm run migrate` | 运行数据库迁移 |
| `cd server && npm run seed` | 填充测试数据 |

### Supabase Edge Functions

```bash
supabase functions deploy embox-api   # 部署所有模块（单函数打包）
supabase functions list               # 查看已部署函数
```

## 架构概览

```
React (Vite :3000) ── /api/* ──→ Express (:4000)    开发环境
                   ── /functions/v1/embox-api/* ──→ Edge Function  生产环境

Edge Function (单函数打包):
  embox-api/
    index.ts          # 路由表 + Deno.serve 入口
    _shared/          # 共享工具（auth, cors, supabase client, LLM）
    ai-proxy/         # AI LLM 代理
    interview-scoring/# 面试转写 + 评分
    training/         # 培训学堂
    ... (25+ 模块)
```

详细架构见 [docs/系统架构文档.md](docs/系统架构文档.md)。

## 项目结构

```
em-box/
├── src/                    # 前端源码
│   ├── app/                # App 根组件、路由、布局、Context
│   ├── modules/            # 业务模块（domain/ 目录结构）
│   │   ├── candidates/     #   候选人中心
│   │   ├── interviews/     #   AI 面试中心
│   │   ├── training/       #   培训学堂
│   │   └── ...             #   (8 个模块)
│   ├── shared/             # 共享工具（apiClient, runtime, 组件）
│   └── navigation.ts      # 导航定义
├── server/                 # Express 开发服务器
│   └── src/
│       ├── modules/        # 业务路由（镜像 Edge Function 模块）
│       ├── middleware/      # auth, csrf, security, errorHandler
│       ├── config/         # database, env
│       └── db/migrations/  # 编号 SQL 迁移文件
├── supabase/functions/     # Supabase Edge Functions（生产后端）
│   └── embox-api/
│       ├── index.ts        # 路由表入口
│       └── _shared/        # 共享工具
├── e2e/                    # E2E 测试
│   └── real-flow/          # 真实后端 E2E 测试
├── docs/                   # 文档
└── scripts/                # 运维脚本
```

## 导航与模块

8 大模块侧边栏导航：

| 模块 | 路径 | 说明 |
|------|------|------|
| 工作台 | `/` | 仪表盘总览 |
| 项目管理 | `/projects` | 项目 + 岗位配置 |
| 候选人中心 | `/candidates` | 搜索、人才库、联系人 |
| 招聘推进 | `/pipeline` | 入围名单、外联 |
| AI 面试中心 | `/interviews` | 模板、会话、评分、分析 |
| 审批中心 | `/approvals` | 录用审批 |
| 培训学堂 | `/training` | 课程、学习路径、效果分析 |
| 系统管理 | `/admin` | 用户、权限、集成 |

## 角色权限

| 角色 | 权限范围 |
|------|----------|
| admin | 全部功能 + 用户管理 + 系统配置 |
| recruiter | 候选人管理、面试、培训、审批（除系统管理） |
| hiring_manager | 面试评审、审批决策 |
| viewer | 只读浏览 |

## 文档索引

- [系统架构文档](docs/系统架构文档.md)
- [API 接口文档](docs/API接口文档.md)
- [数据库设计文档](docs/数据库设计文档.md)
- [部署与运维手册](docs/部署与运维手册.md)
- [操作手册（业务人员）](docs/操作手册-业务人员.md)
- [PRD 产品需求文档](docs/PRD-产品需求文档.md)
- [培训学堂文档](docs/TRAINING_ACADEMY.md)
- [更新日志](docs/更新日志.md)

## CI/CD

- **CI** (`.github/workflows/ci.yml`): PR → TypeScript 检查 + Vitest 测试（前后端）
- **Deploy** (`.github/workflows/deploy.yml`): main 推送 → Vercel 部署 + Supabase Edge Functions 部署
