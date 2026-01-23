import cfspider
import os

# 禁用系统代理
os.environ['NO_PROXY'] = '*'
os.environ['no_proxy'] = '*'

# VLESS 模式测试（需要 UUID）
res = cfspider.get(
    "https://httpbin.org/ip",
    cf_proxies="https://ip.kami666.xyz",
    uuid="c373c80c-58e4-4e64-8db5-40096905ec58",
)
print(f"状态码: {res.status_code}")
print(f"出口 IP: {res.text}")
print(f"CF 节点: {res.cf_colo}")
