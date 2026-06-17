# ReportViz-vercel 工作规则

## 项目定位

ReportViz-vercel 是报告转高清图片工具，前端静态页面部署在 Vercel，后端使用 Vercel Serverless Functions，数据存储在 Supabase。

## 目录约定

- `api/`: Vercel Serverless API，不放前端渲染代码。
- `lib/`: 后端共享逻辑和可测试工具函数。
- `public/`: 静态前端页面。
- `prompts/`: AI 系统提示词。
- `sql/`: 数据库初始化 SQL。
- `tests/`: 本地自动化验证脚本。

## 修改纪律

- API Key、管理员密码、JWT Secret、Supabase Service Key 不写入代码、文档或日志。
- 不修改 `.env`、Vercel 环境变量、Supabase schema，除非丘山明确确认。
- 不删除文件、目录或 git 历史，除非丘山明确确认。
- 修改后必须至少运行：
  - `npm test`
  - `node --check api/parse.js`
- 涉及报告结果清洗时，优先改 `lib/result-sanitizer.js` 并补充测试。

## 结果清洗要求

- 报告里除 `info_grid` 事实信息外，学员姓名统一替换为“你”。
- 不允许输出“主赛道 / 副业赛道 / 高阶赛道 / 赛道”等机械标签，统一替换为“核心方向 / 补充方向 / 进阶方向 / 方向”。
- `radar_score.total_score` 和所有维度 `score` 都不得低于 70。
- 同一 `level` 的 `track_cards` 只保留第一条。
