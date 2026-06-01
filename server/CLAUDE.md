# CLAUDE.md — Backend (Express + Edge Functions)

## 后端架构

```
企业招聘系统后端
├── Express 开发服务器   (server/)        → localhost:4000 (仅开发)
└── Supabase Edge Function (supabase/)    → 生产环境
```

两套后端的 API 行为必须保持一致。Express 新增端点时，Edge Function 必须同步实现。

## Express 开发命令

```bash
cd server
npm run dev          # tsx watch 热重载 :4000
npx tsc --noEmit     # TypeScript 类型检查
npx vitest run       # 运行所有后端测试
npx vitest run src/__tests__/path/to/test.test.ts  # 单个测试
```

数据库迁移（Express 端仅在本地开发使用，生产走 Supabase 迁移）:
```bash
npm run migrate      # 按文件名顺序执行未运行的迁移
npm run seed         # 插入测试种子数据
```

## 目录结构

```
server/src/
├── index.ts              # Express 入口，所有路由注册在此
├── config/
│   ├── database.ts       # query<T>(), queryOne<T>(), getClient(), transaction()
│   └── env.ts            # 环境变量读取与类型定义
├── middleware/
│   ├── auth.ts           # JWT 验证 + req.user 注入 + 过期 token 清理
│   ├── requireRole.ts    # 角色守卫: requireRole('admin', 'recruiter')
│   ├── csrf.ts           # CSRF 防护（双 submit cookie 模式）
│   ├── security.ts       # Helmet + rate limiting (api/auth/password/tokenRefresh)
│   ├── errorHandler.ts   # 全局错误处理 + PostgreSQL 错误码映射
│   ├── auditLog.ts       # 审计日志中间件
│   └── logger.ts         # 结构化日志
├── modules/
│   ├── ai/               # AI 配置 CRUD + LLM 客户端 + Prompt 构建器 + AI Proxy
│   ├── agents/           # AI Agent 执行器
│   ├── analytics/        # 数据分析与洞察
│   ├── approvals/        # 审批流程
│   ├── auth/             # 认证 (login, refresh, logout, change-password)
│   ├── candidates/       # 候选人管理
│   ├── contacts/         # 联系人管理
│   ├── employees/        # 员工档案 + 绩效 + 胜任力模型
│   ├── integrations/     # 外部系统集成
│   ├── interviews/       # 面试模板/场次/结果/评分/对话式/公开入口
│   ├── outreach/         # 外联沟通记录
│   ├── positions/        # 职位详情
│   ├── projects/         # 招聘项目
│   ├── settings/         # 用户/权限/角色权限/通知设置/邀请
│   ├── shortlist/        # 候选人短名单
│   ├── stats/            # 轻量聚合统计
│   └── training/         # 培训学堂
├── shared/
│   ├── errors.ts         # NotFoundError, UnauthorizedError, ValidationError 等
│   └── pdfProxy.ts       # PDF 解析 (pdftotext → OCR → MinerU → Vision LLM)
└── __tests__/            # Vitest 测试
```

## 核心模式

### 数据库操作

```typescript
import { query, queryOne, transaction } from '../../config/database.js';

// 查询多行
const rows = await query<MyType>('SELECT * FROM my_table WHERE status = $1', ['active']);

// 查询单行
const row = await queryOne<MyType>('SELECT * FROM my_table WHERE id = $1', [id]);

// 事务
await transaction(async (client) => {
  await client.query('UPDATE ...');
  await client.query('INSERT ...');
});
```

### 路由文件结构

每个模块的路由文件导出 Express Router：

```typescript
import { Router } from 'express';
import { query, queryOne } from '../../config/database.js';
import { requireRole } from '../../middleware/requireRole.js';

const router = Router();

// GET / — 列表
router.get('/', async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM table ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { next(e); }
});

// POST / — 创建 (需要角色)
router.post('/', requireRole('admin', 'recruiter'), async (req, res, next) => {
  try {
    const row = await queryOne('INSERT INTO table (...) VALUES (...) RETURNING *', [...]);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

export default router;
```

然后在 `server/src/index.ts` 注册（带 /api 和 /api/v1 双前缀）：
```typescript
app.use('/api/module-name', moduleRoutes);
app.use('/api/v1/module-name', moduleRoutes);
```

### JSONB 字段处理

以下字段在 SQL INSERT/UPDATE 前需要 `JSON.stringify()`：
- interview_templates: `scoring_config`, `grade_rules`
- interview_questions: `follow_ups`, `scoring_guide`, `linked_dimensions`
- positions: `profile`, `profile_rules`, `scoring_rules`, `grade_rules`, `base_score_config`
- interview_answer_scores: `dimension_scores`, `scoring_guide_used`
- interview_results: `question_answers`
- shortlist_entries: `status_log`
- employee_profiles: `certifications`, `skills`, `personality`, `interview_weaknesses`

### 错误处理

使用 `server/src/shared/errors.ts` 中的错误类，不要直接 `throw new Error()`：

```typescript
throw new NotFoundError('User', userId);        // → 404
throw new ValidationError('email is required'); // → 400
throw new UnauthorizedError();                  // → 401
throw new ForbiddenError();                     // → 403
```

PostgreSQL 错误码自动映射：
- `23505` (unique_violation) → 409 CONFLICT
- `23503` (foreign_key_violation) → 400 FK_VIOLATION

### 认证与授权

```typescript
// JWT 中间件自动设置 req.user
import { authMiddleware } from './middleware/auth.js';

// 角色守卫
import { requireRole } from './middleware/requireRole.js';
router.post('/', requireRole('admin', 'recruiter'), handler);  // admin 或 recruiter
router.delete('/:id', requireRole('admin'), handler);           // 仅 admin
```

req.user 结构:
```typescript
{
  userId: string;
  email: string;
  role: 'admin' | 'recruiter' | 'hiring_manager' | 'viewer';
}
```

### AI/LLM 调用

```typescript
import { callLLM, callVisionLLM } from '../modules/ai/llmClient.js';

await callLLM(config, systemPrompt, userMessage);
await callVisionLLM(config, systemPrompt, contentParts); // ContentPart[]
```

Model config 从 `ai_model_configs` 表解析（优先 is_default + is_active → 最新 active）。

## 与 Edge Function 的关系

| 场景 | Express | Edge Function |
|------|---------|---------------|
| 数据库访问 | `pg` 驱动直连 | `createSupabaseAdmin(req)` 通过 PostgREST |
| 文件处理 | `child_process.execFile` (pdftotext/tesseract) | 不支持，客户端直调 MinerU |
| 认证 | JWT 黑名单 Redis-like | JWT 黑名单同逻辑 |
| 部署 | `tsx watch` 本地 | `supabase functions deploy embox-api` |

Edge Function 在 `supabase/functions/embox-api/`:
- `index.ts` — 路由表 + Deno.serve 入口
- `_shared/` — 共享工具 (auth.ts, cors.ts, supabase.ts, llmClient.ts)
- 各模块文件夹 — handler 函数（`path === pattern || path.startsWith(pattern + '/')` 匹配）

新增功能时需要同时实现 Express 路由和 Edge Function handler。

## 安全注意事项

- `execFile()` 不要改用 `exec()` — 防止命令注入
- AI Config 路由全部 admin-only (`requireRole('admin')`)
- base_url 校验：必须是 HTTPS，不允许内网 IP
- Webhook 签名验证使用 `crypto.timingSafeEqual` 防时序攻击
- CORS 白名单严格校验 origin
- express-rate-limit 分级（apiLimiter 100/min, authLimiter 20/min, passwordLimiter 5/min）

## 测试

```bash
# 所有测试
npx vitest run

# 单个模块测试
npx vitest run src/__tests__/routes/approvals.test.ts
```

测试文件在 `src/__tests__/`，结构镜像 `src/modules/`。测试用 `supertest` + `vi.mock` 模拟数据库和认证中间件：

```typescript
vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock('../../middleware/requireRole.js', () => ({
  requireRole: (..._roles: string[]) => (req: any, _res: any, next: any) => next(),
}));
```
