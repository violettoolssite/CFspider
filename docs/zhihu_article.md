# 如何用 Cloudflare Workers 免费搭建代理 IP 池（完整指南）

> 本文介绍如何利用 Cloudflare Workers 的边缘计算能力，零成本搭建一个拥有全球 300+ 节点的代理 IP 池，并通过 Python 库 CFspider 进行调用。

---

## 一、为什么选择 Cloudflare Workers

### 1.1 传统代理方案的痛点

做过爬虫或数据采集的同学都知道，代理 IP 是绑定你的：

- **免费公共代理**：可用率不到 10%，速度慢，安全性存疑
- **数据中心代理**：IP 容易被识别为机房 IP，封禁率高
- **住宅代理**：质量最高，但价格昂贵（$5-15/GB）
- **自建代理服务器**：需要购买 VPS，IP 固定且容易被封

### 1.2 Cloudflare Workers 的优势

Cloudflare Workers 是 Cloudflare 提供的 Serverless 边缘计算服务，部署在其全球 300+ 个数据中心。用它做代理有以下优势：

**企业级 IP 信誉**

Cloudflare 的 IP（AS13335）被全球数百万网站使用，包括 Discord、Shopify、Medium 等知名服务。这些 IP 拥有极高的信誉度，不会像普通代理 IP 那样被轻易封禁。

**零成本**

Workers 免费版每日 100,000 次请求，无需信用卡。对于个人开发者和中小规模采集来说完全够用。

**全球分布**

请求会自动路由到离目标网站最近的边缘节点，延迟低、速度快。

**无需维护**

Serverless 架构，无需管理服务器，部署后即可使用。

---

## 二、方案对比

在开始之前，先澄清一个常见误区：

### 2.1 为什么不能直接使用 Cloudflare CDN IP

很多人看到 Cloudflare 有大量 IP（如 172.64.x.x、104.21.x.x），就想直接拿来当代理用。这是行不通的：

1. **技术层面**：CDN IP 是 Anycast IP，仅用于边缘加速，不提供 HTTP 代理服务
2. **协议层面**：这些 IP 不会响应 CONNECT 请求，无法建立代理隧道
3. **合规层面**：直接滥用 CDN IP 属于对基础设施的违规使用

### 2.2 CFspider 的正确方式

CFspider 的原理是：在你自己的 Cloudflare 账户中部署一个 Workers 脚本，这个脚本作为代理转发请求。请求从 Cloudflare 边缘节点发出，对目标网站来说，来源 IP 就是 Cloudflare 的企业级 IP。

这种方式：
- 合规使用 Cloudflare 计算服务
- 流量来自你的独立 Worker，行为可控
- 符合 Cloudflare 服务条款

---

## 三、部署步骤

### 3.1 注册 Cloudflare 账户

1. 访问 https://dash.cloudflare.com/sign-up
2. 使用邮箱注册账户（无需绑定域名，无需信用卡）

### 3.2 创建 Workers 脚本

1. 登录 Cloudflare Dashboard
2. 左侧菜单点击「Workers 和 Pages」
3. 点击「创建应用程序」->「创建 Worker」
4. 为 Worker 命名（如 `my-proxy`），点击「部署」
5. 部署后点击「编辑代码」

### 3.3 粘贴代理脚本

将以下代码完整粘贴到编辑器中（替换原有内容）：

```javascript
// CFspider Workers Proxy v1.7.3
const VERSION = '1.7.3';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // 健康检查
        if (url.pathname === '/health' || url.pathname === '/') {
            return new Response(JSON.stringify({
                status: 'ok',
                version: VERSION,
                ip: request.headers.get('CF-Connecting-IP'),
                colo: request.cf?.colo || 'unknown'
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // 代理请求
        if (url.pathname === '/proxy') {
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl) {
                return new Response('Missing url parameter', { status: 400 });
            }
            
            try {
                const targetRequest = new Request(targetUrl, {
                    method: request.method,
                    headers: request.headers,
                    body: request.method !== 'GET' ? request.body : null
                });
                
                const response = await fetch(targetRequest);
                const newHeaders = new Headers(response.headers);
                newHeaders.set('X-Proxy-By', 'CFspider/' + VERSION);
                newHeaders.set('X-CF-Colo', request.cf?.colo || 'unknown');
                
                return new Response(response.body, {
                    status: response.status,
                    headers: newHeaders
                });
            } catch (e) {
                return new Response('Proxy error: ' + e.message, { status: 500 });
            }
        }
        
        return new Response('CFspider Proxy Ready', { status: 200 });
    }
};
```

### 3.4 保存并部署

1. 点击右上角「保存并部署」
2. 部署成功后，你会获得一个 Workers 地址，格式如：`https://my-proxy.your-subdomain.workers.dev`

### 3.5 验证部署

在浏览器中访问你的 Workers 地址，应该看到类似响应：

```json
{
    "status": "ok",
    "version": "1.7.3",
    "ip": "你的IP",
    "colo": "SJC"
}
```

`colo` 字段表示处理请求的 Cloudflare 数据中心代码（如 SJC 表示圣何塞）。

---

## 四、Python 客户端使用

### 4.1 安装 CFspider

```bash
pip install cfspider
```

CFspider 是一个专门为 Cloudflare Workers 代理设计的 Python 库，语法兼容 requests，学习成本几乎为零。

### 4.2 基本使用

```python
import cfspider

# 设置你的 Workers 地址
workers_url = "https://my-proxy.your-subdomain.workers.dev"

# 发送 GET 请求（自动通过 Workers 代理）
response = cfspider.get(
    "https://httpbin.org/ip",
    cf_proxies=workers_url
)

print(response.json())
# 输出: {"origin": "172.64.xxx.xxx"}  <- Cloudflare IP
```

### 4.3 隐身模式（反爬绕过）

很多网站会检测请求头是否完整。CFspider 的隐身模式会自动添加 15+ 个真实浏览器请求头：

```python
import cfspider

response = cfspider.get(
    "https://example.com",
    cf_proxies=workers_url,
    stealth=True,           # 启用隐身模式
    stealth_browser='chrome' # 模拟 Chrome 浏览器
)
```

隐身模式添加的请求头包括：

| 请求头 | 示例值 |
|--------|--------|
| User-Agent | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36... |
| Accept | text/html,application/xhtml+xml,application/xml;q=0.9,image/avif... |
| Accept-Language | zh-CN,zh;q=0.9,en;q=0.8 |
| Accept-Encoding | gzip, deflate, br |
| Sec-Fetch-Dest | document |
| Sec-Fetch-Mode | navigate |
| Sec-Fetch-Site | none |
| Sec-Fetch-User | ?1 |
| Sec-CH-UA | "Google Chrome";v="131", "Chromium";v="131" |
| Sec-CH-UA-Mobile | ?0 |
| Sec-CH-UA-Platform | "Windows" |
| Upgrade-Insecure-Requests | 1 |
| Cache-Control | max-age=0 |

### 4.4 会话保持

对于需要登录或保持 Cookie 的场景，使用 StealthSession：

```python
from cfspider import StealthSession

# 创建隐身会话
session = StealthSession(
    cf_proxies=workers_url,
    browser='chrome'
)

# 第一次请求（获取 Cookie）
session.get("https://example.com/login")

# 后续请求自动携带 Cookie，且 User-Agent 保持一致
session.post("https://example.com/api/data", json={"key": "value"})
```

### 4.5 TLS 指纹模拟

部分网站会检测 TLS 指纹（JA3/JA4）。CFspider 支持模拟真实浏览器的 TLS 指纹：

```python
import cfspider

response = cfspider.get(
    "https://tls.browserleaks.com/json",
    cf_proxies=workers_url,
    impersonate="chrome131"  # 模拟 Chrome 131 的 TLS 指纹
)
```

支持的指纹包括：chrome131、chrome124、safari18、firefox133、edge131 等。

### 4.6 异步请求

对于高并发场景，使用异步 API：

```python
import asyncio
import cfspider

async def main():
    urls = [
        "https://httpbin.org/ip",
        "https://httpbin.org/headers",
        "https://httpbin.org/user-agent"
    ]
    
    tasks = [
        cfspider.aget(url, cf_proxies=workers_url, stealth=True)
        for url in urls
    ]
    
    responses = await asyncio.gather(*tasks)
    for r in responses:
        print(r.status_code)

asyncio.run(main())
```

---

## 五、进阶功能

### 5.1 浏览器自动化

对于 JavaScript 渲染的页面，CFspider 支持 Playwright 浏览器模式：

```python
from cfspider import Browser

# 需要先安装：pip install playwright && playwright install chromium

with Browser() as browser:
    page = browser.new_page()
    page.goto("https://example.com")
    
    # 等待 JS 渲染
    page.wait_for_selector(".content")
    
    # 获取渲染后的 HTML
    html = page.content()
    
    # 截图
    page.screenshot(path="screenshot.png")
```

浏览器模式需要配合 VLESS 代理才能使用 Cloudflare IP 出口，这需要额外部署 edgetunnel Workers。

### 5.2 网页镜像

一键下载整个网页（包括 CSS、JS、图片、字体）：

```python
from cfspider import mirror

# 镜像网页到本地
mirror(
    "https://example.com",
    output_dir="./example_mirror",
    cf_proxies=workers_url,
    stealth=True
)
```

### 5.3 IP 地图可视化

查看你的代理 IP 地理分布：

```python
from cfspider import generate_ip_map

# 生成 IP 分布地图
generate_ip_map(
    workers_url,
    output_file="ip_map.html",
    test_count=20
)
```

这会生成一个交互式地图，显示 Cloudflare 边缘节点的地理位置。

---

## 六、性能与限制

### 6.1 免费版限制

| 项目 | 限制 |
|------|------|
| 每日请求数 | 100,000 |
| 单次 CPU 时间 | 10ms |
| 请求体大小 | 100MB |
| 超时时间 | 30 秒 |

对于大多数采集场景，这些限制完全够用。如果需要更高配额，可以升级到 Workers 付费版（$5/月起）。

### 6.2 性能表现

实测数据（从中国大陆访问）：

| 指标 | 数值 |
|------|------|
| 平均延迟 | 50-200ms |
| 成功率 | >99% |
| 可用节点 | 300+ |

### 6.3 注意事项

1. 不要对单一网站高频请求，即使使用 Cloudflare IP 也可能触发反爬
2. 建议添加随机延迟，模拟真实用户行为
3. 遵守目标网站的 robots.txt 和服务条款
4. 仅用于合法用途，不要用于攻击或非法采集

---

## 七、常见问题

### Q1: 为什么响应的 IP 不是 Cloudflare IP

检查以下几点：
1. 确认 `cf_proxies` 参数设置正确
2. 确认 Workers 部署成功（访问健康检查接口验证）
3. 部分网站可能返回的是其 CDN IP，而非访问者 IP

### Q2: 如何提高并发性能

1. 使用异步 API（`cfspider.aget`）
2. 使用 `AsyncSession` 复用连接
3. 部署多个 Workers 进行负载均衡

### Q3: 遇到 403/429 错误怎么办

1. 启用隐身模式：`stealth=True`
2. 使用 TLS 指纹模拟：`impersonate="chrome131"`
3. 添加随机延迟：`delay=(1, 3)`
4. 降低请求频率

### Q4: Workers 脚本能自定义吗

可以。CFspider 仓库提供了完整的 Workers 脚本（`workers.js`），你可以根据需要修改，比如添加鉴权、IP 白名单等功能。

---

## 八、总结

通过 Cloudflare Workers，我们可以零成本搭建一个拥有全球 300+ 节点、企业级 IP 信誉的代理 IP 池。配合 CFspider Python 库，可以轻松实现：

- 基础 HTTP 请求代理
- 隐身模式反爬绕过
- TLS 指纹模拟
- 会话保持
- 异步高并发
- 浏览器自动化
- 网页镜像

相关链接：

- GitHub: https://github.com/violettoolssite/CFspider
- PyPI: https://pypi.org/project/cfspider/
- 官方文档: https://spider.violetteam.cloud

---

**声明**：本文仅供技术学习和合法用途。使用者需遵守相关法律法规及 Cloudflare 服务条款，对于任何非法使用行为，作者不承担任何责任。

