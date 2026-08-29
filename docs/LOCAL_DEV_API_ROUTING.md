# 本地开发 API 路由与 `/admin` 跳转修复说明

> 记录日期：2026-07-16  
> 关联提交：`buildEdgeFunctionUrl` + 全量 Edge URL 统一（settings 为首发，其余模块随后对齐）  
> 症状：本地 `http://localhost:3000/admin` 自动跳转到 `/`，线上同路径正常

---

## 1. 问题现象

| 环境 | 行为 |
|------|------|
| 本地 Vite `:3000` | 访问 `/admin` 短暂 loading 后跳转到 `/` |
| 线上 Vercel + Supabase | `/admin` 正常打开（admin 用户） |

本地代码版本**领先**于线上部署，因此不是「线上有、本地缺功能」，而是**本地 API 请求路径/路由策略不一致**导致权限校验失败。

---

## 2. 跳转触发链（前端）

`/admin` 对应 `SystemAdminPage`（`src/modules/admin/pages/SystemAdminPage.tsx`）。  
自 commit `a40357e`（`fix: prevent non-admin settings requests`）起，页面挂载时会调用 `getCurrentUser()` 做 admin 守卫：

```
getCurrentUser()
  ├─ 成功 + role === 'admin'     → 渲染系统管理页
  ├─ 成功 + role === 'video_viewer' → 跳转 /video-sharing/manage
  ├─ 成功 + role !== 'admin'     → 跳转 /
  └─ 请求失败（catch）            → 跳转 /
```

**路由本身没有问题**（`AppRouter` 已注册 `/admin`）。跳转是权限守卫的**预期行为**，根因是 `getCurrentUser()` 在本地环境下**请求失败**或返回非 admin。

---

## 3. 根因：两套后端 + 两套 URL 格式

本项目存在**双后端**架构（详见根目录 `CLAUDE.md` / `AGENTS.md`）：

| | 本地 Express | 线上 Supabase Edge Function |
|---|---|---|
| 地址 | `http://localhost:4000` | `https://<project>.supabase.co/functions/v1/embox-api` |
| 路由前缀 | `/api/*` | `/settings/*`、`/agents` 等（无 `/api` 前缀） |
| 认证 | 自签 JWT（`server` 的 `JWT_SECRET`） | Supabase Auth JWT |
| 用户表 | `users` | `profiles` |

### 3.1 本地 `.env` 典型配置

```env
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://localhost:4000
VITE_SUPABASE_URL=https://<project>.supabase.co
```

登录走 **Supabase Auth**（`App.tsx` → `supabase.auth.getSession()`），浏览器存储的是 Supabase 签发的 access token。

### 3.2 修复前的错误请求

`settings/api.ts` 中的 `efetch` **硬编码** Edge Function 路径，并始终拼在 `API_BASE_URL` 上：

```typescript
// 修复前
fetch(`${API_BASE_URL}/functions/v1/embox-api${path}`)
// → http://localhost:4000/functions/v1/embox-api/settings/users/me
```

**Express 没有** `/functions/v1/embox-api/...` 这类路由 → 404/超时 → `getCurrentUser()` 抛错 → `/admin` 跳转 `/`。

Express 上对应的用户接口是：

```
GET http://localhost:4000/api/users/me
```

### 3.3 为什么不能简单改成 `/api/users/me`？

即使把 URL 改成 Express 的 `/api/users/me`，在当前登录方案下仍然不行：

- Express `authMiddleware` 用 `JWT_SECRET` 验签（`server/src/middleware/auth.ts`）
- 前端携带的是 **Supabase Auth JWT**，签名密钥不同 → 401

因此 `fetchJson('/api/...')` 在 `buildApiUrl` 中已有约定：**当 `API_BASE_URL` 含 `localhost` 且非 mock 模式时，自动改走 Supabase Edge Function**（注释：Express 无法验证 Supabase JWT）。

```typescript
// src/shared/lib/apiClient.ts — buildApiUrl 核心逻辑
if (!USE_MOCK_API && path.startsWith('/api/')) {
  const cloudBase = resolveCloudBackendUrl(); // localhost → SUPABASE_URL
  if (cloudBase && !cloudBase.includes('localhost')) {
    return `${cloudBase}/functions/v1/embox-api${resolveEdgeFunctionPath(path)}`;
  }
}
```

**问题**：`settings/api.ts` 的 `efetch` 没有复用这套逻辑，导致 settings 模块（含 `getCurrentUser`）在本地走错地址。

### 3.4 Mock 模式下的次要问题

若 `VITE_USE_MOCK_API=true`（默认），`getCurrentUser()` 返回 `currentUserFixture`，其 `role` 为 `'viewer'`（`src/modules/settings/fixtures.ts`），同样会被 admin 守卫重定向。  
当前项目 `.env` 为 `false`，主要问题仍是上述 efetch 路由错误。

---

## 4. 修复方案

### 4.1 思路

让 `settings/api.ts` 的 Edge Function 调用与 `fetchJson` / `buildApiUrl` **共用同一套 localhost → Supabase 路由策略**，而不是把 Edge Function 路径拼到 `localhost:4000` 上。

### 4.2 代码改动

**`src/shared/lib/apiClient.ts`** — 抽取共享 helper：

```typescript
/** localhost 时回退到 Supabase（Express 无法验 Supabase JWT） */
export const resolveCloudBackendUrl = (): string => { ... };

/** 构建 embox-api Edge Function 完整 URL，如 /settings/users/me */
export const buildEdgeFunctionUrl = (path: string): string => { ... };
```

`buildApiUrl` 内部改为调用 `resolveCloudBackendUrl()`，避免两处逻辑漂移。

**`src/modules/settings/api.ts`** — efetch 改用 helper：

```typescript
// 修复后
const res = await fetch(buildEdgeFunctionUrl(path), { ... });
// 本地 → https://<project>.supabase.co/functions/v1/embox-api/settings/users/me
// 线上 → 同上（API_BASE_URL 已是 Supabase 时行为不变）
```

**`src/shared/lib/__tests__/apiClient.test.ts`** — 新增 `buildEdgeFunctionUrl` 单测，验证 localhost 场景路由到 Supabase。

### 4.3 修复后请求路径

| 环境 | `getCurrentUser()` 实际请求 |
|------|---------------------------|
| 本地 `API_BASE_URL=localhost:4000` | `https://<project>.supabase.co/functions/v1/embox-api/settings/users/me` |
| 线上 | 同上（或等价的 Supabase URL） |

---

## 5. `localhost:4000` 仍然做什么？

Express `:4000` **仍是本地后端**，但并非当前 Supabase Auth 配置下的**主业务 API**：

| 用途 | 示例 |
|------|------|
| Vite 代理 | `/api/mineru` → 本地 PDF 解析（pdftotext/OCR） |
| 纯 Express 开发模式 | 自签 JWT 登录 + `/api/*` 全走 Express（需单独切换登录方案） |
| 不依赖 Supabase JWT 的路由 | 部分公开/本地-only 端点 |

在 **`VITE_USE_MOCK_API=false` + Supabase 登录** 的配置下，大部分需鉴权的业务 API 应走 **Supabase Edge Function**，与线上一致。这是设计选择，不是 bug。

---

## 6. 验收步骤

1. 确认 `.env`：`VITE_USE_MOCK_API=false`，已配置 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
2. 使用 **admin 角色** 的 Supabase 账号登录
3. 访问 `http://localhost:3000/admin` → 应停留并显示系统管理 Tab（AI 代理 / 数据洞察 / …）
4. DevTools Network：应看到对  
   `https://<project>.supabase.co/functions/v1/embox-api/settings/users/me`  
   的 **200** 响应，且 `role: "admin"`
5. 非 admin 用户访问 `/admin` → 仍应跳转 `/`（守卫正常）

---

## 7. 相关文件索引

| 文件 | 说明 |
|------|------|
| `src/modules/admin/pages/SystemAdminPage.tsx` | admin 守卫与跳转逻辑 |
| `src/modules/settings/api.ts` | `getCurrentUser` / settings efetch（首个修复点） |
| `src/modules/agents/api.ts` 等 | 各模块 `efetch` 已统一 `buildEdgeFunctionUrl` |
| `src/shared/lib/apiClient.ts` | `buildApiUrl`、`buildEdgeFunctionUrl`、`resolveCloudBackendUrl` |
| `src/shared/lib/__tests__/apiClient.test.ts` | localhost / 127.0.0.1 / 生产 / `/functions` 前缀单测 |
| `src/App.tsx` | Supabase Auth 登录态 |
| `server/src/middleware/auth.ts` | Express JWT 验签（与 Supabase JWT 不互通） |
| `server/src/modules/settings/settings.routes.ts` | Express 侧 `/api/users/me` |
| `supabase/functions/embox-api/settings/index.ts` | Edge Function 侧 `/settings/users/me` |

---

## 8. 已实施：全量统一 Edge URL（2026-07-16）

原先仅修复 `settings/api.ts`。现已将所有硬编码  
`` `${API_BASE_URL}/functions/v1/embox-api...` ``  
统一为 `buildEdgeFunctionUrl()`（或经 `buildApiUrl`/`fetchJson` 的 `/api/*` 路径）。

**双后端框架未改动**：Express `:4000` 仍负责 Vite 代理的本地-only 能力（如 `/api/mineru`）；Supabase Auth 下的鉴权业务 API 走 Edge。

### 8.1 调用约定（接手必读）

| 场景 | 使用 | 示例 |
|------|------|------|
| Express 风格路径 `/api/...` | `fetchJson(path)` 或 `buildApiUrl(path)` | `fetchJson('/api/shortlist')` |
| 已是 Edge 路径（无 `/api`） | `buildEdgeFunctionUrl(path)` | `buildEdgeFunctionUrl('/settings/users/me')` |
| 独立非 embox-api 函数 | 专用 helper（勿混用） | `publicTrainingEndpoint` → `training-public` |
| 本地-only Express（有意） | 直接拼 `API_BASE_URL` + `/api/...` | MinerU 本地 PDF、可选本地 AI parse |

**禁止**：再写 `` `${API_BASE_URL}/functions/v1/embox-api${path}` `` 或  
`` `${base}/functions/v1/embox-api${path}` ``（`base = API_BASE_URL`）。  
本地 `API_BASE_URL` 含 `localhost` / `127.0.0.1` 时会打到 Express，导致 404/超时。

### 8.2 接手检查清单

1. 新增 Edge 调用前：确认路径是 `/api/*` 还是 Edge 原生路径，选对 helper。
2. 本地 `USE_MOCK_API=false`：DevTools Network 中鉴权请求 host 应为 `*.supabase.co`，不是 `localhost:4000`。
3. 回归：`/admin` 可进；Agents / Settings Tab 请求成功。
4. `rg "API_BASE_URL.*/functions/v1/embox-api|/\$\{base\}/functions/v1/embox-api" src` 应无业务命中（注释与单测期望字符串除外）。
5. Mock 模式：`currentUserFixture.role` 仍为 `'viewer'`，纯 mock 下访问 `/admin` 仍会跳转（可选后续改为 `'admin'`）。

### 8.3 仍可选的改进

- Mock 模式：将 `currentUserFixture.role` 改为 `'admin'`，便于纯前端开发访问 `/admin`