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

    with page.expect_response(lambda response: '/audio/' in response.url and response.url.endswith('.mp3')) as first_audio:
        page.click("button:has-text('来一组')")
    page.wait_for_selector(".word")
    first = page.inner_text(".word")
    check(first == WORDS[0]['word'] and first != 'the', f"第一张卡按新学习顺序 (实际: {first})")
    check(first_audio.value.status in (200, 206), '首卡自动请求内置音频成功（支持浏览器 Range 请求）')
    audio_response = page.request.get(URL + f'audio/{first}.mp3')
    check(audio_response.status == 200 and 'audio/' in audio_response.headers.get('content-type', ''), '首卡完整 MP3 请求返回 200 和音频类型')
    audio_duration = page.evaluate('''async word => {
        const response = await fetch(`audio/${word}.mp3`);
        const context = new AudioContext();
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        await context.close();
        return buffer.duration;
    }''', first)
    check(0.15 < audio_duration < 10, '首卡 MP3 在浏览器可解码，无需系统语音')
    page.screenshot(path=f"{OUT}/2_front.png")
    page.click("button:has-text('显示答案')")
    page.wait_for_selector(".grades")
    page.screenshot(path=f"{OUT}/3_back.png")
    check(page.query_selector("button:has-text('慢速')") is not None, "卡片上有慢速播放按钮")
    check(page.query_selector(".example .example-en") is not None and page.inner_text(".example .example-zh").strip() != "", "卡片背面显示例句(英文和中文)")
    check(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "背面没有横向溢出")
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

    check("第一级 5/500" in page.inner_text(".progress"), "首页显示第一级已学 5/500")

    # 离线:首次联网加载后,断网刷新仍能打开(service worker 缓存)
    page.wait_for_function("navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true)")
    page.evaluate("navigator.serviceWorker.ready")
    page.reload(); page.wait_for_selector(".stats")
    ctx.set_offline(True)
    page.reload(); page.wait_for_selector(".stats", timeout=8000)
    check("音标入门" in page.inner_text("footer"), "断网刷新后首页仍可打开")
    ctx.set_offline(False)

    # 音标入门:走一遍第一个音标的听音选词(i 的对比词是 sit),进度刷新后保留
    page.click("button:has-text('音标入门')")
    page.wait_for_selector(".phoneme")
    check(len(page.query_selector_all(".phoneme")) == 41, "音标列表有 41 个音素")
    page.click(".phoneme >> nth=0")
    page.wait_for_selector(".example-word")
    check(len(page.query_selector_all(".example-word")) == 3, "音标详情显示 3 个例词")
    page.click("button:has-text('听音选词')")
    for _ in range(3):
        page.wait_for_selector(".option")
        page.click(".option:not(:has-text('sit'))")
        page.click("button.primary")
    page.wait_for_selector("text=学会了")
    check(page.query_selector("text=答对 3 / 3 题") is not None, "听音选词答对 3 题")
    page.click("button:has-text('回到音标列表')")
    page.wait_for_selector(".phoneme.done")
    check(len(page.query_selector_all(".phoneme.done")) == 1, "答对后音标变绿")
    page.reload()
    page.wait_for_selector(".stats")
    check("音标入门 1/41" in page.inner_text("footer"), "刷新后音标进度还在")
    check(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "首页底部没有横向溢出")

    # 日常会话:进入第一个场景,标记"我会了",做听句选意思(靠音频请求里的句子 id 找答案),进度保留
    PHRASES = {p['id']: p for sc in json.loads((ROOT / 'data/phrases.json').read_text(encoding='utf-8'))['scenes'] for p in sc['phrases']}
    requested = []
    page.on('request', lambda r: requested.append(r.url.split('/phrases/')[1][:-4]) if '/audio/phrases/' in r.url else None)
    page.click("button:has-text('日常会话')")
    page.wait_for_selector(".scene")
    check(len(page.query_selector_all(".scene")) >= 12, "日常会话至少有 12 个场景")
    page.click(".scene >> nth=0")
    page.wait_for_selector(".phrase")
    check(len(page.query_selector_all(".phrase")) == 8, "场景里有 8 句")
    page.click(".phrase >> nth=0 >> button:has-text('我会了')")
    page.wait_for_selector(".phrase.learned")
    check("1/8" in page.inner_text("header span"), "标记我会了后进度 1/8")
    requested.clear()
    page.click("button:has-text('听句选意思')")
    for n in range(4):
        page.wait_for_selector(".option")
        page.wait_for_function("true")
        for _ in range(50):
            if len(requested) > n:
                break
            page.wait_for_timeout(100)
        pid = requested[n]
        page.click(f".option:text-is('{PHRASES[pid]['zh']}')")
        page.click("button.primary")
    page.wait_for_selector("text=通关了")
    check(page.query_selector("text=答对 4 / 4 题") is not None, "听句选意思全对,场景通关")
    page.click("button:has-text('回到场景')")
    page.click("button:has-text('返回')")
    page.wait_for_selector(".scene.done")
    page.reload(); page.wait_for_selector(".stats")
    check("日常会话 1/" in page.inner_text("footer"), "刷新后日常会话进度还在")

    # 备份导出 -> 清空 -> 导入
    page.click("text=设置与备份")
    with page.expect_download() as dl:
        page.click("button:has-text('导出备份')")
    path = f"{OUT}/backup.json"
    dl.value.save_as(path)
    data = json.load(open(path, encoding="utf-8"))
    check(data['version'] == 5, '新备份使用版本 5')
    check(len(data.get('phrases', [])) == 2, '备份里有日常会话进度')
    check(len(data.get('phonetics', [])) == 1 and data['phonetics'][0]['done'], '备份里有音标进度')
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
    check("音标入门 1/41" in page.inner_text("footer"), "导入后音标进度恢复")
    check("日常会话 1/" in page.inner_text("footer"), "导入后日常会话进度恢复")

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
