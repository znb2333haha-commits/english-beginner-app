# T2 第一步：试听后选声音

状态：**使用者已选 Edge · Jenny 女声（en-US-JennyNeural，美式英语）**。选择日期：2026-10-18。第二步已生成第一级 500 词内置音频，待检查；重建步骤见根目录 README.md。以下对比保留为第一步试听记录。

双击本目录的 [index.html](index.html) 可离线试听。每种声音有 12 个独立文件和一个 `all.wav` 合集；合集只连接原音频，中间加入 0.6 秒静音，不改变音量或语速。GitHub 不直接渲染此 HTML，可下载仓库后打开。

建议优先试听 **Kokoro af_heart**，再与 am_adam 比较。推荐依据是本轮成功离线运行、无需付费密钥、模型采用 Apache-2.0 许可，并非已经代替使用者选定声音，也不是主观听感排名。

## 固定内容

所有声音使用美式英语及各自默认语速，生成完全相同的 10 词：

`apple、water、go、think、three、ship、sheep、about、teacher、beautiful`

两句原创试听句（仅用于比较，不是 T3 正式例句数据）：

1. **I eat an apple and drink water.** 我吃一个苹果，喝一些水。
2. **The teacher sees three sheep near the ship.** 老师看见船附近有三只羊。

重点对比 ship/sheep 的区别、three 的辅音、water 的美式读法，以及长句的语速和舒适程度。

## 对比表

日期：2026-10-18。以下速度是本机 Windows/Python 3.12.10 的一次运行实测，非手机性能承诺。音质栏列可核验的格式与信号检查，未进行真人听辨评分；自然度、清晰度和偏好请使用者试听。

| 候选与试听 | 音质/检查 | 生成速度：12 段 | 是否需要联网 | 付费密钥 | 许可证与使用边界 | 体积 |
| --- | --- | --- | --- | --- | --- | --- |
| [Kokoro af_heart 女声](kokoro-af_heart/all.wav) | 24kHz、16-bit PCM WAV；非静音，未检测到触顶采样 | 5.914 秒，音频 12.23 秒；共享模型载入另计 2.240 秒 | 首次下载模型需要；生成及播放离线 | 不需要 | 模型 Apache-2.0；kokoro-onnx MIT；下述 GPL 工具依赖只在仓库外使用 | 12 段 573.8 KiB；模型约 310.4 MiB + 声音包 26.9 MiB |
| [Kokoro am_adam 男声](kokoro-am_adam/all.wav) | 24kHz、16-bit PCM WAV；非静音，未检测到触顶采样 | 4.192 秒，音频 10.26 秒；复用已载入模型 | 同上 | 不需要 | 同上 | 12 段 481.3 KiB；与女声共享模型 |
| [Edge Jenny 女声](edge-en-US-JennyNeural/all.wav) | 24kHz MP3；非静音，未检测到触顶采样 | 21.114 秒，音频 20.71 秒；含网络请求 | 生成必须联网；下载后的音频可离线播放 | 不需要 | edge-tts 主体 LGPLv3；服务是非官方接口，软件许可不等于微软音频再分发授权；本轮仅个人试听，不推荐作为公开发布方案 | 12 段 121.4 KiB；无本地模型 |
| [Edge Guy 男声](edge-en-US-GuyNeural/all.wav) | 24kHz MP3；非静音，未检测到触顶采样 | 16.802 秒，音频 21.91 秒；含网络请求 | 同上 | 不需要 | 同上 | 12 段 128.4 KiB；无本地模型 |
| [Piper LJSpeech 女声（旧版）](piper-en_US-ljspeech-medium/all.wav) | 22.05kHz PCM WAV；每段有 1 个接近满幅峰值，共 12 个；这项检测不等于已确认可闻失真，需试听 | 1.580 秒，音频 12.29 秒；包含单进程启动与模型载入 | 首次下载需要；生成及播放离线 | 不需要 | 本轮程序为 rhasspy/piper 2023.11.14-2（MIT，已归档）；模型仓库 MIT，LJSpeech 数据集为公有领域；eSpeak 工具许可另列下方 | 12 段 529.9 KiB；模型约 60.6 MiB；运行程序压缩包约 21.4 MiB |
| Piper 当前版 OHF-Voice/piper1-gpl | 本轮未运行，不把旧版结果当成新版质量 | 未测 | 本地引擎 | 不需要 | 当前引擎 GPLv3；本轮采用旧版外部程序供比较，未将新版代码或二进制引入应用 | 未下载 |
| 付费云服务（Azure Speech 等） | 未测试 | 未测 | 通常生成需联网 | 需要付费授权及对应凭据 | 未启用；尚未获得使用者愿意付费的指示 | 无样本，无费用 |

12 段音频体积不含试听合集，WAV 与 MP3 格式不同，不能直接把字节数当作音质比较。所有样本和合集加记录合计约 7 MiB，单个文件均小于 5MB。模型、虚拟环境和程序均不在仓库内，也不会被网页应用打包。后续 mp3 压缩和 500 词生成属于第二步，本轮未做。

## 许可证核对与来源

- [Kokoro-82M 模型卡](https://huggingface.co/hexgrad/Kokoro-82M)：82M 模型，Apache-2.0；[官方代码](https://github.com/hexgrad/kokoro)同为 Apache-2.0。本轮使用未量化的 v1.0 ONNX 导出，不是假装运行原 PyTorch 包。[kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) 是 MIT，ONNX Runtime 是 MIT。
- 本轮 Kokoro ONNX 的外部发音前端包含 phonemizer（GPLv3）和 eSpeak NG（GPLv3）；Piper 旧版运行包也包含 eSpeak。仅在仓库外独立环境运行，不复制这些代码、模型或工具到应用。不能把整套运行环境统称为 MIT/Apache；如将来分发生成工具或嵌入引擎，需另行处理依赖许可。[eSpeak NG 许可](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING)。
- [edge-tts 许可](https://github.com/rany2/edge-tts/blob/master/LICENSE)：除 SRT composer 的 MIT 文件外，主体为 LGPLv3。库可使用不代表非官方微软在线服务的音频再分发条款已经明确；该候选仅按任务要求个人试听，正式发布不据此作授权结论。
- [旧版 Piper MIT 许可](https://github.com/rhasspy/piper/blob/2023.11.14-2/LICENSE.md)；[当前 Piper GPLv3 许可](https://github.com/OHF-Voice/piper1-gpl/blob/main/COPYING)。只使用旧版公开发布的 Windows 程序，不复制其源代码。
- [LJSpeech 模型卡](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD) 标明 en_US、22,050Hz 与 public domain 数据来源；[LJ Speech 数据集](https://keithito.com/LJ-Speech-Dataset/) 由 Keith Ito 整理、Linda Johnson 录音，说明文本和录音在美国为公有领域。其他 Piper 声音不能沿用此结论，每个模型须单独核对；本轮未使用 Lessac。
- 具体模型下载 URL、大小及 SHA-256 见 [model-sources.json](model-sources.json)；生成版本、文本、耗时及每段音频 SHA-256 见各子目录 `manifest.json`。

## 重现方法

在仓库外创建 Python 3.12 虚拟环境，然后安装 `scripts/requirements-tts-samples.txt`（冻结本轮生成环境，不是应用依赖）。按 `model-sources.json` 下载模型到仓库外目录，核对 SHA-256；Piper zip 解压到另一个外部目录。

```powershell
python -m venv ..\tts-env
..\tts-env\Scripts\python -m pip install -r scripts/requirements-tts-samples.txt
# 若 Windows 临时目录无权限，指定你可写的目录
$env:TEMP = (Resolve-Path ..).Path
$env:TMP = $env:TEMP
..\tts-env\Scripts\python scripts/tts_samples.py kokoro --models ..\tts-models
..\tts-env\Scripts\python scripts/tts_samples.py edge --models ..\tts-models
..\tts-env\Scripts\python scripts/tts_samples.py piper --models ..\tts-models --piper ..\piper\piper.exe
..\tts-env\Scripts\python scripts/review_tts_samples.py
```

脚本固定仅处理这 12 段内容，不读取 words.json，不支持级别范围，也不写入 public/audio。三个免费候选最终均成功，本轮无候选因运行失败跳过。首次隔离环境/临时目录权限失败已通过将 TEMP/TMP 指向可写目录解决。Edge 未来可能因网络或非官方接口变化失败，脚本会记录错误类型与 HTTP 状态，不写入请求令牌。

## 验证与待确认

- 60 个独立音频均完整解码，文本列表一致、单声道、时长合理、非静音、哈希一致；生成 5 个合集，检查结果见 [validation.json](validation.json)。
- Chrome 393×852：65 个音频入口全部加载到有效时长，手机宽度无横向溢出，页面无脚本错误。
- `npm test` 18/18、`npm run build` 通过；应用构建仍有原词库导致的体积提示。
- 自然度、口音、细微发音与声音喜好尚待使用者试听。**请回复声音名称（如 af_heart、am_adam、Jenny、Guy 或 Piper LJSpeech），本轮停在这里。**
