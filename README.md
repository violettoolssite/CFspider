# CFspider

Cloudflare Workers 代理 IP 池，一键部署即可使用 Cloudflare 全球边缘节点 IP 作为代理出口。

## 在线演示

https://ip.kami666.xyz

## 部署方式

### 方式一：Cloudflare Dashboard

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 Workers & Pages
3. 创建新 Worker
4. 将 `workers.js` 代码复制粘贴到编辑器
5. 点击 Deploy

### 方式二：Wrangler CLI

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

## API 接口

| 接口 | 说明 |
|------|------|
| `GET /` | 赛博朋克风格 Web 界面 |
| `GET /api/fetch?url=` | 代理请求，返回原始内容 |
| `GET /api/json?url=` | 代理请求，返回 JSON |
| `GET /api/pool` | 获取 IP 池状态 |
| `POST /api/batch` | 批量代理请求 |

## 使用示例

### Python

```python
import requests

# 代理请求
resp = requests.get("https://ip.kami666.xyz/api/json", 
                    params={"url": "https://httpbin.org/ip"})
print(resp.json())
# {"success": true, "proxyip": "...", "data": {"origin": "172.64.xxx.xxx"}}
```

### cURL

```bash
curl "https://ip.kami666.xyz/api/fetch?url=https://httpbin.org/ip"
```

### JavaScript

```javascript
fetch("https://ip.kami666.xyz/api/json?url=https://httpbin.org/ip")
  .then(r => r.json())
  .then(console.log);
```

## 特点

- 使用 Cloudflare 全球边缘节点 IP
- 无需服务器，完全 Serverless
- 赛博朋克 2077 风格界面
- 实时显示 IP 池状态

## License

MIT
