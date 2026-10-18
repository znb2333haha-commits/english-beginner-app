import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "http://localhost:4173/"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
Path(OUT).mkdir(parents=True, exist_ok=True)
ROOT = Path(__file__).resolve().parents[2]
WORDS = json.loads((ROOT / 'data/words.json').read_text(encoding='utf-8'))
LEGACY = {version: json.loads((ROOT / ('data/legacy-word-order-v1.json' if version == 1 else 'data/legacy-word-order.json')).read_text(encoding='utf-8')) for version in (1, 2)}

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        check.failed = True
check.failed = False

with sync_playwright() as p:
    b = p.chromium.launch(channel=os.environ.get('PLAYWRIGHT_CHANNEL') or None)
    ctx = b.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=2, accept_downloads=True)
    # 仓库没有 favicon；不把浏览器隐式请求当成应用报错。
    ctx.route('**/favicon.ico', lambda route: route.fulfill(status=204))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    page.goto(URL)
    page.wait_for_selector("text=来一组")
    page.screenshot(path=f"{OUT}/1_home.png")
    check("0/10" in page.inner_text(".stats"), "首页显示今日新词 0/10")

    page.click("button:has-text('来一组')")
    page.wait_for_selector(".word")
    first = page.inner_text(".word")
    check(first == WORDS[0]['word'] and first != 'the', f"第一张卡按新学习顺序 (实际: {first})")
    page.screenshot(path=f"{OUT}/2_front.png")
    page.click("button:has-text('显示答案')")
    page.wait_for_selector(".grades")
    page.screenshot(path=f"{OUT}/3_back.png")
    labels = page.inner_text(".grades").replace("\n", " ")
    check("不认识" in labels and "太简单" in labels, f"四个评分按钮都在 ({labels[:60]})")

    # 第一张答"不认识",验证同组会再出现;其余用键盘评"认识"/"太简单"
    page.click("button.g1")
    page.wait_for_selector('.grades', state='detached')
    page.wait_for_selector(".word")
    n_left = page.inner_text(".study header span")
    check("还剩 5 张" in n_left, f"答错的卡放回队尾,剩余仍为 5 张 ({n_left})")

    seen = []
    for i in range(30):
        if page.query_selector("text=这一组完成了"):
            break
        w = page.inner_text(".word")
        seen.append(w)
        page.keyboard.press(" ")
        page.wait_for_selector(".grades")
        page.keyboard.press("4" if w != first else "3")
        page.wait_for_selector('.grades', state='detached')
    check(page.query_selector("text=这一组完成了") is not None, f"这一组能走完 (看过 {len(seen)} 张: {seen})")
    check(first in seen, '答错的第一张卡确实再次出现')
    page.screenshot(path=f"{OUT}/4_done.png")

    page.click("button:has-text('回首页')")
    page.wait_for_selector(".stats")
    stats = page.inner_text(".stats").replace("\n", " ")
    check("5/10" in stats, f"回首页后今日新词 5/10 ({stats})")
    check("连续学习 1 天" in page.inner_text(".streak"), "连续学习 1 天")

    page.reload()
    page.wait_for_selector(".stats")
    check("5/10" in page.inner_text(".stats"), "刷新页面后进度还在")

    # 备份导出 -> 清空 -> 导入
    page.click("text=设置与备份")
    with page.expect_download() as dl:
        page.click("button:has-text('导出备份')")
    path = f"{OUT}/backup.json"
    dl.value.save_as(path)
    data = json.load(open(path, encoding="utf-8"))
    check(data['version'] == 3, '新备份使用版本 3')
    check(len(data["cards"]) == 5 and len(data["logs"]) >= 5, f"备份里有 5 张卡、{len(data['logs'])} 条记录")
    page.screenshot(path=f"{OUT}/5_settings.png")

    page.evaluate("indexedDB.deleteDatabase('english-beginner-app')")
    page.reload()
    page.wait_for_selector(".stats")
    check("0/10" in page.inner_text(".stats"), "清空后回到 0/10")
    page.click("text=设置与备份")
    page.set_input_files("#import-file", path)
    page.wait_for_selector("text=导入完成")
    page.click("button:has-text('返回')")
    page.wait_for_selector(".stats")
    check("5/10" in page.inner_text(".stats"), "导入后进度恢复")

    # 今日新词额度没用完时再来一组只补 5 个新词
    page.click("button:has-text('来一组')")
    page.wait_for_selector(".word")
    check(page.inner_text(".word") not in seen, "第二组从未学的新词开始")
    check(not errors, f"页面没有报错 ({errors[:3]})")

    for version in (1, 2):
        # 真实 v1/v2 IndexedDB + 对应版本备份：用刚学完的卡构造旧 ID，检查原词、日志、统计均保留。
        old = json.loads(json.dumps(data))
        old['version'] = version
        for row in old['cards'] + old['logs']:
            row['wordId'] = LEGACY[version].index(WORDS[row['wordId'] - 1]['word']) + 1
        legacy_path = f'{OUT}/backup-v{version}.json'
        Path(legacy_path).write_text(json.dumps(old), encoding='utf-8')
        migration_ctx = b.new_context(viewport={"width": 393, "height": 852}, accept_downloads=True)
        migration_ctx.route('**/favicon.ico', lambda route: route.fulfill(status=204))
        mp = migration_ctx.new_page()
        mp.on('pageerror', lambda e: errors.append(str(e)))
        # 同源空页面避免应用先打开数据库。
        mp.route('**/migration-seed', lambda route: route.fulfill(body='<html></html>', content_type='text/html'))
        mp.goto(URL + 'migration-seed')
        mp.evaluate('''backup => new Promise((resolve, reject) => {
          const request = indexedDB.open('english-beginner-app', backup.version);
          request.onupgradeneeded = () => {
            const db = request.result;
            db.createObjectStore('cards', {keyPath: 'wordId'});
            db.createObjectStore('logs', {keyPath: 'id', autoIncrement: true});
            db.createObjectStore('stats', {keyPath: 'date'});
            db.createObjectStore('settings');
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(['cards','logs','stats','settings'], 'readwrite');
            for (const name of ['cards','logs','stats']) for (const row of backup[name]) tx.objectStore(name).put(row);
            tx.objectStore('settings').put(backup.settings, 'main');
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onerror = () => reject(tx.error);
          };
        })''', old)
        mp.goto(URL)
        mp.wait_for_selector('.stats')
        check('5/10' in mp.inner_text('.stats'), '数据库升级保留统计')
        mp.click('text=设置与备份')
        for label in [f'数据库 v{version} 升级', f'v{version} 旧备份导入']:
            if label == f'v{version} 旧备份导入':
                mp.set_input_files('#import-file', legacy_path)
                mp.wait_for_selector('text=导入完成')
            with mp.expect_download() as migrated_dl:
                mp.click("button:has-text('导出备份')")
            migrated_path = f'{OUT}/migrated.json'
            migrated_dl.value.save_as(migrated_path)
            migrated = json.loads(Path(migrated_path).read_text(encoding='utf-8'))
            check(migrated['cards'] == data['cards'], label + '保留原单词及全部卡片数据')
            check(migrated['logs'] == data['logs'], label + '保留原日志及单词对应')
            check(migrated['stats'] == data['stats'] and migrated['settings'] == data['settings'], label + '保留统计和设置')
        mp.reload()
        mp.wait_for_selector('.stats')
        check('5/10' in mp.inner_text('.stats'), f'v{version} 迁移后刷新保留进度')
        migration_ctx.close()
    check(not errors, f'迁移流程没有报错 ({errors[:3]})')
    b.close()

sys.exit(1 if check.failed else 0)
