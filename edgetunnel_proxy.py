"""
edgetunnel to HTTP Proxy
将 edgetunnel Workers 转换为本地 HTTP 代理

使用方法:
    python edgetunnel_proxy.py --host v2.kami666.xyz --uuid your-uuid --port 8080

然后可以使用:
    curl -x http://127.0.0.1:8080 https://httpbin.org/ip
"""

import argparse
import socket
import struct
import threading
import ssl
import time
import uuid as uuid_module
from urllib.parse import urlparse


class VlessProxy:
    """VLESS to HTTP Proxy"""
    
    def __init__(self, edgetunnel_host, vless_uuid, local_port=8080):
        self.edgetunnel_host = edgetunnel_host
        self.vless_uuid = vless_uuid
        self.local_port = local_port
        self.running = False
        self.server_socket = None
    
    def _create_vless_header(self, target_host, target_port):
        """创建 VLESS 请求头"""
        header = bytes([0])  # 版本
        header += uuid_module.UUID(self.vless_uuid).bytes  # UUID
        header += bytes([0])  # 附加信息长度
        header += bytes([1])  # TCP 命令
        header += struct.pack('>H', target_port)  # 端口
        
        # 地址
        try:
            socket.inet_aton(target_host)
            header += bytes([1])
            header += socket.inet_aton(target_host)
        except socket.error:
            header += bytes([2])
            domain_bytes = target_host.encode('utf-8')
            header += bytes([len(domain_bytes)])
            header += domain_bytes
        
        return header
    
    def _websocket_handshake(self, sock):
        """WebSocket 握手"""
        import base64
        import hashlib
        import os
        
        key = base64.b64encode(os.urandom(16)).decode()
        path = f'/{self.vless_uuid}'
        
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {self.edgetunnel_host}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"\r\n"
        )
        
        sock.sendall(request.encode())
        response = b""
        while b"\r\n\r\n" not in response:
            chunk = sock.recv(1024)
            if not chunk:
                raise Exception("WebSocket handshake failed")
            response += chunk
        
        if b"101" not in response:
            raise Exception(f"WebSocket upgrade failed: {response[:200]}")
        
        return True
    
    def _send_ws_frame(self, sock, data):
        """发送 WebSocket 帧"""
        import os
        mask_key = os.urandom(4)
        length = len(data)
        
        if length <= 125:
            header = bytes([0x82, 0x80 | length])
        elif length <= 65535:
            header = bytes([0x82, 0x80 | 126]) + struct.pack('>H', length)
        else:
            header = bytes([0x82, 0x80 | 127]) + struct.pack('>Q', length)
        
        masked_data = bytes([data[i] ^ mask_key[i % 4] for i in range(length)])
        sock.sendall(header + mask_key + masked_data)
    
    def _recv_ws_frame(self, sock):
        """接收 WebSocket 帧"""
        header = sock.recv(2)
        if len(header) < 2:
            return None
        
        payload_len = header[1] & 0x7F
        if payload_len == 126:
            ext = sock.recv(2)
            payload_len = struct.unpack('>H', ext)[0]
        elif payload_len == 127:
            ext = sock.recv(8)
            payload_len = struct.unpack('>Q', ext)[0]
        
        data = b""
        while len(data) < payload_len:
            chunk = sock.recv(min(payload_len - len(data), 8192))
            if not chunk:
                break
            data += chunk
        
        return data
    
    def _handle_client(self, client_socket, client_addr):
        """处理客户端连接"""
        try:
            request = b""
            while b"\r\n\r\n" not in request:
                chunk = client_socket.recv(4096)
                if not chunk:
                    return
                request += chunk
            
            first_line = request.split(b"\r\n")[0].decode()
            parts = first_line.split()
            
            if len(parts) < 3:
                return
            
            method = parts[0]
            
            if method == "CONNECT":
                # HTTPS 代理
                host_port = parts[1]
                if ":" in host_port:
                    target_host, target_port = host_port.rsplit(":", 1)
                    target_port = int(target_port)
                else:
                    target_host = host_port
                    target_port = 443
                
                initial_data = b""
            else:
                # HTTP 代理
                url = parts[1]
                parsed = urlparse(url)
                target_host = parsed.hostname
                target_port = parsed.port or 80
                
                # 重写请求
                path = parsed.path or "/"
                if parsed.query:
                    path += "?" + parsed.query
                
                new_first_line = f"{method} {path} HTTP/1.1\r\n"
                rest = request.split(b"\r\n", 1)[1]
                initial_data = new_first_line.encode() + rest
            
            # 连接 edgetunnel
            ws_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            ws_sock.settimeout(30)
            
            context = ssl.create_default_context()
            ws_sock = context.wrap_socket(ws_sock, server_hostname=self.edgetunnel_host)
            ws_sock.connect((self.edgetunnel_host, 443))
            
            self._websocket_handshake(ws_sock)
            
            # 发送 VLESS 头 + 初始数据
            vless_header = self._create_vless_header(target_host, target_port)
            self._send_ws_frame(ws_sock, vless_header + initial_data)
            
            if method == "CONNECT":
                client_socket.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            
            # 双向转发
            ws_sock.setblocking(False)
            client_socket.setblocking(False)
            
            first_response = True
            while True:
                readable = []
                try:
                    client_socket.setblocking(False)
                    ws_sock.setblocking(False)
                    
                    import select
                    readable, _, _ = select.select([client_socket, ws_sock], [], [], 30)
                except:
                    break
                
                if not readable:
                    break
                
                for sock in readable:
                    try:
                        if sock is client_socket:
                            data = client_socket.recv(8192)
                            if not data:
                                raise Exception("Client closed")
                            self._send_ws_frame(ws_sock, data)
                        else:
                            ws_sock.setblocking(True)
                            ws_sock.settimeout(1)
                            data = self._recv_ws_frame(ws_sock)
                            if data is None:
                                raise Exception("WS closed")
                            
                            # 跳过 VLESS 响应头
                            if first_response and len(data) >= 2:
                                addon_len = data[1]
                                data = data[2 + addon_len:]
                                first_response = False
                            
                            if data:
                                client_socket.sendall(data)
                    except Exception as e:
                        raise
            
        except Exception as e:
            pass
        finally:
            try:
                client_socket.close()
            except:
                pass
    
    def start(self):
        """启动代理服务器"""
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind(('127.0.0.1', self.local_port))
        self.server_socket.listen(100)
        self.running = True
        
        print(f"[*] edgetunnel HTTP Proxy started")
        print(f"[*] edgetunnel: {self.edgetunnel_host}")
        print(f"[*] UUID: {self.vless_uuid}")
        print(f"[*] Local proxy: http://127.0.0.1:{self.local_port}")
        print(f"[*] Usage: curl -x http://127.0.0.1:{self.local_port} https://httpbin.org/ip")
        print()
        
        while self.running:
            try:
                client_socket, client_addr = self.server_socket.accept()
                thread = threading.Thread(target=self._handle_client, args=(client_socket, client_addr))
                thread.daemon = True
                thread.start()
            except Exception as e:
                if self.running:
                    print(f"[!] Accept error: {e}")
    
    def stop(self):
        """停止代理服务器"""
        self.running = False
        if self.server_socket:
            self.server_socket.close()


def main():
    parser = argparse.ArgumentParser(description='edgetunnel to HTTP Proxy')
    parser.add_argument('--host', '-H', required=True, help='edgetunnel Workers host (e.g., v2.kami666.xyz)')
    parser.add_argument('--uuid', '-u', required=True, help='VLESS UUID')
    parser.add_argument('--port', '-p', type=int, default=8080, help='Local proxy port (default: 8080)')
    
    args = parser.parse_args()
    
    proxy = VlessProxy(args.host, args.uuid, args.port)
    
    try:
        proxy.start()
    except KeyboardInterrupt:
        print("\n[*] Stopping...")
        proxy.stop()


if __name__ == '__main__':
    main()

