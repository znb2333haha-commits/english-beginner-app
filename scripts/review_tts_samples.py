"""检查固定试听样本，生成各声音合集和离线试听页。依赖与 tts_samples.py 相同。"""
import html
import json
from pathlib import Path

import numpy as np
import soundfile as sf

from tts_samples import ROOT, SAMPLES, audio_info

directory = ROOT / 'docs/tts-samples'
labels = {
    'kokoro-af_heart': 'Kokoro · Heart 女声',
    'kokoro-am_adam': 'Kokoro · Adam 男声',
    'edge-en-US-JennyNeural': 'Edge · Jenny 女声',
    'edge-en-US-GuyNeural': 'Edge · Guy 男声',
    'piper-en_US-ljspeech-medium': 'Piper 旧版 · LJSpeech 女声',
}
sections, reports = [], []
for candidate, label in labels.items():
    folder = directory / candidate
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf8'))
    if manifest['status'] != 'complete':
        sections.append(f'<section><h2>{html.escape(label)}</h2><p>本轮未成功生成，原因见对比说明。</p></section>')
        continue
    assert [row['text'] for row in manifest['samples']] == [text for _, text in SAMPLES]
    segments, links = [], []
    sample_rate = None
    for (name, text), row in zip(SAMPLES, manifest['samples']):
        path = folder / row['file']
        assert path.stem == name and path.resolve().parent == folder.resolve()
        actual = audio_info(path)
        assert actual == {key: row[key] for key in actual}, f'样本或元数据变更: {path}'
        assert actual['bytes'] < 5_000_000 and actual['channels'] == 1
        samples, rate = sf.read(path)
        assert sample_rate is None or sample_rate == rate
        sample_rate = rate
        segments += [samples, np.zeros(round(rate * 0.6))]
        url = html.escape(f'{candidate}/{path.name}', quote=True)
        links.append(f'<li><span>{html.escape(text)}</span><audio controls preload="none" src="{url}"></audio></li>')
    sf.write(folder / 'all.wav', np.concatenate(segments), sample_rate, subtype='PCM_16')
    compilation = audio_info(folder / 'all.wav')
    assert compilation['bytes'] < 5_000_000
    reports.append({'candidate': candidate, 'validated_samples': len(SAMPLES),
                    'total_sample_bytes': sum(r['bytes'] for r in manifest['samples']),
                    'clipped_samples': sum(r['clipped_samples'] for r in manifest['samples']),
                    'compilation': compilation})
    sections.append(f'''<section><h2>{html.escape(label)}</h2>
<p>完整试听 · 10 个单词 + 2 个句子</p><audio controls preload="metadata" src="{candidate}/all.wav"></audio>
<details><summary>逐词对比</summary><ol>{''.join(links)}</ol></details></section>''')

page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>英语小白 · 选一个你喜欢的声音</title><style>
body{margin:0;background:#f4f6fb;color:#1d2939;font:17px/1.6 system-ui,sans-serif}main{max-width:850px;margin:40px auto;padding:0 20px}
h1{font-size:30px}h2{font-size:22px;margin:0}section{background:white;border:1px solid #d9e0ed;border-radius:18px;padding:24px;margin:18px 0}
audio{width:100%;max-width:650px;margin:8px 0}summary{cursor:pointer;padding:14px 0;color:#2455c2}li{margin:14px 0}li span{display:block}
a{color:#2455c2}.note{color:#536176}ol{padding-left:25px}
</style><main><h1>选一个你喜欢的声音</h1><p>先听同样的单词和句子，再告诉我声音名称。现在只提供试听，尚未选定正式发音。</p>
<p class="note">顺序：apple · water · go · think · three · ship · sheep · about · teacher · beautiful。各声音使用默认语速与原始音量。</p>
<p>① I eat an apple and drink water.<br>我吃一个苹果，喝一些水。<br>② The teacher sees three sheep near the ship.<br>老师看见船附近有三只羊。</p>
<p class="note">重点听 ship / sheep 是否容易分清，以及 water、three 和长句是否舒服。可在“逐词对比”中单独播放。</p>
''' + ''.join(sections) + '''<p>付费云服务本轮未测试。Piper 使用旧版程序；许可证和运行记录见同目录 README.md。</p></main>
<script>document.addEventListener('play',e=>{document.querySelectorAll('audio').forEach(a=>{if(a!==e.target)a.pause()})},true)</script></html>'''
(directory / 'index.html').write_text(page, encoding='utf8')
(directory / 'validation.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(f'已验证 {sum(r["validated_samples"] for r in reports)} 段试听，生成 {len(reports)} 个合集及离线试听页')
