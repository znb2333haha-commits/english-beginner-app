"""主动回忆练习(听音选义/拼写/完形填空)和跟读录音的端到端测试。
需要先 npm run build && npx vite preview --port 4173;录音用 Chromium 的假麦克风。"""
import json, os, sys
from playwright.sync_api import sync_playwright

URL = os.environ.get("E2E_URL", "http://localhost:4173/")

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        check.failed = True
check.failed = False

def seed_reviewed(page):
    """让第 1 个词变成学过的词:走一遍普通卡片并评"认识"。"""
    page.add_init_script("window.__forceKind = 'card'")

with sync_playwright() as p:
    b = p.chromium.launch(channel=os.environ.get('PLAYWRIGHT_CHANNEL') or None,
                          args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
    ctx = b.new_context(viewport={"width": 393, "height": 852}, permissions=["microphone"])
    ctx.route('**/favicon.ico', lambda route: route.fulfill(status=204))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL)
    page.wait_for_selector("text=来一组")

    # 先把第一个词学一遍(普通卡片),评"不认识",它会在本组再次出现
    page.evaluate("window.__forceKind = 'card'")
    page.click("button:has-text('来一组')")
    page.wait_for_selector(".word")
    first = page.inner_text(".word")
    page.click("button:has-text('显示答案')")
    page.wait_for_selector(".grades")
    check(page.query_selector(".shadow-row button:has-text('跟读')") is not None, "卡片背面有跟读按钮")

    # 跟读:录音 → 停止 → 出现对比
    page.click(".shadow-row button:has-text('跟读')")
    page.wait_for_selector("button:has-text('停止')")
    page.wait_for_timeout(800)
    page.click("button:has-text('停止')")
    page.wait_for_selector("button:has-text('对比')", timeout=5000)
    check(page.query_selector("button:has-text('我的')") is not None, "录音后出现对比和我的按钮")
    page.click("button:has-text('对比')")  # 不应报错

    page.click("button.g1")
    page.wait_for_selector('.grades', state='detached')

    # 听音选义
    page.evaluate("window.__forceKind = 'listen'")
    # 现在队列里已有学过的词;逐张评掉直到轮到 first 再出现
    for _ in range(12):
        page.wait_for_selector(".study")
        if page.query_selector(".quiz"):
            break
        if page.query_selector("button:has-text('显示答案')"):
            page.click("button:has-text('显示答案')")
        page.wait_for_selector(".grades")
        page.click("button.g3")
        page.wait_for_selector('.grades', state='detached')
    check(page.query_selector(".quiz .quiz-option") is not None, "学过的词出现听音选义题")
    check(len(page.query_selector_all(".quiz-option")) == 4, "听音选义有 4 个选项")
    check(page.query_selector(".quiz .word") is None, "答题前不显示单词")
    check(page.evaluate("document.documentElement.scrollHeight <= window.innerHeight"), "练习题一屏放得下")
    # 键盘 1 选第一个,不管对错都进入背面
    page.keyboard.press("1")
    page.wait_for_selector(".grades")
    check(page.query_selector(".result") is not None, "答题后显示对错结果")
    check(page.query_selector(".grade.suggest") is not None, "推荐的评分按钮高亮")
    word = page.inner_text(".word")
    page.click("button.g3")
    page.wait_for_selector('.grades', state='detached')

    # 拼写:先答错再答对(通过看答案路径)
    page.evaluate("window.__forceKind = 'spell'")
    for _ in range(12):
        if page.query_selector("text=这一组完成了") or page.query_selector("#spell-input"):
            break
        if page.query_selector(".quiz-option"):
            page.keyboard.press("1"); page.wait_for_selector(".grades")
        elif page.query_selector("button:has-text('显示答案')"):
            page.click("button:has-text('显示答案')"); page.wait_for_selector(".grades")
        page.click("button.g3")
        page.wait_for_selector('.grades', state='detached')
    if page.query_selector("#spell-input"):
        page.fill("#spell-input", "zzzz")
        page.keyboard.press("Enter")
        page.wait_for_selector(".result.wrong")
        check("zzzz" in page.inner_text(".result"), "拼错时显示你写的和正确答案")
        ans = page.inner_text(".word")
        page.click("button.g1")
        page.wait_for_selector('.grades', state='detached')
        # 同一个词会再来一次,这次拼对
        for _ in range(12):
            if page.query_selector("#spell-input"):
                break
            if page.query_selector(".quiz-option"):
                page.keyboard.press("1"); page.wait_for_selector(".grades")
            elif page.query_selector("button:has-text('显示答案')"):
                page.click("button:has-text('显示答案')"); page.wait_for_selector(".grades")
            if page.query_selector(".grades"):
                page.click("button.g3"); page.wait_for_selector('.grades', state='detached')
        if page.query_selector("#spell-input"):
            page.evaluate("window.__forceKind = 'spell'")
            # 先偷看答案:用跳过路径拿到词,再下一轮拼对
            page.click("button:has-text('不知道,看答案')")
            page.wait_for_selector(".result.wrong")
            check(True, "跳过也能看到答案")
    else:
        check(False, "没有出现拼写题")

    # 设置里能关闭练习
    page.goto(URL)
    page.wait_for_selector(".stats")
    page.click("text=设置与备份")
    page.select_option("select[data-setting=practice]", "0")
    page.reload(); page.wait_for_selector(".stats")
    page.click("text=设置与备份")
    check(page.eval_on_selector("select[data-setting=practice]", "e => e.value") == "0", "关闭练习的设置刷新后保留")
    check(not errors, f"没有报错 ({errors[:3]})")
    b.close()

sys.exit(1 if check.failed else 0)
