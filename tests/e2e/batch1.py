"""首页:中文搜索、"今天的 10 分钟"路径、摸底测试。"""
import os, sys
from playwright.sync_api import sync_playwright

URL = os.environ.get("E2E_URL", "http://localhost:4173/")

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        check.failed = True
check.failed = False

with sync_playwright() as p:
    b = p.chromium.launch(channel=os.environ.get('PLAYWRIGHT_CHANNEL') or None)
    ctx = b.new_context(viewport={"width": 393, "height": 852})
    ctx.route('**/favicon.ico', lambda route: route.fulfill(status=204))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script("window.__forceKind = 'card'")
    page.goto(URL)
    page.wait_for_selector("#search-input")

    # ---- 搜索 ----
    page.fill("#search-input", "咖啡")
    page.wait_for_selector("#search-results .hit")
    check(page.is_hidden("#home-main"), "搜索时隐藏首页其他内容")
    check(len(page.query_selector_all("#search-results .hit")) >= 1, "中文搜索有结果")
    page.fill("#search-input", "水")
    page.wait_for_selector("#search-results .hit")
    txt = page.inner_text("#search-results")
    check("能这样说" in txt and "相关单词" in txt, "搜索结果分为句子和单词")
    page.click("#search-results .hit .play-btn >> nth=0")
    page.fill("#search-input", "")
    page.wait_for_selector("#home-main:not([hidden])")
    check(page.inner_text("#search-results").strip() == "", "清空搜索后恢复首页")
    page.fill("#search-input", "zzzzqq")
    page.wait_for_selector("#search-results .hint")
    check("没找到" in page.inner_text("#search-results"), "搜不到时有提示")
    page.fill("#search-input", "")

    # ---- 摸底 ----
    check(page.query_selector("button:has-text('2 分钟摸底')") is not None, "没学过时首页提示摸底")
    page.click("button:has-text('2 分钟摸底')")
    page.wait_for_selector("[data-action=placement-answer]")
    for i in range(20):
        page.click("[data-action=placement-answer][data-known='1']")
    page.wait_for_selector("text=摸底结果")
    check("20" in page.inner_text(".home") and "标记" in page.inner_text(".home"), "全部认识时提示可标记已会")
    page.click("[data-action=placement-apply]")
    page.wait_for_selector("text=已标记")
    check("已学 5" in page.inner_text("footer") or "已学 500" in page.inner_text("footer"), "标记后已学词数增加 (" + page.inner_text("footer")[:30] + ")")
    check(page.query_selector("button:has-text('2 分钟摸底')") is None, "做过摸底后不再提示")

    # ---- 今天的 10 分钟 ----
    page.reload()
    page.wait_for_selector("#search-input")
    page.click("[data-action=path-start]")
    page.wait_for_selector(".study, .home, .settings")
    guard = 0
    seen = []
    while guard < 40:
        guard += 1
        if page.query_selector("text=今天的 10 分钟完成了") and page.query_selector("[data-action=home]"):
            break
        if page.query_selector("[data-action=path-next]"):
            seen.append(page.inner_text("[data-action=path-next]"))
            page.click("[data-action=path-next]")
            page.wait_for_timeout(400)
            continue
        if page.query_selector("[data-action=reveal]"):
            page.click("[data-action=reveal]")
            page.wait_for_selector(".grades")
            page.click(".grade.g3")
            page.wait_for_timeout(100)
            continue
        if page.query_selector("[data-action=pquiz-pick]"):
            page.click("[data-action=pquiz-pick] >> nth=0")
            page.wait_for_selector("[data-action=pquiz-next]")
            page.click("[data-action=pquiz-next]")
            continue
        page.wait_for_timeout(150)
    check(page.query_selector("text=今天的 10 分钟完成了") is not None, f"10 分钟路径能走完 ({seen})")
    page.click("[data-action=home]")
    page.wait_for_selector("#search-input")
    check("完成了" in page.inner_text(".path"), "首页显示今天已完成")
    check(len(page.query_selector_all(".chip-step.on")) >= 2, "路径步骤打勾")
    page.reload()
    page.wait_for_selector("#search-input")
    check("完成了" in page.inner_text(".path"), "刷新后今天的路径进度还在")
    check(not errors, f"没有报错 ({errors[:3]})")
    b.close()

sys.exit(1 if check.failed else 0)
