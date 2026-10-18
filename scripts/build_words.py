#!/usr/bin/env python3
"""从 ECDICT 的 stardict.db 筛出常用词,导出精简词库 JSON。

用法:
    python3 -I scripts/build_words.py <stardict.db 路径> <输出 words.json 路径> [词数,默认 3000]

数据来源: https://github.com/skywind3000/ECDICT (MIT 许可)
ECDICT 的 stardict.db 可从其 Releases 页面的 ecdict-sqlite-28.zip 解压得到,
文件很大(约 850MB),不要放进仓库。
"""
import json
import re
import sqlite3
import sys

LEVEL_SIZE = 500
BIG = 10**9

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
    return "".join(PHONETIC_FIX.get(ch, ch) for ch in p)


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
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    db_path, out_path = sys.argv[1], sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 3000

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
        if not ph or not meaning or is_name_or_abbr(meaning):
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

    cands.sort(key=lambda r: (r["freq_rank"], r["word"]))
    out = cands[:limit]
    for i, r in enumerate(out):
        r["id"] = i + 1
        r["level"] = i // LEVEL_SIZE + 1

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    levels = sorted({r["level"] for r in out})
    print(f"候选 {len(cands)} 个,导出 {len(out)} 个,共 {len(levels)} 级")


if __name__ == "__main__":
    main()
