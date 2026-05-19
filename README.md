# CFspider

[![PyPI version](https://img.shields.io/pypi/v/cfspider)](https://pypi.org/project/cfspider/)
[![Python](https://img.shields.io/pypi/pyversions/cfspider)](https://pypi.org/project/cfspider/)
[![License](https://img.shields.io/github/license/violettoolssite/CFspider)](LICENSE)

**v1.9.4** — Cloudflare Workers 免费代理 IP 池 + CloakBrowser 深度反检测

| 功能 | 说明 |
|------|------|
| **CloakBrowser 反检测** | C++ 源码级 Chromium 补丁，`stealth=True` / `browser=True` 一参启用，绕过人机验证 |
| **Cloudflare Workers IP 池** | VLESS/HTTP 双模式，300+ 全球节点，每次请求动态换 IP |
| **一键部署** | API Token 自动创建 Workers，无需手动操作 |

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

### StealthSession — 会话复用

复用同一 CloakBrowser 实例，自动保持 Cookie / Referer / TLS 指纹。

```python
with cfspider.StealthSession() as sess:
    r1 = sess.get("https://example.com/page1")
    r2 = sess.get("https://example.com/page2")   # 自动带 Cookie + Referer
    print(f"请求次数: {sess.request_count}")
```

### 模式对比

| | `stealth=True` | `browser=True` |
|---|---|---|
| JS 执行 | ✗ | ✅ |
| 绕过 Turnstile | 部分 | ✅ |
| 速度 | 快 | 慢 |
| 截图 / js_eval | ✗ | ✅ |
| 适合场景 | API、高频 | 动态页面、验证码 |

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
| `proxies` | dict | None | 普通 HTTP/SOCKS5 代理 |

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
