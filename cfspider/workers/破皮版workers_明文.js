/**
 * 破皮版 Workers - 明文版本
 * 
 * 功能特性:
 * 1. Nginx 伪装首页
 * 2. 动态密钥访问验证
 * 3. X27CN 加密响应
 * 4. 环境变量配置支持
 */

import { connect } from "cloudflare:sockets";

// ==================== X27CN 加密解密函数 ====================

/**
 * X27CN 解密函数
 * @param {string} encrypted - 加密的字符串 (格式: <xxxx><xxxx>...)
 * @param {string} key - 解密密钥 (默认: x27cn2026)
 * @returns {string} 解密后的明文
 */
function x27cnDecrypt(encrypted, key = 'x27cn2026') {
    if (!encrypted) return '';
    
    // 转换密钥为字节数组
    const keyBytes = [];
    for (let i = 0; i < key.length; i++) {
        keyBytes.push(key.charCodeAt(i));
    }
    
    // 初始化扩展密钥和 S-Box
    const expandedKey = new Array(256);
    const sBox = new Array(256);
    const invSBox = new Array(256);
    
    for (let i = 0; i < 256; i++) {
        expandedKey[i] = (keyBytes[i % keyBytes.length] ^ ((7 * i + 13) & 255)) & 255;
        sBox[i] = (167 * i + 89) & 255;
    }
    for (let i = 0; i < 256; i++) {
        invSBox[sBox[i]] = i;
    }
    
    // 提取十六进制数据
    const hex = encrypted.replace(/<([0-9a-fA-F]{1,4})>/g, '$1');
    if (hex.length % 2 !== 0) return '';
    
    // 转换为字节数组
    const encBytes = [];
    for (let i = 0; i < hex.length; i += 2) {
        encBytes.push(parseInt(hex.substr(i, 2), 16));
    }
    
    // 初始状态
    let state = 0;
    for (let i = 0; i < keyBytes.length; i++) {
        state ^= keyBytes[i];
    }
    
    // 4轮逆变换
    const result = [];
    for (let i = 0; i < encBytes.length; i++) {
        let v = encBytes[i];
        const nextState = (state + v + expandedKey[(i + 128) % 256]) & 255;
        
        v = (((v - 3 * i - state) % 256) + 256) % 256;
        v = ((v >> 5) | (v << 3)) & 255;
        v = invSBox[v];
        v = v ^ expandedKey[i % 256];
        
        result.push(v);
        state = nextState;
    }
    
    try {
        return decodeURIComponent(result.map(x => '%' + x.toString(16).padStart(2, '0')).join(''));
    } catch (e) {
        return String.fromCharCode(...result);
    }
}

/**
 * X27CN 加密函数
 * @param {string} text - 明文字符串
 * @param {string} key - 加密密钥 (默认: x27cn2026)
 * @returns {string} 加密后的字符串 (格式: <xxxx><xxxx>...)
 */
function x27cnEncrypt(text, key = 'x27cn2026') {
    if (!text) return '';
    
    const keyBytes = new TextEncoder().encode(key);
    const expandedKey = new Uint8Array(256);
    const sBox = new Uint8Array(256);
    
    for (let i = 0; i < 256; i++) {
        expandedKey[i] = (keyBytes[i % keyBytes.length] ^ ((7 * i + 13) & 255)) & 255;
        sBox[i] = (167 * i + 89) & 255;
    }
    
    const data = new TextEncoder().encode(text);
    const result = new Uint8Array(data.length);
    
    let state = 0;
    for (const b of keyBytes) state ^= b;
    
    for (let i = 0; i < data.length; i++) {
        let v = data[i];
        v = v ^ expandedKey[i % 256];
        v = sBox[v];
        v = ((v << 5) | (v >> 3)) & 255;
        v = (v + 3 * i + state) & 255;
        state = (state + v + expandedKey[(i + 128) % 256]) & 255;
        result[i] = v;
    }
    
    const hex = Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('');
    let output = '';
    for (let i = 0; i < hex.length; i += 4) {
        output += '<' + hex.substr(i, 4) + '>';
    }
    return output;
}

// ==================== 辅助函数 ====================

/**
 * 基于哈希生成8位访问密钥
 * @param {string} hash - MD5 哈希值
 * @returns {string} 8位密钥
 */
function generateAccessKey(hash) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let key = '';
    for (let i = 0; i < 8; i++) {
        const value = parseInt(hash.substr(i * 2, 2), 16);
        key += chars[value % chars.length];
    }
    return key;
}

/**
 * 计算双重 MD5 哈希
 * @param {string} text - 输入文本
 * @returns {Promise<string>} MD5 哈希值
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
 * @param {string} text - 输入文本
 * @returns {Promise<string[]>} 字符串数组
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
        
        // 获取原始主机名 (支持 EdgeOne/CDN 回源)
        // 优先级: 环境变量 > X-Forwarded-Host > Host 头 > url.hostname
        const originalHost = env.CUSTOM_HOST || env.HOST || 
                            request.headers.get('X-Forwarded-Host') ||
                            request.headers.get('X-Original-Host') ||
                            request.headers.get('Host') ||
                            url.hostname;
        
        // 获取管理员密码和加密密钥
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
            
            // 获取访问密钥 (优先使用环境变量，否则自动生成)
            const accessKey = env.ACCESSKEY || env.ACCESS_KEY || env.AKEY || generateAccessKey(userIDMD5);
            
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
            
            // /x2727admin - 返回加密的密钥提示
            if (path === 'x2727admin') {
                const fullUrl = `https://${originalHost}/x2727admin/${accessKey}`;
                
                // 构建提示信息
                const message = `您的密钥为: ${accessKey}

完整访问地址:
${fullUrl}

环境变量设置(可选):
- ACCESSKEY: 自定义访问密钥
- UUID: cfspider库的uuid参数
- KEY: 自定义加密密钥
- PROXYIP: 自定义代理IP`;
                
                // 使用默认密钥加密
                const encrypted = x27cnEncrypt(message);
                
                return new Response(encrypted, {
                    headers: {
                        'Content-Type': 'text/plain',
                        'Access-Control-Allow-Origin': '*',
                        'X-Enc': 'x27cn',
                        'X-Hint': 'Decrypt with key: x27cn2026'
                    }
                });
            }
            
            // /x2727admin/{key} - 验证密钥后返回加密的配置
            const originalPath = url.pathname.slice(1);
            if (path.startsWith('x2727admin/')) {
                const inputKey = originalPath.substring(11); // 保留原始大小写
                
                // 验证密钥
                if (inputKey !== accessKey) {
                    const errorMsg = '密钥无效，请重新访问 /x2727admin 获取正确密钥';
                    return new Response(x27cnEncrypt(errorMsg), {
                        status: 403,
                        headers: {
                            'Content-Type': 'text/plain',
                            'Access-Control-Allow-Origin': '*',
                            'X-Enc': 'x27cn'
                        }
                    });
                }
                
                // 密钥验证通过，返回加密的配置信息
                const colo = request.cf?.colo || 'UNKNOWN';
                const vlessPath = '/' + userID + (twoProxy ? '?two_proxy=' + encodeURIComponent(twoProxy) : '');
                const vlessLink = `vless://${userID}@${originalHost}:443?security=tls&type=ws&host=${originalHost}&sni=${originalHost}&path=${encodeURIComponent(vlessPath)}&encryption=none#Node-${colo}`;
                
                const configData = {
                    status: 'online',
                    version: '1.8.7',
                    colo: colo,
                    host: originalHost,
                    uuid: userID,
                    vless: vlessLink,
                    two_proxy: twoProxy || null,
                    proxyip: proxyIP
                };
                
                // 使用输入的密钥加密配置
                const encryptedConfig = x27cnEncrypt(JSON.stringify(configData), inputKey);
                
                return new Response(encryptedConfig, {
                    headers: {
                        'Content-Type': 'text/plain',
                        'Access-Control-Allow-Origin': '*',
                        'X-Enc': 'x27cn',
                        'X-Key': inputKey
                    }
                });
            }
            
            // 未知路由
            return new Response(JSON.stringify({
                error: 'Unknown endpoint',
                available: ['/x2727admin']
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // WebSocket 处理 (VLESS 协议)
        // ... 省略 WebSocket 处理代码，与原版相同 ...
        
        return new Response(null, { status: 101 });
    }
};

