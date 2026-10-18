"""解码并校验第一级内置 MP3、文件名/覆盖率、哈希与体积；不联网。"""
import json
from pathlib import Path

from build_audio import ROOT, VOICE, RATE, inspect_audio, select_words

rows = json.loads((ROOT / 'data/words.json').read_text(encoding='utf8'))
selected = select_words(rows, 1, 1)
manifest = json.loads((ROOT / 'data/audio-manifest.json').read_text(encoding='utf8'))
assert manifest['voice'] == VOICE and manifest['rate'] == RATE
expected = {r['word'] for r in selected}
actual = {p.stem for p in (ROOT / 'public/audio').glob('*.mp3')}
assert len(expected) == 500 and actual == expected, f'缺少 {expected - actual}，额外 {actual - expected}'
assert set(manifest['words']) == expected
results = []
for word in sorted(expected):
    info = inspect_audio(ROOT / 'public/audio' / f'{word}.mp3')
    assert info == manifest['words'][word], f'{word} 的音频与清单不一致'
    results.append(info)
sizes = [r['bytes'] for r in results]
report = {'voice': VOICE, 'rate': RATE, 'level': 1, 'files': len(results),
          'bytes': sum(sizes), 'max_file_bytes': max(sizes),
          'over_20kb': sum(size > 20000 for size in sizes),
          'duration_seconds': round(sum(r['duration_seconds'] for r in results), 3),
          'sample_rates': sorted({r['sample_rate'] for r in results}),
          'decode_and_hash_checks': 'passed'}
assert report['bytes'] < 10_000_000
assert not list((ROOT / 'public/audio').glob('*.part'))
(ROOT / 'docs/T2-AUDIO-VALIDATION.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
print(json.dumps(report, ensure_ascii=False))
