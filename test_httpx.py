"""
测试 cfspider httpx 异步功能
"""
import asyncio
import sys
sys.path.insert(0, '.')

import cfspider

# Workers 地址
CF_WORKERS = "https://ip.kami666.xyz"

async def test_async_no_proxy():
    """测试异步请求 - 无代理"""
    print("\n" + "="*60)
    print("测试 1: 异步请求 - 无代理模式")
    print("="*60)
    
    try:
        response = await cfspider.aget("https://httpbin.org/ip")
        print(f"状态码: {response.status_code}")
        print(f"HTTP 版本: {response.http_version}")
        print(f"响应: {response.text}")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def test_async_workers_proxy():
    """测试异步请求 - Workers API 代理"""
    print("\n" + "="*60)
    print("测试 2: 异步请求 - Workers API 代理")
    print("="*60)
    
    try:
        response = await cfspider.aget(
            "https://httpbin.org/ip",
            cf_proxies=CF_WORKERS
        )
        print(f"状态码: {response.status_code}")
        print(f"HTTP 版本: {response.http_version}")
        print(f"CF Colo: {response.cf_colo}")
        print(f"CF Ray: {response.cf_ray}")
        print(f"响应: {response.text}")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def test_async_post():
    """测试异步 POST 请求"""
    print("\n" + "="*60)
    print("测试 3: 异步 POST 请求 - Workers API 代理")
    print("="*60)
    
    try:
        response = await cfspider.apost(
            "https://httpbin.org/post",
            cf_proxies=CF_WORKERS,
            json={"name": "cfspider", "version": "1.3.0", "feature": "httpx"}
        )
        print(f"状态码: {response.status_code}")
        print(f"HTTP 版本: {response.http_version}")
        data = response.json()
        print(f"发送的 JSON: {data.get('json', {})}")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def test_async_session():
    """测试异步 Session"""
    print("\n" + "="*60)
    print("测试 4: 异步 Session - Workers API 代理")
    print("="*60)
    
    try:
        async with cfspider.AsyncSession(cf_proxies=CF_WORKERS) as session:
            # 第一个请求
            r1 = await session.get("https://httpbin.org/ip")
            print(f"请求 1 - 状态码: {r1.status_code}, HTTP 版本: {r1.http_version}")
            
            # 第二个请求
            r2 = await session.post("https://httpbin.org/post", json={"test": 1})
            print(f"请求 2 - 状态码: {r2.status_code}, HTTP 版本: {r2.http_version}")
            
            # 第三个请求
            r3 = await session.get("https://httpbin.org/headers")
            print(f"请求 3 - 状态码: {r3.status_code}, HTTP 版本: {r3.http_version}")
        
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def test_async_session_no_proxy():
    """测试异步 Session - 无代理"""
    print("\n" + "="*60)
    print("测试 5: 异步 Session - 无代理模式")
    print("="*60)
    
    try:
        async with cfspider.AsyncSession() as session:
            r1 = await session.get("https://httpbin.org/ip")
            print(f"请求 1 - 状态码: {r1.status_code}, HTTP 版本: {r1.http_version}")
            print(f"响应: {r1.text}")
        
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def test_concurrent_requests():
    """测试并发请求"""
    print("\n" + "="*60)
    print("测试 6: 并发请求 - Workers API 代理")
    print("="*60)
    
    try:
        urls = [
            "https://httpbin.org/ip",
            "https://httpbin.org/headers",
            "https://httpbin.org/user-agent"
        ]
        
        async def fetch(url):
            return await cfspider.aget(url, cf_proxies=CF_WORKERS)
        
        import time
        start = time.time()
        results = await asyncio.gather(*[fetch(url) for url in urls])
        elapsed = time.time() - start
        
        for i, r in enumerate(results):
            print(f"请求 {i+1} - 状态码: {r.status_code}, HTTP 版本: {r.http_version}")
        
        print(f"并发 3 个请求耗时: {elapsed:.2f}s")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

def test_sync_http2():
    """测试同步请求 HTTP/2"""
    print("\n" + "="*60)
    print("测试 7: 同步请求 HTTP/2 - 无代理")
    print("="*60)
    
    try:
        response = cfspider.get(
            "https://httpbin.org/ip",
            http2=True
        )
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.text}")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

def test_sync_http2_workers():
    """测试同步请求 HTTP/2 - Workers 代理"""
    print("\n" + "="*60)
    print("测试 8: 同步请求 HTTP/2 - Workers API 代理")
    print("="*60)
    
    try:
        response = cfspider.get(
            "https://httpbin.org/ip",
            cf_proxies=CF_WORKERS,
            http2=True
        )
        print(f"状态码: {response.status_code}")
        print(f"CF Colo: {response.cf_colo}")
        print(f"响应: {response.text}")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def main():
    print("="*60)
    print("CFspider httpx 功能测试")
    print("="*60)
    print(f"Workers 地址: {CF_WORKERS}")
    
    results = []
    
    # 异步测试
    results.append(await test_async_no_proxy())
    results.append(await test_async_workers_proxy())
    results.append(await test_async_post())
    results.append(await test_async_session())
    results.append(await test_async_session_no_proxy())
    results.append(await test_concurrent_requests())
    
    # 同步 HTTP/2 测试
    results.append(test_sync_http2())
    results.append(test_sync_http2_workers())
    
    # 结果汇总
    print("\n" + "="*60)
    print("测试结果汇总")
    print("="*60)
    
    tests = [
        "异步请求 - 无代理",
        "异步请求 - Workers API",
        "异步 POST - Workers API",
        "异步 Session - Workers API",
        "异步 Session - 无代理",
        "并发请求 - Workers API",
        "同步 HTTP/2 - 无代理",
        "同步 HTTP/2 - Workers API"
    ]
    
    passed = 0
    failed = 0
    for i, (test, result) in enumerate(zip(tests, results)):
        status = "✓ 通过" if result else "✗ 失败"
        print(f"{i+1}. {test}: {status}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print(f"\n总计: {passed} 通过, {failed} 失败")

if __name__ == "__main__":
    asyncio.run(main())

