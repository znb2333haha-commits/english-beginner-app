#!/usr/bin/env python3
"""检查 data/examples.json 的例句。

用法:python3 -I scripts/check_examples.py [words.json] [examples.json]
错误(退出码 1):第 1、2 级的词缺少例句、格式不对、超过 10 个词、没用到目标词(或词形)、中文为空、每词条数不是 1 到 2。
提醒(不影响退出码):句子里出现了词库前 1500 词以外的词,方便人工看是否太难。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_WORDS = 10
VOCAB_LIMIT = 1500
# 冠词、助动词等虚词不计入"超纲"提醒
FUNCTION_WORDS = set(
    "a an the i you he she it we they me him her us them my your his its our their this that these those "
    "am is are was were be been do does did can could will would shall should may might must "
    "to of in on at by for with from and or but not no yes so if as than too very".split()
)


def tokens(text):
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.lower())


def word_forms(entry):
    forms = {entry["word"].lower()}
    for part in (entry.get("forms") or "").split("/"):
        if ":" in part:
            forms.add(part.split(":", 1)[1].lower())
    return forms


REQUIRED_LEVELS = (1, 2)


def check(words, examples, required_levels=REQUIRED_LEVELS):
    errors, warnings = [], []
    by_word = {w["word"]: w for w in words}
    known = {w["word"].lower() for w in words if w["id"] <= VOCAB_LIMIT}
    for w in words:
        if w["id"] <= VOCAB_LIMIT:
            known |= word_forms(w)
    targets = [w for w in words if w["level"] in required_levels]
    for w in targets:
        if w["word"] not in examples:
            errors.append(f"{w['word']}: 缺少例句")
    for key, items in examples.items():
        if key not in by_word:
            errors.append(f"{key}: 不在词库里")
            continue
        if not isinstance(items, list) or not 1 <= len(items) <= 2:
            errors.append(f"{key}: 例句条数必须是 1 到 2 条")
            continue
        forms = word_forms(by_word[key])
        for i, item in enumerate(items, 1):
            en = (item.get("en") or "").strip() if isinstance(item, dict) else ""
            zh = (item.get("zh") or "").strip() if isinstance(item, dict) else ""
            if not en:
                errors.append(f"{key}#{i}: 英文为空")
                continue
            if not zh:
                errors.append(f"{key}#{i}: 中文为空")
            toks = tokens(en)
            if len(toks) > MAX_WORDS:
                errors.append(f"{key}#{i}: 超过 {MAX_WORDS} 个词({len(toks)})")
            if not forms & set(toks):
                errors.append(f"{key}#{i}: 句子里没有用到目标词或它的词形")
            hard = sorted(
                {t for t in toks if t not in forms and t not in known and t not in FUNCTION_WORDS}
            )
            if hard:
                warnings.append(f"{key}#{i}: 超出前 {VOCAB_LIMIT} 词的词:{', '.join(hard)}")
    return errors, warnings


def main(argv):
    words_path = Path(argv[1]) if len(argv) > 1 else ROOT / "data/words.json"
    ex_path = Path(argv[2]) if len(argv) > 2 else ROOT / "data/examples.json"
    words = json.loads(words_path.read_text(encoding="utf-8"))
    examples = json.loads(ex_path.read_text(encoding="utf-8"))
    errors, warnings = check(words, examples)
    print(f"例句 {len(examples)} 个词;错误 {len(errors)},提醒 {len(warnings)}")
    for line in errors:
        print("错误:", line)
    for line in warnings:
        print("提醒:", line)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
