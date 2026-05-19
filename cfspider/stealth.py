"""
CFspider 隐身模式模块

提供完整的反爬虫规避能力，解决以下常见问题：

1. 请求头不完整或不真实
   - 问题：缺少 User-Agent, Accept-Language, Sec-Fetch-* 等头
   - 解决：自动添加 15+ 个真实浏览器请求头

2. 缺乏会话一致性
   - 问题：频繁更换 IP、User-Agent，不处理 Cookie
   - 解决：StealthSession 固定 User-Agent，自动管理 Cookie

3. 行为模式单一
   - 问题：只访问特定 API，没有随机停留等行为
   - 解决：random_delay 随机延迟，auto_referer 自动添加来源

使用方式：

    方式一：单次请求启用隐身模式
    >>> response = cfspider.get(url, stealth=True, stealth_browser='chrome')

    方式二：使用 StealthSession 保持会话一致性
    >>> with cfspider.StealthSession(browser='chrome', delay=(1, 3)) as session:
    ...     response1 = session.get(url1)  # 自动添加请求头
    ...     response2 = session.get(url2)  # 自动添加 Referer = url1

支持的浏览器：
    - chrome: Chrome 131（推荐，15 个请求头）
    - firefox: Firefox 133（12 个请求头，含隐私保护头）
    - safari: Safari 18（5 个请求头，macOS 风格）
    - edge: Edge 131（14 个请求头）
    - chrome_mobile: Chrome Mobile（10 个请求头，Android）
"""

import random
import time
from typing import Optional, Dict, List, Tuple, Any
from urllib.parse import urlparse, urlencode, urlunparse

# 真实 Chrome 版本字符串池 (major.0.build.patch)
_CHROME_REAL_VERSIONS = [
    "136.0.7103.92",  "136.0.7103.114", "136.0.7103.149",
    "137.0.7151.55",  "137.0.7151.68",  "137.0.7151.103",
    "138.0.7204.45",  "138.0.7204.74",  "138.0.7204.100",
    "139.0.7258.40",  "139.0.7258.65",  "139.0.7258.89",
    "140.0.7294.67",  "140.0.7294.86",  "140.0.7294.127",
    "141.0.7360.44",  "141.0.7360.60",  "141.0.7360.79",
    "142.0.7420.30",  "142.0.7420.44",  "142.0.7420.67",
    "143.0.7476.38",  "143.0.7476.53",  "143.0.7476.74",
    "144.0.7536.33",  "144.0.7536.48",  "144.0.7536.79",
    "145.0.7598.26",  "145.0.7598.39",  "145.0.7598.61",
    "146.0.7652.46",  "146.0.7652.60",  "146.0.7652.77",
]


def _random_chrome_ua() -> str:
    """Generate a realistic Chrome User-Agent string with real build numbers"""
    ver = random.choice(_CHROME_REAL_VERSIONS)
    return (
        f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        f"AppleWebKit/537.36 (KHTML, like Gecko) "
        f"Chrome/{ver} Safari/537.36"
    )

# CloakBrowser 源码级反检测
CLOAKBROWSER_AVAILABLE = False
try:
    from cloakbrowser import launch as _cloak_launch_sync
    CLOAKBROWSER_AVAILABLE = True
except ImportError:
    pass


class _CloakResponseAdapter:
    """将 Playwright APIResponse 适配为 CFSpiderResponse 兼容接口"""
    def __init__(self, pw_response):
        self._r = pw_response
        # 必须在 browser context 关闭前立即读取，不能懒加载
        self._text = pw_response.text()
        self._content = pw_response.body()
        self._status = pw_response.status
        self._headers = dict(pw_response.headers)
        self._url = pw_response.url
        self._ok = pw_response.ok

    @property
    def status_code(self):
        return self._status

    @property
    def text(self):
        return self._text

    @property
    def content(self):
        return self._content

    @property
    def headers(self):
        return self._headers

    @property
    def url(self):
        return self._url

    @property
    def encoding(self):
        return 'utf-8'

    @encoding.setter
    def encoding(self, value):
        pass

    @property
    def cookies(self):
        return {}

    def json(self, **kwargs):
        import json as _j
        return _j.loads(self.text)

    def raise_for_status(self):
        if not self._ok:
            raise Exception(f"请求失败 [{self.status_code}]: {self.url}")

    def __repr__(self):
        return f"<CloakResponse [{self.status_code}]>"


# Chrome 131 完整请求头模板
CHROME_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Sec-CH-UA': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
    'Connection': 'keep-alive',
    'DNT': '1',
}

# Firefox 133 完整请求头模板
FIREFOX_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive',
    'DNT': '1',
    'Sec-GPC': '1',
}

# Safari 18 完整请求头模板
SAFARI_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
}

# Edge 131 完整请求头模板
EDGE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Sec-CH-UA': '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
    'Connection': 'keep-alive',
}

# 移动端 Chrome 请求头
CHROME_MOBILE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Sec-CH-UA': '"Google Chrome";v="131", "Chromium";v="131"',
    'Sec-CH-UA-Mobile': '?1',
    'Sec-CH-UA-Platform': '"Android"',
    'Upgrade-Insecure-Requests': '1',
}

# 浏览器配置集合
BROWSER_PROFILES = {
    'chrome': CHROME_HEADERS,
    'firefox': FIREFOX_HEADERS,
    'safari': SAFARI_HEADERS,
    'edge': EDGE_HEADERS,
    'chrome_mobile': CHROME_MOBILE_HEADERS,
}

# 默认使用 Chrome
DEFAULT_BROWSER = 'chrome'


def get_stealth_headers(browser: str = 'chrome', custom_headers: Dict = None) -> Dict[str, str]:
    """
    获取隐身模式请求头
    
    Args:
        browser: 浏览器类型 (chrome/firefox/safari/edge/chrome_mobile)
        custom_headers: 自定义请求头（会覆盖默认值）
    
    Returns:
        完整的浏览器请求头字典
    """
    headers = BROWSER_PROFILES.get(browser, CHROME_HEADERS).copy()
    if custom_headers:
        headers.update(custom_headers)
    return headers


def get_random_browser_headers() -> Dict[str, str]:
    """随机选择一个浏览器的请求头"""
    browser = random.choice(list(BROWSER_PROFILES.keys()))
    return get_stealth_headers(browser)


def random_delay(min_sec: float = 0.5, max_sec: float = 2.0) -> float:
    """
    随机延迟，模拟人类行为
    
    Args:
        min_sec: 最小延迟秒数
        max_sec: 最大延迟秒数
    
    Returns:
        实际延迟的秒数
    """
    delay = random.uniform(min_sec, max_sec)
    time.sleep(delay)
    return delay


def get_referer(current_url: str, previous_url: str = None) -> Optional[str]:
    """
    生成 Referer 头
    
    Args:
        current_url: 当前请求的 URL
        previous_url: 上一个访问的 URL
    
    Returns:
        Referer 值
    """
    if previous_url:
        return previous_url
    
    # 如果没有上一个 URL，使用当前 URL 的首页作为 Referer
    parsed = urlparse(current_url)
    return f"{parsed.scheme}://{parsed.netloc}/"


def update_sec_fetch_headers(headers: Dict, site_type: str = 'none') -> Dict:
    """
    更新 Sec-Fetch-* 请求头
    
    Args:
        headers: 原始请求头
        site_type: 网站类型 (none/same-origin/same-site/cross-site)
    
    Returns:
        更新后的请求头
    """
    headers = headers.copy()
    headers['Sec-Fetch-Site'] = site_type
    
    if site_type == 'none':
        # 直接访问（如在地址栏输入URL）
        headers['Sec-Fetch-Mode'] = 'navigate'
        headers['Sec-Fetch-Dest'] = 'document'
    elif site_type in ('same-origin', 'same-site'):
        # 站内跳转
        headers['Sec-Fetch-Mode'] = 'navigate'
        headers['Sec-Fetch-Dest'] = 'document'
    else:
        # 跨站跳转
        headers['Sec-Fetch-Mode'] = 'navigate'
        headers['Sec-Fetch-Dest'] = 'document'
    
    return headers


class StealthSession:
    """
    CloakBrowser 驱动的隐身会话

    使用 CloakBrowser 的 context.request 发送 HTTP 请求：
    - 真实 Chrome TLS 指纹（源码级 C++ 补丁）
    - 真实浏览器请求头（无需手动维护 headers 列表）
    - 自动 Cookie 管理（整个会话共享 browser context）
    - 自动 Referer、随机延迟
    - 支持 CF Workers 代理
    
    """
    
    def __init__(
        self,
        browser: str = 'chrome',
        cf_proxies: str = None,
        uuid: str = None,
        delay: Tuple[float, float] = None,
        auto_referer: bool = True,
        static_ip: bool = False,
        two_proxy: str = None,
        **kwargs
    ):
        self.browser = browser
        self.cf_proxies = cf_proxies
        self.uuid = uuid
        self.delay = delay
        self.auto_referer = auto_referer
        self.static_ip = static_ip
        self.two_proxy = two_proxy
        self.last_url = None
        self.request_count = 0

        self._pw_browser = None
        self._pw_context = None
        self._playwright = None

    def _resolve_proxy(self):
        """Resolve cf_proxies string to a proxy URL usable by CloakBrowser"""
        cf = self.cf_proxies
        if not cf:
            return None
        if hasattr(cf, 'url'):
            cf = getattr(cf, 'url', None) or str(cf)
        if isinstance(cf, str):
            if cf.startswith('socks5://'):
                return cf
            if cf.startswith('http://'):
                return cf
            if cf.startswith('https://'):
                return 'http://' + cf[8:]
        return None

    def _ensure_browser(self):
        """Lazy-init CloakBrowser (one browser per session)"""
        if self._pw_context is not None:
            return

        proxy_url = self._resolve_proxy()
        launch_opts = {"headless": True, "humanize": True}
        if proxy_url and CLOAKBROWSER_AVAILABLE:
            launch_opts["proxy"] = {"server": proxy_url}

        if CLOAKBROWSER_AVAILABLE:
            self._pw_browser = _cloak_launch_sync(**launch_opts)
        else:
            from playwright.sync_api import sync_playwright
            self._playwright = sync_playwright().start()
            self._pw_browser = self._playwright.chromium.launch(headless=True)

        ctx_opts = {
            "ignore_https_errors": True,
            "user_agent": _random_chrome_ua(),
        }
        if proxy_url and not CLOAKBROWSER_AVAILABLE:
            ctx_opts["proxy"] = {"server": proxy_url}
        self._pw_context = self._pw_browser.new_context(**ctx_opts)

    def _apply_delay(self):
        if self.delay and self.request_count > 0:
            random_delay(self.delay[0], self.delay[1])

    def _make_request(self, method: str, url: str, **kwargs):
        """Execute an HTTP request via CloakBrowser context.request"""
        self._ensure_browser()
        self._apply_delay()

        req_opts = {}

        # Auto-referer
        if self.auto_referer and self.last_url:
            req_opts["headers"] = {"Referer": self.last_url}

        # Merge caller headers
        if "headers" in kwargs:
            h = dict(req_opts.get("headers", {}))
            h.update(kwargs.pop("headers"))
            req_opts["headers"] = h

        # URL params
        if "params" in kwargs:
            params = kwargs.pop("params")
            from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
            p = urlparse(url)
            q = parse_qs(p.query)
            q.update({k: [v] if not isinstance(v, list) else v for k, v in params.items()})
            url = urlunparse(p._replace(query=urlencode(q, doseq=True)))

        # Body
        if "json" in kwargs:
            import json as _j
            req_opts["data"] = _j.dumps(kwargs.pop("json")).encode()
            req_opts.setdefault("headers", {})["Content-Type"] = "application/json"
        elif "data" in kwargs:
            req_opts["data"] = kwargs.pop("data")

        pw_resp = getattr(self._pw_context.request, method.lower())(url, **req_opts)
        adapted = _CloakResponseAdapter(pw_resp)  # eager-reads all content immediately

        from .api import CFSpiderResponse
        cf_ray = adapted.headers.get('cf-ray', '')
        cf_colo = cf_ray.split('-')[-1] if cf_ray else None
        result = CFSpiderResponse(adapted, cf_colo=cf_colo, cf_ray=cf_ray or None)

        self.last_url = url
        self.request_count += 1
        return result
    
    def get(self, url: str, **kwargs) -> Any:
        return self._make_request('GET', url, **kwargs)

    def post(self, url: str, **kwargs) -> Any:
        return self._make_request('POST', url, **kwargs)

    def put(self, url: str, **kwargs) -> Any:
        return self._make_request('PUT', url, **kwargs)

    def delete(self, url: str, **kwargs) -> Any:
        return self._make_request('DELETE', url, **kwargs)

    def head(self, url: str, **kwargs) -> Any:
        return self._make_request('HEAD', url, **kwargs)

    def get_cookies(self) -> Dict[str, str]:
        """Browser context 自动管理 Cookie"""
        if self._pw_context:
            return {c['name']: c['value'] for c in self._pw_context.cookies()}
        return {}

    def set_cookie(self, name: str, value: str):
        if self._pw_context:
            self._pw_context.add_cookies([{"name": name, "value": value, "url": "https://example.com"}])

    def clear_cookies(self):
        if self._pw_context:
            self._pw_context.clear_cookies()

    def get_headers(self) -> Dict[str, str]:
        return get_stealth_headers(self.browser)

    def close(self):
        if self._pw_context:
            try: self._pw_context.close()
            except: pass
        if self._pw_browser:
            try: self._pw_browser.close()
            except: pass
        if self._playwright:
            try: self._playwright.stop()
            except: pass
        self._pw_context = None
        self._pw_browser = None
        self._playwright = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def _cloak_single_request(method: str, url: str, cf_proxies=None, uuid=None, two_proxy=None, **kwargs) -> Any:
    """Single-shot CloakBrowser request (used by api.py stealth=True)"""
    with StealthSession(cf_proxies=cf_proxies, uuid=uuid, two_proxy=two_proxy) as sess:
        return getattr(sess, method.lower())(url, **kwargs)


class _BrowserPageResponse:
    """Full-page CloakBrowser render result, compatible with CFSpiderResponse inner interface"""
    def __init__(self, html: str, url: str, status: int = 200, js_result=None):
        self._html = html
        self._url = url
        self._status = status
        self.js_result = js_result

    @property
    def text(self): return self._html
    @property
    def content(self): return self._html.encode('utf-8', errors='replace')
    @property
    def status_code(self): return self._status
    @property
    def headers(self): return {}
    @property
    def url(self): return self._url
    @property
    def encoding(self): return 'utf-8'
    @encoding.setter
    def encoding(self, v): pass
    @property
    def cookies(self): return {}
    def json(self, **kw):
        import json as _j
        return _j.loads(self._html)
    def raise_for_status(self): pass
    def __repr__(self): return f"<BrowserResponse [{self._status}] {self._url}>"


def _browser_single_request(
    method: str,
    url: str,
    cf_proxies=None,
    uuid=None,
    two_proxy=None,
    headless: bool = True,
    humanize: bool = True,
    wait_until: str = 'load',
    screenshot: str = None,
    js_eval: str = None,
    **kwargs
) -> Any:
    """Full CloakBrowser page.goto() render — executes JS, bypasses bot challenges"""
    proxy_url = StealthSession(cf_proxies=cf_proxies, uuid=uuid, two_proxy=two_proxy)._resolve_proxy()

    launch_opts = {"headless": headless, "humanize": humanize}
    if proxy_url and CLOAKBROWSER_AVAILABLE:
        launch_opts["proxy"] = {"server": proxy_url}

    if CLOAKBROWSER_AVAILABLE:
        browser_obj = _cloak_launch_sync(**launch_opts)
        _pw = None
    else:
        from playwright.sync_api import sync_playwright
        _pw = sync_playwright().start()
        browser_obj = _pw.chromium.launch(headless=headless)

    try:
        ctx_opts = {
            "ignore_https_errors": True,
            "user_agent": _random_chrome_ua(),
        }
        if proxy_url and not CLOAKBROWSER_AVAILABLE:
            ctx_opts["proxy"] = {"server": proxy_url}

        context = browser_obj.new_context(**ctx_opts)
        page = context.new_page()

        headers = kwargs.pop("headers", {})
        if headers:
            page.set_extra_http_headers(headers)

        page.goto(url, wait_until=wait_until, timeout=60000)

        if screenshot:
            page.screenshot(path=screenshot)

        js_result = page.evaluate(js_eval) if js_eval else None
        html = page.content()
        final_url = page.url

        from .api import CFSpiderResponse
        raw = _BrowserPageResponse(html, final_url, 200, js_result)
        result = CFSpiderResponse(raw)
        if js_result is not None:
            result.js_result = js_result
        return result
    finally:
        try: browser_obj.close()
        except: pass
        if _pw:
            try: _pw.stop()
            except: pass


# 支持的浏览器列表
SUPPORTED_BROWSERS = list(BROWSER_PROFILES.keys())


def get_supported_browsers() -> List[str]:
    """获取支持的浏览器列表"""
    return SUPPORTED_BROWSERS.copy()

