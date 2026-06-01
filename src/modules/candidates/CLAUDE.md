# CLAUDE.md — 候选人中心模块

## 模块概述

候选人中心是招聘流程的入口，负责简历导入、智能解析、AI 搜索匹配、人才库管理。对外暴露三个 URL 前缀：`/candidates`、`/talent-pool`、`/talent`（均为同一套路由）。

## 目录结构

```
src/modules/candidates/
├── types.ts          # 类型（复用 talent 模块的 CandidateCard, TalentStats 等）
├── api.ts            # listCandidates, deleteCandidate, exportCandidatesCsv
├── hooks.ts          # useCandidates() — 封装 listCandidates + refresh
├── fixtures.ts       # 空文件，mock 数据由 talent 模块提供
└── pages/
    ├── CandidateCenterPage.tsx      # Tab 容器（人才库 | 搜索 | 联系人）
    └── CandidateSearchPage.tsx      # AI 智能搜索页（1696 行，核心页面）

实际数据层在 ../talent/ — candidates 模块是瘦包装层。
```

## 后端对应

```
server/src/modules/candidates/
├── candidates.routes.ts   # Express 路由（8 个端点）
└── candidates.service.ts  # upsertCandidate() 去重逻辑
```

Edge Function: `supabase/functions/embox-api/candidate-ops/index.ts`（6 个 handler）

## 核心数据流

```
简历文件上传 → MinerU API / Vision LLM 解析
  → upsertCandidate (email 去重 → name+phone 去重)
  → autoTriggerForCandidate (触发 Parser/Screener Agent)
  → CandidateCard 入库
  → AI 搜索匹配（前端规则引擎 + LLM ranking）
  → 加入短名单 → 发起面试
```

## 路由别名

`server/src/index.ts` 中挂载了三套前缀，实际路由相同：
```
app.use('/api/candidates', candidatesRoutes);
app.use('/api/talent-pool', candidatesRoutes);
app.use('/api/talent', candidatesRoutes);
```

## API 端点

| 端点 | 用途 |
|------|------|
| `GET /api/candidates` | 列表（分页 + 搜索），过滤 seed data |
| `GET /api/candidates/search` | 高级搜索（关键词/岗位/等级/排序） |
| `GET /api/candidates/stats` | 统计（总数/月新增/等级分布） |
| `GET /api/candidates/export/csv` | CSV 导出（中文表头，BOM） |
| `GET /api/candidates/:id` | 单个候选人详情 |
| `POST /api/candidates/import` | 导入（去重 upsert） |
| `DELETE /api/candidates/:id` | 级联删除（9 张关联表） |
| `POST /api/candidates/:id/tags` | 替换标签 |

## 关键实现细节

### 去重策略 (candidates.service.ts)
1. 先按 email 查重 → 找到则更新
2. 再按 name + phone 查重 → 找到则更新
3. 都没找到 → 新建

### CandidateCenterPage 标签页
URL search param `?tab=` 控制：
- `talent` → TalentPoolPage（人才库总览）
- `search` → CandidateSearchPage（AI 搜索）
- `contacts` → ContactsPage（联系人）

### AI 搜索匹配逻辑 (CandidateSearchPage)
- 前端规则引擎：自然语言关键词 → 技能/学历/经验匹配
- 分数颜色映射：高分绿色、中分黄色、低分灰色
- 等级过滤：A / B+ / B / C
- 省市区二级联动选择器
- 匹配历史 localStorage 存储

### 简历解析四层回退 (pdfProxy.ts / mineruClient.ts)
1. `pdftotext` 直接提取文本
2. OCR (tesseract) 处理扫描件
3. MinerU API (vlm 模式)
4. LLM Vision (Gemini/GLM/MiniMax) 处理图片型 PDF

## JSONB 字段注意
- `candidates.resume_parsed_info` — 解析结果 JSONB
- `candidates.score_result` — 评分结果 JSONB
- 写入时需要 `JSON.stringify()`

## 关联模块
- **talent**: 共享类型和数据层
- **shortlist**: 候选人 → 短名单 → 面试
- **agents**: 简历导入后自动触发 Parser/Screener
- **interviews**: 短名单 promote → 创建面试会话
