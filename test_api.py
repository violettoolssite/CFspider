# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8')

import cfspider

CF_WORKERS = "https://cfspider.violetqqcom.workers.dev"
CF_UUID = "3fde701a-f0c9-45e7-a1b0-b5fe62c4698c"

print("1. 无代理:")
r = cfspider.get("https://httpbin.org/ip")
print(f"   IP: {r.json()['origin']}")

print("2. Workers代理 (cf_workers=True):")
r = cfspider.get("https://httpbin.org/ip", cf_proxies=CF_WORKERS, uuid=CF_UUID)
print(f"   IP: {r.json()['origin']}")

print("3. 无代理 HTTP/2:")
r = cfspider.get("https://httpbin.org/ip", http2=True)
print(f"   IP: {r.json()['origin']}")

print("\nDone!")

