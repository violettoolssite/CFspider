"""
CFspider 核心 API 模块

提供同步 HTTP 请求功能，支持：
- 通过 Cloudflare Workers VLESS 代理请求
- TLS 指纹模拟 (curl_cffi)
- HTTP/2 支持 (httpx)
- 隐身模式（完整浏览器请求头）
- IP 地图可视化
"""

import requests
import time
from urllib.parse import urlencode, quote, urlparse
from typing import Optional, Any

# 延迟导入 IP 地图模块
from . import ip_map

# 延迟导入 httpx，仅在需要 HTTP/2 时使用
_httpx = None

def _get_httpx():
    """延迟加载 httpx 模块"""
    global _httpx
    if _httpx is None:
        try:
            import httpx
            _httpx = httpx
        except ImportError:
            raise ImportError(
                "httpx is required for HTTP/2 support. "
                "Install it with: pip install httpx[http2]"
            )
    return _httpx


# 延迟导入 curl_cffi，仅在需要 TLS 指纹时使用
_curl_cffi = None

def _get_curl_cffi():
    """延迟加载 curl_cffi 模块"""
    global _curl_cffi
    if _curl_cffi is None:
        try:
            from curl_cffi import requests as curl_requests
            _curl_cffi = curl_requests
        except ImportError:
            raise ImportError(
                "curl_cffi is required for TLS fingerprint impersonation. "
                "Install it with: pip install curl_cffi"
            )
    return _curl_cffi


class CFSpiderResponse:
    """
    CFspider 响应对象
    
    封装 HTTP 响应，提供与 requests.Response 兼容的接口，
    并额外提供 Cloudflare 特有的信息（如节点代码、Ray ID）。
    
    Attributes:
        cf_colo (str): Cloudflare 数据中心代码（如 NRT=东京, SIN=新加坡, LAX=洛杉矶）
                       使用 Workers 代理时可用，表示请求经过的 CF 节点
        cf_ray (str): Cloudflare Ray ID，每个请求的唯一标识符
                      可用于调试和追踪请求
        text (str): 响应文本内容（自动解码）
        content (bytes): 响应原始字节内容
        status_code (int): HTTP 状态码（如 200, 404, 500）
        headers (dict): 响应头字典
        cookies: 响应 Cookie
        url (str): 最终请求的 URL（跟随重定向后）
        encoding (str): 响应编码
    
    Methods:
        json(**kwargs): 将响应解析为 JSON
        raise_for_status(): 当状态码非 2xx 时抛出 HTTPError
    
    Example:
        >>> response = cfspider.get("https://httpbin.org/ip", cf_proxies="...", uuid="...")
        >>> print(response.status_code)  # 200
        >>> print(response.cf_colo)      # NRT (东京节点)
        >>> data = response.json()
        >>> print(data['origin'])        # Cloudflare IP
    """
    
    def __init__(self, response, cf_colo=None, cf_ray=None):
        """
        初始化响应对象
        
        Args:
            response: 原始 requests/httpx/curl_cffi 响应对象
            cf_colo: Cloudflare 数据中心代码（从响应头获取）
            cf_ray: Cloudflare Ray ID（从响应头获取）
        """
        self._response = response
        self.cf_colo = cf_colo
        self.cf_ray = cf_ray
    
    @property
    def text(self) -> str:
        """响应文本内容（自动解码）"""
        return self._response.text
    
    @property
    def content(self) -> bytes:
        """响应原始字节内容"""
        return self._response.content
    
    @property
    def status_code(self) -> int:
        """HTTP 状态码"""
        return self._response.status_code
    
    @property
    def headers(self):
        """响应头字典"""
        return self._response.headers
    
    @property
    def cookies(self):
        """响应 Cookie"""
        return self._response.cookies
    
    @property
    def url(self) -> str:
        """最终请求的 URL（跟随重定向后）"""
        return self._response.url
    
    @property
    def encoding(self) -> Optional[str]:
        """响应编码"""
        return self._response.encoding
    
    @encoding.setter
    def encoding(self, value: str):
        """设置响应编码"""
        self._response.encoding = value
    
    def json(self, **kwargs) -> Any:
        """
        将响应解析为 JSON
        
        Args:
            **kwargs: 传递给 json.loads() 的参数
            
        Returns:
            解析后的 JSON 数据（dict 或 list）
            
        Raises:
            JSONDecodeError: 当响应不是有效的 JSON 时
        """
        return self._response.json(**kwargs)
    
    def raise_for_status(self):
        """
        当状态码非 2xx 时抛出 HTTPError
        
        Raises:
            requests.HTTPError: 当状态码表示错误时
        """
        self._response.raise_for_status()
    
    # ========== 数据提取方法 ==========
    
    def _get_extractor(self):
        """获取数据提取器（延迟初始化）"""
        if not hasattr(self, '_extractor') or self._extractor is None:
            from .extract import Extractor
            content_type = "json" if self._is_json_response() else "html"
            self._extractor = Extractor(self.text, content_type)
        return self._extractor
    
    def _is_json_response(self) -> bool:
        """判断是否是 JSON 响应"""
        content_type = self.headers.get("content-type", "")
        return "application/json" in content_type.lower()
    
    def find(self, selector: str, attr: str = None, strip: bool = True, 
             regex: str = None, parser=None):
        """
        查找第一个匹配的元素（最简单的 API）
        
        自动识别选择器类型：
        - 以 $ 开头：JSONPath
        - 以 // 开头：XPath
        - 其他：CSS 选择器
        
        Args:
            selector: 选择器（CSS/XPath/JSONPath）
            attr: 要提取的属性名
            strip: 是否去除空白
            regex: 正则表达式提取
            parser: 自定义解析函数
            
        Returns:
            匹配的文本或属性值
            
        Example:
            >>> response.find("h1")          # CSS
            >>> response.find("//h1/text()") # XPath
            >>> response.find("$.title")     # JSONPath
        """
        return self._get_extractor().find(selector, attr=attr, strip=strip, 
                                          regex=regex, parser=parser)
    
    def find_all(self, selector: str, attr: str = None, strip: bool = True):
        """
        查找所有匹配的元素
        
        Args:
            selector: 选择器（CSS/XPath/JSONPath）
            attr: 要提取的属性名
            strip: 是否去除空白
            
        Returns:
            匹配的文本或属性值列表
        """
        return self._get_extractor().find_all(selector, attr=attr, strip=strip)
    
    def css(self, selector: str, attr: str = None, html: bool = False, strip: bool = True):
        """
        使用 CSS 选择器提取第一个匹配元素
        
        Args:
            selector: CSS 选择器
            attr: 要提取的属性名
            html: 是否返回 HTML 而非文本
            strip: 是否去除空白
            
        Returns:
            匹配元素的文本、属性或 HTML
        """
        return self._get_extractor().css(selector, attr=attr, html=html, strip=strip)
    
    def css_all(self, selector: str, attr: str = None, html: bool = False, strip: bool = True):
        """
        使用 CSS 选择器提取所有匹配元素
        
        Args:
            selector: CSS 选择器
            attr: 要提取的属性名
            html: 是否返回 HTML 而非文本
            strip: 是否去除空白
            
        Returns:
            匹配元素的文本、属性或 HTML 列表
        """
        return self._get_extractor().css_all(selector, attr=attr, html=html, strip=strip)
    
    def css_one(self, selector: str):
        """
        返回第一个匹配的 Element 对象，支持链式操作
        
        Args:
            selector: CSS 选择器
            
        Returns:
            Element 对象
        """
        return self._get_extractor().css_one(selector)
    
    def xpath(self, expression: str):
        """
        使用 XPath 表达式提取第一个匹配
        
        Args:
            expression: XPath 表达式
            
        Returns:
            匹配的文本或属性值
        """
        return self._get_extractor().xpath(expression)
    
    def xpath_all(self, expression: str):
        """
        使用 XPath 表达式提取所有匹配
        
        Args:
            expression: XPath 表达式
            
        Returns:
            匹配的文本或属性值列表
        """
        return self._get_extractor().xpath_all(expression)
    
    def xpath_one(self, expression: str):
        """
        返回第一个匹配的 Element 对象
        
        Args:
            expression: XPath 表达式
            
        Returns:
            Element 对象
        """
        return self._get_extractor().xpath_one(expression)
    
    def jpath(self, expression: str):
        """
        使用 JSONPath 表达式提取第一个匹配
        
        Args:
            expression: JSONPath 表达式（如 $.data.items[0].name）
            
        Returns:
            匹配的值
        """
        return self._get_extractor().jpath(expression)
    
    def jpath_all(self, expression: str):
        """
        使用 JSONPath 表达式提取所有匹配
        
        Args:
            expression: JSONPath 表达式
            
        Returns:
            匹配的值列表
        """
        return self._get_extractor().jpath_all(expression)
    
    def pick(self, **fields):
        """
        批量提取多个字段
        
        Args:
            **fields: 字段名=选择器 的映射
                - 字符串：CSS 选择器，提取文本
                - 元组 (selector, attr)：提取属性
                - 元组 (selector, attr, converter)：提取并转换
                
        Returns:
            ExtractResult 字典，支持直接保存
            
        Example:
            >>> data = response.pick(
            ...     title="h1",
            ...     links=("a", "href"),
            ...     price=(".price", "text", float),
            ... )
            >>> data.save("output.csv")
        """
        result = self._get_extractor().pick(**fields)
        result.url = str(self.url)
        return result
    
    def extract(self, rules: dict):
        """
        使用规则字典提取数据（支持前缀指定类型）
        
        Args:
            rules: 字段名到选择器的映射
                选择器可以带前缀指定类型：
                - "css:h1.title" 或直接 "h1.title"
                - "xpath://a/@href"
                - "jsonpath:$.data.name"
                
        Returns:
            ExtractResult 字典
        """
        result = self._get_extractor().extract(rules)
        result.url = str(self.url)
        return result
    
    def save(self, filepath: str, encoding: str = "utf-8"):
        """
        保存响应内容到文件
        
        Args:
            filepath: 输出文件路径
            encoding: 文件编码（仅用于文本内容）
            
        Returns:
            输出文件的绝对路径
        """
        from .export import save_response
        return save_response(self.content, filepath, encoding=encoding)


def request(method, url, cf_proxies=None, uuid=None, http2=False, impersonate=None, 
             map_output=False, map_file="cfspider_map.html", 
             stealth=False, stealth_browser='chrome', delay=None,
             static_ip=False, **kwargs):
    """
    发送 HTTP 请求
    
    通过 CFspider Workers VLESS 代理发送请求，完全隐藏 Cloudflare 特征。
    
    Args:
        method: HTTP 方法（GET, POST, PUT, DELETE, HEAD, OPTIONS, PATCH）
        
        url: 目标 URL，必须包含协议（如 https://）
        
        cf_proxies: CFspider Workers 地址（可选）
            如 "https://cfspider.violetqqcom.workers.dev"
            不填写时直接请求，不使用代理
        
        uuid: VLESS UUID（可选）
            不填写会自动从 Workers 获取
        
        static_ip: 是否使用固定 IP（默认 False）
            - False: 每次请求获取新的出口 IP（适合大规模采集）
            - True: 保持使用同一个 IP（适合需要会话一致性的场景）
        
        http2: 是否启用 HTTP/2 协议（默认 False）
        
        impersonate: TLS 指纹模拟（可选）
            可选值: chrome131, safari18_0, firefox133, edge101 等
        
        map_output: 是否生成 IP 地图 HTML 文件（默认 False）
        
        map_file: 地图输出文件名（默认 "cfspider_map.html"）
        
        stealth: 是否启用隐身模式（默认 False）
            自动添加 15+ 个完整浏览器请求头
        
        stealth_browser: 隐身模式浏览器类型（默认 'chrome'）
            可选值: chrome, firefox, safari, edge, chrome_mobile
        
        delay: 请求前的随机延迟范围（秒），如 (1, 3)
        
        **kwargs: 其他参数，与 requests 库完全兼容
            - params: URL 查询参数
            - headers: 自定义请求头
            - data: 表单数据
            - json: JSON 数据
            - cookies: Cookie
            - timeout: 超时时间（秒），默认 30
    
    Returns:
        CFSpiderResponse: 响应对象 / Response object
            - text: 响应文本 / Response text
            - content: 响应字节 / Response bytes
            - json(): 解析 JSON / Parse JSON
            - status_code: HTTP 状态码 / HTTP status code
            - headers: 响应头 / Response headers
    
    Examples:
        >>> import cfspider
        >>> 
        >>> # 基本 GET 请求（无代理）
        >>> response = cfspider.get("https://httpbin.org/ip")
        >>> print(response.json())
        >>> 
        >>> # 使用 Workers VLESS 代理（自动获取 UUID，每次新 IP）
        >>> response = cfspider.get(
        ...     "https://httpbin.org/ip",
        ...     cf_proxies="https://cfspider.violetqqcom.workers.dev"
        ... )
        >>> print(response.json())  # 出口 IP
        >>> 
        >>> # 多次请求自动获取不同 IP
        >>> for i in range(5):
        ...     response = cfspider.get(
        ...         "https://httpbin.org/ip",
        ...         cf_proxies="https://cfspider.violetqqcom.workers.dev"
        ...     )
        ...     print(response.json()['origin'])  # 每次都是不同 IP
    """
    # 应用随机延迟
    if delay:
        from .stealth import random_delay
        random_delay(delay[0], delay[1])
    
    # 如果指定了 cf_proxies，使用 VLESS 代理
    if cf_proxies:
        return _request_vless(
            method, url, cf_proxies, uuid,
            http2=http2, impersonate=impersonate,
            map_output=map_output, map_file=map_file,
            stealth=stealth, stealth_browser=stealth_browser,
            static_ip=static_ip,
            **kwargs
        )
    
    # 没有指定代理，直接请求
    params = kwargs.pop("params", None)
    headers = kwargs.pop("headers", {})
    
    # 如果启用隐身模式，添加完整的浏览器请求头
    if stealth:
        from .stealth import get_stealth_headers
        stealth_headers = get_stealth_headers(stealth_browser)
        final_headers = stealth_headers.copy()
        final_headers.update(headers)
        headers = final_headers
    
    data = kwargs.pop("data", None)
    json_data = kwargs.pop("json", None)
    cookies = kwargs.pop("cookies", None)
    timeout = kwargs.pop("timeout", 30)
    
    # 记录请求开始时间
    start_time = time.time()
    
    # 如果指定了 impersonate，使用 curl_cffi
    if impersonate:
        curl_requests = _get_curl_cffi()
        response = curl_requests.request(
            method,
            url,
            params=params,
            headers=headers,
            data=data,
            json=json_data,
            cookies=cookies,
            timeout=timeout,
            impersonate=impersonate,
            **kwargs
        )
        resp = CFSpiderResponse(response)
        _handle_map_output(resp, url, start_time, map_output, map_file)
        return resp
    
    # 如果启用 HTTP/2，使用 httpx
    if http2:
        httpx = _get_httpx()
        with httpx.Client(http2=True, timeout=timeout) as client:
            response = client.request(
                method,
                url,
                params=params,
                headers=headers,
                data=data,
                json=json_data,
                cookies=cookies,
                **kwargs
            )
            resp = CFSpiderResponse(response)
            _handle_map_output(resp, url, start_time, map_output, map_file)
            return resp
    
    # 默认使用 requests
    resp = requests.request(
        method,
        url,
        params=params,
        headers=headers,
        data=data,
        json=json_data,
        cookies=cookies,
        timeout=timeout,
        **kwargs
    )
    response = CFSpiderResponse(resp)
    _handle_map_output(response, url, start_time, map_output, map_file)
    return response


def _handle_map_output(response, url, start_time, map_output, map_file):
    """处理 IP 地图输出"""
    if not map_output:
        return
    
    # 计算响应时间
    response_time = (time.time() - start_time) * 1000  # 毫秒
    
    # 收集 IP 记录
    ip_map.add_ip_record(
        url=url,
        ip=None,
        cf_colo=getattr(response, 'cf_colo', None),
        cf_ray=getattr(response, 'cf_ray', None),
        status_code=response.status_code,
        response_time=response_time
    )
    
    # 生成地图 HTML
    ip_map.generate_map_html(output_file=map_file)


# VLESS 本地代理缓存
_vless_proxy_cache = {}

# Workers 配置缓存
_workers_config_cache = {}


def _get_workers_config(cf_proxies):
    """
    从 Workers 获取配置（UUID、new_ip 等）
    
    返回:
        dict: {
            'uuid': str,
            'host': str,
            'new_ip': bool,
            ...
        }
    """
    # 解析 Workers 地址
    parsed = urlparse(cf_proxies)
    if parsed.scheme:
        host = parsed.netloc or parsed.path.split('/')[0]
    else:
        host = cf_proxies.split('/')[0]
    
    # 检查缓存
    if host in _workers_config_cache:
        return _workers_config_cache[host]
    
    # 尝试从 Workers API 获取配置
    try:
        workers_url = f"https://{host}"
        resp = requests.get(f"{workers_url}/api/config", timeout=10)
        if resp.status_code == 200:
            config = resp.json()
            config['host'] = host
            _workers_config_cache[host] = config
            return config
    except:
        pass
    
    # 尝试从 /api/uuid 获取（兼容旧版本）
    try:
        workers_url = f"https://{host}"
        resp = requests.get(f"{workers_url}/api/uuid", timeout=10)
        if resp.status_code == 200:
            config = resp.json()
            config['host'] = host
            if 'new_ip' not in config:
                config['new_ip'] = True  # 默认启用
            _workers_config_cache[host] = config
            return config
    except:
        pass
    
    # 如果获取失败，尝试从首页 HTML 解析 UUID
    try:
        workers_url = f"https://{host}"
        resp = requests.get(workers_url, timeout=10)
        if resp.status_code == 200:
            import re
            match = re.search(r'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', resp.text)
            if match:
                config = {
                    'uuid': match.group(1).lower(),
                    'host': host,
                    'new_ip': True  # 默认启用
                }
                _workers_config_cache[host] = config
                return config
    except:
        pass
    
    return None


def _request_vless(method, url, cf_proxies, uuid=None,
                   http2=False, impersonate=None,
                   map_output=False, map_file="cfspider_map.html",
                   stealth=False, stealth_browser='chrome',
                   static_ip=False, **kwargs):
    """
    使用 VLESS 协议发送请求
    
    通过 CFspider Workers 的 VLESS 协议代理请求，
    完全隐藏 Cloudflare 特征（CF-Ray、CF-Worker 等头）。
    
    Args:
        method: HTTP 方法
        url: 目标 URL
        cf_proxies: Workers 地址
        uuid: VLESS UUID（可选，不填则自动获取）
        static_ip: 是否使用固定 IP（默认 False）
            - False: 每次请求获取新的出口 IP（适合大规模采集）
            - True: 保持使用同一个 IP（适合需要会话一致性的场景）
        其他参数与 request() 相同
    """
    from .vless_client import LocalVlessProxy
    import uuid as uuid_mod
    
    # 获取 Workers 配置
    config = _get_workers_config(cf_proxies)
    if not config:
        raise ValueError(
            f"无法从 {cf_proxies} 获取配置。\n"
            "请确保 Workers 已正确部署。"
        )
    
    # 解析配置
    host = config.get('host')
    is_default_uuid = config.get('is_default_uuid', True)
    
    # 如果用户提供了 uuid，使用用户的
    # 如果用户没提供，尝试从 Workers 获取（仅默认 UUID 可获取）
    if not uuid:
        uuid = config.get('uuid')
    
    if not uuid:
        # Workers 配置了自定义 UUID，需要用户手动填写
        raise ValueError(
            f"Workers 配置了自定义 UUID，需要手动指定 uuid 参数。\n"
            "用法: cfspider.get(url, cf_proxies='...', uuid='你的UUID')\n"
            "提示: UUID 可在 Workers 界面或 Cloudflare Dashboard 中查看。"
        )
    
    # 构建 VLESS WebSocket URL: wss://host/uuid
    vless_url = f"wss://{host}/{uuid}"
    
    # 根据 static_ip 参数决定是否复用连接
    if static_ip:
        # 固定 IP 模式：复用同一个连接
        cache_key = f"{host}:{uuid}"
        if cache_key in _vless_proxy_cache:
            proxy = _vless_proxy_cache[cache_key]
            port = proxy.port
        else:
            proxy = LocalVlessProxy(vless_url, uuid)
            port = proxy.start()
            _vless_proxy_cache[cache_key] = proxy
    else:
        # 动态 IP 模式：每次创建新连接
        proxy = LocalVlessProxy(vless_url, uuid)
        port = proxy.start()
    
    # 构建本地代理 URL
    local_proxy = f"http://127.0.0.1:{port}"
    
    # 记录请求开始时间
    start_time = time.time()
    
    # 准备请求参数
    params = kwargs.pop("params", None)
    headers = kwargs.pop("headers", {})
    
    # 如果启用隐身模式，添加完整的浏览器请求头
    if stealth:
        from .stealth import get_stealth_headers
        stealth_headers = get_stealth_headers(stealth_browser)
        final_headers = stealth_headers.copy()
        final_headers.update(headers)
        headers = final_headers
    
    data = kwargs.pop("data", None)
    json_data = kwargs.pop("json", None)
    cookies = kwargs.pop("cookies", None)
    timeout = kwargs.pop("timeout", 30)
    
    proxies = {
        "http": local_proxy,
        "https": local_proxy
    }
    
    # 如果指定了 impersonate，使用 curl_cffi
    if impersonate:
        curl_requests = _get_curl_cffi()
        response = curl_requests.request(
            method,
            url,
            params=params,
            headers=headers,
            data=data,
            json=json_data,
            cookies=cookies,
            timeout=timeout,
            impersonate=impersonate,
            proxies=proxies,
            **kwargs
        )
        resp = CFSpiderResponse(response)
        _handle_map_output(resp, url, start_time, map_output, map_file)
        return resp
    
    # 如果启用 HTTP/2，使用 httpx
    if http2:
        httpx = _get_httpx()
        with httpx.Client(http2=True, timeout=timeout, proxy=local_proxy) as client:
            response = client.request(
                method,
                url,
                params=params,
                headers=headers,
                data=data,
                json=json_data,
                cookies=cookies,
                **kwargs
            )
            resp = CFSpiderResponse(response)
            _handle_map_output(resp, url, start_time, map_output, map_file)
            return resp
    
    # 默认使用 requests
    resp = requests.request(
        method,
        url,
        params=params,
        headers=headers,
        data=data,
        json=json_data,
        cookies=cookies,
        timeout=timeout,
        proxies=proxies,
        **kwargs
    )
    response = CFSpiderResponse(resp)
    _handle_map_output(response, url, start_time, map_output, map_file)
    return response


def stop_vless_proxies():
    """
    停止所有 VLESS 本地代理
    
    在程序结束时调用，释放资源。
    
    Example:
        >>> import cfspider
        >>> # 使用 VLESS 发送请求
        >>> response = cfspider.get("https://httpbin.org/ip",
        ...     cf_proxies="https://cfspider.violetqqcom.workers.dev",
        ...     uuid="c373c80c-58e4-4e64-8db5-40096905ec58"
        ... )
        >>> # 程序结束时清理
        >>> cfspider.stop_vless_proxies()
    """
    for key, proxy in list(_vless_proxy_cache.items()):
        try:
            proxy.stop()
        except:
            pass
    _vless_proxy_cache.clear()


def get(url, cf_proxies=None, uuid=None, http2=False, impersonate=None,
        map_output=False, map_file="cfspider_map.html",
        stealth=False, stealth_browser='chrome', delay=None, 
        static_ip=False, **kwargs):
    """
    发送 GET 请求 / Send GET request
    
    Args:
        url: 目标 URL（必须包含协议，如 https://）
        
        cf_proxies: CFspider Workers 地址（可选）
            如 "https://cfspider.violetqqcom.workers.dev"
            不填写时直接请求，不使用代理
        
        uuid: VLESS UUID（可选）
            不填写会自动从 Workers 获取
        
        static_ip: 是否使用固定 IP（默认 False）
            - False: 每次请求获取新的出口 IP（适合大规模采集）
            - True: 保持使用同一个 IP（适合需要会话一致性的场景）
        
        http2: 是否启用 HTTP/2 协议（默认 False）
        
        impersonate: TLS 指纹模拟（可选）
            可选值: chrome131, safari18_0, firefox133, edge101 等
        
        map_output: 是否生成 IP 地图 HTML 文件（默认 False）
        
        map_file: 地图输出文件名（默认 "cfspider_map.html"）
        
        stealth: 是否启用隐身模式（默认 False）
        
        stealth_browser: 隐身模式浏览器类型（默认 'chrome'）
        
        delay: 请求前随机延迟范围（秒），如 (1, 3)
        
        **kwargs: 其他参数，与 requests 库完全兼容
    
    Returns:
        CFSpiderResponse: 响应对象
    
    Example:
        >>> # 动态 IP（默认，每次请求换 IP）
        >>> response = cfspider.get(
        ...     "https://httpbin.org/ip",
        ...     cf_proxies="https://cfspider.violetqqcom.workers.dev"
        ... )
        >>> 
        >>> # 固定 IP（保持同一个 IP）
        >>> response = cfspider.get(
        ...     "https://httpbin.org/ip",
        ...     cf_proxies="https://cfspider.violetqqcom.workers.dev",
        ...     static_ip=True
        ... )
    """
    return request("GET", url, cf_proxies=cf_proxies, uuid=uuid, 
                   http2=http2, impersonate=impersonate,
                   map_output=map_output, map_file=map_file,
                   stealth=stealth, stealth_browser=stealth_browser, delay=delay,
                   static_ip=static_ip, **kwargs)


def post(url, cf_proxies=None, uuid=None, http2=False, impersonate=None,
         map_output=False, map_file="cfspider_map.html",
         stealth=False, stealth_browser='chrome', delay=None,
         static_ip=False, **kwargs):
    """发送 POST 请求 / Send POST request"""
    return request("POST", url, cf_proxies=cf_proxies, uuid=uuid,
                   http2=http2, impersonate=impersonate,
                   map_output=map_output, map_file=map_file,
                   stealth=stealth, stealth_browser=stealth_browser, delay=delay,
                   static_ip=static_ip, **kwargs)


def put(url, cf_proxies=None, uuid=None, http2=False, impersonate=None,
        map_output=False, map_file="cfspider_map.html",
        stealth=False, stealth_browser='chrome', delay=None,
        static_ip=False, **kwargs):
    """发送 PUT 请求 / Send PUT request"""
    return request("PUT", url, cf_proxies=cf_proxies, uuid=uuid,
                   http2=http2, impersonate=impersonate,
                   map_output=map_output, map_file=map_file,
                   stealth=stealth, stealth_browser=stealth_browser, delay=delay,
                   static_ip=static_ip, **kwargs)


def delete(url, cf_proxies=None, uuid=None, http2=False, impersonate=None,
           map_output=False, map_file="cfspider_map.html",
           stealth=False, stealth_browser='chrome', delay=None,
           static_ip=False, **kwargs):
    """发送 DELETE 请求 / Send DELETE request"""
    return request("DELETE", url, cf_proxies=cf_proxies, uuid=uuid,
                   http2=http2, impersonate=impersonate,
                   map_output=map_output, map_file=map_file,
                   stealth=stealth, stealth_browser=stealth_browser, delay=delay,
                   static_ip=static_ip, **kwargs)


def head(url, cf_proxies=None, uuid=None, http2=False, impersonate=None,
         map_output=False, map_file="cfspider_map.html",
         stealth=False, stealth_browser='chrome', delay=None,
         static_ip=False, **kwargs):
    """发送 HEAD 请求 / Send HEAD request"""
    return request("HEAD", url, cf_proxies=cf_proxies, uuid=uuid,
                   http2=http2, impersonate=impersonate,
                   map_output=map_output, map_file=map_file,
                   stealth=stealth, stealth_browser=stealth_browser, delay=delay,
                   static_ip=static_ip, **kwargs)


def options(url, cf_proxies=None, uuid=None, http2=False, impersonate=None,
            map_output=False, map_file="cfspider_map.html",
            stealth=False, stealth_browser='chrome', delay=None,
            static_ip=False, **kwargs):
    """发送 OPTIONS 请求 / Send OPTIONS request"""
    return request("OPTIONS", url, cf_proxies=cf_proxies, uuid=uuid,
                   http2=http2, impersonate=impersonate,
                   map_output=map_output, map_file=map_file,
                   stealth=stealth, stealth_browser=stealth_browser, delay=delay,
                   static_ip=static_ip, **kwargs)


def patch(url, cf_proxies=None, uuid=None, http2=False, impersonate=None,
          map_output=False, map_file="cfspider_map.html",
          stealth=False, stealth_browser='chrome', delay=None,
          static_ip=False, **kwargs):
    """发送 PATCH 请求 / Send PATCH request"""
    return request("PATCH", url, cf_proxies=cf_proxies, uuid=uuid,
                   http2=http2, impersonate=impersonate,
                   map_output=map_output, map_file=map_file,
                   stealth=stealth, stealth_browser=stealth_browser, delay=delay,
                   static_ip=static_ip, **kwargs)


def clear_map_records():
    """清空 IP 地图记录"""
    ip_map.clear_records()


def get_map_collector():
    """获取 IP 地图收集器"""
    return ip_map.get_collector()
