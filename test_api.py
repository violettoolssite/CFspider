import cfspider

print("1. 无代理:")
r = cfspider.get("https://httpbin.org/ip")
print(f"   IP: {r.json()['origin']}")

print("2. Workers代理 (cf_workers=True):")
r = cfspider.get("https://httpbin.org/ip", cf_proxies="cfspider.violetqqcom.workers.dev")
print(f"   IP: {r.json()['origin']}")

print("3. 普通代理 (cf_workers=False):")
r = cfspider.get("https://httpbin.org/ip", cf_proxies="127.0.0.1:9674", cf_workers=False)
print(f"   IP: {r.json()['origin']}")

print("\nDone!")

