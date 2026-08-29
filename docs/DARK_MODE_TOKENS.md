# 夜间模式语义 Token 统一 — 修复要点（2026-07-17）

## 背景

开启夜间模式后，大量模块仍为浅色硬编码（`bg-white` / `text-gray-900`），与已适配页的 `dark:` 配对不一致。采用**语义色 CSS Token**统一表面/文字/边框，只调配色、不改布局。

## 方案要点

### Token 定义

位置：[`src/index.css`](../src/index.css)

- `:root` / `.dark` 定义 `--em-*` 变量
- `@theme` 映射为 Tailwind 工具类（如 `bg-surface`、`text-fg`）
- 主题开关仍为 `html.dark` + `localStorage('em-box.theme')`
- [`index.html`](../index.html) 内联脚本提前挂 `dark`，减少 FOUC

| 工具类 | Light | Dark | 用途 |
|--------|-------|------|------|
| `bg-page` | `#f8fafc` | `#0f172a` | 页面底 |
| `bg-surface` | `#ffffff` | `#1f2937` | 卡片/弹窗 |
| `bg-surface-muted` | `#f9fafb` | `#374151` | 表头/次级面/输入底 |
| `border-border` | `#e5e7eb` | `#4b5563` | 主边框 |
| `border-border-subtle` | `#f3f4f6` | `#374151` | 分割线 |
| `text-fg` | `#111827` | `#e2e8f0` | 主文字 |
| `text-fg-secondary` | `#374151` | `#d1d5db` | 正文/标签 |
| `text-fg-muted` | `#6b7280` | `#9ca3af` | 辅助说明 |
| `text-fg-faint` | `#9ca3af` | `#6b7280` | 更弱提示 |
| `text-brand` / `bg-brand` | `#1a4bc4` | `#1a4bc4` | 品牌主色 |
| `bg-brand-soft` | `#e0f2fe` | `#1e3a5f` | 品牌浅底（移动端 header 等） |

### 写法约定

```
页面底          → bg-page
卡片/弹窗        → bg-surface + border-border + text-fg
次级块/表头      → bg-surface-muted
表单控件         → bg-surface text-fg border-border placeholder:text-fg-faint
状态 badge       → 继续用 emerald/amber/red/blue 的 dark: 配对（不进 token）
```

**不要再写** `bg-white dark:bg-gray-800` / `text-gray-900 dark:text-white` 这类表面/文字配对。

## 覆盖范围

- **已改**：Dashboard 内业务模块 + 共享组件（ConfirmDialog、Toast、Notification、ErrorBoundary、Breadcrumbs 等）
- **保持浅色/品牌面（不跟主题）**：
  - 登录页 `LoginPage`
  - 公开培训/PDF：`PublicTrainingVideoPage`、`PublicPdfPreviewPage`
  - 公开对话面试：`PublicConversationInterviewPage`
  - 无登录公开视频壳：`DashboardLayout` 中 `bg-[#f8fafc]`
- **始终深色的视频 chrome**：`AIVideoInterviewPage` 控制条上的 `bg-white/10`、加载态 `text-white/50`（勿改成语义 `text-fg-faint`）

## Code Review 后补修

1. 公开页误跟主题 → 已 checkout 回浅色硬编码，避免候选人页在 recruiter 的 `em-box.theme=dark` 下出现黑字+深底
2. 表单仅改了 `border-border`、缺 `bg-surface text-fg` → AI 配置 / Agents / Settings / 对话面试等已补
3. 移动端 header 浅色 tint 漂移 → 引入 `brand-soft`
4. ConfirmDialog 图标井 → 补 `dark:bg-*-900/30`
5. Dark 主文字改为 `#e2e8f0`；主边框与 muted 表面色值区分开

## 已知遗留（非阻塞）

- 培训学堂等处仍有少量 `bg-blue-50` 浅色 tint，深色下略闪
- `data-theme="dark"` 已写入 DOM，CSS 暂未消费（仅用 `.dark`）
- 尚无浅/深 Playwright 冒烟用例

## 验收抽查

浅色与深色各看一遍：工作台、培训学堂、员工档案、AI 模型配置弹窗、设置、候选人中心、ConfirmDialog；公开培训/面试链接应**始终浅色**。
