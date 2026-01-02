"""
CFspider - Cloudflare Workers 代理请求库

使用方式与 requests 一致，通过 cf_proxies 参数指定 Workers 地址

示例:
    import cfspider
    
    # 基础使用
    response = cfspider.get("https://httpbin.org/ip", cf_proxies="https://your-workers.dev")
    print(response.text)
    
    # 使用 Session
    session = cfspider.Session(cf_proxies="https://your-workers.dev")
    response = session.get("https://httpbin.org/ip")
    print(response.json())
"""

from .api import get, post, put, delete, head, options, patch, request
from .session import Session

__version__ = "1.0.0"
__all__ = [
    "get", "post", "put", "delete", "head", "options", "patch", "request",
    "Session"
]

