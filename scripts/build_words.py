#!/usr/bin/env python3
"""从 ECDICT 的 stardict.db 筛出常用词,导出精简词库 JSON。

用法:
    python3 -I scripts/build_words.py <stardict.db 或旧 words.json> <输出 words.json> [词数,默认 3000] --cmudict <cmudict.dict>

数据来源: https://github.com/skywind3000/ECDICT (MIT 许可)
ECDICT 的 stardict.db 可从其 Releases 页面的 ecdict-sqlite-28.zip 解压得到,
文件很大(约 850MB),不要放进仓库。
CMUdict: https://github.com/cmusphinx/cmudict (Carnegie Mellon University, BSD-2-Clause)
支持原始 ECDICT 导出 JSON，以便不下载完整数据库也能重现原 3000 词的调整。
"""
import json
import re
import sqlite3
import argparse
from pathlib import Path

LEVEL_SIZE = 500
BIG = 10**9

# ECDICT 用 j 表示形容词、r 表示副词；a 是冠词/限定词，不能算实词。
CONTENT_POS = frozenset({'n', 'v', 'j', 'r', 'adj', 'adv'})
EARLY_POS = frozenset({'n', 'v', 'j', 'adj'})
# 语法类别的有限例外，不是手写教学词表：ECDICT 把这些助动词标作 v。
AUXILIARIES = frozenset({'be', 'have', 'do', 'can', 'could', 'may', 'might',
                         'must', 'shall', 'should', 'will', 'would', 'ought'})
FUNCTION_POS = frozenset({'a', 'c', 'd', 't'})
# 常见合法复辅音声母；用于把重音放在整个声母前，而非元音前。
ONSETS = {tuple(s.split()) for s in (
    'P R', 'P L', 'B R', 'B L', 'T R', 'D R', 'K R', 'K L', 'G R', 'G L',
    'F R', 'F L', 'TH R', 'SH R', 'S P', 'S T', 'S K', 'S M', 'S N', 'S L',
    'S W', 'K W', 'T W', 'D W', 'G W', 'S P R', 'S P L', 'S T R', 'S K R',
    'S K W', 'S K L', 'P Y', 'B Y', 'K Y', 'G Y', 'F Y', 'V Y', 'M Y', 'HH Y')}
ARPABET = dict(zip(
    'AA AE AH AO AW AY B CH D DH EH ER EY F G HH IH IY JH K L M N NG OW OY P R S SH T TH UH UW V W Y Z ZH'.split(),
    'ɑ æ ʌ ɔ aʊ aɪ b tʃ d ð ɛ ɝ eɪ f g h ɪ i dʒ k l m n ŋ oʊ ɔɪ p r s ʃ t θ ʊ u v w j z ʒ'.split()))


def arpabet_to_ipa(tokens):
    """宽式美式 IPA；主重音置于音节起始，次重音保留 ˌ。

    无显式音节边界时按合法声母作最大声母划分。
    单音节省略重音；非重读 AH/ER 分别为 ə/ɚ。
    """
    vowels = [i for i, t in enumerate(tokens) if t[-1:].isdigit()]
    parts = []
    marks = {}
    if len(vowels) > 1:
        for v, idx in enumerate(vowels):
            stress = tokens[idx][-1]
            if stress in '12':
                start = 0 if v == 0 else max(vowels[v - 1] + 1, idx - 1)
                if v > 0:
                    for candidate in range(vowels[v - 1] + 1, idx):
                        if tuple(tokens[candidate:idx]) in ONSETS:
                            start = candidate
                            break
                marks[start] = 'ˈ' if stress == '1' else 'ˌ'
    for i, token in enumerate(tokens):
        base = token.rstrip('012')
        sound = {'AH0': 'ə', 'ER0': 'ɚ'}.get(token, ARPABET.get(base))
        if sound is None:
            raise ValueError(f'未知 ARPAbet: {token}')
        parts.append(marks.get(i, '') + sound)
    return ''.join(parts)


def load_cmu(path):
    pronunciations = {}
    for line in Path(path).read_text(encoding='utf-8').splitlines():
        line = line.split('#', 1)[0].strip()
        if not line or line.startswith(';;;'):
            continue
        word, *phones = line.split()
        word = re.sub(r'\(\d+\)$', '', word.lower())
        pronunciations.setdefault(word, arpabet_to_ipa(phones))
    return pronunciations


def learning_key(row):
    pos = row['pos']
    auxiliary = row['word'] in AUXILIARIES or re.search(r'\baux\.', row['meaning'])
    group = (3 if auxiliary or pos in FUNCTION_POS else
             0 if pos in EARLY_POS else 1 if pos in CONTENT_POS else 2)
    return group, row['freq_rank'], row['word']


def finalize(candidates, cmu, limit):
    # 保持原来的 3000 词和每级成员，只调整第一级顺序，避免任意换词。
    out = sorted(candidates, key=lambda r: (r['freq_rank'], r['word']))[:limit]
    out[:LEVEL_SIZE] = sorted(out[:LEVEL_SIZE], key=learning_key)
    fallback = []
    for i, row in enumerate(out):
        if row['word'] in cmu:
            row['phonetic'] = cmu[row['word']]
        else:
            row['phonetic'] = clean_phonetic(row['phonetic'])
            fallback.append(row['word'])
        if not row['phonetic'] or not row['meaning']:
            raise ValueError(f"缺少音标或释义: {row['word']}")
        row['id'], row['level'] = i + 1, i // LEVEL_SIZE + 1
    print(f'CMUdict {len(out) - len(fallback)} 词；ECDICT 回退 {len(fallback)} 词: {", ".join(fallback)}')
    return out

# ECDICT 音标里用了几个外观相近的字符,统一成标准 IPA 符号
PHONETIC_FIX = {
    "ә": "ə",  # ә -> ə
    "ə": "ə",
    "ɡ": "g",       # ɡ -> g
    "є": "ɛ",  # є -> ɛ
    "'": "ˈ",       # ' -> ˈ(重音符号)
}


def clean_phonetic(p):
    p = (p or "").strip()
    p = "".join(PHONETIC_FIX.get(ch, ch) for ch in p)
    # ECDICT 回退：恢复卷舌元音，英式 GOAT/LOT 转美式，宽式不标元音长度。
    for old, new in [('əʊ', 'oʊ'), ('ɜː', 'ɝ'), ('ə:', 'ɝ'), ('ɜ', 'ɝ'),
                     ('iə', 'ɪr'), ('ɪə', 'ɪr'), ('eə', 'ɛr'), ('uə', 'ʊr'),
                     ('ʊə', 'ʊr'), ('ɒ', 'ɑ'), ('ː', ''), (':', '')]:
        p = p.replace(old, new)
    return p


def clean_meaning(t):
    """保留词性开头的释义行,去掉 [网络]/[医] 之类的领域标注行,最多 3 行,每行最多 40 字。"""
    lines = [ln.strip() for ln in (t or "").split("\n") if ln.strip()]
    core = [ln for ln in lines if not ln.startswith("[")]
    if not core:
        core = lines
    return "\n".join(ln[:40] for ln in core[:3])


def is_name_or_abbr(meaning):
    lines = [ln for ln in meaning.split("\n") if ln]
    if not lines:
        return True
    if all(ln.startswith("abbr.") or "人名" in ln or "地名" in ln for ln in lines):
        return True
    return False


def parse_pos(pos_field):
    """'n:100' 或 'u:97/n:3' -> 占比最高的词性字母"""
    best, best_v = "", -1
    for part in (pos_field or "").split("/"):
        if ":" in part:
            k, v = part.split(":", 1)
            try:
                v = int(v)
            except ValueError:
                continue
            if v > best_v:
                best, best_v = k, v
    return best


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', help='stardict.db 或原始 ECDICT 导出 JSON')
    parser.add_argument('output')
    parser.add_argument('limit', type=int, nargs='?', default=3000)
    parser.add_argument('--cmudict', required=True, help='CMUdict cmudict.dict 文件')
    args = parser.parse_args()
    db_path, out_path, limit = args.source, args.output, args.limit
    cmu = load_cmu(args.cmudict)
    if Path(db_path).suffix == '.json':
        cands = json.loads(Path(db_path).read_text(encoding='utf-8'))
        out = finalize(cands, cmu, limit)
        Path(out_path).write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        return

    con = sqlite3.connect(db_path)
    rows = con.execute(
        "select word, phonetic, translation, pos, collins, oxford, tag, bnc, frq, exchange "
        "from stardict where (oxford = 1 or collins >= 2 or (frq > 0 and frq <= 8000))"
    ).fetchall()

    cands = []
    for word, phonetic, translation, pos, collins, oxford, tag, bnc, frq, exchange in rows:
        if not re.fullmatch(r"[a-z]{2,}", word or ""):
            continue
        ph = clean_phonetic(phonetic)
        meaning = clean_meaning(translation)
        if (not ph and word not in cmu) or not meaning or is_name_or_abbr(meaning):
            continue
        rank = frq if frq and frq > 0 else (bnc if bnc and bnc > 0 else BIG)
        cands.append(
            {
                "word": word,
                "phonetic": ph,
                "meaning": meaning,
                "pos": parse_pos(pos),
                "collins": collins or 0,
                "oxford": bool(oxford),
                "tags": (tag or "").split(),
                "freq_rank": rank,
                "forms": exchange or "",
            }
        )

    out = finalize(cands, cmu, limit)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    levels = sorted({r["level"] for r in out})
    print(f"候选 {len(cands)} 个,导出 {len(out)} 个,共 {len(levels)} 级")


if __name__ == "__main__":
    main()
