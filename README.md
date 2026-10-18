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

首次使用先运行 `python -m pip install playwright` 和 `python -m playwright install chromium`。
也可设置环境变量 `PLAYWRIGHT_CHANNEL=chrome` 使用已安装的 Chrome。
e2e 输出目录可自行指定，测试会创建目录并保存截图与备份样本。

## 词库

`data/words.json` 由 `scripts/build_words.py` 从 ECDICT 生成,说明见脚本开头。

释义、词频和词性来自 [ECDICT](https://github.com/skywind3000/ECDICT)(MIT)。
美式音标来自 Carnegie Mellon University 的 [CMUdict](https://github.com/cmusphinx/cmudict)，
按 ARPAbet 转为宽式 IPA。CMUdict 使用 BSD-2-Clause 许可，允许使用、修改及再分发，
但需保留版权声明、许可条件和免责声明，完整文本随应用放在 `public/CMUdict-LICENSE.txt`。
本次固定 CMUdict 提交 `74790861f652b15e4ac49015a90074ad62a27690`。

```bash
git clone https://github.com/cmusphinx/cmudict.git ../cmudict
git -C ../cmudict checkout 74790861f652b15e4ac49015a90074ad62a27690
python -I scripts/build_words.py /path/to/stardict.db data/words.json --cmudict ../cmudict/cmudict.dict
python -m unittest discover -s tests -p 'test_*.py'
```

不下载大数据库也可重现 T1：先取 M2 原始导出，再运行同一排序/音标流水线。
以下导出命令用 Python 保持 UTF-8 字节不被旧版 PowerShell 的重定向改写：

```bash
python -c "import subprocess,pathlib; pathlib.Path('../words-m2.json').write_bytes(subprocess.check_output(['git','show','e2a006af8ff7231e8042d4f1f235016ff7d3a886:data/words.json']))"
python -I scripts/build_words.py ../words-m2.json data/words.json --cmudict ../cmudict/cmudict.dict
```

仅重排第一级，保持原 3000 词及各级成员。优先名词、动词、形容词，再副词，
然后代词、介词等，冠词、限定词、连词、助动词放后；每组内按原词频。
多读音暂取 CMUdict 第一条；单音节省略重音，非重读 AH/ER 用 ə/ɚ。
本次 3000 词全部命中 CMUdict；脚本仍支持并报告 ECDICT 音标回退。
音标抽检见 `docs/T1-PHONETIC-AUDIT.md`。

T1 重新编号后，IndexedDB 升级至 v2 并按冻结的 `data/legacy-word-order.json`
迁移旧卡片和日志。备份导出版本也升为 2，仍可导入 v1 备份。
旧版应用不能导入 v2 备份；迁移不会清空统计、设置或复习参数。

## 目录

- `src/scheduler.ts` FSRS 调度与"来一组"队列
- `src/store.ts` IndexedDB 存储与备份导入导出
- `src/main.ts` 界面
- `data/words.json` 精简词库(3000 词,6 级)
