#!/usr/bin/env python3
"""为日常会话句子(含小对话)和儿童乐园单词生成美式女声 Jenny 的 MP3(与单词音频同一个声音)。

python3 scripts/build_phrase_audio.py            # 生成缺少的句子音频
python3 scripts/build_phrase_audio.py --dry-run  # 只列出要生成的文件
需要联网和 edge-tts(pip install edge-tts);已存在且非空的文件会跳过。
输出:public/audio/phrases/<句子 id>.mp3 和 public/audio/kids/<文件名>.mp3、public/audio/examples/<单词>.mp3。仅供个人使用,服务条款见 DECISIONS.md。
"""
import argparse
import asyncio
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOICE = 'en-US-JennyNeural'
OUT = ROOT / 'public/audio/phrases'
KIDS_OUT = ROOT / 'public/audio/kids'
EX_OUT = ROOT / 'public/audio/examples'
WORD_OUT = ROOT / 'public/audio'


def load_phrases(path=None):
    data = json.loads((path or ROOT / 'data/phrases.json').read_text(encoding='utf-8'))
    items = [p for sc in data['scenes'] for p in sc['phrases'] + sc.get('dialog', [])]
    ids = [p['id'] for p in items]
    if len(ids) != len(set(ids)) or any(not re.fullmatch(r'[a-z]+-d?\d+', i) for i in ids):
        raise ValueError('句子 id 重复或文件名不安全')
    return items


def load_kids(path=None):
    data = json.loads((path or ROOT / 'data/kids.json').read_text(encoding='utf-8'))
    seen, items = set(), []
    for g in data['groups']:
        for it in g['items']:
            if it['file'] in seen:
                continue
            if not re.fullmatch(r'[a-z_]+', it['file']):
                raise ValueError('儿童词文件名不安全: ' + it['file'])
            seen.add(it['file'])
            items.append({'id': it['file'], 'en': it['word']})
    return items


def load_examples(path=None):
    """每个单词的第一条例句(界面朗读的就是这一条)→ examples/<单词>.mp3"""
    data = json.loads((path or ROOT / 'data/examples.json').read_text(encoding='utf-8'))
    items = []
    for word, exs in data.items():
        if not re.fullmatch(r'[a-z]+', word):
            raise ValueError('例句单词名不安全: ' + word)
        if exs:
            items.append({'id': word, 'en': exs[0]['en']})
    return items


def load_lookup_words(words_path=None, phrases_path=None):
    """会话句子里能点开查词的词(含过去式、复数等词形对应的原词):它们的单词发音 audio/<词>.mp3 也要有"""
    words = json.loads((words_path or ROOT / 'data/words.json').read_text(encoding='utf-8'))
    index = {}

    def put(form, w):
        k = form.lower()
        if k not in index or w['id'] < index[k]['id']:
            index[k] = w

    for w in words:
        put(w['word'], w)
        for part in (w.get('forms') or '').split('/'):
            i = part.find(':')
            if i > 0:
                put(part[i + 1:], w)
    data = json.loads((phrases_path or ROOT / 'data/phrases.json').read_text(encoding='utf-8'))
    out, seen = [], set()
    for sc in data['scenes']:
        for line in sc['phrases'] + sc.get('dialog', []):
            for t in re.findall(r"[a-z]+(?:'[a-z]+)?", line['en'].lower()):
                w = index.get(t)
                if w and w['word'] not in seen:
                    if not re.fullmatch(r'[a-z]+', w['word']):
                        continue
                    seen.add(w['word'])
                    out.append({'id': w['word'], 'en': w['word']})
    return out


def missing(items, out=OUT):
    return [p for p in items if not (out / f"{p['id']}.mp3").exists() or (out / f"{p['id']}.mp3").stat().st_size < 1000]


async def synth(items, out=OUT, retries=3):
    import edge_tts
    out.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(4)
    failed = []

    async def one(p):
        async with sem:
            for attempt in range(retries):
                tmp = out / f"{p['id']}.part"
                try:
                    await edge_tts.Communicate(p['en'], VOICE).save(str(tmp))
                    if tmp.stat().st_size < 1000:
                        raise RuntimeError('音频太小')
                    tmp.replace(out / f"{p['id']}.mp3")
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
    jobs = [('句子', missing(load_phrases()), OUT), ('儿童词', missing(load_kids(), KIDS_OUT), KIDS_OUT),
            ('例句', missing(load_examples(), EX_OUT), EX_OUT),
            ('查词单词', missing(load_lookup_words(), WORD_OUT), WORD_OUT)]
    total_failed = 0
    for name, todo, out in jobs:
        print(f'需要生成 {len(todo)} 个{name}音频')
        if args.dry_run or not todo:
            continue
        failed = asyncio.run(synth(todo, out))
        for pid, err in failed:
            print('失败:', pid, err)
        print(f'{name}完成 {len(todo) - len(failed)},失败 {len(failed)}')
        total_failed += len(failed)
    return 1 if total_failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
