import cfspider
import requests

worker_url = "ip.kami666.xyz"
cf_response = cfspider.get("https://httpbin.org/ip", cf_proxies=worker_url)
req_response = requests.get("https://httpbin.org/ip")

print(cf_response.text)
print(req_response.text)