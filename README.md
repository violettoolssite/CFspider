# CFspider - Cloudflare Workers Spider

免费的代理 IP 池，利用 Cloudflare 全球 300+ 边缘节点作为出口，支持隐身模式、TLS 指纹模拟、网页镜像和浏览器自动化。

## 📸 项目截图

### 官网首页

![官网首页](pages.png)

### Workers 部署界面

![Workers 部署界面](workers.png)

## 视频教程

**如何用 Cloudflare Workers 免费搭建代理 IP 池**

- [点击观看 B 站视频教程](https://b23.tv/1uzOf7M)
- [点击观看 YouTube 视频教程](https://youtu.be/oPeXiIFJ9TA?si=ukXsX8iP86ZTB4LP)

> ⚠️ **重要声明**：本项目仅供学习研究、网络安全测试、合规数据采集等**合法用途**。使用者须遵守所在地法律法规及 Cloudflare 服务条款。**任何非法使用（包括但不限于网络攻击、侵犯隐私、规避版权保护等）均与本项目开发者无关，使用者自行承担全部法律责任。**

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

### 合规使用 vs 违规滥用

| 对比项 | 违规滥用：直接攻击 CF CDN IP | CFspider 官方方式：Workers 部署 |
|--------|------------------------------|--------------------------------|
| **本质** | 撬锁硬闯公共大门 | 租用独立办公室 |
| **行为性质** | 对基础设施的违规滥用 | 合规使用计算服务 |
| **IP 信誉** | 极易被封，污染 IP 池 | 信誉相对更高 |
| **影响范围** | 害人害己，殃及无辜 | 风险自担，行为可控 |
| **法律风险** | 高风险，可能违反计算机滥用法规 | 低风险，遵守 Cloudflare TOS |
| **可持续性** | 不可持续，IP 被封后需不断寻找 | 长期可用，Workers 稳定运行 |
| **数据控制** | 无法控制 | 完全可控，有完整日志 |

**违规滥用方式：**
```python
# 错误示范 - 直接使用 CF CDN IP
proxies = {"http": "172.64.155.xxx:80"}
requests.get(url, proxies=proxies)  # 无法工作且违规！
```
- 直接使用 172.64.x.x、104.21.x.x 等公共 CDN IP
- 这属于**对基础设施的违规滥用**
- 流量会**污染 IP 池**，极易被封
- 导致该 IP 段上其他正常网站遭殃
- 可能触发 Cloudflare 安全机制被封禁
- 存在法律风险

**CFspider 官方方式：**
```python
# 正确方式 - 使用你的 Workers
import cfspider
cfspider.get(url, cf_proxies="你的.workers.dev")
```
- 在你的 Cloudflare 账户中部署个人 Workers 脚本
- 这属于**合规使用 Cloudflare 计算服务**
- 流量来自你的独立 Worker，行为可控
- IP 信誉由 Cloudflare 维护，相对更高
- 符合 Cloudflare 服务条款

**简单说：一个是在撬锁硬闯公共大门（违规、害人害己），一个是在租用大楼里的独立办公室（合规、风险自担）。**

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
- **支持多种代理方式**：HTTP 代理、SOCKS5 代理、VLESS 链接（支持直接填写完整链接）
- **支持异步请求**（基于 httpx），可使用 async/await 语法
- **支持 HTTP/2 协议**，更快的连接复用和性能
- **支持流式响应**，高效处理大文件下载
- **支持 TLS 指纹模拟**（基于 curl_cffi），可模拟 Chrome/Safari/Firefox/Edge 浏览器指纹
- **支持 IP 地图可视化**（基于 MapLibre GL），生成 HTML 地图文件，显示代理 IP 地理位置
- **支持网页镜像**（基于 Playwright + BeautifulSoup），一键保存完整网页到本地，自动下载所有资源
- **支持隐身模式**：自动添加完整浏览器请求头（Sec-Fetch-*、Accept-* 等 15+ 个头）
- **支持会话一致性**（StealthSession）：保持 User-Agent 和 Cookie 一致，模拟真实用户
- **支持行为模拟**：请求随机延迟、自动 Referer、多浏览器指纹轮换
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
| IP 地图可视化 | OK | 生成 HTML 地图文件 |
| 网页镜像 | OK | 保存完整网页到本地 |
| 隐身模式 | OK | 自动添加 15+ 个请求头 |
| StealthSession | OK | 会话一致性、自动 Referer |
| 随机延迟 | OK | 请求间随机等待 |

## 部署 Workers

![GitHub stars](https://img.shields.io/github/stars/violettoolssite/CFspider?style=social)
![GitHub forks](https://img.shields.io/github/forks/violettoolssite/CFspider?style=social)
![GitHub watchers](https://img.shields.io/github/watchers/violettoolssite/CFspider?style=social)

### ⭐ Stars 增长趋势

![Star History Chart](https://api.star-history.com/svg?repos=violettoolssite/CFspider&type=Date)

### 部署步骤

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 Workers & Pages
3. 点击 Create application → Create Worker
4. 将 `workers.js` 代码粘贴到编辑器中
5. 点击 Deploy

部署完成后，你将获得一个 Workers 地址，如 `https://xxx.username.workers.dev`

如需自定义域名，可在 Worker → Settings → Triggers → Custom Domain 中添加。

### Token 鉴权配置（可选）

为了增强安全性，你可以为 Workers 配置 Token 鉴权：

1. 在 Worker → Settings → Variables and Secrets 中添加环境变量
2. 变量名：`TOKEN`
3. 变量值：你的 token（支持多个 token，用逗号分隔，如 `token1,token2,token3`）
4. 保存并重新部署 Worker

配置 Token 后，所有 API 请求（除了首页和 debug 页面）都需要提供有效的 token：

```python
import cfspider

# 在请求时传递 token
response = cfspider.get(
    "https://httpbin.org/ip",
    cf_proxies="https://your-workers.dev",
    token="your-token"  # 从查询参数传递
)

# 或在 Session 中设置 token
with cfspider.Session(
    cf_proxies="https://your-workers.dev",
    token="your-token"
) as session:
    response = session.get("https://httpbin.org/ip")
```

**注意：**
- 如果不配置 `TOKEN` 环境变量，则所有请求都可以访问（无鉴权）
- Token 可以通过查询参数 `?token=xxx` 或 Header `Authorization: Bearer xxx` 传递
- 支持配置多个 token，用逗号分隔

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

# 使用 VLESS 链接（推荐，无需填写 UUID）
browser = cfspider.Browser(
    cf_proxies="vless://your-uuid@v2.example.com:443?path=/"
)
html = browser.html("https://httpbin.org/ip")
print(html)  # 返回 Cloudflare IP
browser.close()

# 使用 edgetunnel 域名 + UUID（旧方式）
browser = cfspider.Browser(
    cf_proxies="v2.example.com",
    vless_uuid="your-vless-uuid"
)
html = browser.html("https://httpbin.org/ip")
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

> **注意**: `http2` 和 `impersonate` 参数使用不同后端（httpx vs curl_cffi），不能同时启用。

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

## 隐身模式（反爬虫规避）

CFspider v1.7.0 新增隐身模式，解决反爬检测中最常见的三个问题：

1. **请求头不完整**：自动添加完整的浏览器请求头（15+ 个头）
2. **会话不一致**：StealthSession 保持 User-Agent、Cookie 一致
3. **行为模式单一**：支持随机延迟、自动 Referer、浏览器指纹轮换

### 基本用法（stealth=True）

```python
import cfspider

# 启用隐身模式 - 自动添加完整浏览器请求头
response = cfspider.get(
    "https://example.com",
    stealth=True
)
print(response.text)

# 自动添加的请求头包括：
# - User-Agent (Chrome 131 完整指纹)
# - Accept, Accept-Language, Accept-Encoding
# - Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, Sec-Fetch-User
# - Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform
# - Upgrade-Insecure-Requests, Cache-Control, Connection, DNT
```

### 选择浏览器类型

```python
import cfspider

# 使用 Firefox 请求头
response = cfspider.get(
    "https://example.com",
    stealth=True,
    stealth_browser='firefox'  # chrome, firefox, safari, edge, chrome_mobile
)

# 查看支持的浏览器
print(cfspider.STEALTH_BROWSERS)
# ['chrome', 'firefox', 'safari', 'edge', 'chrome_mobile']
```

### 随机延迟

```python
import cfspider

# 每次请求前随机延迟 1-3 秒
response = cfspider.get(
    "https://example.com",
    stealth=True,
    delay=(1, 3)  # 最小 1 秒，最大 3 秒
)
```

### StealthSession 会话一致性

```python
import cfspider

# 隐身会话 - 保持 User-Agent、Cookie 一致
with cfspider.StealthSession(
    browser='chrome',      # 固定浏览器类型
    delay=(0.5, 2.0),      # 请求间随机延迟
    auto_referer=True      # 自动添加 Referer
) as session:
    # 第一次请求
    r1 = session.get("https://example.com/page1")
    
    # 第二次请求 - 自动带上 Cookie 和 Referer
    r2 = session.get("https://example.com/page2")
    
    # 查看会话状态
    print(f"请求次数: {session.request_count}")
    print(f"当前 Cookie: {session.get_cookies()}")
```

### 配合 Workers 代理使用

```python
import cfspider

# 隐身模式 + Cloudflare IP 出口
response = cfspider.get(
    "https://httpbin.org/headers",
    cf_proxies="https://your-workers.dev",
    stealth=True
)
print(response.cf_colo)  # Cloudflare 节点代码

# 隐身会话 + Workers 代理
with cfspider.StealthSession(
    cf_proxies="https://your-workers.dev",
    browser='chrome'
) as session:
    r1 = session.get("https://example.com")
    r2 = session.get("https://example.com/api")
```

### 配合 TLS 指纹模拟

```python
import cfspider

# 隐身模式 + TLS 指纹模拟（终极反爬方案）
response = cfspider.get(
    "https://example.com",
    stealth=True,
    impersonate='chrome131'  # 模拟 Chrome 131 的 TLS 指纹
)
# 同时具备：完整请求头 + 真实 TLS 指纹
```

### 手动获取请求头

```python
import cfspider

# 获取指定浏览器的请求头模板
chrome_headers = cfspider.get_stealth_headers('chrome')
firefox_headers = cfspider.get_stealth_headers('firefox')

# 获取随机浏览器的请求头
random_headers = cfspider.get_random_browser_headers()

# 使用预定义的请求头常量
from cfspider import CHROME_HEADERS, FIREFOX_HEADERS, SAFARI_HEADERS
```

### 支持的浏览器请求头

| 浏览器 | 参数值 | 请求头数量 | 特点 |
|--------|--------|------------|------|
| Chrome 131 | `chrome` | 15 | 包含完整 Sec-CH-UA 客户端提示 |
| Firefox 133 | `firefox` | 12 | 包含 Sec-GPC 隐私头 |
| Safari 18 | `safari` | 5 | 简洁的 macOS Safari 指纹 |
| Edge 131 | `edge` | 14 | 基于 Chromium 的 Edge |
| Chrome Mobile | `chrome_mobile` | 10 | Android Pixel 设备指纹 |

## TLS 指纹模拟 (curl_cffi)

CFspider 集成了 curl_cffi，支持模拟各种浏览器的 TLS 指纹，有效绕过基于 JA3/JA4 指纹的反爬检测。

### 基本用法（直接在 get/post 中使用）

```python
import cfspider

# 直接在 get() 中使用 impersonate 参数
response = cfspider.get(
    "https://example.com",
    impersonate="chrome131"
)
print(response.text)

# POST 请求也支持
response = cfspider.post(
    "https://api.example.com",
    impersonate="safari18_0",
    json={"key": "value"}
)
```

### 配合 Workers 代理使用

```python
import cfspider

# TLS 指纹 + Cloudflare IP 出口
response = cfspider.get(
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

## IP 地图可视化

CFspider 支持生成 IP 地理位置地图，可视化展示代理请求使用的 Cloudflare 节点分布。

### 基本用法

```python
import cfspider

# 启用地图输出
response = cfspider.get(
    "https://httpbin.org/get",
    cf_proxies="https://your-workers.dev",
    map_output=True,                    # 启用地图输出
    map_file="my_proxy_map.html"        # 自定义文件名（可选）
)

# 请求完成后会自动生成 HTML 地图文件
# 在浏览器中打开 my_proxy_map.html 即可查看地图
```

### 多次请求收集

```python
import cfspider

# 清空之前的记录
cfspider.clear_map_records()

# 发送多个请求
urls = [
    "https://httpbin.org/get",
    "https://api.ipify.org",
    "https://ifconfig.me/ip"
]

for url in urls:
    response = cfspider.get(
        url,
        cf_proxies="https://your-workers.dev",
        map_output=True,
        map_file="multi_request_map.html"
    )
    print(f"{url}: {response.cf_colo}")

# 获取收集器信息
collector = cfspider.get_map_collector()
print(f"总请求数: {len(collector.get_records())}")
print(f"使用的节点: {collector.get_unique_colos()}")
```

### 手动添加记录

```python
import cfspider

# 手动添加 IP 记录
cfspider.add_ip_record(
    url="https://example.com",
    cf_colo="NRT",           # Cloudflare 节点代码
    status_code=200,
    response_time=50.0       # 毫秒
)

# 生成地图
cfspider.generate_map_html(
    output_file="custom_map.html",
    title="My Custom IP Map"
)
```

### 节点坐标数据

CFspider 内置了 39 个主要 Cloudflare 节点的坐标数据：

```python
import cfspider

# 查看支持的节点
print(f"支持节点数: {len(cfspider.COLO_COORDINATES)}")

# 查看某个节点信息
nrt = cfspider.COLO_COORDINATES["NRT"]
print(f"东京: {nrt['city']}, {nrt['country']} ({nrt['lat']}, {nrt['lng']})")
```

### IP 地图 API 参考

| 方法 | 说明 |
|------|------|
| `cfspider.get(..., map_output=True)` | 请求时启用地图输出 |
| `cfspider.clear_map_records()` | 清空地图记录 |
| `cfspider.get_map_collector()` | 获取 IP 收集器 |
| `cfspider.add_ip_record(**kwargs)` | 手动添加 IP 记录 |
| `cfspider.generate_map_html(**kwargs)` | 生成地图 HTML |
| `cfspider.COLO_COORDINATES` | 节点坐标数据库 |

### 地图特性

生成的 HTML 地图包含：

- **Cyberpunk 风格**：与 CFspider 整体风格一致
- **MapLibre GL**：高性能 WebGL 地图渲染
- **交互式标记**：点击标记查看详细信息
- **统计面板**：显示请求总数、唯一节点数
- **节点列表**：显示所有使用的 Cloudflare 节点代码
- **自动缩放**：地图自动缩放到数据范围

## 网页镜像

CFspider 支持将网页完整镜像到本地，包括 HTML、CSS、JavaScript、图片、字体等所有资源，并自动重写链接，实现离线浏览。

### 基本用法

```python
import cfspider

# 镜像网页到本地，自动打开浏览器预览
result = cfspider.mirror("https://httpbin.org", open_browser=True)

print(f"保存位置: {result.index_file}")
print(f"资源目录: {result.assets_dir}")
print(f"总文件数: {result.total_files}")
print(f"总大小: {result.total_size / 1024:.2f} KB")
```

### 指定保存目录

```python
import cfspider

# 指定保存目录，不自动打开浏览器
result = cfspider.mirror(
    "https://example.com",
    save_dir="./my_mirror",
    open_browser=False
)
```

### 配合代理使用

```python
import cfspider

# 使用 VLESS 代理镜像网页
result = cfspider.mirror(
    "https://httpbin.org",
    save_dir="./mirror_output",
    cf_proxies="vless://uuid@v2.example.com:443?path=/",
    open_browser=True
)
```

### 高级选项

```python
import cfspider

result = cfspider.mirror(
    "https://example.com",
    save_dir="./output",
    open_browser=True,
    timeout=60,          # 请求超时时间（秒）
    max_workers=10       # 并发下载线程数
)
```

### 目录结构

镜像完成后的目录结构如下：

```
save_dir/
├── index.html              # 主页面（链接已重写为相对路径）
└── assets/
    ├── css/
    │   └── style.css
    ├── js/
    │   └── main.js
    ├── images/
    │   ├── logo.png
    │   └── banner.jpg
    ├── fonts/
    │   └── roboto.woff2
    └── other/
        └── favicon.ico
```

### MirrorResult 对象

| 属性 | 类型 | 说明 |
|------|------|------|
| index_file | str | 主 HTML 文件路径 |
| assets_dir | str | 资源目录路径 |
| total_files | int | 下载的文件总数 |
| total_size | int | 总大小（字节） |
| failed_urls | list | 下载失败的 URL 列表 |
| success | bool | 是否成功 |

### 镜像 API 参考

| 方法 | 说明 |
|------|------|
| `cfspider.mirror(url, **kwargs)` | 镜像网页到本地 |
| `cfspider.MirrorResult` | 镜像结果类 |
| `cfspider.WebMirror(**kwargs)` | 镜像器类 |

### 镜像功能特性

- **完整资源保存**：自动下载 CSS、JS、图片、字体等所有资源
- **CSS 资源解析**：自动解析 CSS 中的 `url()` 引用（背景图、字体等）
- **链接重写**：将绝对 URL 自动转换为相对路径
- **并发下载**：多线程并发下载资源，提高效率
- **代理支持**：支持 VLESS、HTTP、SOCKS5 代理
- **浏览器渲染**：使用 Playwright 渲染 JavaScript 动态页面
- **自动预览**：下载完成后自动打开浏览器预览

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

# 4. VLESS 链接（推荐，无需填写 UUID）
browser = cfspider.Browser(cf_proxies="vless://uuid@v2.example.com:443?path=/")

# 5. edgetunnel 域名 + UUID（旧方式）
browser = cfspider.Browser(
    cf_proxies="v2.example.com",
    vless_uuid="your-vless-uuid"
)

# 6. 无代理
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
可以。Apache 2.0 许可证允许商业使用。但建议阅读 Cloudflare Workers 服务条款，确保用途合规。

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

## ⚖️ 法律声明与免责条款

### 项目定位

CFspider 是一个**技术研究项目**，旨在探索 Cloudflare Workers 边缘计算能力在网络代理领域的应用。本项目的目标用户是：

- 网络安全研究人员
- 学术研究者
- 合规数据采集开发者
- 技术爱好者

### ✅ 合规使用场景

| 场景 | 描述 | 合规性 |
|------|------|--------|
| **学术研究** | 研究分布式系统、边缘计算、网络架构 | ✅ 合规 |
| **安全测试** | 对自有或授权系统进行渗透测试 | ✅ 合规 |
| **公开数据采集** | 采集无需登录的公开信息（遵守 robots.txt） | ✅ 合规 |
| **API 开发测试** | 测试自己开发的 API 服务 | ✅ 合规 |
| **网络诊断** | 检测网络连通性、延迟、路由 | ✅ 合规 |
| **隐私保护** | 在合法范围内保护个人网络隐私 | ✅ 合规 |

### ❌ 禁止用途

**以下行为严格禁止，使用者须自行承担全部法律责任：**

| 禁止行为 | 法律风险 |
|----------|----------|
| 🚫 DDoS 攻击或任何形式的网络攻击 | 刑事犯罪 |
| 🚫 未授权访问计算机系统 | 刑事犯罪 |
| 🚫 侵犯版权（绕过付费墙、下载盗版内容） | 民事/刑事责任 |
| 🚫 侵犯隐私（爬取个人隐私数据） | 民事/刑事责任 |
| 🚫 网络诈骗、钓鱼攻击 | 刑事犯罪 |
| 🚫 规避制裁或出口管制 | 刑事犯罪 |
| 🚫 恶意竞争（大规模爬取竞争对手数据） | 不正当竞争 |
| 🚫 违反目标网站 Terms of Service | 民事责任 |

### 免责声明

1. **开发者免责**：本项目开发者仅提供技术工具，不对使用者的任何行为负责。使用者的行为完全由其个人承担法律责任。

2. **无担保**：本软件按"原样"提供，不提供任何明示或暗示的担保，包括但不限于适销性、特定用途适用性和非侵权性的担保。

3. **风险自担**：使用者理解并同意，使用本软件的风险完全由使用者自行承担。

4. **合规责任**：使用者有责任确保其使用行为符合：
   - 所在国家/地区的法律法规
   - Cloudflare 服务条款
   - 目标网站的服务条款和 robots.txt
   - 相关行业监管规定

5. **第三方服务**：本项目依赖 Cloudflare Workers 服务，使用者须同时遵守 [Cloudflare 服务条款](https://www.cloudflare.com/terms/)。

### 社区治理

本项目采取积极的社区管理策略：

1. **Issue 审核**：对于明显涉及非法用途的讨论（如"如何爬取 xxx 付费内容"、"如何攻击 xxx"），将：
   - 立即关闭 Issue
   - 保留证据记录
   - 必要时向 GitHub 举报

2. **PR 审核**：拒绝合并任何旨在促进非法活动的代码贡献

3. **文档明确**：在所有文档中明确声明合法用途

**如发现有人滥用本项目进行非法活动，请通过 GitHub Issue 举报。**

## License

Apache License 2.0

本项目采用 Apache 2.0 许可证。Apache 2.0 许可证已包含免责条款（第7、8条），请仔细阅读 [LICENSE](LICENSE) 文件。

## 链接

- GitHub: https://github.com/violettoolssite/CFspider
- PyPI: https://pypi.org/project/cfspider/
- 官网: https://spider.violetteam.cloud
- B 站视频教程: https://b23.tv/1uzOf7M
- YouTube 视频教程: https://youtu.be/oPeXiIFJ9TA?si=ukXsX8iP86ZTB4LP
- edgetunnel: https://github.com/cmliu/edgetunnel
