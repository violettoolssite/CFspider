"""
CFspider Session 模块

提供会话管理功能，在多个请求之间保持代理配置、请求头和 Cookie。
简化 API：只需提供 Workers 地址即可自动获取 UUID 和配置。
"""

from .api import request


class Session:
    """
    CFspider 会话类 / CFspider Session class
    
    在多个请求之间保持相同的代理配置、请求头和 Cookie。
    Maintains the same proxy configuration, headers, and cookies across multiple requests.
    适合需要登录状态或连续请求的场景。
    Suitable for scenarios requiring login state or consecutive requests.
    
    Attributes:
        cf_proxies (str): Workers 代理地址（自动获取 UUID 配置）
                         / Workers proxy address (auto-fetches UUID config)
        uuid (str, optional): VLESS UUID（可选，不填则自动获取）
                             / VLESS UUID (optional, auto-fetched if not provided)
        headers (dict): 会话级别的默认请求头 / Session-level default headers
        cookies (dict): 会话级别的 Cookie / Session-level cookies
    
    Example:
        >>> import cfspider
        >>> 
        >>> # 简化用法：只需 Workers 地址（自动获取 UUID）
        >>> with cfspider.Session(cf_proxies="https://cfspider.violetqqcom.workers.dev") as session:
        ...     response = session.get("https://api.example.com/user")
        ...     print(f"Cookies: {session.cookies}")
        >>> 
        >>> # 手动指定 UUID
        >>> with cfspider.Session(
        ...     cf_proxies="https://cfspider.violetqqcom.workers.dev",
        ...     uuid="c373c80c-58e4-4e64-8db5-40096905ec58"
        ... ) as session:
        ...     response = session.get("https://httpbin.org/ip")
    
    Note:
        如果需要隐身模式的会话一致性（自动 Referer、随机延迟等），
        If you need stealth mode session consistency (auto Referer, random delay, etc.),
        请使用 cfspider.StealthSession。
        please use cfspider.StealthSession.
    """
    
    def __init__(self, cf_proxies=None, uuid=None, static_ip=False, two_proxy=None):
        """
        初始化会话 / Initialize session
        
        Args:
            cf_proxies (str): Workers 代理地址（必填）
                            / Workers proxy address (required)
                例如："https://cfspider.violetqqcom.workers.dev"
                e.g., "https://cfspider.violetqqcom.workers.dev"
                UUID 将自动从 Workers 获取
                UUID will be auto-fetched from Workers
            uuid (str, optional): VLESS UUID（可选）
                如果不填写，会自动从 Workers 首页获取
                If not provided, will be auto-fetched from Workers homepage
            static_ip (bool): 是否使用固定 IP 模式（默认 False）
                / Whether to use static IP mode (default False)
            two_proxy (str, optional): 第二层代理配置
                / Second layer proxy configuration
                格式：host:port:user:pass 或 host:port
        
        Raises:
            ValueError: 当 cf_proxies 为空时
        
        Example:
            >>> # 简化用法（推荐）
            >>> session = cfspider.Session(cf_proxies="https://cfspider.violetqqcom.workers.dev")
            >>> 
            >>> # 手动指定 UUID
            >>> session = cfspider.Session(
            ...     cf_proxies="https://cfspider.violetqqcom.workers.dev",
            ...     uuid="c373c80c-58e4-4e64-8db5-40096905ec58"
            ... )
            >>> 
            >>> # 固定 IP 模式
            >>> session = cfspider.Session(
            ...     cf_proxies="https://cfspider.violetqqcom.workers.dev",
            ...     static_ip=True
            ... )
        """
        if not cf_proxies:
            raise ValueError(
                "cf_proxies 是必填参数。\n"
                "请提供 CFspider Workers 地址，例如：\n"
                "  session = cfspider.Session(cf_proxies='https://cfspider.violetqqcom.workers.dev')\n\n"
                "UUID 将自动从 Workers 获取，无需手动指定。\n"
                "如果不需要代理，可以直接使用 cfspider.get() 等函数。\n"
                "如果需要隐身模式会话，请使用 cfspider.StealthSession。"
            )
        self.cf_proxies = cf_proxies.rstrip("/") if cf_proxies else None
        self.uuid = uuid
        self.static_ip = static_ip
        self.two_proxy = two_proxy
        self.headers = {}
        self.cookies = {}
        self._base_headers = {}  # 兼容 StealthSession API
    
    @property
    def _cookies(self):
        """兼容 StealthSession 的 _cookies 属性"""
        return self.cookies
    
    @_cookies.setter
    def _cookies(self, value):
        """兼容 StealthSession 的 _cookies 属性"""
        self.cookies = value
    
    def _update_cookies(self, response):
        """
        从响应中更新 cookies / Update cookies from response
        
        支持两种方式：
        1. 从 response.cookies 获取（直接请求时）
        2. 从响应头 Set-Cookie 解析（通过 Workers 代理时）
        """
        # 方式1：从 response.cookies 获取
        if hasattr(response, 'cookies'):
            try:
                for cookie in response.cookies:
                    if hasattr(cookie, 'name') and hasattr(cookie, 'value'):
                        self.cookies[cookie.name] = cookie.value
                    elif isinstance(cookie, str):
                        if '=' in cookie:
                            name, value = cookie.split('=', 1)
                            self.cookies[name.strip()] = value.strip()
            except TypeError:
                if hasattr(response.cookies, 'items'):
                    for name, value in response.cookies.items():
                        self.cookies[name] = value
        
        # 方式2：从响应头 Set-Cookie 解析（Workers 代理时需要）
        if hasattr(response, 'headers'):
            self._parse_set_cookie_headers(response.headers)
    
    def _parse_set_cookie_headers(self, headers):
        """
        从响应头中解析 Set-Cookie
        
        Workers 代理会原样返回目标网站的 Set-Cookie 头，
        但 requests 库不会自动解析成 cookies，需要手动处理。
        """
        # 获取所有 Set-Cookie 头
        set_cookie_headers = []
        
        # 尝试多种方式获取所有 Set-Cookie 头
        if hasattr(headers, 'get_all'):
            # httpx 风格
            set_cookie_headers = headers.get_all('set-cookie') or []
        elif hasattr(headers, 'getlist'):
            # urllib3 风格
            set_cookie_headers = headers.getlist('set-cookie') or []
        else:
            # requests 风格 - headers 可能合并了多个 Set-Cookie
            # 用逗号分隔多个 cookie（但需要小心 Expires 中的逗号）
            cookie_header = headers.get('set-cookie', '')
            if cookie_header:
                # 简单分割，按照 ", " 后跟字母开头的模式
                # 例如: "a=1; Path=/, b=2; Path=/" 
                import re
                # 匹配 ", " 后面紧跟 cookie 名称的模式
                parts = re.split(r',\s*(?=[A-Za-z_][A-Za-z0-9_-]*=)', cookie_header)
                set_cookie_headers = [p.strip() for p in parts if p.strip()]
        
        # 解析每个 Set-Cookie 头
        for cookie_str in set_cookie_headers:
            self._parse_single_cookie(cookie_str)
    
    def _parse_single_cookie(self, cookie_str):
        """
        解析单个 Set-Cookie 字符串
        
        格式示例：
        __Host-authjs.csrf-token=xxx%7Cyyy; Path=/; Secure; HttpOnly
        """
        if not cookie_str:
            return
        
        # 分割成多个部分
        parts = cookie_str.split(';')
        if not parts:
            return
        
        # 第一部分是 name=value
        first_part = parts[0].strip()
        if '=' not in first_part:
            return
        
        name, value = first_part.split('=', 1)
        name = name.strip()
        value = value.strip()
        
        if name:
            self.cookies[name] = value
    
    def request(self, method, url, **kwargs):
        """
        发送 HTTP 请求 / Send HTTP request
        
        Args:
            method (str): HTTP 方法（GET, POST, PUT, DELETE 等）
                         / HTTP method (GET, POST, PUT, DELETE, etc.)
            url (str): 目标 URL / Target URL
            **kwargs: 其他参数，与 cfspider.request() 相同
                     / Other parameters, same as cfspider.request()
                - headers (dict): 自定义请求头 / Custom headers
                - cookies (dict): Cookie
                - data (dict/str): 表单数据 / Form data
                - json (dict): JSON 数据 / JSON data
                - timeout (int/float): 超时时间（秒） / Timeout (seconds)
                - stealth (bool): 启用隐身模式 / Enable stealth mode
                - impersonate (str): TLS 指纹模拟 / TLS fingerprint impersonation
                - http2 (bool): 启用 HTTP/2 / Enable HTTP/2
                - 其他参数与 requests 库兼容
                - Other parameters compatible with requests library
        
        Returns:
            CFSpiderResponse: 响应对象 / Response object
        
        Note:
            会话级别的 headers 和 cookies 会自动添加到请求中，
            Session-level headers and cookies are automatically added to requests,
            但请求级别的参数优先级更高。
            but request-level parameters have higher priority.
            响应中的 Set-Cookie 会自动保存到会话中。
            Set-Cookie from response will be automatically saved to session.
        """
        headers = self.headers.copy()
        headers.update(self._base_headers)  # 应用基础请求头
        headers.update(kwargs.pop("headers", {}))
        
        cookies = self.cookies.copy()
        cookies.update(kwargs.pop("cookies", {}))
        
        # 如果用户在请求中指定了 uuid，使用用户指定的，否则使用 Session 的
        uuid = kwargs.pop("uuid", None) or self.uuid
        # 如果用户在请求中指定了 cf_proxies，使用用户指定的，否则使用 Session 的
        cf_proxies = kwargs.pop("cf_proxies", None) or self.cf_proxies
        # 如果用户在请求中指定了 static_ip，使用用户指定的，否则使用 Session 的
        static_ip = kwargs.pop("static_ip", None)
        if static_ip is None:
            static_ip = self.static_ip
        # 如果用户在请求中指定了 two_proxy，使用用户指定的，否则使用 Session 的
        two_proxy = kwargs.pop("two_proxy", None) or self.two_proxy
        
        response = request(
            method,
            url,
            cf_proxies=cf_proxies,
            uuid=uuid,
            static_ip=static_ip,
            two_proxy=two_proxy,
            headers=headers,
            cookies=cookies,
            **kwargs
        )
        
        # 自动从响应中更新 cookies
        self._update_cookies(response)
        
        return response
    
    def get(self, url, **kwargs):
        """
        发送 GET 请求 / Send GET request
        
        Args:
            url (str): 目标 URL / Target URL
            **kwargs: 其他参数，与 cfspider.get() 相同
                     / Other parameters, same as cfspider.get()
        
        Returns:
            CFSpiderResponse: 响应对象 / Response object
        """
        return self.request("GET", url, **kwargs)
    
    def post(self, url, **kwargs):
        """
        发送 POST 请求 / Send POST request
        
        Args:
            url (str): 目标 URL / Target URL
            **kwargs: 其他参数，与 cfspider.post() 相同
                     / Other parameters, same as cfspider.post()
        
        Returns:
            CFSpiderResponse: 响应对象 / Response object
        """
        return self.request("POST", url, **kwargs)
    
    def put(self, url, **kwargs):
        """
        发送 PUT 请求 / Send PUT request
        
        Args:
            url (str): 目标 URL / Target URL
            **kwargs: 其他参数，与 cfspider.put() 相同
                     / Other parameters, same as cfspider.put()
        
        Returns:
            CFSpiderResponse: 响应对象 / Response object
        """
        return self.request("PUT", url, **kwargs)
    
    def delete(self, url, **kwargs):
        """
        发送 DELETE 请求 / Send DELETE request
        
        Args:
            url (str): 目标 URL / Target URL
            **kwargs: 其他参数，与 cfspider.delete() 相同
                     / Other parameters, same as cfspider.delete()
        
        Returns:
            CFSpiderResponse: 响应对象 / Response object
        """
        return self.request("DELETE", url, **kwargs)
    
    def head(self, url, **kwargs):
        """
        发送 HEAD 请求 / Send HEAD request
        
        Args:
            url (str): 目标 URL / Target URL
            **kwargs: 其他参数，与 cfspider.head() 相同
                     / Other parameters, same as cfspider.head()
        
        Returns:
            CFSpiderResponse: 响应对象 / Response object
        """
        return self.request("HEAD", url, **kwargs)
    
    def options(self, url, **kwargs):
        """
        发送 OPTIONS 请求 / Send OPTIONS request
        
        Args:
            url (str): 目标 URL / Target URL
            **kwargs: 其他参数，与 cfspider.options() 相同
                     / Other parameters, same as cfspider.options()
        
        Returns:
            CFSpiderResponse: 响应对象 / Response object
        """
        return self.request("OPTIONS", url, **kwargs)
    
    def patch(self, url, **kwargs):
        """
        发送 PATCH 请求 / Send PATCH request
        
        Args:
            url (str): 目标 URL / Target URL
            **kwargs: 其他参数，与 cfspider.patch() 相同
                     / Other parameters, same as cfspider.patch()
        
        Returns:
            CFSpiderResponse: 响应对象 / Response object
        """
        return self.request("PATCH", url, **kwargs)
    
    def close(self):
        """
        关闭会话
        
        当前实现中，每个请求都是独立的，无需特殊清理。
        保留此方法是为了与 requests.Session 保持接口兼容。
        """
        pass
    
    def __enter__(self):
        """支持上下文管理器（with 语句）"""
        return self
    
    def __exit__(self, *args):
        """退出上下文时关闭会话"""
        self.close()

