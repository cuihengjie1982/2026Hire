# 03 — 候选人中心

> 导航：候选人中心 `/candidates`，别名 `/talent-pool`、`/talent` | `AppPageId: candidates`  
> 关联：[02-projects.md](./02-projects.md) · [04-pipeline.md](./04-pipeline.md)

## 模块目标与成功指标

| 目标 | 成功指标 |
|------|----------|
| 统一候选人数据入口 | 人才库 / 简历搜索 / 联系人三 Tab 共用候选人域 |
| 简历导入可解析 | PDF/Word/Excel 等可解析入库，去重 upsert |
| AI 匹配可操作 | 搜索页可按岗位规则评分，展示 Fit Score / 匹配关键词 |
| 可导出 | CSV 导出可用 |

## 用户故事

1. **作为招募专员**，我在「人才库」浏览/筛选候选人，导入简历批量入库。
2. **作为招募专员**，我在「简历搜索」用自然语言或筛选条件匹配岗位，查看评分解释后加入入围名单。
3. **作为招募专员**，我在「联系人」查看推进后的联系人漏斗状态，状态从 pending 流转到 hired 或 rejected。
4. **作为管理员**，我导出候选人 CSV 做线下分析。

## 功能范围

### 页面 / Tab

| Tab | `?tab=` | UI 文案 | 实现 |
|-----|---------|---------|------|
| 人才库 | `talent` | 人才库 | `TalentPoolPage`，来自 talent 模块 |
| 简历搜索 | `search` | 简历搜索 | `CandidateSearchPage` |
| 联系人 | `contacts` | 联系人 | `ContactsPage` |

容器：`CandidateCenterPage.tsx`。Legacy 导航 `search`/`talent`/`contacts` → `candidates`，见 `navigateToPage`。

### 关键交互

- 简历导入 Modal：MinerU + LLM Vision 回退
- 去重：email 优先，其次 name+phone，逻辑在 `candidates.service.ts`
- 导入后可触发 Agent 的 `autoTriggerForCandidate`，执行 Parser/Screener
- 搜索页：等级过滤、省市区、匹配历史 localStorage
- 人才库分组 Tab：全部 / 按项目 / 按岗位 / 来源

### 边界与错误态

- 解析失败：展示错误，允许重试或手工补全
- 删除候选人：级联清理多张关联表，约 9 张
- Mock 模式：不连库，数据在 localStorage

## 验收标准

| # | 标准 | 状态 |
|---|------|------|
| AC-1 | 三 Tab 可通过 URL `?tab=` 切换且刷新保持 | **已实现** |
| AC-2 | PDF 简历可解析入库，需真实 API 与 MinerU token | **已实现** |
| AC-3 | 同 email 重复导入更新而非新建 | **已实现** |
| AC-4 | 搜索页展示匹配分与 matched/missing keywords | **已实现** |
| AC-5 | 可加入短名单，对接 pipeline | **已实现** |
| AC-6 | CSV 导出含中文表头 + BOM | **已实现** |
| AC-7 | 标签完整管理体系，支持批量打标与体系化分类 | **部分**，已有 tags API，产品化待完善 |
| AC-8 | 候选人关系图谱 | **缺失** |

## 数据实体

| 实体 | 说明 | 类型入口 |
|------|------|----------|
| Candidate / CandidateCard | 核心候选人 | `src/modules/talent/` + `candidates/types.ts` |
| Contact | 推进后漏斗 | `src/modules/contacts/types.ts` |
| JSONB | `resume_parsed_info`、`score_result` | 写入需 stringify |

## API 面（关键）

| Express，多别名 | Edge | 说明 |
|-------------------|------|------|
| `GET /api/candidates`、`/search`、`/stats` | `candidate-ops` | 列表/搜索/统计 |
| `POST /api/candidates/import` | 同左 | 导入 upsert |
| `DELETE /api/candidates/:id` | 同左 | 级联删除 |
| `POST /api/candidates/:id/tags` | 同左 | 替换标签 |
| `GET /api/candidates/export/csv` | 同左 | CSV |
| `GET/POST/PATCH /api/contacts` | `contacts` | 联系人 |

别名挂载：`/api/candidates`、`/api/talent-pool`、`/api/talent`。

## 代码入口

| 层 | 路径 |
|----|------|
| 前端 | `src/modules/candidates/`、`src/modules/talent/`、`src/modules/contacts/` |
| Express | `server/src/modules/candidates/`、`contacts/` |
| Edge | `supabase/functions/embox-api/candidate-ops/`、`contacts/` |
| 指南 | `src/modules/candidates/CLAUDE.md` |

## 依赖与跨模块

- **positions**：评分规则来源
- **agents**：导入后自动触发
- **shortlist**：加入入围
- **interviews / approvals / employees / training**：下游 FK `candidate_id`

## 实现状态汇总

| 能力 | 状态 |
|------|------|
| 三 Tab 中心 + 导入解析 | **已实现** |
| AI 搜索匹配 + Fit Score | **已实现** |
| 联系人漏斗 | **已实现** |
| CSV 导出 | **已实现** |
| 高级多维组合过滤 / 批量评分 UX | **部分** |
| 关系图谱 | **缺失** |

## Open questions

1. `candidates` 是薄包装，真实数据层多在 `talent/`——改类型时两边同步。
2. Prod PDF 走浏览器 MinerU；缺 `VITE_MINERU_API_TOKEN` 时解析会失败。
3. 联系人既在候选人中心 Tab，也与 pipeline「推进」联动——状态以 `contacts.status` 为准。
