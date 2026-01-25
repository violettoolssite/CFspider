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
from typing import Optional


# Workers 代码模板（简化版，用于自动部署）
WORKERS_SCRIPT = '''
const UUID = crypto.randomUUID();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // UUID 验证
    const uuid = env.UUID || UUID;
    
    // 根路径返回配置信息
    if (path === "/" || path === "/api/config") {
      return new Response(JSON.stringify({
        host: url.hostname,
        vless_path: "/" + uuid,
        version: "auto-deploy",
        uuid: uuid
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // VLESS WebSocket
    if (path === "/" + uuid) {
      const upgradeHeader = request.headers.get("Upgrade");
      if (upgradeHeader === "websocket") {
        return handleVLESS(request, uuid);
      }
    }
    
    // 代理请求
    if (path === "/proxy") {
      return handleProxy(request);
    }
    
    return new Response("Not Found", { status: 404 });
  }
};

async function handleProxy(request) {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }
  
  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" ? request.body : undefined
    });
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
  } catch (e) {
    return new Response("Proxy error: " + e.message, { status: 500 });
  }
}

async function handleVLESS(request, uuid) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  
  const readable = new ReadableStream({
    start(controller) {
      server.addEventListener("message", (event) => {
        controller.enqueue(event.data);
      });
      server.addEventListener("close", () => {
        controller.close();
      });
    }
  });
  
  const writable = new WritableStream({
    write(chunk) {
      server.send(chunk);
    }
  });
  
  // 简化的 VLESS 处理
  handleVLESSStream(readable, writable, uuid);
  
  return new Response(null, {
    status: 101,
    webSocket: client
  });
}

async function handleVLESSStream(readable, writable, uuid) {
  const reader = readable.getReader();
  const writer = writable.getWriter();
  
  try {
    const { value: header } = await reader.read();
    if (!header) return;
    
    // VLESS 协议头解析
    const version = header[0];
    const uuidBytes = header.slice(1, 17);
    const optLength = header[17];
    const cmd = header[18 + optLength];
    
    // 解析目标地址
    let addressType = header[19 + optLength];
    let addressLength = 0;
    let addressIndex = 20 + optLength;
    let address = "";
    
    switch (addressType) {
      case 1: // IPv4
        addressLength = 4;
        address = header.slice(addressIndex, addressIndex + 4).join(".");
        break;
      case 2: // Domain
        addressLength = header[addressIndex];
        addressIndex++;
        address = new TextDecoder().decode(header.slice(addressIndex, addressIndex + addressLength));
        break;
      case 3: // IPv6
        addressLength = 16;
        const ipv6 = [];
        for (let i = 0; i < 8; i++) {
          ipv6.push(((header[addressIndex + i * 2] << 8) | header[addressIndex + i * 2 + 1]).toString(16));
        }
        address = ipv6.join(":");
        break;
    }
    
    const portIndex = addressIndex + addressLength;
    const port = (header[portIndex] << 8) | header[portIndex + 1];
    
    // 连接目标
    const { connect } = await import("cloudflare:sockets");
    const socket = connect({ hostname: address, port: port });
    
    // 发送 VLESS 响应头
    await writer.write(new Uint8Array([version, 0]));
    
    // 写入剩余数据
    const remaining = header.slice(portIndex + 2);
    if (remaining.length > 0) {
      await socket.writable.getWriter().write(remaining);
    }
    
    // 双向转发
    socket.readable.pipeTo(writable).catch(() => {});
    readable.pipeTo(socket.writable).catch(() => {});
    
  } catch (e) {
    console.error("VLESS error:", e);
  }
}
'''


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
        check_interval: int = 60
    ):
        """
        初始化 Workers 管理器
        
        Args:
            api_token: Cloudflare API Token（需要 Workers 编辑权限）
            account_id: Cloudflare Account ID
            worker_name: Workers 名称（可选，不填则自动生成）
            auto_recreate: 失效后是否自动重建（默认 True）
            check_interval: 健康检查间隔（秒，默认 60）
        """
        self.api_token = api_token
        self.account_id = account_id
        self.worker_name = worker_name or self._generate_name()
        self.auto_recreate = auto_recreate
        self.check_interval = check_interval
        
        self._url: Optional[str] = None
        self._uuid: Optional[str] = None
        self._healthy = False
        self._check_thread: Optional[threading.Thread] = None
        self._stop_check = False
        
        # 创建 Workers
        self._create_worker()
        
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
        
        try:
            # 上传脚本
            response = requests.put(
                api_url,
                headers=self._get_headers(),
                data=WORKERS_SCRIPT,
                timeout=30
            )
            
            if response.status_code in (200, 201):
                result = response.json()
                if result.get("success"):
                    # 获取 Workers URL
                    self._url = f"https://{self.worker_name}.{self.account_id[:8]}.workers.dev"
                    self._healthy = True
                    
                    # 尝试获取 UUID
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
        """获取 Workers URL"""
        return self._url
    
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
    check_interval: int = 60
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
    
    Returns:
        WorkersManager: Workers 管理器，可直接用于 cf_proxies
    
    Example:
        >>> import cfspider
        >>> 
        >>> # 创建 Workers
        >>> workers = cfspider.make_workers(
        ...     api_token="your-api-token",
        ...     account_id="your-account-id"
        ... )
        >>> 
        >>> # 直接用于请求
        >>> response = cfspider.get(
        ...     "https://httpbin.org/ip",
        ...     cf_proxies=workers,
        ...     uuid=workers.uuid
        ... )
        >>> 
        >>> # 或者获取 URL 字符串
        >>> print(workers.url)
        >>> 
        >>> # 停止健康检查
        >>> workers.stop()
    
    API Token 权限要求：
        - Account: Workers Scripts: Edit
        - Zone: Workers Routes: Edit (可选，用于自定义域名)
    """
    return WorkersManager(
        api_token=api_token,
        account_id=account_id,
        worker_name=worker_name,
        auto_recreate=auto_recreate,
        check_interval=check_interval
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

