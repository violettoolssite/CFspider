"""
CFspider Workers Manager - 自动创建和管理 Cloudflare Workers

使用 Cloudflare API 自动创建、部署和管理 Workers，
当 Workers 失效时自动创建新的。

使用方法：
    >>> import cfspider
    >>> 
    >>> # 创建 Workers 管理器
    >>> workers = cfspider.make_workers(
    ...     api_token="your-cloudflare-api-token",
    ...     account_id="your-account-id"
    ... )
    >>> 
    >>> # 直接用于请求
    >>> response = cfspider.get("https://httpbin.org/ip", cf_proxies=workers)
    >>> 
    >>> # 获取 Workers URL
    >>> print(workers.url)
    
API Token 获取方式：
    1. 登录 Cloudflare Dashboard
    2. 点击右上角头像 -> My Profile -> API Tokens
    3. 点击 Create Token
    4. 选择 "Edit Cloudflare Workers" 模板
    5. 复制生成的 Token

Account ID 获取方式：
    1. 登录 Cloudflare Dashboard
    2. 进入 Workers & Pages
    3. 右侧边栏可以看到 Account ID
"""

import requests
import random
import string
import time
import threading
import os
from typing import Optional
from pathlib import Path


def _get_workers_script() -> str:
    """获取破皮版 Workers 代码"""
    # 尝试多个可能的路径（按优先级）
    possible_paths = [
        # 1. pip 安装后的路径（在 cfspider 包内）
        Path(__file__).parent / "workers" / "破皮版workers.js",
        # 2. 项目根目录的 workers 文件夹
        Path(__file__).parent.parent / "workers" / "破皮版workers.js",
        # 3. 当前工作目录
        Path("workers") / "破皮版workers.js",
        Path("破皮版workers.js"),
    ]
    
    for path in possible_paths:
        if path.exists():
            return path.read_text(encoding='utf-8')
    
    # 如果找不到文件，使用内嵌的简化版本
    return _FALLBACK_SCRIPT


# 备用简化版脚本（当找不到破皮版时使用）
_FALLBACK_SCRIPT = '''import{connect}from"cloudflare:sockets";const UUID=crypto.randomUUID();export default{async fetch(e,t){const n=new URL(e.url),s=t.UUID||UUID;if("/"===n.pathname||"/api/config"===n.pathname)return new Response(JSON.stringify({host:n.hostname,vless_path:"/"+s,version:"auto",uuid:s}),{headers:{"Content-Type":"application/json"}});if(n.pathname==="/"+s&&"websocket"===e.headers.get("Upgrade")){const[t,n]=Object.values(new WebSocketPair);return n.accept(),new Response(null,{status:101,webSocket:t})}return"/proxy"===n.pathname?handleProxy(e):new Response("404",{status:404})}};async function handleProxy(e){const t=new URL(e.url).searchParams.get("url");if(!t)return new Response("Missing url",{status:400});try{return await fetch(t)}catch(e){return new Response(e.message,{status:500})}}'''


# Workers 代码（运行时加载）
WORKERS_SCRIPT = None


class WorkersManager:
    """
    Cloudflare Workers 管理器
    
    自动创建和管理 Workers，当失效时自动重建。
    可以直接作为 cf_proxies 参数使用。
    """
    
    def __init__(
        self,
        api_token: str,
        account_id: str,
        worker_name: Optional[str] = None,
        auto_recreate: bool = True,
        check_interval: int = 60,
        env_vars: Optional[dict] = None,
        my_domain: Optional[str] = None
    ):
        """
        初始化 Workers 管理器
        
        Args:
            api_token: Cloudflare API Token（需要 Workers 编辑权限）
            account_id: Cloudflare Account ID
            worker_name: Workers 名称（可选，不填则自动生成）
            auto_recreate: 失效后是否自动重建（默认 True）
            check_interval: 健康检查间隔（秒，默认 60）
            env_vars: Workers 环境变量（可选）
                常用变量：
                - UUID: VLESS UUID
                - PROXYIP: 代理 IP
                - SOCKS5: SOCKS5 代理地址
                
                示例: {"UUID": "your-uuid", "PROXYIP": "1.2.3.4"}
        """
        self.api_token = api_token
        self.account_id = account_id
        self.worker_name = worker_name or self._generate_name()
        self.auto_recreate = auto_recreate
        self.check_interval = check_interval
        self.env_vars = env_vars or {}
        self.my_domain = my_domain
        
        self._url: Optional[str] = None
        self._custom_url: Optional[str] = None
        self._uuid: Optional[str] = None
        self._healthy = False
        self._check_thread: Optional[threading.Thread] = None
        self._stop_check = False
        
        # 如果用户指定了 UUID 环境变量，记录下来
        if 'UUID' in self.env_vars:
            self._uuid = self.env_vars['UUID']
        
        # 创建 Workers
        self._create_worker()
        
        # 配置自定义域名
        if my_domain and self._healthy:
            self._setup_custom_domain(my_domain)
        
        # 启动健康检查
        if auto_recreate:
            self._start_health_check()
    
    def _generate_name(self) -> str:
        """生成随机 Workers 名称"""
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        return f"cfspider-{suffix}"
    
    def _get_headers(self) -> dict:
        """获取 API 请求头"""
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/javascript"
        }
    
    def _create_worker(self) -> bool:
        """创建或更新 Workers"""
        api_url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/workers/scripts/{self.worker_name}"
        
        # 获取 Workers 脚本
        script = _get_workers_script()
        
        try:
            # 如果有环境变量，使用 multipart/form-data 格式
            if self.env_vars:
                # 构建元数据
                metadata = {
                    "main_module": "worker.js",
                    "bindings": []
                }
                
                # 添加环境变量绑定
                for key, value in self.env_vars.items():
                    metadata["bindings"].append({
                        "type": "plain_text",
                        "name": key,
                        "text": str(value)
                    })
                
                import json
                
                # 使用 multipart 上传
                files = {
                    'metadata': (None, json.dumps(metadata), 'application/json'),
                    'worker.js': ('worker.js', script, 'application/javascript+module')
                }
                
                response = requests.put(
                    api_url,
                    headers={"Authorization": f"Bearer {self.api_token}"},
                    files=files,
                    timeout=30
                )
            else:
                # 无环境变量，也需要使用 multipart 格式（ES Module 需要）
                import json
                metadata = {
                    "main_module": "worker.js",
                    "bindings": []
                }
                files = {
                    'metadata': (None, json.dumps(metadata), 'application/json'),
                    'worker.js': ('worker.js', script, 'application/javascript+module')
                }
                response = requests.put(
                    api_url,
                    headers={"Authorization": f"Bearer {self.api_token}"},
                    files=files,
                    timeout=30
                )
            
            if response.status_code in (200, 201):
                result = response.json()
                if result.get("success"):
                    # 启用 workers.dev 子域名路由
                    self._enable_subdomain()
                    
                    # 获取 Workers URL（需要获取正确的子域名）
                    self._url = self._get_workers_url()
                    self._healthy = True
                    
                    # 如果没有预设 UUID，尝试获取
                    if not self._uuid:
                        self._fetch_uuid()
                    
                    print(f"[CFspider] Workers 创建成功: {self._url}")
                    return True
                else:
                    print(f"[CFspider] Workers 创建失败: {result.get('errors')}")
            else:
                print(f"[CFspider] API 错误 {response.status_code}: {response.text[:200]}")
                
        except Exception as e:
            print(f"[CFspider] 创建 Workers 异常: {e}")
        
        return False
    
    def _get_zone_id(self, domain: str) -> Optional[str]:
        """根据域名获取 Zone ID"""
        # 提取根域名（如 proxy.example.com -> example.com）
        parts = domain.split('.')
        if len(parts) >= 2:
            root_domain = '.'.join(parts[-2:])
        else:
            root_domain = domain
        
        try:
            api_url = f"https://api.cloudflare.com/client/v4/zones?name={root_domain}"
            response = requests.get(
                api_url,
                headers={"Authorization": f"Bearer {self.api_token}"},
                timeout=10
            )
            if response.ok:
                result = response.json()
                if result.get("success") and result.get("result"):
                    return result["result"][0].get("id")
        except:
            pass
        return None
    
    def _setup_custom_domain(self, domain: str) -> bool:
        """配置自定义域名"""
        # 获取 Zone ID
        zone_id = self._get_zone_id(domain)
        if not zone_id:
            print(f"[CFspider] 无法找到域名 {domain} 的 Zone，请确保域名已添加到 Cloudflare")
            return False
        
        try:
            # 使用 Custom Domains API（推荐）
            api_url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/workers/domains"
            response = requests.put(
                api_url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "hostname": domain,
                    "zone_id": zone_id,
                    "service": self.worker_name,
                    "environment": "production"
                },
                timeout=30
            )
            
            if response.ok:
                result = response.json()
                if result.get("success"):
                    self._custom_url = f"https://{domain}"
                    print(f"[CFspider] 自定义域名配置成功: {self._custom_url}")
                    return True
            
            # 如果 Custom Domains 失败，尝试使用 Workers Routes
            api_url = f"https://api.cloudflare.com/client/v4/zones/{zone_id}/workers/routes"
            response = requests.post(
                api_url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "pattern": f"{domain}/*",
                    "script": self.worker_name
                },
                timeout=30
            )
            
            if response.ok:
                result = response.json()
                if result.get("success"):
                    self._custom_url = f"https://{domain}"
                    print(f"[CFspider] 自定义域名路由配置成功: {self._custom_url}")
                    return True
                    
            print(f"[CFspider] 自定义域名配置失败: {response.text[:200]}")
            
        except Exception as e:
            print(f"[CFspider] 自定义域名配置异常: {e}")
        
        return False
    
    def _enable_subdomain(self):
        """启用 workers.dev 子域名路由"""
        try:
            api_url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/workers/scripts/{self.worker_name}/subdomain"
            response = requests.post(
                api_url,
                headers={
                    "Authorization": f"Bearer {self.api_token}",
                    "Content-Type": "application/json"
                },
                json={"enabled": True},
                timeout=10
            )
            if response.ok:
                result = response.json()
                if result.get("success"):
                    return True
        except:
            pass
        return False
    
    def _get_workers_url(self) -> str:
        """获取 Workers 的正确 URL"""
        # 尝试获取子域名
        try:
            api_url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/workers/subdomain"
            response = requests.get(
                api_url,
                headers={"Authorization": f"Bearer {self.api_token}"},
                timeout=10
            )
            if response.ok:
                result = response.json()
                if result.get("success"):
                    subdomain = result.get("result", {}).get("subdomain")
                    if subdomain:
                        return f"https://{self.worker_name}.{subdomain}.workers.dev"
        except:
            pass
        
        # 回退到默认格式
        return f"https://{self.worker_name}.{self.account_id[:8]}.workers.dev"
    
    def _fetch_uuid(self):
        """从 Workers 获取 UUID"""
        if not self._url:
            return
        
        try:
            response = requests.get(f"{self._url}/api/config", timeout=10)
            if response.ok:
                config = response.json()
                self._uuid = config.get("uuid")
        except:
            pass
    
    def _delete_worker(self) -> bool:
        """删除 Workers"""
        api_url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/workers/scripts/{self.worker_name}"
        
        try:
            response = requests.delete(
                api_url,
                headers={"Authorization": f"Bearer {self.api_token}"},
                timeout=30
            )
            return response.status_code in (200, 204)
        except:
            return False
    
    def _check_health(self) -> bool:
        """检查 Workers 健康状态"""
        if not self._url:
            return False
        
        try:
            response = requests.get(f"{self._url}/api/config", timeout=10)
            return response.ok
        except:
            return False
    
    def _health_check_loop(self):
        """健康检查循环"""
        while not self._stop_check:
            time.sleep(self.check_interval)
            
            if self._stop_check:
                break
            
            if not self._check_health():
                self._healthy = False
                print(f"[CFspider] Workers 不可用，正在重建...")
                
                # 删除旧的
                self._delete_worker()
                
                # 生成新名称并重建
                self.worker_name = self._generate_name()
                self._create_worker()
    
    def _start_health_check(self):
        """启动健康检查线程"""
        self._check_thread = threading.Thread(target=self._health_check_loop, daemon=True)
        self._check_thread.start()
    
    def stop(self):
        """停止健康检查并清理"""
        self._stop_check = True
        if self._check_thread:
            self._check_thread.join(timeout=1)
    
    @property
    def url(self) -> Optional[str]:
        """获取 Workers URL（优先返回自定义域名）"""
        return self._custom_url or self._url
    
    @property
    def workers_dev_url(self) -> Optional[str]:
        """获取 workers.dev URL"""
        return self._url
    
    @property
    def custom_url(self) -> Optional[str]:
        """获取自定义域名 URL"""
        return self._custom_url
    
    @property
    def uuid(self) -> Optional[str]:
        """获取 UUID"""
        return self._uuid
    
    @property
    def healthy(self) -> bool:
        """是否健康"""
        return self._healthy
    
    def __str__(self) -> str:
        """作为字符串使用时返回 URL"""
        return self._url or ""
    
    def __repr__(self) -> str:
        return f"WorkersManager(url={self._url}, healthy={self._healthy})"
    
    def __del__(self):
        """析构时停止检查"""
        self.stop()


def make_workers(
    api_token: str,
    account_id: str,
    worker_name: Optional[str] = None,
    auto_recreate: bool = True,
    check_interval: int = 60,
    env_vars: Optional[dict] = None,
    # 常用环境变量快捷参数
    uuid: Optional[str] = None,
    proxyip: Optional[str] = None,
    socks5: Optional[str] = None,
    host: Optional[str] = None,
    key: Optional[str] = None,
    accesskey: Optional[str] = None,
    two_proxy: Optional[str] = None,
    # 自定义域名
    my_domain: Optional[str] = None
) -> WorkersManager:
    """
    创建 Cloudflare Workers 并返回管理器
    
    自动创建 Workers，当失效时自动重建。
    返回的对象可以直接用于 cf_proxies 参数。
    
    Args:
        api_token: Cloudflare API Token
            获取方式：Dashboard -> My Profile -> API Tokens -> Create Token
            选择 "Edit Cloudflare Workers" 模板
        account_id: Cloudflare Account ID
            获取方式：Dashboard -> Workers & Pages -> 右侧边栏
        worker_name: Workers 名称（可选，不填则自动生成）
        auto_recreate: 失效后是否自动重建（默认 True）
        check_interval: 健康检查间隔秒数（默认 60）
        env_vars: Workers 环境变量字典（可选）
            示例: {"UUID": "xxx", "PROXYIP": "1.2.3.4", "CUSTOM_VAR": "value"}
        
        # 常用环境变量快捷参数（会合并到 env_vars）
        uuid: VLESS UUID
        proxyip: 优选 IP / 代理 IP（支持多个，逗号分隔）
        socks5: SOCKS5 代理地址
        host: 自定义主机名（用于 CDN 回源）
        key: 加密密钥
        accesskey: 访问密钥（破皮版用）
        two_proxy: 双层代理地址（格式: host:port:user:pass）
        my_domain: 自定义域名（如 proxy.example.com，域名需已在 Cloudflare）
    
    Returns:
        WorkersManager: Workers 管理器，可直接用于 cf_proxies
    
    Example:
        >>> import cfspider
        >>> 
        >>> # 基本用法
        >>> workers = cfspider.make_workers(
        ...     api_token="your-api-token",
        ...     account_id="your-account-id"
        ... )
        >>> 
        >>> # 指定 UUID（固定 IP）
        >>> workers = cfspider.make_workers(
        ...     api_token="your-api-token",
        ...     account_id="your-account-id",
        ...     uuid="your-custom-uuid"
        ... )
        >>> 
        >>> # 使用代理 IP
        >>> workers = cfspider.make_workers(
        ...     api_token="your-api-token",
        ...     account_id="your-account-id",
        ...     proxyip="proxyip.fxxk.dedyn.io"
        ... )
        >>> 
        >>> # 使用完整环境变量
        >>> workers = cfspider.make_workers(
        ...     api_token="your-api-token",
        ...     account_id="your-account-id",
        ...     env_vars={
        ...         "UUID": "your-uuid",
        ...         "PROXYIP": "1.2.3.4",
        ...         "SOCKS5": "user:pass@host:port"
        ...     }
        ... )
        >>> 
        >>> # 直接用于请求
        >>> response = cfspider.get(
        ...     "https://httpbin.org/ip",
        ...     cf_proxies=workers,
        ...     uuid=workers.uuid
        ... )
        >>> 
        >>> # 停止健康检查
        >>> workers.stop()
    
    API Token 权限要求：
        - Account: Workers Scripts: Edit
        - Zone: Workers Routes: Edit (可选，用于自定义域名)
    """
    # 合并环境变量
    final_env_vars = env_vars.copy() if env_vars else {}
    
    # 处理快捷参数
    if uuid:
        final_env_vars['UUID'] = uuid
    if proxyip:
        final_env_vars['PROXYIP'] = proxyip
    if socks5:
        final_env_vars['SOCKS5'] = socks5
    if host:
        final_env_vars['HOST'] = host
    if key:
        final_env_vars['KEY'] = key
    if accesskey:
        final_env_vars['ACCESSKEY'] = accesskey
    if two_proxy:
        final_env_vars['TWO_PROXY'] = two_proxy
    
    return WorkersManager(
        api_token=api_token,
        account_id=account_id,
        worker_name=worker_name,
        auto_recreate=auto_recreate,
        check_interval=check_interval,
        env_vars=final_env_vars if final_env_vars else None,
        my_domain=my_domain
    )


def list_workers(api_token: str, account_id: str) -> list:
    """
    列出账号下所有 Workers
    
    Args:
        api_token: Cloudflare API Token
        account_id: Cloudflare Account ID
    
    Returns:
        list: Workers 列表
    """
    api_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts"
    
    try:
        response = requests.get(
            api_url,
            headers={"Authorization": f"Bearer {api_token}"},
            timeout=30
        )
        
        if response.ok:
            result = response.json()
            if result.get("success"):
                return result.get("result", [])
    except:
        pass
    
    return []


def delete_workers(api_token: str, account_id: str, worker_name: str) -> bool:
    """
    删除指定的 Workers
    
    Args:
        api_token: Cloudflare API Token
        account_id: Cloudflare Account ID
        worker_name: Workers 名称
    
    Returns:
        bool: 是否删除成功
    """
    api_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{worker_name}"
    
    try:
        response = requests.delete(
            api_url,
            headers={"Authorization": f"Bearer {api_token}"},
            timeout=30
        )
        return response.status_code in (200, 204)
    except:
        return False

