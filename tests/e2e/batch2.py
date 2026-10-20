"""句型练习、连读弱读、角色扮演。"""
import os
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
    ctx.route('**/audio/**', lambda route: route.fulfill(status=404))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector("#search-input")

    # 句型
    page.click('[data-action="frames"]')
    check(len(page.query_selector_all('[data-action="frame"]')) >= 20, "句型列表 20 个以上")
    page.click('[data-action="frame"] >> nth=0')
    check(len(page.query_selector_all('[data-action="frame-play"]')) == 8, "每个句型 8 个填空")
    page.click('[data-action="frame-play"] >> nth=2')
    page.click('[data-action="frame-quiz"]')
    for i in range(5):
        page.click('[data-action="drill-pick"] >> nth=0')
        page.click('[data-action="drill-next"]')
    check("答对" in page.inner_text('#app'), "句型小测出分数")
    page.click('[data-action="drill-back"]')
    check(page.query_selector('[data-action="frame-quiz"]') is not None, "小测后回到句型页")

    # 连读
    page.click('[data-action="frames"]') if False else None
    page.click('[data-action="link-quiz"]') if page.query_selector('[data-action="link-quiz"]') else None
    page.goto(URL)
    page.wait_for_selector("#search-input")
    page.click('[data-action="linking"]')
    check(len(page.query_selector_all('[data-action="link-play"]')) >= 40, "连读每条有慢速和自然两个按钮")
    check("听起来像" in page.inner_text('#app'), "显示听起来像")
    page.click('[data-action="link-play"] >> nth=1')
    page.click('[data-action="link-quiz"]')
    for i in range(5):
        page.click('[data-action="drill-pick"] >> nth=1')
        page.click('[data-action="drill-next"]')
    check("答对" in page.inner_text('#app'), "连读小测出分数")

    # 角色扮演
    page.goto(URL)
    page.wait_for_selector("#search-input")
    page.click('footer [data-action="scenes"]')
    page.click('[data-action="scene"] >> nth=0')
    page.click('[data-action="role-open"]')
    page.click('[data-action="role-start"][data-me="A"]')
    page.wait_for_selector('[data-action="role-reveal"]')
    check("轮到你了" in page.inner_text('#app'), "轮到我说话时有提示")
    check("……" in page.inner_text('.dialog'), "我的句子先隐藏")
    n = 0
    while True:
        page.wait_for_selector('[data-action="role-reveal"], [data-action="role-again"]', timeout=15000)
        if page.query_selector('[data-action="role-again"]'):
            break
        page.click('[data-action="role-reveal"]')
        page.click('[data-action="role-next"]')
        n += 1
    check(n >= 2, f"演完整段对话,说了 {n} 句")
    check("演完了" in page.inner_text('#app'), "结束页")
    page.click('[data-action="role-exit"] >> nth=-1')
    check(page.query_selector('[data-action="role-open"]') is not None, "回到场景页")
    check(errors == [], f"没有报错 ({errors})")
    b.close()
raise SystemExit(1 if check.failed else 0)
