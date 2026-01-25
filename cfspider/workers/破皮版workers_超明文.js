/**
 * 破皮版 Workers - 超明文版本
 * 
 * 特点: 所有数据都是明文，无任何加密
 * 
 * 路由:
 * - / : Nginx 伪装页面
 * - /admin : 查看配置信息 (明文JSON)
 * - /{uuid} : WebSocket VLESS 连接
 */

import { connect } from "cloudflare:sockets";

// ==================== 辅助函数 ====================

/**
 * 计算双重 MD5 哈希
 */
async function doubleMD5(text) {
    const encoder = new TextEncoder();
    const data1 = await crypto.subtle.digest('MD5', encoder.encode(text));
    const hex1 = Array.from(new Uint8Array(data1)).map(b => b.toString(16).padStart(2, '0')).join('');
    const data2 = await crypto.subtle.digest('MD5', encoder.encode(hex1.slice(7, 27)));
    return Array.from(new Uint8Array(data2)).map(b => b.toString(16).padStart(2, '0')).join('').toLowerCase();
}

/**
 * 解析字符串为数组
 */
async function parseArray(text) {
    let str = text.replace(/[\t"'\r\n]+/g, ',').replace(/,+/g, ',');
    if (str.charAt(0) === ',') str = str.slice(1);
    if (str.charAt(str.length - 1) === ',') str = str.slice(0, -1);
    return str.split(',');
}

// ==================== Nginx 伪装页面 ====================

const NGINX_PAGE = `<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
html { color-scheme: light dark; }
body { width: 35em; margin: 0 auto; font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and working. Further configuration is required.</p>
<p>For online documentation and support please refer to <a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at <a href="http://nginx.com/">nginx.com</a>.</p>
<p><em>Thank you for using nginx.</em></p>
</body>
</html>`;

// ==================== 全局变量 ====================

let proxyIP = '';
let enableFallback = true;
const DOH_URL = 'https://doh.cmliussss.net/CMLiussss';
const SOCKS5_WHITELIST = ['*tapecontent.net', '*cloudatacdn.com', '*loadshare.org', '*cdn-centaurus.com', 'scholar.google.com'];

// ==================== 主处理函数 ====================

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const userAgent = request.headers.get('User-Agent') || 'null';
        const upgradeHeader = request.headers.get('Upgrade');
        
        // 获取管理员密码
        const adminPassword = env.ADMIN || env.admin || env.PASSWORD || env.password || 
                             env.pswd || env.TOKEN || env.KEY || env.UUID || env.uuid || 'cfspider-public';
        const encryptKey = env.KEY || 'cfspider-default-key';
        
        // 生成用户ID
        const userIDMD5 = await doubleMD5(adminPassword + encryptKey);
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
        const envUUID = env.UUID || env.uuid;
        
        let userID;
        if (envUUID && uuidRegex.test(envUUID)) {
            userID = envUUID.toLowerCase();
        } else {
            userID = [
                userIDMD5.slice(0, 8),
                userIDMD5.slice(8, 12),
                '4' + userIDMD5.slice(13, 16),
                '8' + userIDMD5.slice(17, 20),
                userIDMD5.slice(20)
            ].join('-');
        }
        
        // 获取主机名
        const hosts = env.HOST 
            ? (await parseArray(env.HOST)).map(h => h.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0])
            : [url.hostname];
        const host = hosts[0];
        
        // 设置代理IP
        if (env.PROXYIP) {
            const proxyIPs = await parseArray(env.PROXYIP);
            proxyIP = proxyIPs[Math.floor(Math.random() * proxyIPs.length)];
            enableFallback = false;
        } else {
            proxyIP = (request.cf.colo + '.proxyip.cmliussss.net').toLowerCase();
        }
        
        // 获取客户端IP
        const clientIP = request.headers.get('X-Real-IP') || 
                        request.headers.get('CF-Connecting-IP') || 
                        request.headers.get('X-Forwarded-For') || 'unknown';
        
        // HTTP 请求处理 (非 WebSocket)
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            // HTTP 重定向到 HTTPS
            if (url.protocol === 'http:') {
                return Response.redirect(url.href.replace(`http://${url.hostname}`, `https://${url.hostname}`), 301);
            }
            
            const path = url.pathname.slice(1).toLowerCase();
            const twoProxy = env.TWO_PROXY || env.two_proxy || '';
            
            // ============ 路由处理 ============
            
            // 根路径 - 返回 Nginx 伪装页面
            if (path === '' || path === '/') {
                return new Response(NGINX_PAGE, {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/html',
                        'Server': 'nginx/1.18.0'
                    }
                });
            }
            
            // /admin - 直接返回明文配置 (无需密钥)
            if (path === 'admin') {
                const colo = request.cf?.colo || 'UNKNOWN';
                const vlessPath = '/' + userID + (twoProxy ? '?two_proxy=' + encodeURIComponent(twoProxy) : '');
                const vlessLink = `vless://${userID}@${url.hostname}:443?security=tls&type=ws&host=${url.hostname}&sni=${url.hostname}&path=${encodeURIComponent(vlessPath)}&encryption=none#Node-${colo}`;
                
                const configData = {
                    status: 'online',
                    version: '1.8.7',
                    colo: colo,
                    host: url.hostname,
                    uuid: userID,
                    vless: vlessLink,
                    two_proxy: twoProxy || null,
                    proxyip: proxyIP,
                    client_ip: clientIP,
                    env_settings: {
                        ADMIN: '管理员密码',
                        UUID: 'cfspider库的uuid参数',
                        KEY: '加密密钥',
                        PROXYIP: '自定义代理IP',
                        HOST: '自定义主机名',
                        TWO_PROXY: '二级代理设置'
                    }
                };
                
                return new Response(JSON.stringify(configData, null, 2), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            
            // /config 或 /api/config - 同样返回明文配置
            if (path === 'config' || path === 'api/config') {
                const colo = request.cf?.colo || 'UNKNOWN';
                const vlessPath = '/' + userID + (twoProxy ? '?two_proxy=' + encodeURIComponent(twoProxy) : '');
                const vlessLink = `vless://${userID}@${url.hostname}:443?security=tls&type=ws&host=${url.hostname}&sni=${url.hostname}&path=${encodeURIComponent(vlessPath)}&encryption=none#Node-${colo}`;
                
                return new Response(JSON.stringify({
                    status: 'online',
                    version: '1.8.7',
                    colo: colo,
                    host: url.hostname,
                    uuid: userID,
                    vless: vlessLink,
                    two_proxy: twoProxy || null,
                    proxyip: proxyIP
                }, null, 2), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            
            // /proxyip 或 /api/proxyip - 返回代理IP
            if (path === 'proxyip' || path === 'api/proxyip') {
                return new Response(JSON.stringify({
                    proxyip: proxyIP,
                    fallback: enableFallback
                }, null, 2), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            
            // /uuid - 返回UUID
            if (path === 'uuid') {
                return new Response(JSON.stringify({
                    uuid: userID
                }, null, 2), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            
            // /vless - 返回VLESS链接
            if (path === 'vless') {
                const colo = request.cf?.colo || 'UNKNOWN';
                const vlessPath = '/' + userID + (twoProxy ? '?two_proxy=' + encodeURIComponent(twoProxy) : '');
                const vlessLink = `vless://${userID}@${url.hostname}:443?security=tls&type=ws&host=${url.hostname}&sni=${url.hostname}&path=${encodeURIComponent(vlessPath)}&encryption=none#Node-${colo}`;
                
                return new Response(vlessLink, {
                    headers: {
                        'Content-Type': 'text/plain',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            
            // /help - 帮助信息
            if (path === 'help') {
                return new Response(JSON.stringify({
                    endpoints: {
                        '/': 'Nginx 伪装首页',
                        '/admin': '完整配置信息 (JSON)',
                        '/config': '基本配置信息 (JSON)',
                        '/uuid': 'UUID信息 (JSON)',
                        '/vless': 'VLESS链接 (纯文本)',
                        '/proxyip': '代理IP信息 (JSON)',
                        '/help': '帮助信息 (当前页面)'
                    },
                    env_variables: {
                        ADMIN: '管理员密码 (用于生成UUID)',
                        UUID: '直接指定UUID',
                        KEY: '加密密钥',
                        PROXYIP: '自定义代理IP',
                        HOST: '自定义主机名',
                        TWO_PROXY: '二级代理设置'
                    },
                    note: '这是超明文版本，所有数据直接返回明文JSON，无任何加密'
                }, null, 2), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            
            // 未知路由
            return new Response(JSON.stringify({
                error: 'Unknown endpoint',
                message: '未知路由，请访问 /help 查看可用端点',
                available_endpoints: ['/admin', '/config', '/uuid', '/vless', '/proxyip', '/help']
            }, null, 2), {
                status: 404,
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        
        // WebSocket 处理 (VLESS 协议)
        // 这里需要完整的 VLESS WebSocket 处理代码
        // 省略具体实现...
        
        return new Response(null, { status: 101 });
    }
};

