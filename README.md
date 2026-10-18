# 英语小白

给零基础成年人的"每天 15 分钟"英语学习 App:网页应用,手机和电脑浏览器都能用,之后用 Capacitor 打成安卓 APK。
产品说明见 `docs/PRODUCT.md`,已定取舍见 `docs/DECISIONS.md`,更新记录见 `docs/CHANGELOG.md`。

## 开发

```bash
npm install
npm run dev        # 本地开发,手机和电脑都能通过局域网地址打开
npm test           # 单元测试(复习队列、FSRS 调度、连续打卡)
npm run build      # 类型检查 + 构建到 dist/
```

浏览器端到端检查(需要 Python 的 playwright):

```bash
npm run build && npx vite preview --port 4173 &
python3 tests/e2e/run.py /tmp
```

## 词库

`data/words.json` 由 `scripts/build_words.py` 从 ECDICT 生成,说明见脚本开头。

## 目录

- `src/scheduler.ts` FSRS 调度与"来一组"队列
- `src/store.ts` IndexedDB 存储与备份导入导出
- `src/main.ts` 界面
- `data/words.json` 精简词库(3000 词,6 级)
