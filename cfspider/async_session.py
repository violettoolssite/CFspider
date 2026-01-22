"""
CFspider 异步会话模块

基于 httpx 实现，提供可复用的异步 HTTP 客户端，支持 HTTP/2 和连接池。
"""
import httpx
from urllib.parse import urlencode, quote
from typing import Optional, Dict, Any, AsyncIterator
from contextlib import asynccontextmanager

from .async_api import AsyncCFSpiderResponse, AsyncStreamResponse


class AsyncSession:
    """
    异步会话类
    
    提供可复用的 httpx.AsyncClient，支持 HTTP/2 和连接池。
    
    Example:
        async with cfspider.AsyncSession(cf_proxies="workers.dev") as session:
            r1 = await session.get("https://example.com")
            r2 = await session.post("https://example.com", json={"key": "value"})
    """
    
    def __init__(
        self,
        cf_proxies: Optional[str] = None,
        cf_workers: bool = True,
        http2: bool = True,
        timeout: float = 30,
        headers: Optional[Dict[str, str]] = None,
        cookies: Optional[Dict[str, str]] = None,
        token: Optional[str] = None,
        **kwargs
    ):
        """
        初始化异步会话
        
        Args:
            cf_proxies: 代理地址（选填）
            cf_workers: 是否使用 CFspider Workers API（默认 True）
            http2: 是否启用 HTTP/2（默认 True）
            timeout: 默认超时时间（秒）
            headers: 默认请求头
            cookies: 默认 Cookies
            token: CFspider Workers API token（选填）
            **kwargs: 传递给 httpx.AsyncClient 的其他参数
        """
        self.cf_proxies = cf_proxies
        self.cf_workers = cf_workers
        self.http2 = http2
        self.timeout = timeout
        self.headers = headers or {}
        self.cookies = cookies or {}
        self.token = token
        self._client_kwargs = kwargs
        self._client: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self) -> "AsyncSession":
        """进入异步上下文"""
        await self._ensure_client()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """退出异步上下文"""
        await self.close()
    
    async def _ensure_client(self) -> None:
        """确保客户端已创建"""
        if self._client is None:
            # 处理代理
            proxy = None
            if self.cf_proxies and not self.cf_workers:
                proxy = self.cf_proxies
                if not proxy.startswith(('http://', 'https://', 'socks5://')):
                    proxy = f"http://{proxy}"
            
            self._client = httpx.AsyncClient(
                http2=self.http2,
                timeout=self.timeout,
                proxy=proxy,
                headers=self.headers,
                cookies=self.cookies,
                **self._client_kwargs
            )
    
    async def close(self) -> None:
        """关闭会话"""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
    
    async def request(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> AsyncCFSpiderResponse:
        """
        发送请求
        
        Args:
            method: HTTP 方法
            url: 目标 URL
            **kwargs: 请求参数
        
        Returns:
            AsyncCFSpiderResponse: 异步响应对象
        """
        await self._ensure_client()
        
        params = kwargs.pop("params", None)
        headers = kwargs.pop("headers", {})
        data = kwargs.pop("data", None)
        json_data = kwargs.pop("json", None)
        cookies = kwargs.pop("cookies", None)
        timeout = kwargs.pop("timeout", None)
        
        # 合并 headers
        merged_headers = {**self.headers, **headers}
        
        # 如果没有 cf_proxies 或不使用 Workers API，直接请求
        if not self.cf_proxies or not self.cf_workers:
            response = await self._client.request(
                method,
                url,
                params=params,
                headers=merged_headers,
                data=data,
                json=json_data,
                cookies=cookies,
                timeout=timeout,
                **kwargs
            )
            return AsyncCFSpiderResponse(response)
        
        # 使用 CFspider Workers API 代理
        cf_proxies_url = self.cf_proxies.rstrip("/")
        
        if not cf_proxies_url.startswith(('http://', 'https://')):
            cf_proxies_url = f"https://{cf_proxies_url}"
        
        target_url = url
        if params:
            target_url = f"{url}?{urlencode(params)}"
        
        proxy_url = f"{cf_proxies_url}/proxy?url={quote(target_url, safe='')}&method={method.upper()}"
        if self.token:
            proxy_url += f"&token={quote(self.token, safe='')}"
        
        request_headers = {}
        for key, value in merged_headers.items():
            request_headers[f"X-CFSpider-Header-{key}"] = value
        
        all_cookies = {**self.cookies, **(cookies or {})}
        if all_cookies:
            cookie_str = "; ".join([f"{k}={v}" for k, v in all_cookies.items()])
            request_headers["X-CFSpider-Header-Cookie"] = cookie_str
        
        response = await self._client.post(
            proxy_url,
            headers=request_headers,
            data=data,
            json=json_data,
            timeout=timeout,
            **kwargs
        )
        
        cf_colo = response.headers.get("X-CF-Colo")
        cf_ray = response.headers.get("CF-Ray")
        
        return AsyncCFSpiderResponse(response, cf_colo=cf_colo, cf_ray=cf_ray)
    
    @asynccontextmanager
    async def stream(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> AsyncIterator[AsyncStreamResponse]:
        """
        流式请求
        
        Args:
            method: HTTP 方法
            url: 目标 URL
            **kwargs: 请求参数
        
        Yields:
            AsyncStreamResponse: 流式响应对象
        """
        await self._ensure_client()
        
        params = kwargs.pop("params", None)
        headers = kwargs.pop("headers", {})
        data = kwargs.pop("data", None)
        json_data = kwargs.pop("json", None)
        cookies = kwargs.pop("cookies", None)
        timeout = kwargs.pop("timeout", None)
        
        merged_headers = {**self.headers, **headers}
        
        # 如果没有 cf_proxies 或不使用 Workers API，直接请求
        if not self.cf_proxies or not self.cf_workers:
            async with self._client.stream(
                method,
                url,
                params=params,
                headers=merged_headers,
                data=data,
                json=json_data,
                cookies=cookies,
                timeout=timeout,
                **kwargs
            ) as response:
                yield AsyncStreamResponse(response)
            return
        
        # 使用 CFspider Workers API 代理
        cf_proxies_url = self.cf_proxies.rstrip("/")
        
        if not cf_proxies_url.startswith(('http://', 'https://')):
            cf_proxies_url = f"https://{cf_proxies_url}"
        
        target_url = url
        if params:
            target_url = f"{url}?{urlencode(params)}"
        
        proxy_url = f"{cf_proxies_url}/proxy?url={quote(target_url, safe='')}&method={method.upper()}"
        if self.token:
            proxy_url += f"&token={quote(self.token, safe='')}"
        
        request_headers = {}
        for key, value in merged_headers.items():
            request_headers[f"X-CFSpider-Header-{key}"] = value
        
        all_cookies = {**self.cookies, **(cookies or {})}
        if all_cookies:
            cookie_str = "; ".join([f"{k}={v}" for k, v in all_cookies.items()])
            request_headers["X-CFSpider-Header-Cookie"] = cookie_str
        
        async with self._client.stream(
            "POST",
            proxy_url,
            headers=request_headers,
            data=data,
            json=json_data,
            timeout=timeout,
            **kwargs
        ) as response:
            cf_colo = response.headers.get("X-CF-Colo")
            cf_ray = response.headers.get("CF-Ray")
            yield AsyncStreamResponse(response, cf_colo=cf_colo, cf_ray=cf_ray)
    
    async def get(self, url: str, **kwargs) -> AsyncCFSpiderResponse:
        """异步 GET 请求"""
        return await self.request("GET", url, **kwargs)
    
    async def post(self, url: str, **kwargs) -> AsyncCFSpiderResponse:
        """异步 POST 请求"""
        return await self.request("POST", url, **kwargs)
    
    async def put(self, url: str, **kwargs) -> AsyncCFSpiderResponse:
        """异步 PUT 请求"""
        return await self.request("PUT", url, **kwargs)
    
    async def delete(self, url: str, **kwargs) -> AsyncCFSpiderResponse:
        """异步 DELETE 请求"""
        return await self.request("DELETE", url, **kwargs)
    
    async def head(self, url: str, **kwargs) -> AsyncCFSpiderResponse:
        """异步 HEAD 请求"""
        return await self.request("HEAD", url, **kwargs)
    
    async def options(self, url: str, **kwargs) -> AsyncCFSpiderResponse:
        """异步 OPTIONS 请求"""
        return await self.request("OPTIONS", url, **kwargs)
    
    async def patch(self, url: str, **kwargs) -> AsyncCFSpiderResponse:
        """异步 PATCH 请求"""
        return await self.request("PATCH", url, **kwargs)

