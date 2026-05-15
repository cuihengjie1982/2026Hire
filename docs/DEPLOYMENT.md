# EM-BOX AI招聘平台 — 部署文档

> 版本: 1.0 | 更新日期: 2026-05-12

## 目录

1. [部署架构概述](#1-部署架构概述)
2. [Supabase 项目初始化](#2-supabase-项目初始化)
3. [数据库迁移](#3-数据库迁移)
4. [Edge Functions 部署](#4-edge-functions-部署)
5. [前端部署到 Vercel](#5-前端部署到-vercel)
6. [环境变量配置](#6-环境变量配置)
7. [部署验证](#7-部署验证)
8. [域名配置](#8-域名配置)
9. [回滚方案](#9-回滚方案)

---

## 1. 部署架构概述

### 1.1 生产环境架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     前端 (Vercel)                                 │
│  React SPA — vercel.json 配置 SPA fallback rewrites              │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ Supabase       │  │ Supabase Edge │  │ External AI    │
│ PostgREST      │  │ Functions     │  │ APIs          │
│ (CRUD APIs)    │  │ (Auth/AI)     │  │ (LLM/MinerU)   │
└───────┬────────┘  └───────┬────────┘  └────────────────┘
        │                    │
        │            ┌───────┴────────┐
        ▼            ▼                ▼
┌──────────────────────────────────────────┐
│         Supabase Managed Postgres          │
│  SSL enabled, Transaction pooler (port 6543)│
└──────────────────────────────────────────┘
```

### 1.2 各组件职责

| 组件 | 托管方案 | 说明 |
|------|---------|------|
| 前端 React SPA | Vercel | 静态部署，vercel.json 配置 SPA routing |
| CRUD REST API | Supabase PostgREST | 自动从 Postgres schema 生成 |
| 复杂业务逻辑 | Supabase Edge Functions | Deno runtime (Auth, AI, Interview Scoring) |
| 数据库 | Supabase Managed Postgres | SSL + Transaction pooler |
| 外部 AI | 直连 | LLM + Whisper + MinerU |

### 1.3 本地开发架构（保持不变）

```
Frontend (Vite :3000) ──proxy──> Backend (Express :4000) ──> Local PostgreSQL
```

本地开发不受影响，使用 `npm run dev` 继续可用。

---

## 2. Supabase 项目初始化

### 2.1 创建 Supabase 项目

1. 访问 [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. 点击 **New Project**
3. 填写项目信息：
   - **Organization**: 选择或创建组织
   - **Name**: `embox` 或项目名
   - **Database Password**: 生成随机密码并保存
   - **Region**: 选择离用户最近的区域 (如 `ap-northeast-1` 日本)
4. 点击 **Create new project**
5. 等待项目创建完成（约2分钟）

### 2.2 获取连接信息

在 Project Settings → Connection String 获取：

```
# Transaction pooler (用于 Edge Functions / Serverless)
postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres?sslmode=require&pgbouncer=true

# Direct connection (用于本地开发)
postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres?sslmode=require
```

记下以下信息：
- `DATABASE_URL`
- `SUPABASE_DB_PASSWORD`
- Project Ref (URL 中可见)

### 2.3 安装 Supabase CLI

```bash
npm install -g supabase
supabase login
```

### 2.4 初始化项目配置

```bash
cd /Users/tree/Desktop/Ops\ Mind\ Ai/Trai-main
supabase init
```

编辑 `supabase/config.toml` 中的 `project_id`:

```toml
[project]
project_id = "<YOUR_PROJECT_REF>"
```

### 2.5 链接到远程项目

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
```

---

## 3. 数据库迁移

### 3.1 方式 A：使用 Supabase CLI（推荐）

```bash
cd /Users/tree/Desktop/Ops\ Mind\ Ai/Trai-main

# 推送到远程（会覆盖远程数据，请先备份）
supabase db push
```

### 3.2 方式 B：使用 pg_dump + psql

#### 导出本地数据库 schema

```bash
pg_dump -h localhost -U postgres -d Trai-main --schema-only > schema.sql
```

#### 导入到 Supabase

```bash
# 编辑 schema.sql，替换数据库名称（如有）
# 然后导入

psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres?sslmode=require" < schema.sql
```

### 3.3 方式 C：手动导入

1. 在 Supabase Dashboard → Table Editor
2. 点击 **Import data** 或 **New table**
3. 逐个导入 SQL 文件

### 3.4 验证数据库迁移

```sql
-- 在 Supabase Dashboard → SQL Editor 执行
SELECT COUNT(*) FROM users;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

---

## 4. Edge Functions 部署

### 4.1 Edge Functions 目录结构

```
supabase/
├── config.toml                    # Supabase CLI 配置
└── functions/
    ├── _shared/
    │   ├── database.ts           # pg 连接池 (SSL, preparedStatements=false)
    │   └── auth.ts               # JWT 验证 + AppError 类
    ├── index.ts                  # 主路由入口
    ├── auth/
    │   ├── login/index.ts         # 登录
    │   └── refresh/index.ts       # Token 刷新
    ├── ai-proxy/
    │   └── index.ts              # AI LLM 代理
    └── interview-scoring/
        └── index.ts              # Whisper + LLM 评分
```

### 4.2 配置环境变量

在 Supabase Dashboard → Edge Functions → Secrets 添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `JWT_SECRET` | `your-production-jwt-secret-min-32-chars` | JWT 签名密钥 |
| `SUPABASE_DB_URL` | `postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres` | 数据库连接字符串 |
| `SUPABASE_DB_PASSWORD` | `your-db-password` | 数据库密码 |

### 4.3 部署命令

```bash
cd /Users/tree/Desktop/Ops\ Mind\ Ai/Trai-main

# 部署所有 Edge Functions
supabase functions deploy

# 部署单个函数
supabase functions deploy ai-proxy
supabase functions deploy interview-scoring

# 本地测试
supabase functions serve
```

### 4.4 获取 Edge Function URL

部署后在 Supabase Dashboard → Edge Functions 查看 URL，格式为：
```
https://<project>.supabase.co/functions/v1/<function-name>
```

---

## 5. 前端部署到 Vercel

### 5.1 安装 Vercel CLI

```bash
npm install -g vercel
vercel login
```

### 5.2 部署命令

```bash
cd /Users/tree/Desktop/Ops\ Mind\ Ai/Trai-main

# 预览部署
vercel

# 生产部署
vercel --prod
```

### 5.3 Vercel Dashboard 配置

如果没有使用 CLI，也可以在 Dashboard 中配置：

1. 访问 [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. 点击 **Add New Project**
3. 导入 `Trai-main` 仓库
4. 配置环境变量（见下节）
5. 点击 **Deploy**

### 5.4 构建配置

`vercel.json` 已配置：
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

---

## 6. 环境变量配置

### 6.1 Supabase Dashboard 环境变量

在 Supabase Dashboard → Settings → Environment Variables：

| 变量名 | 值 |
|--------|-----|
| `JWT_SECRET` | `your-production-jwt-secret-min-32-chars` |
| `SUPABASE_DB_URL` | `postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres` |
| `SUPABASE_DB_PASSWORD` | `your-db-password` |

### 6.2 Vercel Dashboard 环境变量

在 Vercel Dashboard → Settings → Environment Variables：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `VITE_USE_MOCK_API` | `false` | 使用真实 API |
| `VITE_API_BASE_URL` | `https://<project>.supabase.co` | PostgREST URL |
| `VITE_GEMINI_API_KEY` | `your-gemini-api-key` | Gemini API Key |
| `VITE_MINERU_API_TOKEN` | `your-mineru-api-token` | MinerU API Token |

### 6.3 本地 .env 文件

**根目录 `.env`**：
```env
VITE_USE_MOCK_API=false
VITE_API_BASE_URL="https://<project>.supabase.co"
VITE_GEMINI_API_KEY="your-gemini-api-key"
VITE_MINERU_API_TOKEN="your-mineru-api-token"
```

**server/.env**：
```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres?sslmode=require&pgbouncer=true"
JWT_SECRET="your-production-jwt-secret-min-32-chars"
```

---

## 7. 部署验证

### 7.1 健康检查

```bash
# Supabase PostgREST
curl https://<project>.supabase.co/rest/v1/

# Edge Functions health
curl https://<project>.supabase.co/functions/v1/health

# Vercel Frontend
curl https://your-app.vercel.app
```

### 7.2 功能测试清单

- [ ] 用户登录/注册
- [ ] 项目 CRUD
- [ ] 岗位 CRUD
- [ ] 候选人搜索
- [ ] 简历导入 (MinerU 直接调用)
- [ ] AI 面试评分
- [ ] 审批流程

### 7.3 常见问题排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|----------|
| API 请求失败 | CORS 未配置 | 检查 Vercel vercel.json headers 配置 |
| 数据库连接失败 | 连接字符串错误 | 检查 DATABASE_URL 是否包含 `sslmode=require` |
| Edge Function 超时 | 冷启动 | 等待几秒后重试 |
| PDF 解析失败 | MinerU Token 错误 | 检查 VITE_MINERU_API_TOKEN |

---

## 8. 域名配置（可选）

### 8.1 Vercel 域名配置

1. 在 Vercel Dashboard → Settings → Domains
2. 添加自定义域名（如 `app.yourcompany.com`）
3. 配置 DNS CNAME 记录指向 `cname.vercel-dns.com`
4. 等待 DNS 验证（约5分钟）
5. 更新 Supabase CORS 配置

### 8.2 Supabase CORS 配置

在 Supabase Dashboard → Settings → Authentication → URL Configuration：
- 更新 `Site URL` 为你的域名
- 添加 `Redirect URLs`

### 8.3 更新环境变量

在 Vercel 和 Supabase 中更新：
- `CORS_ORIGIN` → 新域名

---

## 9. 回滚方案

### 9.1 前端回滚 (Vercel)

```bash
# 查看部署历史
vercel ls

# 回滚到上一个版本
vercel rollback
```

### 9.2 数据库回滚

使用之前的 `pg_dump` 备份：

```bash
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres?sslmode=require" < backup.sql
```

### 9.3 Edge Functions 回滚

```bash
# 列出可用版本
supabase functions list-versions ai-proxy

# 部署到指定版本
supabase functions deploy ai-proxy --version <version-id>
```

---

## 附录：快速检查清单

### 部署前检查

- [ ] Supabase 项目已创建
- [ ] 数据库已迁移
- [ ] Edge Functions 已部署
- [ ] 环境变量已配置
- [ ] Vercel 项目已创建

### 部署后验证

- [ ] 前端可访问
- [ ] 用户可以登录
- [ ] 可以创建项目/岗位
- [ ] 可以导入简历
- [ ] AI 面试功能正常

---

*本文档最后更新时间：2026-05-12*
