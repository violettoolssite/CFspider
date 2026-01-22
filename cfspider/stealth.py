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
from urllib.parse import urlparse


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
    隐身会话类 / Stealth Session class
    
    提供完整的会话一致性管理，解决反爬虫检测的三大问题：
    Provides complete session consistency management, solving three major anti-crawler issues:
    
    1. 固定 User-Agent：整个会话使用同一个浏览器指纹
       Fixed User-Agent: Uses the same browser fingerprint throughout the session
    2. 自动管理 Cookie：响应中的 Cookie 自动保存并在后续请求中发送
       Auto Cookie Management: Cookies from responses are saved and sent in subsequent requests
    3. 自动添加 Referer：页面跳转时自动添加来源信息
       Auto Referer: Automatically adds origin information during page navigation
    4. 随机延迟：每次请求前随机等待，模拟人类行为
       Random Delay: Random wait before each request, simulating human behavior
    5. 自动更新 Sec-Fetch-Site：根据 Referer 判断同站/跨站访问
       Auto Sec-Fetch-Site: Updates based on Referer to indicate same-site/cross-site access
    
    Attributes:
        browser (str): 当前使用的浏览器类型 / Current browser type
        cf_proxies (str): Workers 代理地址 / Workers proxy address
        uuid (str): VLESS UUID（可选，自动获取） / VLESS UUID (optional, auto-fetched)
        delay (tuple): 随机延迟范围 / Random delay range
        auto_referer (bool): 是否自动添加 Referer / Whether to auto-add Referer
        last_url (str): 上一次请求的 URL / Last requested URL
        request_count (int): 会话累计请求次数 / Session cumulative request count
    
    Example:
        >>> import cfspider
        >>> 
        >>> # 基本用法（使用 Workers 代理）
        >>> with cfspider.StealthSession(
        ...     cf_proxies="https://cfspider.violetqqcom.workers.dev"
        ... ) as session:
        ...     # 第一次请求：Sec-Fetch-Site: none
        ...     r1 = session.get("https://example.com")
        ...     
        ...     # 第二次请求：自动添加 Referer: https://example.com
        ...     # Sec-Fetch-Site: same-origin
        ...     r2 = session.get("https://example.com/page2")
        >>> 
        >>> # 带随机延迟
        >>> with cfspider.StealthSession(
        ...     cf_proxies="https://cfspider.violetqqcom.workers.dev",
        ...     delay=(1, 3)
        ... ) as session:
        ...     for url in urls:
        ...         # 每次请求前随机等待 1-3 秒
        ...         response = session.get(url)
        >>> 
        >>> # 完整配置
        >>> with cfspider.StealthSession(
        ...     cf_proxies="https://cfspider.violetqqcom.workers.dev",
        ...     browser='firefox',
        ...     delay=(0.5, 2.0)
        ... ) as session:
        ...     response = session.get("https://example.com")
        ...     print(f"请求次数: {session.request_count}")
        ...     print(f"当前 Cookie: {session.get_cookies()}")
    
    Note:
        StealthSession 与普通 Session 的区别：
        Differences between StealthSession and regular Session:
        - Session: 仅保持代理配置和基本请求头 / Only maintains proxy config and basic headers
        - StealthSession: 完整的隐身模式，包括浏览器指纹、Cookie 管理、
                          自动 Referer、随机延迟、Sec-Fetch-* 更新
                          Complete stealth mode including browser fingerprint, Cookie management,
                          auto Referer, random delay, Sec-Fetch-* updates
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
        """
        初始化隐身会话 / Initialize stealth session
        
        Args:
            browser (str): 浏览器类型，决定使用的 User-Agent 和请求头模板
                          / Browser type, determines User-Agent and header template
                - 'chrome': Chrome 131（推荐，最完整的请求头，15 个）/ Recommended, 15 headers
                - 'firefox': Firefox 133（含 Sec-GPC 隐私头，12 个）/ Includes privacy headers
                - 'safari': Safari 18（macOS 风格，5 个）/ macOS style
                - 'edge': Edge 131（类似 Chrome，14 个）/ Similar to Chrome
                - 'chrome_mobile': Chrome Mobile（Android，10 个）/ Android mobile
            cf_proxies (str, optional): Workers 代理地址
                                       / Workers proxy address
                - 如 "https://cfspider.violetqqcom.workers.dev"
                - 不指定则直接请求目标 URL / If not specified, requests directly
                - UUID 自动从 Workers 获取 / UUID auto-fetched from Workers
            uuid (str, optional): VLESS UUID（可选，不填则自动获取）
                                 / VLESS UUID (optional, auto-fetched if not provided)
            delay (tuple, optional): 请求间随机延迟范围（秒）
                                    / Random delay range between requests (seconds)
                - 如 (1, 3) 表示每次请求前随机等待 1-3 秒
                - e.g., (1, 3) means random wait 1-3 seconds before each request
                - 第一次请求不会延迟 / First request won't be delayed
            auto_referer (bool): 是否自动添加 Referer（默认 True）
                                / Whether to auto-add Referer (default: True)
            static_ip (bool): 是否使用固定 IP 模式（默认 False）
                             / Whether to use static IP mode (default False)
            two_proxy (str, optional): 第二层代理配置
                                      / Second layer proxy configuration
                格式：host:port:user:pass 或 host:port
            **kwargs: 保留参数，用于未来扩展 / Reserved for future extensions
        
        Example:
            >>> session = cfspider.StealthSession(
            ...     browser='chrome',
            ...     cf_proxies='https://cfspider.violetqqcom.workers.dev',
            ...     delay=(1, 3),
            ...     auto_referer=True
            ... )
        """
        self.browser = browser
        self.cf_proxies = cf_proxies
        self.uuid = uuid
        self.delay = delay
        self.auto_referer = auto_referer
        self.static_ip = static_ip
        self.two_proxy = two_proxy
        self.last_url = None
        self.request_count = 0
        self._extra_kwargs = kwargs
        
        # 获取固定的浏览器请求头
        self._base_headers = get_stealth_headers(browser)
        
        # Cookie 管理
        self._cookies = {}
    
    def _prepare_headers(self, url: str, headers: Dict = None) -> Dict:
        """准备请求头"""
        final_headers = self._base_headers.copy()
        
        # 添加 Referer
        if self.auto_referer and self.last_url:
            parsed_current = urlparse(url)
            parsed_last = urlparse(self.last_url)
            
            if parsed_current.netloc == parsed_last.netloc:
                # 同站跳转
                final_headers['Referer'] = self.last_url
                final_headers = update_sec_fetch_headers(final_headers, 'same-origin')
            else:
                # 跨站跳转
                final_headers['Referer'] = self.last_url
                final_headers = update_sec_fetch_headers(final_headers, 'cross-site')
        
        # 合并自定义请求头
        if headers:
            final_headers.update(headers)
        
        return final_headers
    
    def _apply_delay(self):
        """应用请求延迟"""
        if self.delay and self.request_count > 0:
            random_delay(self.delay[0], self.delay[1])
    
    def _update_cookies(self, response):
        """
        从响应中更新 cookies
        
        支持两种方式：
        1. 从 response.cookies 获取（直接请求时）
        2. 从响应头 Set-Cookie 解析（通过 Workers 代理时）
        """
        # 方式1：从 response.cookies 获取
        if hasattr(response, 'cookies'):
            try:
                for cookie in response.cookies:
                    if hasattr(cookie, 'name') and hasattr(cookie, 'value'):
                        self._cookies[cookie.name] = cookie.value
            except TypeError:
                if hasattr(response.cookies, 'items'):
                    for name, value in response.cookies.items():
                        self._cookies[name] = value
        
        # 方式2：从响应头 Set-Cookie 解析（Workers 代理时需要）
        if hasattr(response, 'headers'):
            self._parse_set_cookie_headers(response.headers)
    
    def _parse_set_cookie_headers(self, headers):
        """从响应头中解析 Set-Cookie"""
        set_cookie_headers = []
        
        if hasattr(headers, 'get_all'):
            set_cookie_headers = headers.get_all('set-cookie') or []
        elif hasattr(headers, 'getlist'):
            set_cookie_headers = headers.getlist('set-cookie') or []
        else:
            cookie_header = headers.get('set-cookie', '')
            if cookie_header:
                import re
                parts = re.split(r',\s*(?=[A-Za-z_][A-Za-z0-9_-]*=)', cookie_header)
                set_cookie_headers = [p.strip() for p in parts if p.strip()]
        
        for cookie_str in set_cookie_headers:
            self._parse_single_cookie(cookie_str)
    
    def _parse_single_cookie(self, cookie_str):
        """解析单个 Set-Cookie 字符串"""
        if not cookie_str:
            return
        parts = cookie_str.split(';')
        if not parts:
            return
        first_part = parts[0].strip()
        if '=' not in first_part:
            return
        name, value = first_part.split('=', 1)
        name = name.strip()
        value = value.strip()
        if name:
            self._cookies[name] = value
    
    def get(self, url: str, **kwargs) -> Any:
        """
        发送 GET 请求 / Send GET request
        
        Args:
            url (str): 目标 URL / Target URL
            **kwargs: 其他参数 / Other parameters
                - impersonate (str): TLS 指纹模拟 / TLS fingerprint impersonation
                - http2 (bool): 启用 HTTP/2 / Enable HTTP/2
                - 其他参数与 requests 库兼容 / Compatible with requests library
        
        Returns:
            CFSpiderResponse: 响应对象 / Response object
        """
        from .api import get as _get
        
        self._apply_delay()
        
        headers = self._prepare_headers(url, kwargs.pop('headers', None))
        
        # 添加 Cookie
        cookies = kwargs.pop('cookies', {})
        cookies.update(self._cookies)
        
        # 提取可覆盖的参数，避免重复传递
        uuid = kwargs.pop('uuid', None) or self.uuid
        cf_proxies = kwargs.pop('cf_proxies', None) or self.cf_proxies
        static_ip = kwargs.pop('static_ip', None)
        if static_ip is None:
            static_ip = getattr(self, 'static_ip', False)
        two_proxy = kwargs.pop('two_proxy', None) or getattr(self, 'two_proxy', None)
        
        response = _get(
            url,
            cf_proxies=cf_proxies,
            uuid=uuid,
            static_ip=static_ip,
            two_proxy=two_proxy,
            headers=headers,
            cookies=cookies,
            **kwargs
        )
        
        self._update_cookies(response)
        self.last_url = url
        self.request_count += 1
        
        return response
    
    def post(self, url: str, **kwargs) -> Any:
        """
        发送 POST 请求 / Send POST request
        
        Args:
            url (str): 目标 URL / Target URL
            **kwargs: 其他参数 / Other parameters
        
        Returns:
            CFSpiderResponse: 响应对象 / Response object
        """
        from .api import post as _post
        
        self._apply_delay()
        
        headers = self._prepare_headers(url, kwargs.pop('headers', None))
        
        # POST 请求的特殊头
        if 'json' in kwargs or 'data' in kwargs:
            headers.setdefault('Content-Type', 'application/x-www-form-urlencoded')
        
        cookies = kwargs.pop('cookies', {})
        cookies.update(self._cookies)
        
        # 提取可覆盖的参数，避免重复传递
        uuid = kwargs.pop('uuid', None) or self.uuid
        cf_proxies = kwargs.pop('cf_proxies', None) or self.cf_proxies
        static_ip = kwargs.pop('static_ip', None)
        if static_ip is None:
            static_ip = getattr(self, 'static_ip', False)
        two_proxy = kwargs.pop('two_proxy', None) or getattr(self, 'two_proxy', None)
        
        response = _post(
            url,
            cf_proxies=cf_proxies,
            uuid=uuid,
            static_ip=static_ip,
            two_proxy=two_proxy,
            headers=headers,
            cookies=cookies,
            **kwargs
        )
        
        self._update_cookies(response)
        self.last_url = url
        self.request_count += 1
        
        return response
    
    def put(self, url: str, **kwargs) -> Any:
        """发送 PUT 请求 / Send PUT request"""
        from .api import put as _put
        
        self._apply_delay()
        headers = self._prepare_headers(url, kwargs.pop('headers', None))
        cookies = kwargs.pop('cookies', {})
        cookies.update(self._cookies)
        
        # 提取可覆盖的参数，避免重复传递
        uuid = kwargs.pop('uuid', None) or self.uuid
        cf_proxies = kwargs.pop('cf_proxies', None) or self.cf_proxies
        static_ip = kwargs.pop('static_ip', None)
        if static_ip is None:
            static_ip = getattr(self, 'static_ip', False)
        two_proxy = kwargs.pop('two_proxy', None) or getattr(self, 'two_proxy', None)
        
        response = _put(
            url,
            cf_proxies=cf_proxies,
            uuid=uuid,
            static_ip=static_ip,
            two_proxy=two_proxy,
            headers=headers,
            cookies=cookies,
            **kwargs
        )
        self._update_cookies(response)
        self.last_url = url
        self.request_count += 1
        return response
    
    def delete(self, url: str, **kwargs) -> Any:
        """发送 DELETE 请求 / Send DELETE request"""
        from .api import delete as _delete
        
        self._apply_delay()
        headers = self._prepare_headers(url, kwargs.pop('headers', None))
        cookies = kwargs.pop('cookies', {})
        cookies.update(self._cookies)
        
        # 提取可覆盖的参数，避免重复传递
        uuid = kwargs.pop('uuid', None) or self.uuid
        cf_proxies = kwargs.pop('cf_proxies', None) or self.cf_proxies
        static_ip = kwargs.pop('static_ip', None)
        if static_ip is None:
            static_ip = getattr(self, 'static_ip', False)
        two_proxy = kwargs.pop('two_proxy', None) or getattr(self, 'two_proxy', None)
        
        response = _delete(
            url,
            cf_proxies=cf_proxies,
            uuid=uuid,
            static_ip=static_ip,
            two_proxy=two_proxy,
            headers=headers,
            cookies=cookies,
            **kwargs
        )
        self._update_cookies(response)
        self.last_url = url
        self.request_count += 1
        return response
    
    def head(self, url: str, **kwargs) -> Any:
        """发送 HEAD 请求 / Send HEAD request"""
        from .api import head as _head
        
        self._apply_delay()
        headers = self._prepare_headers(url, kwargs.pop('headers', None))
        cookies = kwargs.pop('cookies', {})
        cookies.update(self._cookies)
        
        # 提取可覆盖的参数，避免重复传递
        uuid = kwargs.pop('uuid', None) or self.uuid
        cf_proxies = kwargs.pop('cf_proxies', None) or self.cf_proxies
        static_ip = kwargs.pop('static_ip', None)
        if static_ip is None:
            static_ip = getattr(self, 'static_ip', False)
        two_proxy = kwargs.pop('two_proxy', None) or getattr(self, 'two_proxy', None)
        
        response = _head(
            url,
            cf_proxies=cf_proxies,
            uuid=uuid,
            static_ip=static_ip,
            two_proxy=two_proxy,
            headers=headers,
            cookies=cookies,
            **kwargs
        )
        self._update_cookies(response)
        self.last_url = url
        self.request_count += 1
        return response
    
    def get_cookies(self) -> Dict[str, str]:
        """获取当前会话的所有 Cookie"""
        return self._cookies.copy()
    
    def set_cookie(self, name: str, value: str):
        """设置 Cookie"""
        self._cookies[name] = value
    
    def clear_cookies(self):
        """清除所有 Cookie"""
        self._cookies.clear()
    
    def get_headers(self) -> Dict[str, str]:
        """获取当前会话的基础请求头"""
        return self._base_headers.copy()
    
    def close(self):
        """关闭会话"""
        pass  # 无需清理，每次请求都是独立的
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


# 支持的浏览器列表
SUPPORTED_BROWSERS = list(BROWSER_PROFILES.keys())


def get_supported_browsers() -> List[str]:
    """获取支持的浏览器列表"""
    return SUPPORTED_BROWSERS.copy()

