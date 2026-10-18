# 交接流程:怎么让 Codex 接手

## 一、一次性准备(约 10 分钟)
1. 打开 ChatGPT(网页或桌面版),登录你的账号。
2. 进入 Codex:新建任务,点 "Work in" → 选 "Cloud",再点 "Select environment" → "Create environment"。
3. 选择仓库 `znb2333haha-commits/english-beginner-app`,点 "Get started";如果提示连接 GitHub,按提示授权。授权时建议只勾选这一个仓库("Only select repositories")。
4. Codex 会自己检查仓库、安装依赖、试跑。你只需要在它问时回答。需要的话对它说:"安装命令用 `npm ci`,测试命令是 `npm test`,构建命令是 `npm run build`。"
5. 看到设置报告没问题后点保存、"Publish",等出现 "Environment published"。
6. 联网设置:T2 要下载语音模型/装 Python 包,需要打开 "Allow Codex to access internet",域名先选 "Package managers"(常见包仓库);T2 若需要别的域名(比如 huggingface.co),Codex 会告诉你,再到 "Additional allowed domains" 里加。
7. 不要把任何密钥发给 Codex 聊天。付费 TTS 的密钥(如果以后要用)放环境变量/Secrets 里。

## 二、第一次对 Codex 说的话(原样复制)
```
先读仓库里的 AGENTS.md,然后按 docs/TASKS.md 从 T1 开始做。
一次只做一个任务:做完就停下,在 TASKS.md 对应任务下写清楚做了什么、验证了什么、还有什么没做,把状态改成"待检查"。
遇到拿不准的产品问题,写"待确认"在 TASKS.md 里,不要自己决定。
```

## 三、之后每个任务
- T1 做完 → 对 Codex 说:"继续,做 T2 的第一步(只生成试听样本,然后停下等我选)。"
- T2 第一步做完 → 你听 `docs/tts-samples/` 里的样本,把选择告诉 Codex,再让它做第二步。
- T3、T4 同理;T3 的 500 词例句由 Claude 写,不用 Codex 写。
- T5 的 GitHub Actions 工作流如果 Codex 推不上去,按 TASKS.md 里的说明处理。

## 四、Codex 做完后
1. Codex 完成任务后会给出改动和测试结果,点 "Create PR"(或让它提交),在 GitHub 上合并 PR 到 main。
2. 回到 Claude 这里说一声"T1 做完了,检查",Claude 按 `docs/REVIEW_CHECKLIST.md` 检查并补漏。
3. 通过后再给 Codex 下一个任务。

## 五、备选:本地 Codex CLI
如果云端连不上 GitHub:在电脑上装 Node.js 和 Git,`git clone https://github.com/znb2333haha-commits/english-beginner-app`,进入目录运行 Codex CLI(安装方法见 OpenAI 官方 Codex CLI 文档),然后对它说第二节那段话。做完 `git push` 即可。
