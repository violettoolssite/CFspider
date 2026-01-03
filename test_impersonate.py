"""
测试 cfspider TLS 指纹模拟功能
"""
import sys
sys.path.insert(0, '.')

import cfspider

# Workers 地址
CF_WORKERS = "https://ip.kami666.xyz"


def test_impersonate_get():
    """测试 TLS 指纹模拟 GET 请求"""
    print("\n" + "="*60)
    print("测试 1: TLS 指纹模拟 GET 请求 - Chrome 131")
    print("="*60)
    
    try:
        response = cfspider.impersonate_get(
            "https://tls.browserleaks.com/json",
            impersonate="chrome131"
        )
        print(f"状态码: {response.status_code}")
        data = response.json()
        print(f"JA3 Hash: {data.get('ja3_hash', 'N/A')}")
        print(f"JA4: {data.get('ja4', 'N/A')}")
        print(f"Akamai Hash: {data.get('akamai_hash', 'N/A')}")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False


def test_impersonate_safari():
    """测试 Safari 指纹"""
    print("\n" + "="*60)
    print("测试 2: TLS 指纹模拟 GET 请求 - Safari 18")
    print("="*60)
    
    try:
        response = cfspider.impersonate_get(
            "https://tls.browserleaks.com/json",
            impersonate="safari18_0"
        )
        print(f"状态码: {response.status_code}")
        data = response.json()
        print(f"JA3 Hash: {data.get('ja3_hash', 'N/A')}")
        print(f"JA4: {data.get('ja4', 'N/A')}")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False


def test_impersonate_firefox():
    """测试 Firefox 指纹"""
    print("\n" + "="*60)
    print("测试 3: TLS 指纹模拟 GET 请求 - Firefox 133")
    print("="*60)
    
    try:
        response = cfspider.impersonate_get(
            "https://tls.browserleaks.com/json",
            impersonate="firefox133"
        )
        print(f"状态码: {response.status_code}")
        data = response.json()
        print(f"JA3 Hash: {data.get('ja3_hash', 'N/A')}")
        print(f"JA4: {data.get('ja4', 'N/A')}")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False


def test_impersonate_workers():
    """测试 TLS 指纹 + Workers 代理"""
    print("\n" + "="*60)
    print("测试 4: TLS 指纹 + Workers 代理")
    print("="*60)
    
    try:
        response = cfspider.impersonate_get(
            "https://httpbin.org/ip",
            impersonate="chrome131",
            cf_proxies=CF_WORKERS
        )
        print(f"状态码: {response.status_code}")
        print(f"CF Colo: {response.cf_colo}")
        print(f"响应: {response.text}")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False


def test_impersonate_session():
    """测试 TLS 指纹会话"""
    print("\n" + "="*60)
    print("测试 5: TLS 指纹会话")
    print("="*60)
    
    try:
        with cfspider.ImpersonateSession(impersonate="chrome131") as session:
            r1 = session.get("https://httpbin.org/ip")
            print(f"请求 1 - 状态码: {r1.status_code}")
            
            r2 = session.post("https://httpbin.org/post", json={"test": 1})
            print(f"请求 2 - 状态码: {r2.status_code}")
            
            r3 = session.get("https://httpbin.org/headers")
            print(f"请求 3 - 状态码: {r3.status_code}")
        
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False


def test_supported_browsers():
    """测试获取支持的浏览器列表"""
    print("\n" + "="*60)
    print("测试 6: 支持的浏览器列表")
    print("="*60)
    
    try:
        browsers = cfspider.get_supported_browsers()
        print(f"支持的浏览器数量: {len(browsers)}")
        print(f"Chrome: {[b for b in browsers if 'chrome' in b]}")
        print(f"Safari: {[b for b in browsers if 'safari' in b]}")
        print(f"Firefox: {[b for b in browsers if 'firefox' in b]}")
        print(f"Edge: {[b for b in browsers if 'edge' in b]}")
        print("✓ 测试通过")
        return True
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        return False


def main():
    print("="*60)
    print("CFspider TLS 指纹模拟功能测试")
    print("="*60)
    print(f"Workers 地址: {CF_WORKERS}")
    
    results = []
    
    results.append(test_impersonate_get())
    results.append(test_impersonate_safari())
    results.append(test_impersonate_firefox())
    results.append(test_impersonate_workers())
    results.append(test_impersonate_session())
    results.append(test_supported_browsers())
    
    # 结果汇总
    print("\n" + "="*60)
    print("测试结果汇总")
    print("="*60)
    
    tests = [
        "Chrome 131 指纹",
        "Safari 18 指纹",
        "Firefox 133 指纹",
        "指纹 + Workers 代理",
        "指纹会话",
        "支持的浏览器列表"
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
    main()

