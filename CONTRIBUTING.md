# 贡献指南

## 开发环境设置

1. Fork 并 clone 仓库
2. 安装依赖：`npm install && cd server && npm install`
3. 配置环境变量（参考 `.env.example` 和 `server/.env.example`）
4. 默认使用 Mock 模式开发（`VITE_USE_MOCK_API=true`），无需配置数据库

## 代码规范

### 命名约定

- **前端**：camelCase（接口、变量、函数）
- **后端/数据库**：snake_case（表名、字段名、API 响应）
- **API 映射**：每个模块的 `api.ts` 中提供 `mapItem()` 函数做 snake_case ↔ camelCase 转换

### 模块结构

前端模块遵循统一的 domain/ 目录结构：

```
src/modules/{domain}/
  types.ts       # TypeScript 接口定义
  api.ts         # CRUD 函数 + mock/real 双路径
  fixtures.ts    # Mock 数据（用于 mock 模式和测试）
  pages/         # 页面组件
  hooks.ts       # (可选) React hooks
```

### TypeScript

- 前端：`npm run lint`（`tsc --noEmit`）
- 后端：`cd server && npx tsc --noEmit`
- 提交前必须通过类型检查

### 测试

- **单元测试**：Vitest，覆盖前端和 Express 后端
- **E2E 测试**：Playwright，mock 模式测试 UI 交互
- 新增功能需包含测试
- 运行：`npm test`（单元）、`npm run test:e2e`（E2E）

## 提交规范

- 提交信息使用中文
- 格式：`类型: 简短描述`
- 类型：`feat`（新功能）、`fix`（修复）、`refactor`（重构）、`docs`（文档）、`test`（测试）

## 后端双轨说明

本项目有两套后端系统：

| 环境 | 技术 | 用途 |
|------|------|------|
| 开发 | Express (`server/`) | 本地开发调试 |
| 生产 | Supabase Edge Functions (`supabase/functions/embox-api/`) | 线上运行 |

修改后端逻辑时，**两个系统都需要同步更新**。Express 仅用于本地开发，生产环境运行的是 Edge Functions。

## JSONB 字段注意事项

以下字段在 SQL INSERT/UPDATE 前必须 `JSON.stringify()`：

- `scoring_config`、`grade_rules`（interview_templates）
- `follow_ups`、`scoring_guide`、`linked_dimensions`（interview_questions）
- `profile`、`profile_rules`、`scoring_rules`、`grade_rules`（positions）
- `dimension_scores`、`scoring_guide_used`（interview_answer_scores）
- `question_answers`（interview_results）
- `status_log`（shortlist_entries）

## 更多文档

- [CLAUDE.md](CLAUDE.md) — Claude Code 项目指南
- [docs/](docs/) — 架构、API、数据库、部署文档
