"""
CFspider Session - 会话管理
"""

import requests
from urllib.parse import urlencode, quote


class Response:
    """封装响应对象，提供与 requests.Response 兼容的接口"""
    
    def __init__(self, requests_response, cf_data=None):
        self._response = requests_response
        self._cf_data = cf_data or {}
        
    @property
    def status_code(self):
        return self._response.status_code
    
    @property
    def headers(self):
        return self._response.headers
    
    @property
    def text(self):
        return self._response.text
    
    @property
    def content(self):
        return self._response.content
    
    @property
    def url(self):
        return self._cf_data.get("original_url", self._response.url)
    
    @property
    def cf_colo(self):
        """Cloudflare 节点代码"""
        return self.headers.get("X-CF-Colo") or self._cf_data.get("cf_colo")
    
    @property
    def cf_proxyip(self):
        """使用的 PROXYIP"""
        return self.headers.get("X-Proxy-IP") or self._cf_data.get("proxyip")
    
    def json(self, **kwargs):
        return self._response.json(**kwargs)
    
    def raise_for_status(self):
        return self._response.raise_for_status()
    
    @property
    def ok(self):
        return self._response.ok
    
    @property
    def encoding(self):
        return self._response.encoding
    
    @encoding.setter
    def encoding(self, value):
        self._response.encoding = value
    
    def __repr__(self):
        return f"<CFspider Response [{self.status_code}] via {self.cf_colo or 'unknown'}>"


class Session:
    """
    CFspider Session - 类似 requests.Session
    
    示例:
        session = cfspider.Session(cf_proxies="https://your-workers.dev")
        response = session.get("https://httpbin.org/ip")
        print(response.text)
    """
    
    def __init__(self, cf_proxies=None):
        """
        初始化 Session
        
        Args:
            cf_proxies: Workers 地址，如 "https://cfspider-test.violetqqcom.workers.dev"
        """
        self.cf_proxies = cf_proxies.rstrip("/") if cf_proxies else None
        self._session = requests.Session()
        self.headers = {}
    
    def _make_request(self, method, url, **kwargs):
        """通过 Workers 发起请求"""
        if not self.cf_proxies:
            raise ValueError("cf_proxies 未设置，请指定 Workers 地址")
        
        # 合并 headers
        headers = {**self.headers, **kwargs.pop("headers", {})}
        
        # 构建 Workers API URL
        if method.upper() == "GET":
            api_url = f"{self.cf_proxies}/api/fetch"
            params = {"url": url}
            
            # 发起请求
            resp = self._session.get(
                api_url,
                params=params,
                headers=headers,
                **kwargs
            )
        else:
            # 对于非 GET 请求，使用 /api/proxy 端点（需要 Workers 支持）
            api_url = f"{self.cf_proxies}/api/proxy"
            
            # 将原始请求信息发送给 Workers
            payload = {
                "method": method.upper(),
                "url": url,
                "headers": headers,
                "body": kwargs.pop("data", None) or kwargs.pop("json", None)
            }
            
            resp = self._session.post(
                api_url,
                json=payload,
                **kwargs
            )
        
        return Response(resp, {"original_url": url})
    
    def get(self, url, **kwargs):
        """发送 GET 请求"""
        return self._make_request("GET", url, **kwargs)
    
    def post(self, url, **kwargs):
        """发送 POST 请求"""
        return self._make_request("POST", url, **kwargs)
    
    def put(self, url, **kwargs):
        """发送 PUT 请求"""
        return self._make_request("PUT", url, **kwargs)
    
    def delete(self, url, **kwargs):
        """发送 DELETE 请求"""
        return self._make_request("DELETE", url, **kwargs)
    
    def head(self, url, **kwargs):
        """发送 HEAD 请求"""
        return self._make_request("HEAD", url, **kwargs)
    
    def options(self, url, **kwargs):
        """发送 OPTIONS 请求"""
        return self._make_request("OPTIONS", url, **kwargs)
    
    def patch(self, url, **kwargs):
        """发送 PATCH 请求"""
        return self._make_request("PATCH", url, **kwargs)
    
    def close(self):
        """关闭 Session"""
        self._session.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, *args):
        self.close()
    
    def __repr__(self):
        return f"<CFspider Session [{self.cf_proxies}]>"

