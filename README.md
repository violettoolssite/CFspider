# CFspider

基于 Cloudflare Workers 的代理 IP 池，使用 Cloudflare 全球边缘节点 IP 作为代理出口。

## 代理方案对比

| 代理方案 | 价格 | IP 质量 | 速度 | 稳定性 | IP 数量 | 反爬能力 |
|---------|------|---------|------|--------|---------|----------|
| **CFspider (Workers)** | **免费** | **企业级** | **极快** | **99.9%** | **300+ 节点** | **强** |
| 直接爬取 CF CDN IP | 免费 | 无法使用 | - | 无法连接 | 理论很多 | 无 |
| 住宅代理 / 家庭代理 | $5-15/GB | 极高 | 中等 | 中等 | 百万+ | 极强 |
| 数据中心代理 | $1-5/月 | 中等 | 快 | 高 | 有限 | 中等 |
| 免费公共代理 | 免费 | 极差 | 慢 | <10% | 数千 | 弱 |
| VPN 服务 | $3-12/月 | 中等 | 中等 | 高 | 数十服务器 | 中等 |
| 自建代理服务器 | $5-50/月 | 取决于IP | 快 | 高 | 1个 | 弱 |

### 各方案详解

**直接爬取 Cloudflare CDN IP**
- Cloudflare CDN IP（如 172.64.x.x、104.21.x.x）是 Anycast IP
- 无法直接作为 HTTP/SOCKS5 代理使用
- 即使扫描出在线 IP，也无法建立代理连接
- CDN IP 仅用于边缘加速，不提供代理服务

**住宅代理 / 家庭代理**
- 使用真实家庭网络 IP，反爬能力最强
- 价格昂贵，按流量计费（$5-15/GB）
- 部分服务存在合规风险
- 适合对匿名性要求极高的商业爬虫场景

**数据中心代理**
- 速度快、价格适中
- IP 容易被识别为机房 IP
- 被大型网站封禁概率较高
- 适合目标网站防护较弱的场景

**免费公共代理**
- 完全免费但质量极差
- 可用率通常低于 10%
- 速度慢、不稳定
- 存在安全风险（可能被中间人攻击）

**CFspider 优势**
- 利用 Cloudflare Workers 的边缘计算能力
- 请求从 Cloudflare 300+ 全球节点发出
- IP 是 Cloudflare 企业级 IP（与大量正常网站共用）
- 不易被封禁，且完全免费
- Workers 免费版每日 100,000 请求

## 核心优势

### 企业级 IP 信誉
Cloudflare IP (AS13335) 被全球数百万网站使用，包括 Discord、Shopify、Medium 等知名服务。这些 IP 拥有极高的信誉度，不会像普通代理 IP 那样被轻易封禁。

### 零成本运营
Cloudflare Workers 免费版每日 100,000 请求，无需信用卡，无需付费。相比住宅代理每月数百美元的费用，这是真正的零成本方案。

### 全球边缘网络
请求自动路由到离目标网站最近的 Cloudflare 边缘节点。全球 100+ 个国家，300+ 个数据中心，确保最低延迟。

### Serverless 无服务器
无需购买服务器、无需运维、无需担心扩容。Cloudflare 自动处理所有基础设施，冷启动时间接近零毫秒。

### 数据完全可控
代码部署在你自己的 Cloudflare 账户，请求日志、访问数据完全由你掌控。100% 的隐私和控制权。

### 企业级安全
所有请求自动享受 Cloudflare 的 DDoS 防护、WAF 防火墙、SSL/TLS 加密。

## 适用场景

| 场景 | 说明 |
|------|------|
| 数据采集 / 爬虫 | 采集公开数据时避免 IP 被封禁，适合新闻聚合、价格监控、市场调研 |
| SEO 监控 | 从不同地理位置检查搜索引擎排名、网站可访问性 |
| 网站可用性测试 | 从全球各地测试网站的响应时间和可用性 |
| API 聚合服务 | 调用多个第三方 API 时隐藏真实服务器 IP |
| 内容验证 | 验证 CDN 缓存、检查不同地区的内容分发 |
| 学术研究 | 网络研究、互联网测量、安全研究等学术项目 |

## 技术架构

```
+------------------+      +----------------------+      +------------------+
|                  |      |   Cloudflare Edge    |      |                  |
|   Your Python    | ---> |   Workers (300+)     | ---> |   Target Website |
|   Application    |      |   Global Nodes       |      |                  |
|                  |      +----------------------+      +------------------+
+------------------+              |
        |                         v
        v                 +----------------------+
+------------------+      |  Cloudflare IP Pool  |
|   cfspider lib   |      |  172.64.x.x          |
|   requests-like  |      |  104.21.x.x          |
+------------------+      |  162.159.x.x  ...    |
                          +----------------------+
```

**工作流程：**
1. 你的应用调用 `cfspider.get(url, cf_proxies="workers.dev")`
2. CFspider 发送请求到你的 Cloudflare Workers
3. Workers 从最近的边缘节点获取目标 URL
4. 响应返回，目标网站看到的是 Cloudflare IP，而不是你的 IP

## 特性

- 使用 Cloudflare 全球 300+ 边缘节点 IP
- 与 requests 库语法一致，无学习成本
- 支持 GET、POST、PUT、DELETE 等所有 HTTP 方法
- 支持 Session 会话管理
- 返回 Cloudflare 节点信息（cf_colo、cf_ray）
- **支持浏览器模式**，可渲染 JavaScript 动态页面、截图、自动化操作
- **支持多种代理方式**：HTTP 代理、SOCKS5 代理、edgetunnel VLESS 代理
- **支持异步请求**（基于 httpx），可使用 async/await 语法
- **支持 HTTP/2 协议**，更快的连接复用和性能
- **支持流式响应**，高效处理大文件下载
- **支持 TLS 指纹模拟**（基于 curl_cffi），可模拟 Chrome/Safari/Firefox/Edge 浏览器指纹
- 完全免费，Workers 免费版每日 100,000 请求

## 测试结果

| 功能 | 状态 | 说明 |
|------|------|------|
| HTTP GET 请求 | OK | 返回 Cloudflare IP |
| HTTP POST 请求 | OK | 发送数据成功 |
| 自定义 Headers | OK | Header 正确传递 |
| Session 会话 | OK | 多次请求正常 |
| Workers Debug | OK | 返回 CF 机房信息 |
| 浏览器(HTTP代理) | OK | 支持本地/远程代理 |
| 浏览器(VLESS) | OK | Cloudflare IP 出口 |
| 浏览器(无代理) | OK | 本地 IP 出口 |

## 部署 Workers

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 Workers & Pages
3. 点击 Create application → Create Worker
4. 将 `workers.js` 代码粘贴到编辑器中
5. 点击 Deploy

部署完成后，你将获得一个 Workers 地址，如 `https://xxx.username.workers.dev`

如需自定义域名，可在 Worker → Settings → Triggers → Custom Domain 中添加。

## 安装

### 方式一：PyPI 安装（推荐）

```bash
pip install cfspider
```

> **注意**：Python 3.11+ 在 Debian/Ubuntu 上可能提示 `externally-managed-environment` 错误，请使用以下任一方式解决：
> 
> ```bash
> # 方式 A：使用虚拟环境（推荐）
> python3 -m venv venv
> source venv/bin/activate
> pip install cfspider
> 
> # 方式 B：使用 pipx
> pipx install cfspider
> 
> # 方式 C：强制安装（不推荐）
> pip install cfspider --break-system-packages
> ```

### 方式二：国内镜像源安装

如果 PyPI 访问较慢，可使用国内镜像：

```bash
# 清华源
pip install cfspider -i https://pypi.tuna.tsinghua.edu.cn/simple

# 阿里云源
pip install cfspider -i https://mirrors.aliyun.com/pypi/simple

# 中科大源
pip install cfspider -i https://pypi.mirrors.ustc.edu.cn/simple
```

### 方式三：从 GitHub 安装

```bash
pip install git+https://github.com/violettoolssite/CFspider.git
```

### 安装浏览器功能（可选）

如需使用浏览器模式，需要额外安装：

```bash
# 安装带浏览器支持的 cfspider
pip install cfspider[browser]

# 安装 Chromium 浏览器
cfspider install
```

## 快速开始

### HTTP 代理请求

```python
import cfspider

cf_proxies = "https://your-workers.dev"

response = cfspider.get("https://httpbin.org/ip", cf_proxies=cf_proxies)
print(response.text)
# {"origin": "2a06:98c0:3600::103, 172.71.24.151"}  # Cloudflare IP
```

### 浏览器模式

```python
import cfspider

# 使用本地 HTTP 代理
browser = cfspider.Browser(cf_proxies="127.0.0.1:9674")
html = browser.html("https://httpbin.org/ip")
print(html)
browser.close()

# 使用 edgetunnel VLESS 代理（Cloudflare IP 出口）
browser = cfspider.Browser(
    cf_proxies="v2.example.com",
    vless_uuid="your-vless-uuid"
)
html = browser.html("https://httpbin.org/ip")
print(html)  # 返回 Cloudflare IP
browser.close()

# 无代理模式
browser = cfspider.Browser()
html = browser.html("https://example.com")
browser.close()
```

## API 参考

### 请求方法

CFspider 支持以下 HTTP 方法，语法与 requests 库一致：

```python
import cfspider

cf_proxies = "https://your-workers.dev"

cfspider.get(url, cf_proxies=cf_proxies)
cfspider.post(url, cf_proxies=cf_proxies, json=data)
cfspider.put(url, cf_proxies=cf_proxies, data=data)
cfspider.delete(url, cf_proxies=cf_proxies)
cfspider.head(url, cf_proxies=cf_proxies)
cfspider.options(url, cf_proxies=cf_proxies)
cfspider.patch(url, cf_proxies=cf_proxies, json=data)
```

### 请求参数

| 参数 | 类型 | 说明 |
|------|------|------|
| url | str | 目标 URL |
| cf_proxies | str | Workers 地址（必填） |
| params | dict | URL 查询参数 |
| data | dict/str | 表单数据 |
| json | dict | JSON 数据 |
| headers | dict | 请求头 |
| cookies | dict | Cookies |
| timeout | int/float | 超时时间（秒） |

### 响应对象

| 属性 | 类型 | 说明 |
|------|------|------|
| text | str | 响应文本 |
| content | bytes | 响应字节 |
| json() | dict | 解析 JSON |
| status_code | int | HTTP 状态码 |
| headers | dict | 响应头 |
| cf_colo | str | Cloudflare 节点代码（如 NRT） |
| cf_ray | str | Cloudflare Ray ID |

## 使用示例

### GET 请求

```python
import cfspider

cf_proxies = "https://your-workers.dev"

response = cfspider.get(
    "https://httpbin.org/get",
    cf_proxies=cf_proxies,
    params={"key": "value"}
)

print(response.status_code)
print(response.json())
```

### POST 请求

```python
import cfspider

cf_proxies = "https://your-workers.dev"

response = cfspider.post(
    "https://httpbin.org/post",
    cf_proxies=cf_proxies,
    json={"name": "cfspider", "version": "1.0"}
)

print(response.json())
```

### 使用 Session

Session 可以复用 Workers 地址，无需每次请求都指定：

```python
import cfspider

cf_proxies = "https://your-workers.dev"

session = cfspider.Session(cf_proxies=cf_proxies)

r1 = session.get("https://httpbin.org/ip")
r2 = session.post("https://httpbin.org/post", json={"test": 1})
r3 = session.get("https://example.com")

print(r1.text)
print(r2.json())

session.close()
```

### 获取 Cloudflare 节点信息

```python
import cfspider

cf_proxies = "https://your-workers.dev"

response = cfspider.get("https://httpbin.org/ip", cf_proxies=cf_proxies)

print(f"出口 IP: {response.json()['origin']}")
print(f"节点代码: {response.cf_colo}")
print(f"Ray ID: {response.cf_ray}")
```

### 自定义请求头

```python
import cfspider

cf_proxies = "https://your-workers.dev"

response = cfspider.get(
    "https://httpbin.org/headers",
    cf_proxies=cf_proxies,
    headers={
        "User-Agent": "MyApp/1.0",
        "Accept-Language": "zh-CN"
    }
)

print(response.json())
```

### 设置超时

```python
import cfspider

cf_proxies = "https://your-workers.dev"

response = cfspider.get(
    "https://httpbin.org/delay/5",
    cf_proxies=cf_proxies,
    timeout=10
)
```

### HTTP/2 支持

启用 HTTP/2 可以获得更好的性能（连接复用、头部压缩等）：

```python
import cfspider

cf_proxies = "https://your-workers.dev"

# 同步请求启用 HTTP/2
response = cfspider.get(
    "https://httpbin.org/ip",
    cf_proxies=cf_proxies,
    http2=True
)

print(response.text)
```

## 异步 API（httpx）

CFspider 提供基于 httpx 的异步 API，支持 async/await 语法，适合高并发场景。

### 异步请求

```python
import asyncio
import cfspider

async def main():
    cf_proxies = "https://your-workers.dev"
    
    # 异步 GET 请求
    response = await cfspider.aget("https://httpbin.org/ip", cf_proxies=cf_proxies)
    print(response.text)
    
    # 异步 POST 请求
    response = await cfspider.apost(
        "https://httpbin.org/post",
        cf_proxies=cf_proxies,
        json={"key": "value"}
    )
    print(response.json())

asyncio.run(main())
```

### 异步 Session

```python
import asyncio
import cfspider

async def main():
    cf_proxies = "https://your-workers.dev"
    
    async with cfspider.AsyncSession(cf_proxies=cf_proxies) as session:
        # 复用连接，高效执行多个请求
        r1 = await session.get("https://httpbin.org/ip")
        r2 = await session.post("https://httpbin.org/post", json={"test": 1})
        r3 = await session.get("https://example.com")
        
        print(r1.text)
        print(r2.json())

asyncio.run(main())
```

### 流式响应（大文件下载）

```python
import asyncio
import cfspider

async def download_large_file():
    cf_proxies = "https://your-workers.dev"
    
    async with cfspider.astream("GET", "https://example.com/large-file.zip", cf_proxies=cf_proxies) as response:
        with open("large-file.zip", "wb") as f:
            async for chunk in response.aiter_bytes(chunk_size=8192):
                f.write(chunk)

asyncio.run(download_large_file())
```

### 并发请求

```python
import asyncio
import cfspider

async def fetch_url(url, cf_proxies):
    response = await cfspider.aget(url, cf_proxies=cf_proxies)
    return response.json()

async def main():
    cf_proxies = "https://your-workers.dev"
    
    urls = [
        "https://httpbin.org/ip",
        "https://httpbin.org/headers",
        "https://httpbin.org/user-agent"
    ]
    
    # 并发执行所有请求
    tasks = [fetch_url(url, cf_proxies) for url in urls]
    results = await asyncio.gather(*tasks)
    
    for result in results:
        print(result)

asyncio.run(main())
```

### 异步 API 参考

| 方法 | 说明 |
|------|------|
| `cfspider.aget(url, **kwargs)` | 异步 GET 请求 |
| `cfspider.apost(url, **kwargs)` | 异步 POST 请求 |
| `cfspider.aput(url, **kwargs)` | 异步 PUT 请求 |
| `cfspider.adelete(url, **kwargs)` | 异步 DELETE 请求 |
| `cfspider.ahead(url, **kwargs)` | 异步 HEAD 请求 |
| `cfspider.aoptions(url, **kwargs)` | 异步 OPTIONS 请求 |
| `cfspider.apatch(url, **kwargs)` | 异步 PATCH 请求 |
| `cfspider.astream(method, url, **kwargs)` | 流式请求（上下文管理器） |
| `cfspider.AsyncSession(**kwargs)` | 异步会话（支持连接池） |

## TLS 指纹模拟 (curl_cffi)

CFspider 集成了 curl_cffi，支持模拟各种浏览器的 TLS 指纹，有效绕过基于 JA3/JA4 指纹的反爬检测。

### 基本用法

```python
import cfspider

# 模拟 Chrome 131 发送请求
response = cfspider.impersonate_get(
    "https://example.com",
    impersonate="chrome131"
)
print(response.text)

# 模拟 Safari 18
response = cfspider.impersonate_get(
    "https://example.com",
    impersonate="safari18_0"
)

# 模拟 Firefox 133
response = cfspider.impersonate_get(
    "https://example.com",
    impersonate="firefox133"
)
```

### 配合 Workers 代理使用

```python
import cfspider

# TLS 指纹 + Cloudflare IP 出口
response = cfspider.impersonate_get(
    "https://httpbin.org/ip",
    impersonate="chrome131",
    cf_proxies="https://your-workers.dev"
)
print(response.text)  # Cloudflare IP
print(response.cf_colo)  # 节点代码
```

### TLS 指纹会话

```python
import cfspider

# 创建 Chrome 131 指纹会话
with cfspider.ImpersonateSession(impersonate="chrome131") as session:
    r1 = session.get("https://example.com")
    r2 = session.post("https://api.example.com", json={"key": "value"})
    r3 = session.get("https://example.com/data")
```

### 支持的浏览器指纹

```python
import cfspider

# 获取支持的浏览器列表
browsers = cfspider.get_supported_browsers()
print(browsers)
```

| 类型 | 版本 |
|------|------|
| Chrome | chrome99, chrome100, chrome101, chrome104, chrome107, chrome110, chrome116, chrome119, chrome120, chrome123, chrome124, chrome131 |
| Chrome Android | chrome99_android, chrome131_android |
| Safari | safari15_3, safari15_5, safari17_0, safari17_2_ios, safari18_0, safari18_0_ios |
| Firefox | firefox102, firefox109, firefox133 |
| Edge | edge99, edge101 |

### TLS 指纹 API 参考

| 方法 | 说明 |
|------|------|
| `cfspider.impersonate_get(url, impersonate="chrome131", **kwargs)` | GET 请求 |
| `cfspider.impersonate_post(url, impersonate="chrome131", **kwargs)` | POST 请求 |
| `cfspider.impersonate_put(url, **kwargs)` | PUT 请求 |
| `cfspider.impersonate_delete(url, **kwargs)` | DELETE 请求 |
| `cfspider.impersonate_request(method, url, **kwargs)` | 自定义方法请求 |
| `cfspider.ImpersonateSession(impersonate="chrome131", **kwargs)` | 指纹会话 |
| `cfspider.get_supported_browsers()` | 获取支持的浏览器列表 |

## 浏览器模式

CFspider 支持浏览器模式，可以渲染 JavaScript 动态页面、截图、生成 PDF、自动化操作等。

### 安装

```bash
# 安装带浏览器支持的 cfspider
pip install cfspider[browser]

# 安装 Chromium 浏览器
cfspider install
```

### 代理类型支持

浏览器模式支持多种代理类型：

```python
import cfspider

# 1. HTTP 代理（IP:PORT 格式）
browser = cfspider.Browser(cf_proxies="127.0.0.1:9674")

# 2. HTTP 代理（完整格式）
browser = cfspider.Browser(cf_proxies="http://127.0.0.1:9674")

# 3. SOCKS5 代理
browser = cfspider.Browser(cf_proxies="socks5://127.0.0.1:1080")

# 4. edgetunnel VLESS 代理（Cloudflare IP 出口）
browser = cfspider.Browser(
    cf_proxies="v2.example.com",
    vless_uuid="your-vless-uuid"
)

# 5. 无代理
browser = cfspider.Browser()
```

### 获取渲染后的 HTML

```python
import cfspider

browser = cfspider.Browser(cf_proxies="127.0.0.1:9674")

# 获取 JavaScript 渲染后的完整 HTML
html = browser.html("https://example.com")
print(html)

browser.close()
```

### 页面截图

```python
import cfspider

browser = cfspider.Browser()

# 截图并保存
browser.screenshot("https://example.com", "screenshot.png")

# 截取整个页面
browser.screenshot("https://example.com", "full.png", full_page=True)

browser.close()
```

### 生成 PDF

```python
import cfspider

browser = cfspider.Browser()

# 生成 PDF（仅无头模式可用）
browser.pdf("https://example.com", "page.pdf")

browser.close()
```

### 自动化操作

```python
import cfspider

browser = cfspider.Browser()

# 打开页面，返回 Playwright Page 对象
page = browser.get("https://example.com")

# 点击元素
page.click("button#submit")

# 填写表单
page.fill("input#username", "myname")
page.fill("input#password", "mypassword")

# 等待元素
page.wait_for_selector(".result")

# 获取文本
text = page.inner_text(".result")
print(text)

browser.close()
```

### 执行 JavaScript

```python
import cfspider

browser = cfspider.Browser()

# 在页面中执行 JavaScript
result = browser.execute_script("https://example.com", "document.title")
print(result)  # Example Domain

browser.close()
```

### 使用 with 语句

```python
import cfspider

with cfspider.Browser() as browser:
    html = browser.html("https://example.com")
    print(html)
# 自动关闭浏览器
```

### 非无头模式

```python
import cfspider

# headless=False 可以看到浏览器窗口
browser = cfspider.Browser(headless=False)

page = browser.get("https://example.com")
# 可以看到浏览器操作

browser.close()
```

## 错误处理

```python
import cfspider

cf_proxies = "https://your-workers.dev"

try:
    response = cfspider.get("https://httpbin.org/ip", cf_proxies=cf_proxies)
    response.raise_for_status()
    print(response.text)
except cfspider.CFSpiderError as e:
    print(f"请求失败: {e}")
except Exception as e:
    print(f"其他错误: {e}")
```

## Workers API 接口

| 方法 | 接口 | 说明 |
|------|------|------|
| GET | /api/fetch?url=... | 代理请求目标 URL，返回原始内容 |
| GET | /api/json?url=... | 代理请求目标 URL，返回 JSON（含节点信息） |
| GET | /api/pool | 获取当前节点的 IP 池状态信息 |
| GET | /api/proxyip | 获取当前使用的 Proxy IP 和节点代码 |
| POST | /proxy?url=...&method=... | Python 客户端使用的代理接口 |
| GET | /debug | 调试接口，返回当前请求的详细信息 |

## FAQ 常见问题

### 免费版有什么限制？
Workers 免费版每日 100,000 请求，单次 CPU 时间 10ms，足够大多数个人项目使用。付费版 $5/月起，无请求限制。

### IP 会被封吗？
Cloudflare IP 被数百万网站使用，信誉极高。但如果对单一网站高频请求，仍可能触发反爬。建议控制请求频率，模拟正常用户行为。

### 支持 HTTPS 吗？
完全支持。Workers 自动提供 SSL/TLS 加密，所有请求都通过 HTTPS 传输，确保数据安全。

### 能用于商业项目吗？
可以。MIT 许可证允许商业使用。但建议阅读 Cloudflare Workers 服务条款，确保用途合规。

### 为什么不能直接用 CF CDN IP？
Cloudflare CDN IP (如 172.64.x.x) 是 Anycast IP，仅用于边缘加速，不提供 HTTP 代理服务。必须通过 Workers 才能实现代理功能。

### 浏览器模式如何获得 CF IP？
需要配合 edgetunnel 项目使用 VLESS 协议。edgetunnel 将流量通过 Cloudflare 网络转发，实现浏览器流量从 CF IP 出口。

## 注意事项

1. Workers 免费版限制：每日 100,000 请求，单次 CPU 时间 10ms
2. 请求体大小限制：免费版 100MB，付费版无限制
3. 超时限制：免费版 30 秒，付费版无限制
4. 不支持 WebSocket、gRPC 等非 HTTP 协议
5. 浏览器模式需要额外安装 `playwright` 和 Chromium
6. edgetunnel VLESS 代理需要单独部署 edgetunnel Workers

## 致谢

本项目的浏览器 VLESS 代理功能借鉴并使用了 [edgetunnel](https://github.com/cmliu/edgetunnel) 项目。

edgetunnel 是一个优秀的 Cloudflare Workers VLESS 代理实现，感谢 [@cmliu](https://github.com/cmliu) 的开源贡献。

如需使用浏览器模式的 Cloudflare IP 出口功能，请先部署 edgetunnel Workers：
- 仓库地址：https://github.com/cmliu/edgetunnel

## License

MIT License

## 链接

- GitHub: https://github.com/violettoolssite/CFspider
- PyPI: https://pypi.org/project/cfspider/
- 官网: https://spider.violetteam.cloud
- edgetunnel: https://github.com/cmliu/edgetunnel
