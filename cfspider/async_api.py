"""
CFspider 异步 API 模块

基于 httpx 实现，提供：
- 异步 HTTP 请求（async/await）
- HTTP/2 协议支持
- 流式响应（大文件下载）
- 并发请求控制

使用前需要安装 httpx：
    pip install httpx[http2]

快速开始：
    >>> import cfspider
    >>> import asyncio
    >>> 
    >>> async def main():
    ...     # 异步 GET 请求
    ...     response = await cfspider.aget("https://httpbin.org/ip")
    ...     print(response.json())
    ...     
    ...     # 并发请求
    ...     urls = ["https://httpbin.org/ip"] * 5
    ...     tasks = [cfspider.aget(url, cf_proxies="...") for url in urls]
    ...     responses = await asyncio.gather(*tasks)
    >>> 
    >>> asyncio.run(main())

性能对比：
    - 同步请求 10 个 URL：约 10 秒（串行）
    - 异步请求 10 个 URL：约 1 秒（并发）
"""
import httpx
from urllib.parse import urlencode, quote
from typing import Optional, Dict, Any, AsyncIterator
from contextlib import asynccontextmanager


class AsyncCFSpiderResponse:
    """
    异步响应对象
    
    封装 httpx.Response，提供与同步 CFSpiderResponse 一致的接口，
    并额外支持异步迭代（用于流式处理）。
    
    Attributes:
        cf_colo (str): Cloudflare 数据中心代码
        cf_ray (str): Cloudflare Ray ID
        text (str): 响应文本
        content (bytes): 响应字节
        status_code (int): HTTP 状态码
        headers: 响应头
        http_version (str): HTTP 版本（HTTP/1.1 或 HTTP/2）
    
    Methods:
        json(): 解析 JSON
        aiter_bytes(): 异步迭代响应字节
        aiter_text(): 异步迭代响应文本
        aiter_lines(): 异步迭代响应行
    
    Example:
        >>> response = await cfspider.aget("https://httpbin.org/ip")
        >>> print(response.http_version)  # HTTP/2
        >>> data = response.json()
    """
    
    def __init__(self, response: httpx.Response, cf_colo: Optional[str] = None, cf_ray: Optional[str] = None):
        self._response = response
        self.cf_colo = cf_colo
        self.cf_ray = cf_ray
    
    @property
    def text(self) -> str:
        return self._response.text
    
    @property
    def content(self) -> bytes:
        return self._response.content
    
    @property
    def status_code(self) -> int:
        return self._response.status_code
    
    @property
    def headers(self) -> httpx.Headers:
        return self._response.headers
    
    @property
    def cookies(self) -> httpx.Cookies:
        return self._response.cookies
    
    @property
    def url(self) -> httpx.URL:
        return self._response.url
    
    @property
    def encoding(self) -> Optional[str]:
        return self._response.encoding
    
    @property
    def http_version(self) -> str:
        """获取 HTTP 协议版本（如 HTTP/1.1 或 HTTP/2）"""
        return self._response.http_version
    
    def json(self, **kwargs) -> Any:
        return self._response.json(**kwargs)
    
    def raise_for_status(self) -> None:
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
        """查找第一个匹配的元素"""
        return self._get_extractor().find(selector, attr=attr, strip=strip, 
                                          regex=regex, parser=parser)
    
    def find_all(self, selector: str, attr: str = None, strip: bool = True):
        """查找所有匹配的元素"""
        return self._get_extractor().find_all(selector, attr=attr, strip=strip)
    
    def css(self, selector: str, attr: str = None, html: bool = False, strip: bool = True):
        """使用 CSS 选择器提取"""
        return self._get_extractor().css(selector, attr=attr, html=html, strip=strip)
    
    def css_all(self, selector: str, attr: str = None, html: bool = False, strip: bool = True):
        """使用 CSS 选择器提取所有"""
        return self._get_extractor().css_all(selector, attr=attr, html=html, strip=strip)
    
    def css_one(self, selector: str):
        """返回第一个匹配的 Element 对象"""
        return self._get_extractor().css_one(selector)
    
    def xpath(self, expression: str):
        """使用 XPath 表达式提取"""
        return self._get_extractor().xpath(expression)
    
    def xpath_all(self, expression: str):
        """使用 XPath 表达式提取所有"""
        return self._get_extractor().xpath_all(expression)
    
    def xpath_one(self, expression: str):
        """返回第一个匹配的 Element 对象"""
        return self._get_extractor().xpath_one(expression)
    
    def jpath(self, expression: str):
        """使用 JSONPath 表达式提取"""
        return self._get_extractor().jpath(expression)
    
    def jpath_all(self, expression: str):
        """使用 JSONPath 表达式提取所有"""
        return self._get_extractor().jpath_all(expression)
    
    def pick(self, **fields):
        """批量提取多个字段"""
        result = self._get_extractor().pick(**fields)
        result.url = str(self.url)
        return result
    
    def extract(self, rules: dict):
        """使用规则字典提取数据"""
        result = self._get_extractor().extract(rules)
        result.url = str(self.url)
        return result
    
    def save(self, filepath: str, encoding: str = "utf-8"):
        """保存响应内容到文件"""
        from .export import save_response
        return save_response(self.content, filepath, encoding=encoding)
    
    async def aiter_bytes(self, chunk_size: Optional[int] = None) -> AsyncIterator[bytes]:
        """异步迭代响应字节"""
        async for chunk in self._response.aiter_bytes(chunk_size):
            yield chunk
    
    async def aiter_text(self, chunk_size: Optional[int] = None) -> AsyncIterator[str]:
        """异步迭代响应文本"""
        async for chunk in self._response.aiter_text(chunk_size):
            yield chunk
    
    async def aiter_lines(self) -> AsyncIterator[str]:
        """异步迭代响应行"""
        async for line in self._response.aiter_lines():
            yield line


class AsyncStreamResponse:
    """流式响应对象，用于大文件下载"""
    
    def __init__(self, response: httpx.Response, cf_colo: Optional[str] = None, cf_ray: Optional[str] = None):
        self._response = response
        self.cf_colo = cf_colo
        self.cf_ray = cf_ray
    
    @property
    def status_code(self) -> int:
        return self._response.status_code
    
    @property
    def headers(self) -> httpx.Headers:
        return self._response.headers
    
    @property
    def http_version(self) -> str:
        return self._response.http_version
    
    async def aiter_bytes(self, chunk_size: Optional[int] = None) -> AsyncIterator[bytes]:
        """异步迭代响应字节"""
        async for chunk in self._response.aiter_bytes(chunk_size):
            yield chunk
    
    async def aiter_text(self, chunk_size: Optional[int] = None) -> AsyncIterator[str]:
        """异步迭代响应文本"""
        async for chunk in self._response.aiter_text(chunk_size):
            yield chunk
    
    async def aiter_lines(self) -> AsyncIterator[str]:
        """异步迭代响应行"""
        async for line in self._response.aiter_lines():
            yield line
    
    async def aread(self) -> bytes:
        """读取全部响应内容"""
        return await self._response.aread()
    
    async def aclose(self) -> None:
        """关闭响应"""
        await self._response.aclose()


async def arequest(
    method: str,
    url: str,
    cf_proxies: Optional[str] = None,
    cf_workers: bool = True,
    http2: bool = True,
    token: Optional[str] = None,
    stealth: bool = False,
    browser: bool = False,
    headless: bool = True,
    wait_until: str = 'load',
    screenshot: Optional[str] = None,
    js_eval: Optional[str] = None,
    uuid: Optional[str] = None,
    two_proxy: Optional[str] = None,
    **kwargs
) -> AsyncCFSpiderResponse:
    """
    发送异步 HTTP 请求（无需 UUID）
    
    使用 /proxy API 路由，无需提供 UUID。
    
    Args:
        method: HTTP 方法
        url: 目标 URL
        cf_proxies: Workers 代理地址（选填，无需 UUID）
                    - 当 cf_workers=True 时，填写 CFspider Workers 地址
                    - 当 cf_workers=False 时，填写普通代理地址
        cf_workers: 是否使用 CFspider Workers API（默认 True）
        http2: 是否启用 HTTP/2（默认 True）
        **kwargs: 其他参数
    
    Returns:
        AsyncCFSpiderResponse: 异步响应对象
    
    Example:
        # 无需 UUID
        response = await cfspider.aget("https://httpbin.org/ip", cf_proxies="https://your-workers.dev")
    """
    # CloakBrowser 拦截：在线程池中运行同步 Playwright，不阻塞事件循环
    if stealth or browser:
        import asyncio
        import functools
        from .stealth import _cloak_single_request, _browser_single_request
        loop = asyncio.get_event_loop()
        if browser:
            fn = functools.partial(
                _browser_single_request, method, url,
                cf_proxies=cf_proxies, uuid=uuid, two_proxy=two_proxy,
                headless=headless, humanize=True,
                wait_until=wait_until, screenshot=screenshot, js_eval=js_eval,
                **kwargs
            )
        else:
            fn = functools.partial(
                _cloak_single_request, method, url,
                cf_proxies=cf_proxies, uuid=uuid, two_proxy=two_proxy,
                **kwargs
            )
        return await loop.run_in_executor(None, fn)

    params = kwargs.pop("params", None)
    headers = kwargs.pop("headers", {})
    data = kwargs.pop("data", None)
    json_data = kwargs.pop("json", None)
    cookies = kwargs.pop("cookies", None)
    timeout = kwargs.pop("timeout", 30)

    # 如果没有指定 cf_proxies，直接请求
    if not cf_proxies:
        async with httpx.AsyncClient(http2=http2, timeout=timeout) as client:
            response = await client.request(
                method,
                url,
                params=params,
                headers=headers,
                data=data,
                json=json_data,
                cookies=cookies,
                **kwargs
            )
            return AsyncCFSpiderResponse(response)
    
    # 支持 WorkersManager 对象
    if hasattr(cf_proxies, 'url'):
        cf_proxies = getattr(cf_proxies, 'url', None) or str(cf_proxies)

    # cf_workers=False：使用普通代理
    if not cf_workers:
        proxy_url = cf_proxies
        if not proxy_url.startswith(('http://', 'https://', 'socks5://')):
            proxy_url = f"http://{proxy_url}"
        
        async with httpx.AsyncClient(http2=http2, timeout=timeout, proxy=proxy_url) as client:
            response = await client.request(
                method,
                url,
                params=params,
                headers=headers,
                data=data,
                json=json_data,
                cookies=cookies,
                **kwargs
            )
            return AsyncCFSpiderResponse(response)
    
    # cf_workers=True：使用 CFspider Workers API 代理
    cf_proxies = cf_proxies.rstrip("/")
    
    if not cf_proxies.startswith(('http://', 'https://')):
        cf_proxies = f"https://{cf_proxies}"
    
    target_url = url
    if params:
        target_url = f"{url}?{urlencode(params)}"
    
    proxy_url = f"{cf_proxies}/proxy?url={quote(target_url, safe='')}&method={method.upper()}"
    if token:
        proxy_url += f"&token={quote(token, safe='')}"
    
    request_headers = {}
    if headers:
        for key, value in headers.items():
            request_headers[f"X-CFSpider-Header-{key}"] = value
    
    if cookies:
        cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])
        request_headers["X-CFSpider-Header-Cookie"] = cookie_str
    
    async with httpx.AsyncClient(http2=http2, timeout=timeout) as client:
        response = await client.post(
            proxy_url,
            headers=request_headers,
            data=data,
            json=json_data,
            **kwargs
        )
    
    cf_colo = response.headers.get("X-CF-Colo")
    cf_ray = response.headers.get("CF-Ray")
    
    return AsyncCFSpiderResponse(response, cf_colo=cf_colo, cf_ray=cf_ray)


@asynccontextmanager
async def astream(
    method: str,
    url: str,
    cf_proxies: Optional[str] = None,
    cf_workers: bool = True,
    http2: bool = True,
    token: Optional[str] = None,
    **kwargs
) -> AsyncIterator[AsyncStreamResponse]:
    """
    流式请求上下文管理器
    
    Args:
        method: HTTP 方法
        url: 目标 URL
        cf_proxies: 代理地址（选填）
        cf_workers: 是否使用 CFspider Workers API（默认 True）
        http2: 是否启用 HTTP/2（默认 True）
        **kwargs: 其他参数
    
    Yields:
        AsyncStreamResponse: 流式响应对象
    
    Example:
        async with cfspider.astream("GET", url) as response:
            async for chunk in response.aiter_bytes():
                process(chunk)
    """
    params = kwargs.pop("params", None)
    headers = kwargs.pop("headers", {})
    data = kwargs.pop("data", None)
    json_data = kwargs.pop("json", None)
    cookies = kwargs.pop("cookies", None)
    timeout = kwargs.pop("timeout", 30)
    
    # 如果没有指定 cf_proxies，直接请求
    if not cf_proxies:
        async with httpx.AsyncClient(http2=http2, timeout=timeout) as client:
            async with client.stream(
                method,
                url,
                params=params,
                headers=headers,
                data=data,
                json=json_data,
                cookies=cookies,
                **kwargs
            ) as response:
                yield AsyncStreamResponse(response)
        return
    
    # cf_workers=False：使用普通代理
    if not cf_workers:
        proxy_url = cf_proxies
        if not proxy_url.startswith(('http://', 'https://', 'socks5://')):
            proxy_url = f"http://{proxy_url}"
        
        async with httpx.AsyncClient(http2=http2, timeout=timeout, proxy=proxy_url) as client:
            async with client.stream(
                method,
                url,
                params=params,
                headers=headers,
                data=data,
                json=json_data,
                cookies=cookies,
                **kwargs
            ) as response:
                yield AsyncStreamResponse(response)
        return
    
    # cf_workers=True：使用 CFspider Workers API 代理
    cf_proxies_url = cf_proxies.rstrip("/")
    
    if not cf_proxies_url.startswith(('http://', 'https://')):
        cf_proxies_url = f"https://{cf_proxies_url}"
    
    target_url = url
    if params:
        target_url = f"{url}?{urlencode(params)}"
    
    proxy_endpoint = f"{cf_proxies_url}/proxy?url={quote(target_url, safe='')}&method={method.upper()}"
    if token:
        proxy_endpoint += f"&token={quote(token, safe='')}"
    
    request_headers = {}
    if headers:
        for key, value in headers.items():
            request_headers[f"X-CFSpider-Header-{key}"] = value
    
    if cookies:
        cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])
        request_headers["X-CFSpider-Header-Cookie"] = cookie_str
    
    async with httpx.AsyncClient(http2=http2, timeout=timeout) as client:
        async with client.stream(
            "POST",
            proxy_endpoint,
            headers=request_headers,
            data=data,
            json=json_data,
            **kwargs
        ) as response:
            cf_colo = response.headers.get("X-CF-Colo")
            cf_ray = response.headers.get("CF-Ray")
            yield AsyncStreamResponse(response, cf_colo=cf_colo, cf_ray=cf_ray)


# 便捷方法
async def aget(url: str, cf_proxies: Optional[str] = None, cf_workers: bool = True,
               http2: bool = True, stealth: bool = False, browser: bool = False,
               headless: bool = True, wait_until: str = 'load',
               screenshot: Optional[str] = None, js_eval: Optional[str] = None,
               uuid: Optional[str] = None, two_proxy: Optional[str] = None, **kwargs) -> AsyncCFSpiderResponse:
    """异步 GET 请求"""
    return await arequest("GET", url, cf_proxies=cf_proxies, cf_workers=cf_workers, http2=http2,
                          stealth=stealth, browser=browser, headless=headless,
                          wait_until=wait_until, screenshot=screenshot, js_eval=js_eval,
                          uuid=uuid, two_proxy=two_proxy, **kwargs)


async def apost(url: str, cf_proxies: Optional[str] = None, cf_workers: bool = True,
                http2: bool = True, stealth: bool = False, browser: bool = False,
                headless: bool = True, wait_until: str = 'load',
                screenshot: Optional[str] = None, js_eval: Optional[str] = None,
                uuid: Optional[str] = None, two_proxy: Optional[str] = None, **kwargs) -> AsyncCFSpiderResponse:
    """异步 POST 请求"""
    return await arequest("POST", url, cf_proxies=cf_proxies, cf_workers=cf_workers, http2=http2,
                          stealth=stealth, browser=browser, headless=headless,
                          wait_until=wait_until, screenshot=screenshot, js_eval=js_eval,
                          uuid=uuid, two_proxy=two_proxy, **kwargs)


async def aput(url: str, cf_proxies: Optional[str] = None, cf_workers: bool = True,
               http2: bool = True, stealth: bool = False, browser: bool = False,
               headless: bool = True, wait_until: str = 'load',
               screenshot: Optional[str] = None, js_eval: Optional[str] = None,
               uuid: Optional[str] = None, two_proxy: Optional[str] = None, **kwargs) -> AsyncCFSpiderResponse:
    """异步 PUT 请求"""
    return await arequest("PUT", url, cf_proxies=cf_proxies, cf_workers=cf_workers, http2=http2,
                          stealth=stealth, browser=browser, headless=headless,
                          wait_until=wait_until, screenshot=screenshot, js_eval=js_eval,
                          uuid=uuid, two_proxy=two_proxy, **kwargs)


async def adelete(url: str, cf_proxies: Optional[str] = None, cf_workers: bool = True,
                  http2: bool = True, stealth: bool = False, browser: bool = False,
                  headless: bool = True, wait_until: str = 'load',
                  screenshot: Optional[str] = None, js_eval: Optional[str] = None,
                  uuid: Optional[str] = None, two_proxy: Optional[str] = None, **kwargs) -> AsyncCFSpiderResponse:
    """异步 DELETE 请求"""
    return await arequest("DELETE", url, cf_proxies=cf_proxies, cf_workers=cf_workers, http2=http2,
                          stealth=stealth, browser=browser, headless=headless,
                          wait_until=wait_until, screenshot=screenshot, js_eval=js_eval,
                          uuid=uuid, two_proxy=two_proxy, **kwargs)


async def ahead(url: str, cf_proxies: Optional[str] = None, cf_workers: bool = True,
                http2: bool = True, stealth: bool = False,
                uuid: Optional[str] = None, two_proxy: Optional[str] = None, **kwargs) -> AsyncCFSpiderResponse:
    """异步 HEAD 请求"""
    return await arequest("HEAD", url, cf_proxies=cf_proxies, cf_workers=cf_workers, http2=http2,
                          stealth=stealth, uuid=uuid, two_proxy=two_proxy, **kwargs)


async def aoptions(url: str, cf_proxies: Optional[str] = None, cf_workers: bool = True,
                   http2: bool = True, stealth: bool = False,
                   uuid: Optional[str] = None, two_proxy: Optional[str] = None, **kwargs) -> AsyncCFSpiderResponse:
    """异步 OPTIONS 请求"""
    return await arequest("OPTIONS", url, cf_proxies=cf_proxies, cf_workers=cf_workers, http2=http2,
                          stealth=stealth, uuid=uuid, two_proxy=two_proxy, **kwargs)


async def apatch(url: str, cf_proxies: Optional[str] = None, cf_workers: bool = True,
                 http2: bool = True, stealth: bool = False, browser: bool = False,
                 headless: bool = True, wait_until: str = 'load',
                 screenshot: Optional[str] = None, js_eval: Optional[str] = None,
                 uuid: Optional[str] = None, two_proxy: Optional[str] = None, **kwargs) -> AsyncCFSpiderResponse:
    """异步 PATCH 请求"""
    return await arequest("PATCH", url, cf_proxies=cf_proxies, cf_workers=cf_workers, http2=http2,
                          stealth=stealth, browser=browser, headless=headless,
                          wait_until=wait_until, screenshot=screenshot, js_eval=js_eval,
                          uuid=uuid, two_proxy=two_proxy, **kwargs)

