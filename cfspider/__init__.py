"""
CFspider - Cloudflare 代理 IP 池 Python 库

一个基于 Cloudflare Workers 的代理 IP 池库，提供：
- 同步/异步 HTTP 请求（兼容 requests/httpx）
- TLS 指纹模拟（基于 curl_cffi，支持 25+ 浏览器指纹）
- 隐身模式（自动添加完整浏览器请求头，避免反爬检测）
- 浏览器自动化（基于 Playwright，支持 VLESS 代理）
- IP 地图可视化（生成 Cyberpunk 风格的地图）
- 网页镜像（保存网页到本地，自动重写资源链接）

UUID 使用说明：
    需要 UUID 的方法（使用 VLESS 协议，支持双层代理 two_proxy）：
        - cfspider.get/post/... (使用 cf_proxies 时)
        - cfspider.Session
        - cfspider.StealthSession
        - cfspider.Browser (浏览器自动化，UUID 可自动获取)
        - cfspider.WebMirror (网页镜像)
    
    无需 UUID 的方法（使用 /proxy API）：
        - cfspider.AsyncSession
        - cfspider.aget/apost/...
        - cfspider.impersonate_get/post/...
        - cfspider.ImpersonateSession

快速开始：
    >>> import cfspider
    >>> 
    >>> # 自动创建 Workers（推荐）
    >>> workers = cfspider.make_workers(
    ...     api_token="your-api-token",
    ...     account_id="your-account-id"
    ... )
    >>> response = cfspider.get("https://httpbin.org/ip", cf_proxies=workers)
    >>> 
    >>> # 基本 GET 请求（无代理）
    >>> response = cfspider.get("https://httpbin.org/ip")
    >>> print(response.json())
    >>> 
    >>> # 使用 VLESS 代理（需要 UUID）
    >>> response = cfspider.get(
    ...     "https://httpbin.org/ip",
    ...     cf_proxies="https://your-workers.dev",
    ...     uuid="your-uuid"
    ... )
    >>> print(response.cf_colo)  # Cloudflare 节点代码
    >>> 
    >>> # 异步请求（无需 UUID）
    >>> async with cfspider.AsyncSession(cf_proxies="https://your-workers.dev") as session:
    ...     response = await session.get("https://httpbin.org/ip")
    >>> 
    >>> # TLS 指纹模拟（无需 UUID）
    >>> response = cfspider.impersonate_get(
    ...     "https://example.com",
    ...     impersonate="chrome131",
    ...     cf_proxies="https://your-workers.dev"
    ... )

版本信息：
    - 版本号: 1.8.6
    - 协议: Apache License 2.0
    - 文档: https://www.cfspider.com

依赖关系：
    必需：requests
    可选：
        - httpx[http2]: HTTP/2 和异步请求支持
        - curl_cffi: TLS 指纹模拟
        - playwright: 浏览器自动化
        - beautifulsoup4: 网页镜像
"""

from .api import (
    get, post, put, delete, head, options, patch, request,
    clear_map_records, get_map_collector, stop_vless_proxies
)
from .session import Session
from .cli import install_browser

# IP 地图可视化
from .ip_map import (
    IPMapCollector, generate_map_html, add_ip_record,
    get_collector as get_ip_collector, clear_records as clear_ip_records,
    COLO_COORDINATES
)

# 网页镜像
from .mirror import mirror, MirrorResult, WebMirror

# 批量请求
from .batch import batch, abatch, BatchResult, BatchItem

# 数据导出
from .export import export

# 本地代理服务器（支持双层代理）
from .proxy_server import (
    generate_vless_link,
    start_proxy_server,
    TwoProxyServer
)

# Workers 管理器（自动创建和管理 Workers）
from .workers_manager import (
    make_workers,
    list_workers,
    delete_workers,
    WorkersManager
)

# 异步 API（基于 httpx）
from .async_api import (
    aget, apost, aput, adelete, ahead, aoptions, apatch,
    arequest, astream,
    AsyncCFSpiderResponse, AsyncStreamResponse
)
from .async_session import AsyncSession

# TLS 指纹模拟 API（基于 curl_cffi）
from .impersonate import (
    impersonate_get, impersonate_post, impersonate_put,
    impersonate_delete, impersonate_head, impersonate_options,
    impersonate_patch, impersonate_request,
    ImpersonateSession, ImpersonateResponse,
    get_supported_browsers, SUPPORTED_BROWSERS
)

# 隐身模式（反爬虫规避）
from .stealth import (
    StealthSession,
    get_stealth_headers, get_random_browser_headers,
    random_delay, get_referer, update_sec_fetch_headers,
    BROWSER_PROFILES, SUPPORTED_BROWSERS as STEALTH_BROWSERS,
    CHROME_HEADERS, FIREFOX_HEADERS, SAFARI_HEADERS, EDGE_HEADERS, CHROME_MOBILE_HEADERS
)


# 延迟导入 Browser，避免强制依赖 playwright
def Browser(cf_proxies=None, headless=True, timeout=30, uuid=None):
    """
    创建浏览器实例 / Create browser instance
    
    封装 Playwright，支持通过 Cloudflare Workers 代理浏览器流量。
    Wraps Playwright with Cloudflare Workers proxy support.
    
    Args:
        cf_proxies (str, optional): 代理地址 / Proxy address
            - CFspider Workers URL（推荐）: "https://cfspider.violetqqcom.workers.dev"
              UUID 将自动从 Workers 获取 / UUID auto-fetched from Workers
            - VLESS 链接: "vless://uuid@host:port?path=/xxx#name"
            - HTTP 代理: "http://ip:port" 或 "ip:port"
            - SOCKS5 代理: "socks5://ip:port"
            不填则直接使用本地网络 / None for direct connection
        headless (bool): 是否无头模式，默认 True / Headless mode (default: True)
        timeout (int): 请求超时时间（秒），默认 30 / Timeout in seconds (default: 30)
        uuid (str, optional): VLESS UUID（可选，不填则自动获取）
                             / VLESS UUID (optional, auto-fetched)
        
    Returns:
        Browser: 浏览器实例 / Browser instance
        
    Example:
        >>> import cfspider
        >>> 
        >>> # 简化用法（推荐）：只需 Workers 地址，自动获取 UUID
        >>> browser = cfspider.Browser(
        ...     cf_proxies="https://cfspider.violetqqcom.workers.dev"
        ... )
        >>> html = browser.html("https://example.com")
        >>> browser.close()
        >>> 
        >>> # 手动指定 UUID
        >>> browser = cfspider.Browser(
        ...     cf_proxies="https://cfspider.violetqqcom.workers.dev",
        ...     uuid="c373c80c-58e4-4e64-8db5-40096905ec58"
        ... )
        >>> 
        >>> # 直接使用（无代理）
        >>> browser = cfspider.Browser()
    """
    from .browser import Browser as _Browser
    return _Browser(cf_proxies, headless, timeout, uuid)


def parse_vless_link(vless_link):
    """
    解析 VLESS 链接
    
    Args:
        vless_link: VLESS 链接字符串，如 "vless://uuid@host:port?path=/xxx#name"
        
    Returns:
        dict: 包含 uuid, host, port, path 的字典，解析失败返回 None
        
    Example:
        >>> import cfspider
        >>> info = cfspider.parse_vless_link("vless://abc123@v2.example.com:443?path=/ws#proxy")
        >>> print(info)
        {'uuid': 'abc123', 'host': 'v2.example.com', 'port': 443, 'path': '/ws'}
    """
    from .browser import parse_vless_link as _parse
    return _parse(vless_link)


class CFSpiderError(Exception):
    """
    CFspider 基础异常类
    
    所有 CFspider 相关的异常都继承自此类。
    
    Example:
        >>> try:
        ...     response = cfspider.get("https://invalid-url")
        ... except cfspider.CFSpiderError as e:
        ...     print(f"请求失败: {e}")
    """
    pass


class BrowserNotInstalledError(CFSpiderError):
    """
    浏览器未安装错误
    
    当尝试使用浏览器模式但 Chromium 未安装时抛出。
    
    解决方案：
        >>> import cfspider
        >>> cfspider.install_browser()  # 自动安装 Chromium
        
    或使用命令行：
        $ cfspider install
    """
    pass


class PlaywrightNotInstalledError(CFSpiderError):
    """
    Playwright 未安装错误
    
    当尝试使用浏览器模式但 Playwright 库未安装时抛出。
    
    解决方案：
        $ pip install playwright
    """
    pass


__version__ = "1.8.9"
__all__ = [
    # 同步 API (requests)
    "get", "post", "put", "delete", "head", "options", "patch", "request",
    "Session", "Browser", "install_browser", "parse_vless_link", "stop_vless_proxies",
    "CFSpiderError", "BrowserNotInstalledError", "PlaywrightNotInstalledError",
    # 异步 API (httpx)
    "aget", "apost", "aput", "adelete", "ahead", "aoptions", "apatch",
    "arequest", "astream",
    "AsyncSession", "AsyncCFSpiderResponse", "AsyncStreamResponse",
    # TLS 指纹模拟 API (curl_cffi)
    "impersonate_get", "impersonate_post", "impersonate_put",
    "impersonate_delete", "impersonate_head", "impersonate_options",
    "impersonate_patch", "impersonate_request",
    "ImpersonateSession", "ImpersonateResponse",
    "get_supported_browsers", "SUPPORTED_BROWSERS",
    # 隐身模式（反爬虫规避）
    "StealthSession",
    "get_stealth_headers", "get_random_browser_headers",
    "random_delay", "get_referer", "update_sec_fetch_headers",
    "BROWSER_PROFILES", "STEALTH_BROWSERS",
    "CHROME_HEADERS", "FIREFOX_HEADERS", "SAFARI_HEADERS", "EDGE_HEADERS", "CHROME_MOBILE_HEADERS",
    # IP 地图可视化
    "IPMapCollector", "generate_map_html", "add_ip_record",
    "get_ip_collector", "clear_ip_records", "COLO_COORDINATES",
    "clear_map_records", "get_map_collector",
    # 网页镜像
    "mirror", "MirrorResult", "WebMirror",
    # 批量请求
    "batch", "abatch", "BatchResult", "BatchItem",
    # 数据导出
    "export",
    # 本地代理服务器（双层代理）
    "generate_vless_link", "start_proxy_server", "TwoProxyServer",
    # Workers 管理器
    "make_workers", "list_workers", "delete_workers", "WorkersManager",
]
