# 前端模块化重构方案

## 1. 目标

把当前“按页面堆在 `App.tsx`”的原型，重构成可接真实后端的前端工程。

目标不是一次性重写 UI，而是：

- 拆页面边界
- 抽共享组件
- 抽共享类型
- 引入标准路由
- 给后端 API 接入留稳定接口

## 2. 推荐目录

```text
src/
  app/
    router/
      index.tsx
      routes.tsx
    providers/
      AppProviders.tsx
    layouts/
      DashboardLayout.tsx
      AuthLayout.tsx
  modules/
    auth/
      api.ts
      types.ts
      pages/
      components/
    candidates/
      api.ts
      types.ts
      pages/
      components/
      hooks/
      fixtures/
    positions/
      api.ts
      types.ts
      pages/
      components/
    interviews/
      api.ts
      types.ts
      pages/
      components/
    outreach/
      api.ts
      types.ts
      pages/
      components/
    approvals/
      api.ts
      types.ts
      pages/
      components/
    integrations/
      api.ts
      types.ts
      pages/
      components/
  shared/
    ui/
    table/
    modal/
    forms/
    hooks/
    lib/
    types/
  main.tsx
```

## 3. 当前页面重映射

### `candidates`

- 候选人搜索
- 简历导入
- 解析结果
- 候选人详情
- 入围名单

### `positions`

- 岗位列表
- 岗位标准配置
- 岗位画像
- Fit Score 规则

### `interviews`

- 面试模板列表
- 模板编辑
- 面试体验页
- 面试记录

### `outreach`

- 外联序列
- 外联活动详情

### `approvals`

- 审批中心
- 审批详情

## 4. 优先抽离的共享组件

第一批抽这些，收益最高：

- `PageShell`
- `PageHeader`
- `Toolbar`
- `StatusBadge`
- `EntityTable`
- `EntityCardGrid`
- `FilterPanel`
- `DetailModal`
- `StepProgress`
- `TaskProgressCard`

## 5. 状态管理规则

### 路由状态

放 URL：

- 当前模块
- tab
- 搜索条件
- 分页
- 排序

### 服务端状态

放 Query Client：

- 列表数据
- 详情数据
- 模板详情
- 任务状态

### 本地 UI 状态

放页面组件或轻量 store：

- 弹窗开关
- 表单临时值
- 当前选中项

## 6. API 接入边界

每个模块都保持同样结构：

### `types.ts`

- 只放领域类型

### `api.ts`

- 只放请求函数

### `hooks/`

- 只放查询和变更 hook

### `components/`

- 只放可复用视图

### `pages/`

- 只做页面编排

## 7. 重构顺序

### Phase 1

- 把 `App.tsx` 中的页面拆出到 `modules/*/pages`
- 用 React Router 替代事件导航

### Phase 2

- 抽共享组件
- 抽共享类型
- 各模块建立 `api.ts`

### Phase 3

- 引入后端真实 API
- 删除模块内 `mock data`

### Phase 4

- 接入任务轮询
- 接入鉴权
- 接入错误边界和空状态

## 8. 最小可执行重构清单

1. 建 `app/router`
2. 建 `modules/candidates`
3. 建 `modules/positions`
4. 建 `modules/interviews`
5. 把 `SearchPage` 拆出去
6. 把 `ResumeImportModal` 放进 `modules/candidates/components`
7. 把 `CandidateDetailModal` 放进 `modules/candidates/components`
8. 把 `AIInterviewPage` 和 `AIVideoInterviewPage` 放进 `modules/interviews`
9. 把 `PositionConfigPage` 放进 `modules/positions`
10. 把公共导航布局抽成 `DashboardLayout`

## 9. 结果

完成之后，前端会变成：

- 页面层清晰
- 模块边界清晰
- 组件可复用
- 可直接接后端契约
- 后续新功能不需要继续往 `App.tsx` 堆

