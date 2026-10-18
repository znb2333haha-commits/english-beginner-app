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

T1b 保持原 3000 词，通过中文主释义的完整词项规则识别入门主题，结合 Oxford 标记和
Collins 星级加权；第一级按 3 个主题词、2 个原高频词交织。主题池预留至少 200 个
具体名词，跨级提升生活词，被挤出的词按 T1 相对顺序顺延。规则与权重见脚本常量，
无英文教学词白名单。前 100 词与具体名词清单见 `docs/T1b-THEME-AUDIT.md`。
多读音暂取 CMUdict 第一条；单音节省略重音，非重读 AH/ER 用 ə/ɚ。
本次 3000 词全部命中 CMUdict；脚本仍支持并报告 ECDICT 音标回退。
音标抽检见 `docs/T1-PHONETIC-AUDIT.md`。

T1b 重新编号后，IndexedDB 与备份升级至 v3。`data/legacy-word-order.json` 冻结为
T1/v2 顺序；`data/legacy-word-order-v1.json` 保留 M2/v1 顺序，按来源版本迁移旧卡片和日志。
仍可导入 v1/v2 备份；旧版应用不能导入 v3 备份。迁移保留统计、设置和复习参数。

## 内置发音（T2）

使用者已选 Edge Jenny 美式女声 `en-US-JennyNeural`。第一级音频放在
`public/audio/<word>.mp3`，Vite 构建会复制到 `dist/audio/`。生成需要联网，
下载/打包后的音频播放不需要系统英语语音包或谷歌服务。后续级别仍由现有系统语音兜底。
本项目按个人使用处理；edge-tts 为非官方在线接口，库许可证不等于微软音频再分发授权，
公开发布前需另行确认服务条款，见 `docs/DECISIONS.md`。

重建第一级（建议复用仓库外的试听虚拟环境，或另建 Python 3.12 环境）：

```powershell
python -m venv ..\audio-env
..\audio-env\Scripts\python -m pip install -r scripts/requirements-audio.txt
..\audio-env\Scripts\python scripts/build_audio.py --level-start 1 --level-end 1
..\audio-env\Scripts\python scripts/check_audio.py
npm run build
```

脚本固定使用 Jenny、默认语速，支持 `--level-start` / `--level-end` 指定 1～6 级的连续范围；
本次只生成第 1 级。已有文件需通过清单哈希和解码验证才跳过，损坏/不完整文件会重建；
每词最多尝试 3 次，默认并发 2，失败后可原命令重跑，成功文件无需再请求服务。
临时文件验证后才替换正式 MP3。清单在 `data/audio-manifest.json`，完整性报告在
`docs/T2-AUDIO-VALIDATION.json`。脚本不需要付费密钥，不把请求 URL 或服务令牌写入清单。

`npm run build:single` 的音频仍在输出目录的 `audio/` 中；移动试用版时请连同该目录一起复制。
内置音频不等于网页已实现完整离线缓存，service worker 仍是 T6 的任务。

## 目录

- `src/scheduler.ts` FSRS 调度与"来一组"队列
- `src/store.ts` IndexedDB 存储与备份导入导出
- `src/main.ts` 界面
- `data/words.json` 精简词库(3000 词,6 级)

## 安装到安卓手机
1. 打开仓库的 **Releases** 页面,下载 `latest-apk` 里的 `english-beginner.apk`(合并到 main 后自动更新);也可以在 **Actions → Android APK** 的某次运行里下载 `english-beginner-debug-apk`(需要登录 GitHub,是压缩包,先解压)。
2. 传到手机后点击安装;系统提示"未知来源"时,允许这次安装。
3. 这是调试版,没有上架签名;重装或卸载会清空应用内进度,所以换版本前先在应用里"导出备份"。
