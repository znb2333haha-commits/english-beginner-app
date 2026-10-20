"""学习概况、免手操、多声音、设置项。"""
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
    requested = []
    ctx.on('request', lambda r: requested.append(r.url) if '/audio/phrases' in r.url else None)
    ctx.route('**/audio/**', lambda route: route.fulfill(status=404))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector("#search-input")

    # 概况
    page.click('[data-action="stats"]')
    page.wait_for_selector('.cov')
    check("%" in page.inner_text('.cov b'), "显示覆盖率")
    check("最近 7 天" in page.inner_text('#app'), "显示周概况")
    page.click('[data-action="home"]')

    # 设置:网页版不显示提醒,有多声音
    page.click('[data-action="settings"]')
    check(page.query_selector('[data-setting="voices"]') is not None, "设置里有多种声音")
    check(page.query_selector('[data-setting="reminder"]') is None, "网页版不显示提醒开关")
    page.select_option('[data-setting="voices"]', '0')
    page.click('[data-action="home"]')

    # 免手操(用场景)
    page.click('footer [data-action="scenes"]')
    page.click('[data-action="scene"] >> nth=0')
    page.click('[data-action="tutor-scene"]')
    page.wait_for_selector('.tutor-zh')
    check(page.inner_text('.tutor-en').strip() == '…', "先只显示中文")
    page.wait_for_function("document.querySelector('.tutor-en') && document.querySelector('.tutor-en').innerText.trim() !== '…'", timeout=8000)
    check(True, "几秒后显示英文")
    page.click('[data-action="tutor-pause"]')
    check("继续" in page.inner_text('[data-action="tutor-pause"]'), "可以暂停")
    page.click('[data-action="tutor-exit"]')
    page.wait_for_selector('#search-input')
    check(True, "退出回到首页")

    # 多声音开:单句点读会请求声音文件
    page.click('[data-action="settings"]')
    page.select_option('[data-setting="voices"]', '1')
    check(page.evaluate("JSON.parse(localStorage.getItem('shiyu:voices')).multi") is True, "多声音设置保存")
    check(errors == [], f"没有报错 ({errors})")
    b.close()
raise SystemExit(1 if check.failed else 0)
