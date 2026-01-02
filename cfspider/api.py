"""
CFspider API - 提供类似 requests 的函数式接口
"""

from .session import Session, Response


def request(method, url, cf_proxies=None, **kwargs):
    """
    发送请求
    
    Args:
        method: HTTP 方法 (GET, POST, PUT, DELETE, etc.)
        url: 目标 URL
        cf_proxies: Workers 地址
        **kwargs: 其他参数 (headers, data, json, timeout, etc.)
    
    Returns:
        Response: 响应对象
    
    示例:
        response = cfspider.request("GET", "https://httpbin.org/ip", 
                                     cf_proxies="https://workers.dev")
    """
    with Session(cf_proxies=cf_proxies) as session:
        return session._make_request(method, url, **kwargs)


def get(url, cf_proxies=None, **kwargs):
    """
    发送 GET 请求
    
    Args:
        url: 目标 URL
        cf_proxies: Workers 地址
        **kwargs: 其他参数
    
    Returns:
        Response: 响应对象
    
    示例:
        import cfspider
        
        response = cfspider.get("https://httpbin.org/ip", 
                                 cf_proxies="https://cfspider-test.violetqqcom.workers.dev")
        print(response.text)
    """
    return request("GET", url, cf_proxies=cf_proxies, **kwargs)


def post(url, cf_proxies=None, data=None, json=None, **kwargs):
    """
    发送 POST 请求
    
    Args:
        url: 目标 URL
        cf_proxies: Workers 地址
        data: 表单数据
        json: JSON 数据
        **kwargs: 其他参数
    
    Returns:
        Response: 响应对象
    """
    return request("POST", url, cf_proxies=cf_proxies, data=data, json=json, **kwargs)


def put(url, cf_proxies=None, data=None, **kwargs):
    """发送 PUT 请求"""
    return request("PUT", url, cf_proxies=cf_proxies, data=data, **kwargs)


def delete(url, cf_proxies=None, **kwargs):
    """发送 DELETE 请求"""
    return request("DELETE", url, cf_proxies=cf_proxies, **kwargs)


def head(url, cf_proxies=None, **kwargs):
    """发送 HEAD 请求"""
    return request("HEAD", url, cf_proxies=cf_proxies, **kwargs)


def options(url, cf_proxies=None, **kwargs):
    """发送 OPTIONS 请求"""
    return request("OPTIONS", url, cf_proxies=cf_proxies, **kwargs)


def patch(url, cf_proxies=None, data=None, **kwargs):
    """发送 PATCH 请求"""
    return request("PATCH", url, cf_proxies=cf_proxies, data=data, **kwargs)

