#!/usr/bin/env python3
"""为日常会话句子生成美式女声 Jenny 的 MP3(与单词音频同一个声音)。

python3 scripts/build_phrase_audio.py            # 生成缺少的句子音频
python3 scripts/build_phrase_audio.py --dry-run  # 只列出要生成的文件
需要联网和 edge-tts(pip install edge-tts);已存在且非空的文件会跳过。
输出:public/audio/phrases/<句子 id>.mp3。仅供个人使用,服务条款见 DECISIONS.md。
"""
import argparse
import asyncio
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOICE = 'en-US-JennyNeural'
OUT = ROOT / 'public/audio/phrases'


def load_phrases(path=None):
    data = json.loads((path or ROOT / 'data/phrases.json').read_text(encoding='utf-8'))
    items = [p for sc in data['scenes'] for p in sc['phrases']]
    ids = [p['id'] for p in items]
    if len(ids) != len(set(ids)) or any(not re.fullmatch(r'[a-z]+-\d+', i) for i in ids):
        raise ValueError('句子 id 重复或文件名不安全')
    return items


def missing(items, out=OUT):
    return [p for p in items if not (out / f"{p['id']}.mp3").exists() or (out / f"{p['id']}.mp3").stat().st_size < 1000]


async def synth(items, retries=3):
    import edge_tts
    OUT.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(4)
    failed = []

    async def one(p):
        async with sem:
            for attempt in range(retries):
                tmp = OUT / f"{p['id']}.part"
                try:
                    await edge_tts.Communicate(p['en'], VOICE).save(str(tmp))
                    if tmp.stat().st_size < 1000:
                        raise RuntimeError('音频太小')
                    tmp.replace(OUT / f"{p['id']}.mp3")
                    return
                except Exception as e:  # noqa: BLE001
                    tmp.unlink(missing_ok=True)
                    if attempt == retries - 1:
                        failed.append((p['id'], str(e)))
                    else:
                        await asyncio.sleep(2 * (attempt + 1))

    await asyncio.gather(*(one(p) for p in items))
    return failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    todo = missing(load_phrases())
    print(f'需要生成 {len(todo)} 个句子音频')
    if args.dry_run or not todo:
        return 0
    failed = asyncio.run(synth(todo))
    for pid, err in failed:
        print('失败:', pid, err)
    print(f'完成 {len(todo) - len(failed)},失败 {len(failed)}')
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
