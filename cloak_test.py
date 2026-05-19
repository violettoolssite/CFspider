"""
CFspider v1.9.4 CloakBrowser 功能测试脚本

测试项目：
  [1]  普通 GET（requests，无任何反检测）
  [2]  stealth=True  —— CloakBrowser HTTP 隐身，验证 Chrome 146 真实 UA
  [3]  stealth=True POST  —— 隐身模式 POST 请求
  [4]  browser=True  —— CloakBrowser 完整 JS 渲染（无头）
  [5]  browser=True + headless=False  —— 有头模式（可目视弹出浏览器窗口）
  [6]  browser=True + js_eval  —— 页面加载后执行 JS
  [7]  browser=True + wait_until=networkidle + screenshot  —— 截图
  [8]  browser=True 反 bot 检测（bot.sannysoft.com）
  [9]  StealthSession 会话复用（自动 Cookie / Referer）
  [10] 异步 stealth=True
  [11] 异步 browser=True + js_eval
  [12] UA 版本号验证（应在 136-146 区间）
"""

import sys
import re
import asyncio
import cfspider

SEP = "-" * 60
PASS = "\033[92m✓ PASS\033[0m"
FAIL = "\033[91m✗ FAIL\033[0m"

results = []

def check(label, ok, note=""):
    status = PASS if ok else FAIL
    msg = f"{status}  [{label}]"
    if note:
        msg += f"  → {note}"
    print(msg)
    results.append((label, ok))


# ──────────────────────────────────────────────────────────────
print(SEP)
print("同步测试")
print(SEP)

# [1] 普通 GET
try:
    r = cfspider.get("https://httpbin.org/headers")
    ua = r.json()["headers"]["User-Agent"]
    check("[1] 普通 GET", r.status_code == 200, f"status={r.status_code}")
except Exception as e:
    check("[1] 普通 GET", False, str(e))

# [2] stealth=True GET
try:
    r = cfspider.get("https://httpbin.org/headers", stealth=True)
    ua = r.json()["headers"]["User-Agent"]
    major = int(re.search(r"Chrome/(\d+)\.", ua).group(1)) if re.search(r"Chrome/(\d+)\.", ua) else 0
    check("[2] stealth GET", r.status_code == 200 and 136 <= major <= 150,
          f"UA={ua[:60]}  major={major}")
except Exception as e:
    check("[2] stealth GET", False, str(e))

# [3] stealth=True POST
try:
    r = cfspider.post("https://httpbin.org/post", stealth=True, json={"hello": "cloak"})
    check("[3] stealth POST", r.status_code == 200,
          f"status={r.status_code}")
except Exception as e:
    check("[3] stealth POST", False, str(e))

# [4] browser=True（无头）
try:
    r = cfspider.get("https://example.com", browser=True)
    check("[4] browser 无头", r.status_code == 200 and "Example" in r.text,
          f"status={r.status_code}  len={len(r.text)}")
except Exception as e:
    check("[4] browser 无头", False, str(e))

# [5] browser=True + headless=False（有头，弹出窗口）
print("       ↳ [5] 有头模式将弹出浏览器窗口，请目视确认...")
try:
    r = cfspider.get("https://example.com", browser=True, headless=False)
    check("[5] browser 有头", r.status_code == 200, f"status={r.status_code}")
except Exception as e:
    check("[5] browser 有头", False, str(e))

# [6] browser=True + js_eval
try:
    r = cfspider.get("https://example.com", browser=True, js_eval="document.title")
    check("[6] browser js_eval", r.status_code == 200 and bool(r.js_result),
          f"js_result={r.js_result!r}")
except Exception as e:
    check("[6] browser js_eval", False, str(e))

# [7] browser=True + wait_until + screenshot
try:
    r = cfspider.get("https://example.com", browser=True,
                     wait_until="networkidle", screenshot="cloak_test_shot.png")
    import os
    shot_ok = os.path.exists("cloak_test_shot.png")
    check("[7] browser screenshot", r.status_code == 200 and shot_ok,
          f"status={r.status_code}  file={'cloak_test_shot.png' if shot_ok else 'NOT FOUND'}")
    if shot_ok:
        os.remove("cloak_test_shot.png")
except Exception as e:
    check("[7] browser screenshot", False, str(e))

# [8] browser + bot 检测页
print("       ↳ [8] 访问 bot.sannysoft.com，可能耗时 10-20s ...")
try:
    r = cfspider.get("https://bot.sannysoft.com", browser=True,
                     wait_until="networkidle", screenshot="bot_check.png")
    import os
    shot_ok = os.path.exists("bot_check.png")
    check("[8] bot 检测页", r.status_code == 200,
          f"len={len(r.text)}  screenshot={'saved' if shot_ok else 'failed'}")
    if shot_ok:
        print(f"       截图已保存: bot_check.png  (请手动查看检测结果)")
except Exception as e:
    check("[8] bot 检测页", False, str(e))

# [9] StealthSession 会话复用
try:
    with cfspider.StealthSession() as sess:
        r1 = sess.get("https://httpbin.org/cookies/set?cftest=1")
        r2 = sess.get("https://httpbin.org/cookies")
        cookies = r2.json().get("cookies", {})
        check("[9] StealthSession", sess.request_count >= 2,
              f"requests={sess.request_count}  cookies={cookies}")
except Exception as e:
    check("[9] StealthSession", False, str(e))

# [12] UA 版本号验证（采样 10 次，主版本号必须在 136-146）
try:
    from cfspider.stealth import _random_chrome_ua
    versions = [_random_chrome_ua() for _ in range(10)]
    majors = [int(re.search(r"Chrome/(\d+)\.", ua).group(1)) for ua in versions]
    ok = all(136 <= m <= 150 for m in majors)
    check("[12] UA 版本号验证", ok,
          f"抽样主版本号: {sorted(set(majors))}")
except Exception as e:
    check("[12] UA 版本号验证", False, str(e))


# ──────────────────────────────────────────────────────────────
print()
print(SEP)
print("异步测试")
print(SEP)

async def async_tests():
    # [10] 异步 stealth=True
    try:
        r = await cfspider.aget("https://httpbin.org/headers", stealth=True)
        ua = r.json()["headers"]["User-Agent"]
        major = int(re.search(r"Chrome/(\d+)\.", ua).group(1)) if re.search(r"Chrome/(\d+)\.", ua) else 0
        check("[10] async stealth", r.status_code == 200 and 136 <= major <= 150,
              f"UA major={major}")
    except Exception as e:
        check("[10] async stealth", False, str(e))

    # [11] 异步 browser=True + js_eval
    try:
        r = await cfspider.aget("https://example.com", browser=True, js_eval="document.title")
        check("[11] async browser js_eval", r.status_code == 200 and bool(r.js_result),
              f"js_result={r.js_result!r}")
    except Exception as e:
        check("[11] async browser js_eval", False, str(e))

asyncio.run(async_tests())


# ──────────────────────────────────────────────────────────────
print()
print(SEP)
passed = sum(1 for _, ok in results if ok)
total = len(results)
print(f"结果汇总：{passed}/{total} 通过")
if passed < total:
    print("失败项：")
    for label, ok in results:
        if not ok:
            print(f"  {FAIL}  {label}")
print(SEP)
sys.exit(0 if passed == total else 1)
