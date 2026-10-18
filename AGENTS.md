# AGENTS.md(给 Codex 等编码代理的工作说明)

这是"英语小白"学习 App 的仓库。使用者是英语零基础的中文用户,手机是国行 vivo(通常没有谷歌服务),也会在电脑浏览器里用。所有界面文字用简体中文。

## 开始之前必读
1. `docs/PRODUCT.md`:产品定位、分期、验收标准
2. `docs/DECISIONS.md`:已经定下来的取舍,不要推翻;要改先写进这份文件并说明原因
3. `docs/TASKS.md`:任务清单。按顺序做,一次只做一个任务
4. `docs/CHANGELOG.md`:做到哪了

## 技术栈(已定)
- 网页应用:Vite + TypeScript(严格模式),不引入 React/Vue 等框架,除非在 DECISIONS.md 里记录理由
- 复习算法:`ts-fsrs`(目标记忆率 0.9,开启短期学习步骤)
- 存储:IndexedDB(`idb`),词库 `data/words.json` 只读,用户进度单独存
- 安卓:Capacitor 壳(任务 T5),同一套网页代码
- 测试:vitest(单元)、Playwright(`tests/e2e/run.py`,端到端)

## 常用命令
```bash
npm ci              # 安装依赖
npm test            # 单元测试
npm run build       # 类型检查 + 构建,必须通过
npm run build:single   # 单文件版,电脑上双击即可试用
```
端到端检查步骤见 `README.md`。

## 必须遵守
- 每个任务做完必须:`npm test` 和 `npm run build` 通过;改了界面或流程就跑 e2e 并更新它;在 `docs/CHANGELOG.md` 记一条;一个任务一个提交,提交信息写清做了什么。
- 不要提交密钥、API Key、下载来的大文件。需要密钥的脚本从环境变量读取,并在脚本开头写明。单个文件超过 5MB 的先在 DECISIONS.md 里说明理由。
- 用户的学习进度是最重要的数据:改动 IndexedDB 结构必须升级数据库版本并写迁移;改动备份文件格式必须升版本号并兼容导入旧版。
- 发音不能依赖系统语音或谷歌服务:内置音频优先,系统语音只兜底(见 `src/audio.ts`)。
- 引入新依赖或数据来源前先确认许可证(优先 MIT/Apache),不要复制 GPL/AGPL 项目的代码,并把来源和许可证写进 DECISIONS.md。
- 界面面向小白:按钮大、文字少、不出现英文菜单、不出现吓人的红色数字。
- 不确定的产品问题,不要自己拍板:写进 `docs/TASKS.md` 对应任务下的"待确认",继续做不依赖它的部分。
- 不要改 `docs/PRODUCT.md` 的范围和验收标准。

## 做完之后
在 `docs/TASKS.md` 里把任务状态改成"待检查",并在任务下写:做了什么、怎么验证的、还有什么没做或有疑问。检查和补漏由 Claude 负责,检查清单见 `docs/REVIEW_CHECKLIST.md`。
