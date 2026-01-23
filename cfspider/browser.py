"""
CFspider 浏览器模块
基于 Playwright 封装，支持通过 Cloudflare Workers 代理浏览器流量
"""

from urllib.parse import urlparse, parse_qs, unquote
from .vless_client import LocalVlessProxy


def parse_vless_link(vless_link):
    """
    解析 VLESS 链接
    
    支持格式:
        vless://uuid@host:port?type=ws&path=/xxx#name
        vless://uuid@host:port?path=%2Fxxx
        vless://uuid@host:port
    
    Args:
        vless_link: VLESS 链接字符串
        
    Returns:
        dict: 包含 uuid, host, port, path 的字典，解析失败返回 None
    """
    if not vless_link or not vless_link.startswith('vless://'):
        return None
    
    try:
        # 移除 vless:// 前缀
        link = vless_link[8:]
        
        # 分离 fragment（#后面的名称）
        if '#' in link:
            link = link.split('#')[0]
        
        # 分离 query string
        query_str = ""
        if '?' in link:
            link, query_str = link.split('?', 1)
        
        # 解析 uuid@host:port
        if '@' not in link:
            return None
        
        uuid, host_port = link.split('@', 1)
        
        # 解析 host:port
        if ':' in host_port:
            host, port = host_port.rsplit(':', 1)
            port = int(port)
        else:
            host = host_port
            port = 443
        
        # 解析 query 参数
        path = "/"
        if query_str:
            params = parse_qs(query_str)
            if 'path' in params:
                path = unquote(params['path'][0])
        
        return {
            'uuid': uuid,
            'host': host,
            'port': port,
            'path': path
        }
    except Exception:
        return None

try:
    from playwright.sync_api import sync_playwright, Page, Browser as PlaywrightBrowser
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    Page = None
    PlaywrightBrowser = None


class BrowserNotInstalledError(Exception):
    """浏览器未安装错误"""
    pass


class PlaywrightNotInstalledError(Exception):
    """Playwright 未安装错误"""
    pass


class Browser:
    """
    CFspider 浏览器类 / CFspider Browser class
    
    封装 Playwright，支持通过 Cloudflare Workers (edgetunnel) 代理浏览器流量
    Wraps Playwright with Cloudflare Workers (edgetunnel) proxy support
    
    Example:
        >>> import cfspider
        >>> 
        >>> # 简化用法：只需 Workers 地址（自动获取 UUID）
        >>> browser = cfspider.Browser(cf_proxies="https://cfspider.violetqqcom.workers.dev")
        >>> html = browser.html("https://example.com")
        >>> browser.close()
        >>> 
        >>> # 直接使用（无代理）
        >>> browser = cfspider.Browser()
        >>> html = browser.html("https://example.com")
        >>> browser.close()
    """
    
    def __init__(self, cf_proxies=None, headless=True, timeout=30, uuid=None):
        """
        初始化浏览器 / Initialize browser
        
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
            
        Examples:
            >>> # 简化用法（推荐）
            >>> browser = Browser(cf_proxies="https://cfspider.violetqqcom.workers.dev")
            >>> 
            >>> # 手动指定 UUID
            >>> browser = Browser(
            ...     cf_proxies="https://cfspider.violetqqcom.workers.dev",
            ...     uuid="c373c80c-58e4-4e64-8db5-40096905ec58"
            ... )
            >>> 
            >>> # 使用 VLESS 链接
            >>> browser = Browser(cf_proxies="vless://uuid@v2.example.com:443?path=/")
            >>> 
            >>> # 使用 HTTP 代理
            >>> browser = Browser(cf_proxies="127.0.0.1:8080")
        """
        if not PLAYWRIGHT_AVAILABLE:
            raise PlaywrightNotInstalledError(
                "Playwright 未安装，请运行: pip install cfspider[browser]"
            )
        
        self.cf_proxies = cf_proxies
        self.headless = headless
        self.timeout = timeout
        self._vless_proxy = None
        
        # 解析代理地址
        proxy_url = None
        if cf_proxies:
            # 1. 检查是否是 VLESS 链接
            vless_info = parse_vless_link(cf_proxies)
            if vless_info:
                # 使用 VLESS 链接
                ws_url = f"wss://{vless_info['host']}{vless_info['path']}"
                self._vless_proxy = LocalVlessProxy(ws_url, vless_info['uuid'])
                port = self._vless_proxy.start()
                proxy_url = f"http://127.0.0.1:{port}"
            # 2. HTTP/SOCKS5 代理格式
            elif cf_proxies.startswith('http://') or cf_proxies.startswith('https://') or cf_proxies.startswith('socks5://'):
                # 如果是 CFspider Workers URL，尝试获取 UUID
                if 'workers.dev' in cf_proxies or not uuid:
                    uuid = uuid or self._get_workers_uuid(cf_proxies)
                if uuid:
                    # 使用 VLESS 代理
                    hostname = cf_proxies.replace('https://', '').replace('http://', '').split('/')[0]
                    ws_url = f'wss://{hostname}/{uuid}'
                    self._vless_proxy = LocalVlessProxy(ws_url, uuid)
                    port = self._vless_proxy.start()
                    proxy_url = f"http://127.0.0.1:{port}"
                else:
                    # 直接使用 HTTP 代理
                    proxy_url = cf_proxies
            # 3. IP:PORT 格式
            elif ':' in cf_proxies and cf_proxies.replace('.', '').replace(':', '').isdigit():
                proxy_url = f"http://{cf_proxies}"
            # 4. 域名方式（尝试自动获取 UUID）
            else:
                hostname = cf_proxies.replace('wss://', '').replace('ws://', '').split('/')[0]
                uuid = uuid or self._get_workers_uuid(f"https://{hostname}")
                if uuid:
                    ws_url = f'wss://{hostname}/{uuid}'
                    self._vless_proxy = LocalVlessProxy(ws_url, uuid)
                    port = self._vless_proxy.start()
                    proxy_url = f"http://127.0.0.1:{port}"
                else:
                    proxy_url = f"http://{cf_proxies}"
    
    def _get_workers_uuid(self, workers_url):
        """从 Workers 获取 UUID / Get UUID from Workers"""
        import requests
        import re
        
        try:
            # 尝试从 /api/config 获取
            config_url = f"{workers_url.rstrip('/')}/api/config"
            resp = requests.get(config_url, timeout=10)
            if resp.status_code == 200:
                config = resp.json()
                return config.get('uuid')
        except:
            pass
        
        try:
            # 尝试从首页 HTML 解析
            resp = requests.get(workers_url, timeout=10)
            if resp.status_code == 200:
                match = re.search(r'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', resp.text)
                if match:
                    return match.group(1).lower()
        except:
            pass
        
        return None
        
        # 启动 Playwright
        self._playwright = sync_playwright().start()
        
        # 启动浏览器
        launch_options = {"headless": headless}
        if proxy_url:
            launch_options["proxy"] = {"server": proxy_url}
        
        try:
            self._browser = self._playwright.chromium.launch(**launch_options)
        except Exception as e:
            if self._vless_proxy:
                self._vless_proxy.stop()
            self._playwright.stop()
            if "Executable doesn't exist" in str(e):
                raise BrowserNotInstalledError(
                    "Chromium 浏览器未安装，请运行: cfspider install"
                )
            raise
        
        # 创建默认上下文
        self._context = self._browser.new_context(
            ignore_https_errors=True
        )
        self._context.set_default_timeout(timeout * 1000)
    
    def get(self, url):
        """
        打开页面并返回 Page 对象
        
        Args:
            url: 目标 URL
            
        Returns:
            Page: Playwright Page 对象，可用于自动化操作
        """
        page = self._context.new_page()
        page.goto(url, wait_until="networkidle")
        return page
    
    def html(self, url, wait_until="domcontentloaded"):
        """
        获取页面渲染后的 HTML
        
        Args:
            url: 目标 URL
            wait_until: 等待策略，可选 "load", "domcontentloaded", "networkidle"
            
        Returns:
            str: 渲染后的 HTML 内容
        """
        page = self._context.new_page()
        try:
            page.goto(url, wait_until=wait_until)
            return page.content()
        finally:
            page.close()
    
    def screenshot(self, url, path=None, full_page=False):
        """
        页面截图
        
        Args:
            url: 目标 URL
            path: 保存路径，如 "screenshot.png"
            full_page: 是否截取整个页面，默认 False
            
        Returns:
            bytes: 截图的二进制数据
        """
        page = self._context.new_page()
        try:
            page.goto(url, wait_until="networkidle")
            return page.screenshot(path=path, full_page=full_page)
        finally:
            page.close()
    
    def pdf(self, url, path=None):
        """
        生成页面 PDF
        
        Args:
            url: 目标 URL
            path: 保存路径，如 "page.pdf"
            
        Returns:
            bytes: PDF 的二进制数据
            
        Note:
            PDF 生成仅在无头模式下可用
        """
        if not self.headless:
            raise ValueError("PDF 生成仅在无头模式 (headless=True) 下可用")
        
        page = self._context.new_page()
        try:
            page.goto(url, wait_until="networkidle")
            return page.pdf(path=path)
        finally:
            page.close()
    
    def execute_script(self, url, script):
        """
        在页面中执行 JavaScript
        
        Args:
            url: 目标 URL
            script: 要执行的 JavaScript 代码
            
        Returns:
            执行结果
        """
        page = self._context.new_page()
        try:
            page.goto(url, wait_until="networkidle")
            return page.evaluate(script)
        finally:
            page.close()
    
    def new_page(self):
        """
        创建新页面
        
        Returns:
            Page: 新的 Playwright Page 对象
        """
        return self._context.new_page()
    
    def close(self):
        """关闭浏览器和代理"""
        try:
            self._context.close()
        except:
            pass
        
        try:
            self._browser.close()
        except:
            pass
        
        try:
            self._playwright.stop()
        except:
            pass
        
        if self._vless_proxy:
            try:
                self._vless_proxy.stop()
            except:
                pass
    
    def __enter__(self):
        """支持 with 语句"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """支持 with 语句"""
        self.close()
        return False

