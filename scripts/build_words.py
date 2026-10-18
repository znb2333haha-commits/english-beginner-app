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
# 入门主题从中文主释义识别，不维护英文单词白名单。完整释义项匹配，
# 且只看相应词性的前两个义项，避免把“事业/政策”中的字或罕见比喻义误算成实物。
THEME_RULES = {
    '食物饮品': r'(?:水果|苹果|柠檬|橙|葡萄|桃|梨|坚果|蔬菜|土豆|马铃薯|番茄|洋葱|大蒜|豆|米|面粉|谷物|谷粒|谷类|面包|饼干|蛋糕|馅饼|三明治|糖果|蜂蜜|黄油|奶酪|乳酪|牛奶|奶油|食物|食品|肉|鱼肉|鸡蛋|蛋|汤|盐|糖|茶|咖啡|果汁|饮料|水|酒|早餐|午餐|晚餐|餐饭)',
    '动物': r'(?:小|大|母|公|野|家)?(?:动物|宠物|猫|狗|犬|牛|羊|马|猪|兔|鼠|鹿|熊|鸟|鸡|鸭|鹅|鱼|昆虫|虫|蜂|蝴蝶)',
    '家人与人物': r'(?:家人|家庭|父母亲?|母亲|父亲|爸爸|妈妈|祖父|祖母|外祖父|外祖母|兄弟|姐妹|姐姐|妹妹|儿子|女儿|丈夫|妻子|夫妇|叔父|伯父|姑母|姨母|堂兄弟|表兄弟|婴儿|婴孩|孩子|小孩|男孩|女孩|男人|女人|妇女|朋友|邻居|学生|教师|老师|医生|护士|工人|厨师|司机|农民|警察)',
    '身体': r'(?:身体|人体|头|头部|头发|脑袋|脸|面孔|面容|眼|眼睛|耳|耳朵|鼻|鼻子|口|嘴|牙|牙齿|舌|脖子|颈|肩|肩膀|手|手臂|手掌|手指|拇指|指甲|胸|胸部|背|背部|腰|腹|腹部|胃|心脏|肺|肺脏|腿|膝|膝盖|脚|足|脚趾|足趾|脚后跟|皮肤|骨|骨头|血|血液)',
    '衣物日用品': r'(?:衣服|衣物|外衣|外套|衬衫|夹克|毛衣|裙|裙子|裤|裤子|帽|帽子|鞋|靴|袜|手套|围巾|制服|毛毯|毯子|被子|枕头|毛巾|肥皂|刷子|梳子|牙刷|眼镜|手表|钱包|背包|提包|书包|袋|袋子|篮|篮子|箱|箱子|盒|盒子|瓶|瓶子|杯|杯子|碗|盘|盘子|碟|勺|刀|叉|锅|壶|桶|盆|罐|容器|钥匙|镜子|伞|玩具|球|绳|绳子|针|线|电池|灯|蜡烛|纸|书|书籍|笔|铅笔|报纸|照片|图画|地图|电话|电脑|电子计算机|电视|收音机|相机|照相机|钢琴|吉他)',
    '住所与出行': r'(?:房子|住宅|房间|卧室|浴室|厨房|客厅|办公室|建筑物|地板|楼梯|屋顶|天花板|墙|墙壁|窗户|窗子|门|门廊|走廊|院子|花园|床|桌子|餐桌|椅子|沙发|橱柜|柜子|架子|搁板|烤箱|冰箱|炉子|汽车|客车|货车|公共汽车|自行车|火车|飞机|船|小船|轮船|车库|车站|机场|学校|医院|商店|市场|超市|饭店|旅馆|餐馆|银行|公园|街道|马路|公路|桥|桥梁|隧道)',
    '自然': r'(?:树|树木|树枝|树叶|叶|叶片|花|草|草地|草坪|植物|种子|根|茎|森林|树林|山|山脉|小山|河|河流|湖|海|海洋|海岸|海滩|岛|岛屿|石|石头|岩石|沙|沙子|土|泥土|土地|地面|天空|太阳|月亮|星|恒星|云|雨|雨水|雪|风|冰|火|火焰|空气)',
    '颜色': r'(?:颜色|[红橙黄绿青蓝紫黑白灰棕褐粉银金]色(?:的)?|[红黄绿蓝紫黑白灰]的)',
    '数字': r'[一二三四五六七八九十百千万零两]+(?:的)?',
    '日常动作': r'(?:吃|喝|饮|吃饭|饮食|走|步行|跑|跑步|睡|睡觉|洗|洗涤|穿|穿衣|买|购买|卖|出售|煮|烹调|烹饪)',
}
CONCRETE_THEMES = frozenset(THEME_RULES) - {'颜色', '数字', '日常动作'}
THEME_SLOTS = 300  # 每 5 词 3 个主题词，保持生活主题与高频实词混合。
MIN_CONCRETE = 200  # 第一级至少 40% 是主词性为名词的具体名词。
OXFORD_WEIGHT = 2
COLLINS_WEIGHT = 0.5


def themes_for(row):
    pos = row['pos']
    # 仅使用主词性的释义，颜色可用形容词义；不因副义改变实际词性。
    prefix = {'n': r'n\.', 'v': r'v[ti]?\.', 'j': r'a(?:dj)?\.',
              'adj': r'a(?:dj)?\.', 'm': r'(?:num|a)\.'}.get(pos)
    if prefix is None or learning_key(row)[0] == 3:
        return []
    glosses = []
    for line in row['meaning'].splitlines():
        match = re.match(prefix + r'\s*(.*)', line)
        if match:
            glosses.extend(re.split(r'[,，;；、]', match[1])[:2])
    return [theme for theme, pattern in THEME_RULES.items()
            if (theme not in CONCRETE_THEMES or pos == 'n')
            and (theme != '日常动作' or pos == 'v')
            and any(re.fullmatch(pattern, gloss.strip()) for gloss in glosses)]


def is_concrete(row):
    return row['pos'] == 'n' and bool(set(themes_for(row)) & CONCRETE_THEMES)


def theme_key(row):
    # 同一主题池内用牛津核心标记与 Collins 星级降低词频分数；无需逐词调权。
    weight = 1 + OXFORD_WEIGHT * bool(row['oxford']) + COLLINS_WEIGHT * row['collins']
    return row['freq_rank'] / weight, row['freq_rank'], row['word']


def beginner_order(candidates):
    # 重现 T1 顺序，再把生活主题词从后续级别提升，挤出的词保持原顺序顺延。
    baseline = sorted(candidates, key=lambda r: (r['freq_rank'], r['word']))
    baseline[:LEVEL_SIZE] = sorted(baseline[:LEVEL_SIZE], key=learning_key)
    theme_pool = sorted((r for r in baseline if themes_for(r)), key=theme_key)
    concrete = [r for r in theme_pool if is_concrete(r)]
    if len(baseline) >= LEVEL_SIZE and len(concrete) < MIN_CONCRETE:
        raise ValueError(f'具体名词仅 {len(concrete)} 个，不满足 {MIN_CONCRETE} 个；请检查主题规则和数据')
    selected = {r['word'] for r in concrete[:MIN_CONCRETE]}
    for row in theme_pool:
        if len(selected) >= THEME_SLOTS:
            break
        selected.add(row['word'])
    thematic = [r for r in theme_pool if r['word'] in selected]
    ordinary = [r for r in baseline if r['word'] not in selected]
    first = []
    while len(first) < min(LEVEL_SIZE, len(baseline)):
        for pool, count in ((thematic, 3), (ordinary, 2)):
            for _ in range(min(count, len(pool), LEVEL_SIZE - len(first))):
                first.append(pool.pop(0))
    return first + thematic + ordinary
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
    # 保持原来的 3000 词；主题词可跨级提升，被挤出的词顺延。
    out = sorted(candidates, key=lambda r: (r['freq_rank'], r['word']))[:limit]
    out = beginner_order(out)
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
