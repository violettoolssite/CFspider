# CFspider

[![PyPI version](https://img.shields.io/pypi/v/cfspider)](https://pypi.org/project/cfspider/)
[![Python](https://img.shields.io/pypi/pyversions/cfspider)](https://pypi.org/project/cfspider/)
[![License](https://img.shields.io/github/license/violettoolssite/CFspider)](LICENSE)
[![Update VLESS Configs](https://github.com/violettoolssite/CFspider/actions/workflows/update-vless-configs.yml/badge.svg)](https://github.com/violettoolssite/CFspider/actions/workflows/update-vless-configs.yml)

---

**v1.9.4** — Cloudflare Workers 免费代理 IP 池 + CloakBrowser 深度反检测

| 功能 | 说明 |
|------|------|
| **CloakBrowser 反检测** | C++ 源码级 Chromium 补丁，`stealth=True` / `browser=True` 一参启用，绕过人机验证 |
| **Cloudflare Workers IP 池** | VLESS/HTTP 双模式，300+ 全球节点，每次请求动态换 IP |
| **一键部署** | API Token 自动创建 Workers，无需手动操作 |

---

> ### ⚠️ 用 Cloudflare 翻墙上网？稳定性越来越差了
>
> Cloudflare Workers 本质是**边缘计算平台**，并非为翻墙设计。近期大量用户反馈：
> - 国内封锁力度加大，`workers.dev` 域名频繁被污染
> - VLESS/WebSocket 连接随时被 Reset，掉线频繁
> - 自定义域名绑定后也难逃周期性不可用
> - **CF 官方封禁 VLESS Workers（错误代码 1101）**：Cloudflare 已开始主动检测并封禁通过 Worker 建立的 VLESS 隧道，越来越多用户遇到 1101 错误
>
> **如果你执意要折腾 CF 节点**，这里有一批免费 VLESS / Trojan / SS 配置，每 **20 分钟**自动刷新，复制即可导入客户端：
> 📥 [下载配置文件](vless-configs.txt)
> 配置来源：[igareck/vpn-configs-for-russia](https://github.com/igareck/vpn-configs-for-russia)
>
> **如果你需要稳定翻墙，我们强烈推荐 [VPN Cheap](https://siusn-sisjxl.top/#/register?code=aVDxxRS0)**  
> 填写我的邀请码可获免费 5GB/月流量，支持全平台客户端，稳定快速。[👉 点击注册](https://siusn-sisjxl.top/#/register?code=aVDxxRS0) 邀请码：**`aVDxxRS0`**
>
> **如果你需要最强的数据抓取代理，我们强烈推荐：**
> - ⚡ **[Thordata 全球住宅代理](https://thordata.com/)** — **CFspider 绝佳搭档**
>   - **终极防封方案**：拥有 **1亿+** 纯净真人真实 ISP 住宅 IP（覆盖全球190+国家/地区），结合 CFspider 的 **CloakBrowser 真实 TLS 指纹伪装**，轻松绕过 Cloudflare 5s 盾、人机验证及各大顶级反爬机制，实现真正的“无痕隐形采集”。
>   - **强大的网页抓取 API**：除了原生代理池，还提供开箱即用的 Web Scraping API 及 SERP API，自动处理 JS 渲染与验证码，零配置直接获取海量公共数据。
>   - **极致稳定高并发**：高达 **99.9%** 连通率，无惧高频并发请求，毫秒级响应。无论是大规模电商数据抓取、SEO 监控，还是多账号防关联，都能完美胜任。
>   - 💰 **专属福利**：结账时输入优惠码 **`CFspider`** 即可享受 **10% 折扣**！
>   - [👉 **点击立刻注册，打造你的无敌爬虫矩阵**](https://dashboard.thordata.com/zh/register?invitation_code=CSSNEZF2)（[查看 CFspider 详细代码集成方案](#代理-ip-集成方案)）
> - **Cliproxy**：[https://dash.cliproxy.com/](https://dash.cliproxy.com/) — 爬虫 HTTP/SOCKS5，高速稳定
> - **1024proxy**：[https://1024proxy.com/](https://1024proxy.com/) — 住宅 IP，低至 $0.49/GB
> - **Novproxy**：[https://novproxy.com/](https://novproxy.com/) — 1 亿+ 住宅 IP，90 国家，$0.5/GB
> - **[BirdProxies](https://birdproxies.com/@violetto)** — 全球住宅代理 IP 服务商
>   - **静态住宅 IP**：长期固定 IP 地址，适合账号养号、长期登录、多账号防关联、社媒运营等需要 IP 稳定不变的场景
>   - **动态住宅 IP**：每次请求自动轮换真实住宅 IP，适合大规模数据采集、高频爬取、价格监控等需要大量不同 IP 的场景
>   - **全球覆盖**：支持多国家/地区 IP 选择，精准模拟真实用户地理位置，轻松访问地域限制内容
>   - **高匿名真人 IP**：真人住宅 IP 地址，非机房 IP，不易被目标网站识别和封禁，采集成功率极高
>   - 💰 **专属优惠**：使用我的链接注册享 **15% 折扣**！
>   - [👉 **点击注册 BirdProxies，享受 15% 优惠**](https://birdproxies.com/@violetto)
>
> ![Thordata 专属优惠码](专属优惠码.png)

---

## 安装

```bash
pip install cfspider
```

### CloakBrowser 反检测（可选，强烈推荐）

```bash
pip install cloakbrowser
python -m cloakbrowser install   # 安装内置 Chromium
```

> 未安装 CloakBrowser 时自动回退到标准 Playwright，反检测效果较弱。

---

## CloakBrowser 反检测

### stealth=True — HTTP 级隐身

通过 CloakBrowser `context.request` 发起请求：真实 TLS 指纹 + 随机 Chrome 136–146 真实 UA，无 JS 渲染，速度快。

```python
import cfspider

# 适合：API 接口、无 JS 防护页面、高频采集
r = cfspider.get("https://httpbin.org/headers", stealth=True)
print(r.json()["headers"]["User-Agent"])
# Mozilla/5.0 ... Chrome/146.0.7652.77 Safari/537.36
```

### browser=True — 完整页面渲染

通过 CloakBrowser `page.goto()` 打开完整浏览器：执行 JS、触发动态内容，可绕过 Cloudflare Turnstile / 5s 盾 / 滑块验证。

```python
# 基本用法（默认无头）
r = cfspider.get("https://example.com", browser=True)
print(r.text)           # 完整 HTML（JS 已执行）

# 有头模式（目视调试）
r = cfspider.get("https://example.com", browser=True, headless=False)

# 等待网络空闲 + 截图
r = cfspider.get("https://example.com", browser=True,
                 wait_until="networkidle", screenshot="out.png")

# 页面加载后执行 JS
r = cfspider.get("https://example.com", browser=True,
                 js_eval="document.title")
print(r.js_result)      # 'Example Domain'
```

### stealth=True 自动 session 复用（默认开启）

`stealth=True` 会按**域名**自动复用同一个 CloakBrowser 实例：共享 Cookie、Referer、TLS 指纹，无需手动管理。

```python
# 首次请求 example.com → 创建 session
r1 = cfspider.get("https://example.com/page1", stealth=True)

# 同域名后续请求 → 自动复用（带 Cookie + Referer）
r2 = cfspider.get("https://example.com/page2", stealth=True)
r3 = cfspider.get("https://example.com/api/data", stealth=True)

# 不同域名各自独立 session
r4 = cfspider.get("https://other.com/", stealth=True)
```

**取消复用（每次全新 session）：**

```python
r = cfspider.get("https://example.com", stealth=True, no_sess=True)
```

**手动清理 session 池：**

```python
cfspider.close_session("example.com")   # 关闭指定域名的 session
cfspider.close_all_sessions()           # 清空所有缓存 session
```

### StealthSession — 手动会话管理

需要精细控制（自定义 delay、手动 Cookie 操作等）时，直接使用 `StealthSession`：

```python
with cfspider.StealthSession() as sess:
    r1 = sess.get("https://example.com/page1")
    r2 = sess.get("https://example.com/page2")   # 自动带 Cookie + Referer
    print(f"请求次数: {sess.request_count}")
    print(sess.get_cookies())
```

### 模式对比

| | 普通请求 | `stealth=True` | `browser=True` |
|---|---|---|---|
| JS 执行 | ✗ | ✗ | ✅ |
| 真实 TLS 指纹 | ✗ | ✅ | ✅ |
| 自动 session 复用 | ✗ | ✅（默认） | ✗ |
| 绕过 Turnstile | ✗ | 部分 | ✅ |
| 截图 / js_eval | ✗ | ✗ | ✅ |
| 速度 | 最快 | 快 | 慢 |
| 适合场景 | 普通 API | 反爬页面、高频 | 验证码、动态渲染 |

---

## Cloudflare Workers 代理 IP 池

### 自动创建 Workers（推荐）

```python
import cfspider

workers = cfspider.make_workers(
    api_token="your-cloudflare-api-token",
    account_id="your-account-id"
)
print(workers.url)   # https://xxx.workers.dev

# 配合 stealth/browser 使用
r = cfspider.get("https://httpbin.org/ip",
                 cf_proxies=workers, stealth=True)
print(r.json())
```

### 手动使用 Workers

```python
# 动态 IP（默认，每次请求换 IP）
r = cfspider.get("https://httpbin.org/ip",
                 cf_proxies="https://your-workers.dev")

# 固定 IP
r = cfspider.get("https://httpbin.org/ip",
                 cf_proxies="https://your-workers.dev",
                 static_ip=True)

# 配置了自定义 UUID 时需传入
r = cfspider.get("https://httpbin.org/ip",
                 cf_proxies="https://your-workers.dev",
                 uuid="your-uuid")
```

### 双层代理（国内无法直连时）

```python
# 本地 → Workers (VLESS) → 第三方代理 → 目标
r = cfspider.get("https://httpbin.org/ip",
                 cf_proxies="https://your-workers.dev",
                 two_proxy="proxy.example.com:3010:user:pass")
```

---

---

## 异步 API

所有异步方法与同步版本参数完全一致，支持 `stealth` / `browser`（通过 `run_in_executor` 线程池运行 CloakBrowser，不阻塞事件循环）。

```python
import asyncio
import cfspider

async def main():
    # 普通异步请求
    r = await cfspider.aget("https://httpbin.org/ip",
                            cf_proxies="https://your-workers.dev")
    print(r.json())

    # 异步 stealth
    r = await cfspider.aget("https://httpbin.org/headers", stealth=True)
    print(r.json()["headers"]["User-Agent"])

    # 异步 browser + js_eval
    r = await cfspider.aget("https://example.com", browser=True,
                            js_eval="document.title")
    print(r.js_result)

    # 并发请求
    tasks = [cfspider.aget("https://httpbin.org/ip",
                           cf_proxies="https://your-workers.dev")
             for _ in range(5)]
    results = await asyncio.gather(*tasks)
    for res in results:
        print(res.json())

asyncio.run(main())
```

| 方法 | 说明 |
|------|------|
| `cfspider.aget(url, **kwargs)` | 异步 GET |
| `cfspider.apost(url, **kwargs)` | 异步 POST |
| `cfspider.aput(url, **kwargs)` | 异步 PUT |
| `cfspider.adelete(url, **kwargs)` | 异步 DELETE |
| `cfspider.ahead(url, **kwargs)` | 异步 HEAD |
| `cfspider.apatch(url, **kwargs)` | 异步 PATCH |
| `cfspider.astream(method, url, **kwargs)` | 流式响应 |

---

## cfspider-browser — AI 智能浏览器

**cfspider-browser** 是基于 Electron + React 的 AI 驱动智能浏览器，通过自然语言对话控制浏览器，像真人一样操作网页。

### 核心功能

- **AI 智能助手**：通过自然语言对话控制浏览器，支持多种 AI 模型（Ollama、OpenAI、DeepSeek、Moonshot 等）
- **真人模拟操作**：AI 像真人一样点击、输入、滚动，完整展示操作过程
- **虚拟鼠标**：可视化鼠标移动和点击动画，直观展示 AI 操作
- **真人学习系统**：像真人一样学习，记住成功经验，避免重复错误
- **视频总结**：通过视觉模型分析视频内容，支持最多 40 帧分析

### 快速开始

```bash
cd cfspider-browser
npm install
npm run electron:dev
```

### 配置 AI

1. 点击右上角设置按钮
2. 选择 AI 服务商或自定义 API 地址
3. 输入 API 密钥
4. 选择模型

支持的 AI 服务商：Ollama（本地运行，无需 API Key）、OpenAI、DeepSeek、Groq、Moonshot (Kimi)、智谱 AI、通义千问、SiliconFlow 及其他 OpenAI 兼容 API。

### 使用方法

点击右下角蓝色按钮打开 AI 对话框，输入自然语言指令：

- "打开 GitHub" — AI 会通过搜索引擎搜索并点击打开
- "搜索 Python 教程" — 在当前搜索引擎搜索
- "把搜索引擎改成谷歌" — 切换默认搜索引擎
- "在 GitHub 搜索 vue" — 先打开 GitHub 再搜索
- "返回上一页" — 点击后退

### 技术栈

- **Electron** — 桌面应用框架
- **React 18** — UI 框架
- **TypeScript** — 类型安全
- **Tailwind CSS** — 样式
- **Zustand** — 状态管理
- **Vite** — 构建工具

### 详细文档

完整文档请查看 [cfspider-browser/README.md](cfspider-browser/README.md)

---

## API 参数参考

### 请求方法

```python
cfspider.get(url, **kwargs)
cfspider.post(url, **kwargs)
cfspider.put(url, **kwargs)
cfspider.delete(url, **kwargs)
cfspider.head(url, **kwargs)
cfspider.patch(url, **kwargs)
cfspider.options(url, **kwargs)
cfspider.request(method, url, **kwargs)
```

### 参数列表

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | str | — | 目标 URL |
| `cf_proxies` | str / WorkersManager | None | Workers 地址或对象 |
| `uuid` | str | None | VLESS UUID（自定义时必填） |
| `static_ip` | bool | False | 固定 IP 模式 |
| `two_proxy` | str | None | 双层代理 `host:port:user:pass` |
| **`stealth`** | **bool** | **False** | **CloakBrowser HTTP 隐身（真实 TLS + Chrome 146 UA）** |
| `no_sess` | bool | False | `stealth=True` 时禁用 session 复用，每次全新 session |
| **`browser`** | **bool** | **False** | **CloakBrowser 完整渲染（执行 JS，可绕过 CAPTCHA）** |
| `headless` | bool | True | 浏览器无头模式（False = 有头，可目视）|
| `wait_until` | str | `'load'` | `load` / `domcontentloaded` / `networkidle` |
| `screenshot` | str | None | 截图保存路径 |
| `js_eval` | str | None | 页面加载后执行的 JS，结果存入 `response.js_result` |
| `http2` | bool | False | 启用 HTTP/2（普通请求路径） |
| `params` | dict | None | URL 查询参数 |
| `data` | dict/str | None | 表单数据 |
| `json` | dict | None | JSON 请求体 |
| `headers` | dict | None | 自定义请求头 |
| `cookies` | dict | None | Cookies |
| `timeout` | int/float | 30 | 超时时间（秒） |
| `proxies` | dict | None | 普通 HTTP/SOCKS5 代理（[示例](#代理-ip-集成方案)） |

### 响应对象

```python
r = cfspider.get("https://example.com")
r.status_code   # HTTP 状态码
r.text          # 响应文本
r.content       # 响应字节
r.json()        # 解析 JSON
r.headers       # 响应头
r.cf_colo       # Cloudflare 节点代码（如 NRT）
r.cf_ray        # Cloudflare Ray ID
r.js_result     # js_eval 执行结果（browser=True 时）
```

---

## 代理 IP 集成方案

将第三方代理 IP 服务无缝集成至 CFspider，结合 CloakBrowser 反检测能力，实现高匿名、高成功率的自动化数据采集。

![Thordata 代理集成方案](IP质量检测.png)

### Thordata 住宅代理集成

```python
import cfspider

# 基础集成：普通 HTTP 代理
proxies = {
    'http': 'http://USERNAME:PASSWORD@user.pr.thordata.com:9999',
    'https': 'http://USERNAME:PASSWORD@user.pr.thordata.com:9999'
}

r = cfspider.get("https://ipinfo.thordata.com", proxies=proxies)
print(r.json())
```

**结合 CloakBrowser 反检测（推荐）**

```python
# 住宅代理 + Stealth 反检测：真实 TLS 指纹 + 住宅 IP
r = cfspider.get("https://example.com",
                 proxies=proxies,
                 stealth=True)
print(r.text)

# 住宅代理 + Browser 完整渲染：绕过 CAPTCHA + 住宅 IP
r = cfspider.get("https://protected-site.com",
                 proxies=proxies,
                 browser=True,
                 wait_until="networkidle")
print(r.text)
```

**多语言 SDK 示例**

| 语言 | 集成代码 |
|------|----------|
| **Python** | `cfspider.get(url, proxies={'http': 'http://user:pass@proxy:port'})` |
| **cURL** | `curl -x http://user:pass@proxy:port https://example.com` |
| **Node.js** | 使用 `https-proxy-agent` 配合请求库 |
| **Go** | 设置 `http.Transport` 的 `Proxy` 字段 |

> 💡 **为什么需要代理 IP？**
> - 避免 IP 被封禁，支持高频请求
> - 模拟真实用户地理位置
> - 结合 CloakBrowser 实现**指纹 + IP** 双重伪装

**国内无法直连？** 使用 [`two_proxy`](https://github.com/violettoolssite/CFspider#%E5%8F%82%E6%95%B0%E5%88%97%E8%A1%A8) 双层代理：`cfspider.get(url, proxies=proxies, two_proxy="host:port:user:pass")`

**专属优惠码：CFspider**（输入可获 10% 折扣），[👉 点击注册](https://dashboard.thordata.com/zh/register?invitation_code=CSSNEZF2)

![Thordata 专属优惠码](专属优惠码.png)

---

## 部署 Workers

### 自动部署（推荐）

```python
import cfspider

workers = cfspider.make_workers(
    api_token="your-cloudflare-api-token",
    account_id="your-account-id",
    name="my-proxy"          # 可选，Workers 名称
)
print(workers.url)
```

### 手动部署

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Workers & Pages → 创建应用 → 创建 Worker
3. 将 `workers/workers.js` 内容粘贴进编辑器
4. 部署

### UUID 安全配置（推荐）

在 Worker → Settings → Variables 中添加：
- 变量名：`UUID`
- 变量值：标准 UUID（如 `xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx`）

配置后使用时必须传入相同 UUID：

```python
r = cfspider.get("https://httpbin.org/ip",
                 cf_proxies="https://your-workers.dev",
                 uuid="your-uuid")
```

---

## Session 管理工具

| 函数 | 说明 |
|------|------|
| `cfspider.close_session(url_or_domain)` | 关闭并移除指定域名的自动 session |
| `cfspider.close_all_sessions()` | 关闭并清空所有自动 session 缓存 |

```python
# 采集完一个网站后释放资源
cfspider.close_session("example.com")

# 程序退出前全部清理
cfspider.close_all_sessions()
```

---

## 运行测试

```bash
python cloak_test.py
```

测试覆盖：普通请求、stealth、browser（无头 + 有头）、js_eval、截图、StealthSession、异步 stealth/browser、bot 检测页面、UA 版本号验证。

---

## 免责声明

本项目仅供学习研究、网络安全测试、合规数据采集等**合法用途**。使用者须遵守所在地法律法规及 Cloudflare 服务条款。任何非法使用与本项目开发者无关，使用者自行承担全部责任。

---

## 链接

- GitHub: https://github.com/violettoolssite/CFspider
- PyPI: https://pypi.org/project/cfspider/
- 视频教程: https://b23.tv/1uzOf7M
