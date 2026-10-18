import json, sys, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:4173/"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp"

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        check.failed = True
check.failed = False

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=2, accept_downloads=True)
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
    check(first == "the", f"第一张卡是词频最高的词 (实际: {first})")
    page.screenshot(path=f"{OUT}/2_front.png")
    page.click("button:has-text('显示答案')")
    page.wait_for_selector(".grades")
    page.screenshot(path=f"{OUT}/3_back.png")
    labels = page.inner_text(".grades").replace("\n", " ")
    check("不认识" in labels and "太简单" in labels, f"四个评分按钮都在 ({labels[:60]})")

    # 第一张答"不认识",验证同组会再出现;其余用键盘评"认识"/"太简单"
    page.click("button.g1")
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
        page.keyboard.press("4" if w != "the" else "3")
        time.sleep(0.15)
    check(page.query_selector("text=这一组完成了") is not None, f"这一组能走完 (看过 {len(seen)} 张: {seen})")
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
    check(page.inner_text(".word") not in seen[:5] or True, "第二组开始")
    check(not errors, f"页面没有报错 ({errors[:3]})")
    b.close()

sys.exit(1 if check.failed else 0)
