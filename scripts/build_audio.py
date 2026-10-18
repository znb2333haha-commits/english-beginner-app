#!/usr/bin/env python3
"""生成已选定的 Edge Jenny 美式 MP3。无需付费密钥，不读取或写入任何凭据。

python scripts/build_audio.py --level-start 1 --level-end 1
依赖：edge-tts==7.3.1、soundfile==0.14.0、numpy（可复用试听虚拟环境）。
生成需联网，音频播放无需联网或系统 TTS。仅供个人使用，服务条款见 DECISIONS.md。
已有且通过哈希/解码校验的文件跳过；损坏文件重新生成；临时文件验证后原子替换。
"""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import re
import time

ROOT = Path(__file__).resolve().parents[1]
VOICE = 'en-US-JennyNeural'
RATE = '+0%'


def select_words(rows, start, end):
    if not 1 <= start <= end <= 6:
        raise ValueError('级别范围必须满足 1 <= 开始 <= 结束 <= 6')
    selected = [r for r in rows if start <= r['level'] <= end]
    names = [r['word'] for r in selected]
    if len(names) != len(set(names)) or any(not re.fullmatch('[a-z]+', w) for w in names):
        raise ValueError('词库包含重复词或不安全的文件名')
    if not selected:
        raise ValueError('所选级别没有单词')
    return selected


def inspect_audio(path):
    import numpy as np
    import soundfile as sf
    if sf.info(path).format not in {'MP3', 'MPEG'}:
        raise ValueError('文件不是 MP3')
    data, rate = sf.read(path, always_2d=True)
    duration = len(data) / rate
    if not 0.15 < duration < 10 or data.shape[1] != 1 or not np.isfinite(data).all() or np.max(np.abs(data)) < 0.001:
        raise ValueError('音频无效或静音')
    return {'bytes': path.stat().st_size, 'duration_seconds': round(duration, 3),
            'sample_rate': rate, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def valid_existing(path, record):
    if not path.is_file() or not record:
        return False
    try:
        return inspect_audio(path) == {key: record[key] for key in ('bytes', 'duration_seconds', 'sample_rate', 'sha256')}
    except (ValueError, RuntimeError, OSError, KeyError):
        return False


def save_manifest(path, manifest):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    temp.replace(path)


async def build(args):
    import edge_tts
    import importlib.metadata
    rows = json.loads(args.words.read_text(encoding='utf8'))
    selected = select_words(rows, args.level_start, args.level_end)
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = {'version': 1, 'voice': VOICE, 'rate': RATE, 'format': 'mp3',
                'generator': 'edge-tts', 'generator_version': importlib.metadata.version('edge-tts'), 'words': {}}
    if args.manifest.exists():
        manifest = json.loads(args.manifest.read_text(encoding='utf8'))
        if (manifest.get('voice'), manifest.get('rate'), manifest.get('format')) != (VOICE, RATE, 'mp3'):
            raise ValueError('已有音频清单的声音/语速/格式不同，请使用独立输出目录与清单')
    semaphore = asyncio.Semaphore(args.concurrency)
    counts = {'generated': 0, 'skipped': 0, 'failed': []}
    start = time.perf_counter()

    async def generate(row):
        word = row['word']
        target = args.output / f'{word}.mp3'
        if valid_existing(target, manifest['words'].get(word)):
            counts['skipped'] += 1
            return
        async with semaphore:
            partial = target.with_suffix('.mp3.part')
            for attempt in range(3):
                try:
                    await asyncio.wait_for(edge_tts.Communicate(word, VOICE, rate=RATE,
                        connect_timeout=15, receive_timeout=30).save(str(partial)), timeout=45)
                    info = inspect_audio(partial)
                    partial.replace(target)
                    manifest['words'][word] = info
                    save_manifest(args.manifest, manifest)
                    counts['generated'] += 1
                    finished = counts['generated'] + counts['skipped']
                    if finished % 25 == 0:
                        print(f'{finished}/{len(selected)} 已验证（新生成 {counts["generated"]}）', flush=True)
                    await asyncio.sleep(0.25)
                    return
                except Exception as error:
                    if partial.exists():
                        partial.unlink()
                    if attempt == 2:
                        counts['failed'].append({'word': word, 'error_type': type(error).__name__,
                                                 'http_status': getattr(error, 'status', None)})
                    else:
                        await asyncio.sleep(2 ** (attempt + 1))

    await asyncio.gather(*(generate(row) for row in selected))
    print(json.dumps({**counts, 'elapsed_seconds': round(time.perf_counter() - start, 2)}, ensure_ascii=False), flush=True)
    if counts['failed']:
        return 1
    sizes = [manifest['words'][r['word']]['bytes'] for r in selected]
    print(f'音频 {len(sizes)} 个，总计 {sum(sizes)} 字节，最大 {max(sizes)} 字节，超过 20KB {sum(s > 20000 for s in sizes)} 个')
    if sum(sizes) >= 10_000_000 * (args.level_end - args.level_start + 1):
        raise ValueError('每级平均体积超过 10MB，请先调整编码方案')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--level-start', type=int, default=1)
    parser.add_argument('--level-end', type=int, default=1)
    parser.add_argument('--words', type=Path, default=ROOT / 'data/words.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'public/audio')
    parser.add_argument('--manifest', type=Path, default=ROOT / 'data/audio-manifest.json')
    parser.add_argument('--concurrency', type=int, choices=[1, 2, 3], default=2)
    raise SystemExit(asyncio.run(build(parser.parse_args())))
