# CFspider - Cloudflare Workers 代理请求库

语法与 `requests` 完全一致，通过 `cf_proxies` 参数指定 Workers 地址，使用 Cloudflare 全球节点 IP 作为出口。

## 安装

```bash
pip install cfspider
```

或从 GitHub 安装：

```bash
pip install git+https://github.com/violettoolssite/CFspider.git
```

## 快速开始

```python
import cfspider

# 发送 GET 请求
response = cfspider.get(
    "https://httpbin.org/ip",
    cf_proxies="https://ip.kami666.xyz"
)
print(response.text)  # {"origin": "162.159.xxx.xxx"}  Cloudflare IP
```

## 使用方式

### 1. 函数式调用（类似 requests）

```python
import cfspider

# 指定 Workers 地址
CF_PROXY = "https://ip.kami666.xyz"

# GET 请求
response = cfspider.get("https://httpbin.org/ip", cf_proxies=CF_PROXY)
print(response.text)
print(response.status_code)  # 200

# 查看 Cloudflare 节点信息
print(response.cf_colo)      # NRT (东京)
print(response.cf_proxyip)   # 节点 PROXYIP
```

### 2. 使用 Session（推荐）

```python
import cfspider

# 创建 Session，只需设置一次 cf_proxies
session = cfspider.Session(cf_proxies="https://ip.kami666.xyz")

# 之后的请求无需再指定 cf_proxies
response = session.get("https://httpbin.org/ip")
print(response.text)

response = session.get("https://example.com")
print(response.text)

# 关闭 Session
session.close()
```

### 3. 使用 with 语句

```python
import cfspider

with cfspider.Session(cf_proxies="https://ip.kami666.xyz") as session:
    response = session.get("https://httpbin.org/ip")
    print(response.json())
```

## API 参考

### 函数式接口

| 函数 | 说明 |
|------|------|
| `cfspider.get(url, cf_proxies=None, **kwargs)` | GET 请求 |
| `cfspider.post(url, cf_proxies=None, data=None, json=None, **kwargs)` | POST 请求 |
| `cfspider.put(url, cf_proxies=None, **kwargs)` | PUT 请求 |
| `cfspider.delete(url, cf_proxies=None, **kwargs)` | DELETE 请求 |
| `cfspider.head(url, cf_proxies=None, **kwargs)` | HEAD 请求 |
| `cfspider.options(url, cf_proxies=None, **kwargs)` | OPTIONS 请求 |
| `cfspider.patch(url, cf_proxies=None, **kwargs)` | PATCH 请求 |

### Response 对象

| 属性/方法 | 说明 |
|----------|------|
| `response.text` | 响应文本 |
| `response.content` | 响应字节 |
| `response.json()` | 解析 JSON |
| `response.status_code` | 状态码 |
| `response.headers` | 响应头 |
| `response.ok` | 是否成功 (2xx) |
| `response.cf_colo` | Cloudflare 节点代码 |
| `response.cf_proxyip` | 使用的 PROXYIP |

### Session 类

```python
session = cfspider.Session(cf_proxies="https://workers.dev")
session.headers["User-Agent"] = "MyBot/1.0"  # 设置默认请求头
response = session.get("https://example.com")
session.close()
```

## 对比 requests

```python
# requests 使用代理
import requests
response = requests.get("https://httpbin.org/ip", proxies={
    "http": "http://proxy:8080",
    "https": "http://proxy:8080"
})

# cfspider 使用 Cloudflare 代理
import cfspider
response = cfspider.get("https://httpbin.org/ip", 
                         cf_proxies="https://ip.kami666.xyz")
```

## 部署 Workers

### 1. 安装 Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. 部署

```bash
cd CFspider
wrangler deploy
```

部署后获得 Workers 地址，如 `https://cfspider-test.your-account.workers.dev`

### 3. 使用

```python
import cfspider

response = cfspider.get(
    "https://httpbin.org/ip",
    cf_proxies="https://cfspider-test.your-account.workers.dev"
)
print(response.text)
```

## 完整示例

### 爬虫示例

```python
import cfspider
from bs4 import BeautifulSoup

CF_PROXY = "https://ip.kami666.xyz"

# 获取页面
response = cfspider.get("https://news.ycombinator.com", cf_proxies=CF_PROXY)

# 解析 HTML
soup = BeautifulSoup(response.text, "html.parser")
for title in soup.select(".titleline > a")[:10]:
    print(title.text)
```

### 批量请求

```python
import cfspider
import concurrent.futures

CF_PROXY = "https://ip.kami666.xyz"
urls = [
    "https://httpbin.org/ip",
    "https://example.com",
    "https://httpbin.org/headers"
]

def fetch(url):
    return cfspider.get(url, cf_proxies=CF_PROXY)

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
    results = list(executor.map(fetch, urls))

for url, resp in zip(urls, results):
    print(f"{url}: {resp.status_code}")
```

## 项目结构

```
CFspider/
├── cfspider/               # Python 库
│   ├── __init__.py
│   ├── api.py              # 函数式接口
│   └── session.py          # Session 类
├── workers/
│   └── workers.js          # Cloudflare Workers 代码
├── wrangler.toml           # Wrangler 配置
├── setup.py                # Python 包配置
└── README.md
```

## 注意事项

1. **请求限制** - Cloudflare Workers 免费版每日 100,000 请求
2. **出口 IP** - 使用 Cloudflare 边缘节点 IP，每次请求可能不同
3. **HTTPS 支持** - 完全支持 HTTPS 请求

## License

MIT
