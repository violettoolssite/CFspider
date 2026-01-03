"""
测试 cfspider 文件下载功能（流式响应）
"""
import asyncio
import os
import sys
sys.path.insert(0, '.')

import cfspider

# Workers 地址
CF_WORKERS = "https://ip.kami666.xyz"

# 测试文件 URL
TEST_FILES = [
    {
        "name": "小文件 (JSON)",
        "url": "https://httpbin.org/json",
        "filename": "test_json.json"
    },
    {
        "name": "中等文件 (robots.txt)",
        "url": "https://www.google.com/robots.txt",
        "filename": "test_robots.txt"
    },
    {
        "name": "图片文件 (PNG)",
        "url": "https://httpbin.org/image/png",
        "filename": "test_image.png"
    }
]

async def test_stream_download_no_proxy():
    """测试流式下载 - 无代理"""
    print("\n" + "="*60)
    print("测试 1: 流式下载 - 无代理模式")
    print("="*60)
    
    url = "https://httpbin.org/bytes/10240"  # 10KB 随机字节
    filename = "test_bytes_no_proxy.bin"
    
    try:
        total_bytes = 0
        async with cfspider.astream("GET", url) as response:
            print(f"状态码: {response.status_code}")
            print(f"HTTP 版本: {response.http_version}")
            
            with open(filename, "wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=1024):
                    f.write(chunk)
                    total_bytes += len(chunk)
        
        file_size = os.path.getsize(filename)
        print(f"下载完成: {filename}")
        print(f"文件大小: {file_size} bytes")
        os.remove(filename)
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def test_stream_download_workers():
    """测试流式下载 - Workers API 代理"""
    print("\n" + "="*60)
    print("测试 2: 流式下载 - Workers API 代理")
    print("="*60)
    
    url = "https://httpbin.org/bytes/10240"  # 10KB 随机字节
    filename = "test_bytes_workers.bin"
    
    try:
        total_bytes = 0
        async with cfspider.astream("GET", url, cf_proxies=CF_WORKERS) as response:
            print(f"状态码: {response.status_code}")
            print(f"HTTP 版本: {response.http_version}")
            print(f"CF Colo: {response.cf_colo}")
            
            with open(filename, "wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=1024):
                    f.write(chunk)
                    total_bytes += len(chunk)
        
        file_size = os.path.getsize(filename)
        print(f"下载完成: {filename}")
        print(f"文件大小: {file_size} bytes")
        os.remove(filename)
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def test_download_image():
    """测试下载图片文件"""
    print("\n" + "="*60)
    print("测试 3: 下载图片文件 - Workers API 代理")
    print("="*60)
    
    url = "https://httpbin.org/image/png"
    filename = "test_image.png"
    
    try:
        async with cfspider.astream("GET", url, cf_proxies=CF_WORKERS) as response:
            print(f"状态码: {response.status_code}")
            print(f"HTTP 版本: {response.http_version}")
            print(f"Content-Type: {response.headers.get('content-type', 'N/A')}")
            
            with open(filename, "wb") as f:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)
        
        file_size = os.path.getsize(filename)
        print(f"下载完成: {filename}")
        print(f"文件大小: {file_size} bytes")
        
        # 验证 PNG 文件头
        with open(filename, "rb") as f:
            header = f.read(8)
            if header[:4] == b'\x89PNG':
                print("文件类型验证: ✓ 有效的 PNG 文件")
            else:
                print("文件类型验证: ✗ 无效的 PNG 文件")
        
        os.remove(filename)
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def test_download_text():
    """测试下载文本文件"""
    print("\n" + "="*60)
    print("测试 4: 下载文本文件 - Workers API 代理")
    print("="*60)
    
    url = "https://www.google.com/robots.txt"
    filename = "test_robots.txt"
    
    try:
        lines = []
        async with cfspider.astream("GET", url, cf_proxies=CF_WORKERS) as response:
            print(f"状态码: {response.status_code}")
            print(f"HTTP 版本: {response.http_version}")
            
            async for line in response.aiter_lines():
                lines.append(line)
                if len(lines) <= 5:
                    print(f"  {line}")
        
        print(f"...")
        print(f"总行数: {len(lines)}")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def test_large_download():
    """测试大文件下载"""
    print("\n" + "="*60)
    print("测试 5: 大文件下载 (100KB) - 无代理")
    print("="*60)
    
    url = "https://httpbin.org/bytes/102400"  # 100KB
    filename = "test_large.bin"
    
    try:
        import time
        start = time.time()
        
        async with cfspider.astream("GET", url) as response:
            print(f"状态码: {response.status_code}")
            
            with open(filename, "wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    f.write(chunk)
        
        elapsed = time.time() - start
        file_size = os.path.getsize(filename)
        speed = file_size / elapsed / 1024  # KB/s
        
        print(f"下载完成: {filename}")
        print(f"文件大小: {file_size / 1024:.1f} KB")
        print(f"耗时: {elapsed:.2f}s")
        print(f"速度: {speed:.1f} KB/s")
        
        os.remove(filename)
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def test_session_stream():
    """测试 Session 流式下载"""
    print("\n" + "="*60)
    print("测试 6: Session 流式下载 - Workers API 代理")
    print("="*60)
    
    try:
        async with cfspider.AsyncSession(cf_proxies=CF_WORKERS) as session:
            async with session.stream("GET", "https://httpbin.org/bytes/5120") as response:
                print(f"状态码: {response.status_code}")
                print(f"HTTP 版本: {response.http_version}")
                
                data = await response.aread()
                print(f"数据大小: {len(data)} bytes")
        
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False

async def main():
    print("="*60)
    print("CFspider 文件下载测试")
    print("="*60)
    print(f"Workers 地址: {CF_WORKERS}")
    
    results = []
    
    results.append(await test_stream_download_no_proxy())
    results.append(await test_stream_download_workers())
    results.append(await test_download_image())
    results.append(await test_download_text())
    results.append(await test_large_download())
    results.append(await test_session_stream())
    
    # 结果汇总
    print("\n" + "="*60)
    print("测试结果汇总")
    print("="*60)
    
    tests = [
        "流式下载 - 无代理",
        "流式下载 - Workers API",
        "下载图片文件",
        "下载文本文件",
        "大文件下载 (100KB)",
        "Session 流式下载"
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

