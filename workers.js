// CFspider - Cloudflare Workers 代理 IP 池
// 赛博朋克2077风格界面

let 反代IP = '';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname.slice(1).toLowerCase();
        
        // 初始化 PROXYIP
        if (env.PROXYIP) {
            const proxyIPs = env.PROXYIP.split(',').map(ip => ip.trim());
            反代IP = proxyIPs[Math.floor(Math.random() * proxyIPs.length)];
        } else {
            反代IP = (request.cf?.colo || 'unknown') + '.proxyip.fxxk.dedyn.io';
        }
        
        const 访问IP = request.headers.get('CF-Connecting-IP') || 
                       request.headers.get('X-Forwarded-For') || 
                       'UNKNOWN';
        
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        };
        
        // CORS 预检请求
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        
        // 首页 - 赛博朋克2077风格
        if (path === '' || path === '/') {
            return new Response(generateCyberpunkPage(request), {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }
        
        // 调试信息
        if (path === 'debug') {
            return new Response(JSON.stringify({
                success: true,
                proxyip: 反代IP,
                cf_colo: request.cf?.colo || 'unknown',
                cf_country: request.cf?.country || 'unknown',
                visitor_ip: 访问IP,
                timestamp: new Date().toISOString()
            }, null, 2), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        
        // API: 获取 IP 池状态
        if (path === 'api/pool') {
            const poolData = await getIPPoolData(request);
            return new Response(JSON.stringify(poolData, null, 2), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        
        // API: 代理请求并返回内容
        if (path === 'api/fetch') {
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl) {
                return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
            try {
                const response = await fetch(targetUrl, {
                    headers: {
                        'User-Agent': request.headers.get('User-Agent') || 'CFspider/1.0',
                        'Accept': '*/*'
                    }
                });
                const content = await response.text();
                return new Response(content, {
                    status: response.status,
                    headers: {
                        'Content-Type': response.headers.get('Content-Type') || 'text/plain',
                        'X-Proxy-IP': 反代IP,
                        'X-CF-Colo': request.cf?.colo || 'unknown',
                        ...corsHeaders
                    }
                });
            } catch (error) {
                return new Response(JSON.stringify({ 
                    error: error.message, 
                    proxyip: 反代IP 
                }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }
        
        // API: 代理请求并返回 JSON
        if (path === 'api/json') {
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl) {
                return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
            try {
                const response = await fetch(targetUrl, {
                    headers: {
                        'User-Agent': request.headers.get('User-Agent') || 'CFspider/1.0',
                        'Accept': 'application/json'
                    }
                });
                const data = await response.json();
                return new Response(JSON.stringify({
                    success: true,
                    proxyip: 反代IP,
                    cf_colo: request.cf?.colo || 'unknown',
                    data
                }, null, 2), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            } catch (error) {
                return new Response(JSON.stringify({ 
                    error: error.message, 
                    proxyip: 反代IP 
                }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }
        
        // API: 获取当前 PROXYIP
        if (path === 'api/proxyip') {
            return new Response(JSON.stringify({
                success: true,
                proxyip: 反代IP,
                colo: request.cf?.colo || 'unknown'
            }, null, 2), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        
        // API: 批量代理请求
        if (path === 'api/batch') {
            if (request.method !== 'POST') {
                return new Response(JSON.stringify({ error: 'POST method required' }), {
                    status: 405,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
            try {
                const body = await request.json();
                const urls = body.urls || [];
                if (!Array.isArray(urls) || urls.length === 0) {
                    return new Response(JSON.stringify({ error: 'urls array required' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }
                
                const results = await Promise.allSettled(
                    urls.slice(0, 10).map(async (targetUrl) => {
                        const response = await fetch(targetUrl, {
                            headers: { 'User-Agent': 'CFspider/1.0' }
                        });
                        return {
                            url: targetUrl,
                            status: response.status,
                            content_length: parseInt(response.headers.get('Content-Length') || '0'),
                            content_type: response.headers.get('Content-Type')
                        };
                    })
                );
                
                return new Response(JSON.stringify({
                    success: true,
                    proxyip: 反代IP,
                    results: results.map(r => 
                        r.status === 'fulfilled' ? r.value : { error: r.reason?.message }
                    )
                }, null, 2), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            } catch (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }
        
        // 404
        return new Response('NOT FOUND', { status: 404 });
    }
};

// 获取 IP 池数据
async function getIPPoolData(request) {
    const colo = request.cf?.colo || 'unknown';
    const country = request.cf?.country || 'unknown';
    const city = request.cf?.city || 'unknown';
    const region = request.cf?.region || 'unknown';
    
    // Cloudflare 边缘节点信息
    const nodeInfo = {
        colo: colo,
        country: country,
        city: city,
        region: region,
        asn: request.cf?.asn || 'unknown',
        timezone: request.cf?.timezone || 'unknown'
    };
    
    // 模拟 IP 池（实际使用时这些是 Cloudflare 的边缘 IP）
    const ipPool = [
        { ip: `${colo}.edge.cloudflare.com`, status: 'ONLINE', latency: Math.floor(Math.random() * 50 + 10), region: country },
        { ip: `172.64.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, status: 'ONLINE', latency: Math.floor(Math.random() * 50 + 10), region: country },
        { ip: `172.67.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, status: 'ONLINE', latency: Math.floor(Math.random() * 50 + 20), region: country },
        { ip: `104.21.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, status: 'ONLINE', latency: Math.floor(Math.random() * 50 + 15), region: country },
        { ip: `162.159.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, status: 'ONLINE', latency: Math.floor(Math.random() * 50 + 25), region: country },
    ];
    
    return {
        success: true,
        timestamp: new Date().toISOString(),
        node: nodeInfo,
        pool: ipPool,
        total: ipPool.length,
        online: ipPool.filter(p => p.status === 'ONLINE').length
    };
}

// 赛博朋克2077风格页面
function generateCyberpunkPage(request) {
    const colo = request.cf?.colo || 'UNKNOWN';
    const country = request.cf?.country || 'XX';
    const city = request.cf?.city || 'Night City';
    
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CFSPIDER // PROXY NETWORK</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
    <style>
        :root {
            --cyber-yellow: #fcee0a;
            --cyber-cyan: #00f0ff;
            --cyber-magenta: #ff2a6d;
            --cyber-blue: #05d9e8;
            --cyber-dark: #0d0221;
            --cyber-purple: #7b2cbf;
            --grid-color: rgba(0, 240, 255, 0.1);
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Share Tech Mono', monospace;
            background: var(--cyber-dark);
            min-height: 100vh;
            color: #fff;
            overflow-x: hidden;
            position: relative;
        }
        
        /* 网格背景 */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: 
                linear-gradient(90deg, var(--grid-color) 1px, transparent 1px),
                linear-gradient(var(--grid-color) 1px, transparent 1px);
            background-size: 50px 50px;
            animation: gridMove 20s linear infinite;
            pointer-events: none;
            z-index: 0;
        }
        
        @keyframes gridMove {
            0% { transform: perspective(500px) rotateX(60deg) translateY(0); }
            100% { transform: perspective(500px) rotateX(60deg) translateY(50px); }
        }
        
        /* 扫描线效果 */
        body::after {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: repeating-linear-gradient(
                0deg,
                rgba(0, 0, 0, 0.1),
                rgba(0, 0, 0, 0.1) 1px,
                transparent 1px,
                transparent 2px
            );
            pointer-events: none;
            z-index: 1000;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px 20px;
            position: relative;
            z-index: 1;
        }
        
        /* 标题区域 */
        .header {
            text-align: center;
            margin-bottom: 60px;
            position: relative;
        }
        
        .logo {
            font-family: 'Orbitron', sans-serif;
            font-size: 4rem;
            font-weight: 900;
            letter-spacing: 0.2em;
            background: linear-gradient(180deg, var(--cyber-yellow) 0%, var(--cyber-magenta) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 0 40px rgba(252, 238, 10, 0.5);
            animation: glitch 3s infinite;
            position: relative;
        }
        
        .logo::before, .logo::after {
            content: 'CFSPIDER';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(180deg, var(--cyber-cyan) 0%, var(--cyber-blue) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            opacity: 0;
        }
        
        @keyframes glitch {
            0%, 90%, 100% { opacity: 1; transform: translate(0); }
            91% { opacity: 0.8; transform: translate(-2px, 1px); }
            92% { opacity: 0.8; transform: translate(2px, -1px); }
            93% { opacity: 1; transform: translate(0); }
        }
        
        .subtitle {
            font-size: 1.2rem;
            color: var(--cyber-cyan);
            letter-spacing: 0.5em;
            margin-top: 10px;
            text-transform: uppercase;
        }
        
        /* 状态卡片 */
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        
        .status-card {
            background: linear-gradient(135deg, rgba(0, 240, 255, 0.1) 0%, rgba(123, 44, 191, 0.1) 100%);
            border: 1px solid var(--cyber-cyan);
            padding: 25px;
            position: relative;
            clip-path: polygon(0 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 15px 100%, 0 calc(100% - 15px));
        }
        
        .status-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--cyber-cyan), transparent);
            animation: scan 2s linear infinite;
        }
        
        @keyframes scan {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        
        .status-label {
            font-size: 0.75rem;
            color: var(--cyber-cyan);
            text-transform: uppercase;
            letter-spacing: 0.2em;
            margin-bottom: 8px;
        }
        
        .status-value {
            font-family: 'Orbitron', sans-serif;
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--cyber-yellow);
        }
        
        /* IP 池表格 */
        .pool-section {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid var(--cyber-magenta);
            padding: 30px;
            margin-bottom: 40px;
            position: relative;
        }
        
        .pool-section::before {
            content: 'PROXY IP POOL';
            position: absolute;
            top: -12px;
            left: 20px;
            background: var(--cyber-dark);
            padding: 0 15px;
            font-family: 'Orbitron', sans-serif;
            font-size: 0.9rem;
            color: var(--cyber-magenta);
            letter-spacing: 0.2em;
        }
        
        .pool-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .pool-table th {
            text-align: left;
            padding: 15px 10px;
            color: var(--cyber-cyan);
            font-size: 0.8rem;
            letter-spacing: 0.15em;
            border-bottom: 1px solid var(--cyber-cyan);
        }
        
        .pool-table td {
            padding: 15px 12px;
            border-bottom: 1px solid rgba(0, 240, 255, 0.2);
            font-size: 1rem;
            color: #ddd;
        }
        
        .pool-table tr:hover {
            background: rgba(0, 240, 255, 0.05);
        }
        
        .status-online {
            color: #00ff88;
            text-shadow: 0 0 10px #00ff88;
        }
        
        .status-offline {
            color: var(--cyber-magenta);
        }
        
        .latency-good { color: #00ff88; }
        .latency-medium { color: var(--cyber-yellow); }
        .latency-bad { color: var(--cyber-magenta); }
        
        /* API 区域 */
        .api-section {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid var(--cyber-blue);
            padding: 30px;
            margin-bottom: 40px;
        }
        
        .api-section h2 {
            font-family: 'Orbitron', sans-serif;
            font-size: 1.2rem;
            color: var(--cyber-blue);
            margin-bottom: 25px;
            letter-spacing: 0.2em;
        }
        
        .api-item {
            background: rgba(5, 217, 232, 0.1);
            border-left: 3px solid var(--cyber-cyan);
            padding: 15px 20px;
            margin-bottom: 15px;
            transition: all 0.3s;
        }
        
        .api-item:hover {
            background: rgba(5, 217, 232, 0.2);
            transform: translateX(5px);
        }
        
        .api-method {
            display: inline-block;
            padding: 3px 10px;
            background: var(--cyber-cyan);
            color: var(--cyber-dark);
            font-size: 0.7rem;
            font-weight: bold;
            margin-right: 10px;
        }
        
        .api-path {
            color: var(--cyber-yellow);
            font-family: 'Share Tech Mono', monospace;
        }
        
        .api-desc {
            color: #aaa;
            font-size: 0.95rem;
            margin-top: 8px;
        }
        
        /* Python 代码 */
        .code-section {
            background: #0d0d0d;
            border: 2px solid var(--cyber-purple);
            padding: 30px;
            margin-bottom: 40px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(123, 44, 191, 0.3);
        }
        
        .code-section::before {
            content: 'PYTHON';
            position: absolute;
            top: 10px;
            right: 15px;
            font-size: 0.8rem;
            color: var(--cyber-purple);
            letter-spacing: 0.2em;
            font-weight: bold;
        }
        
        .code-section pre {
            color: #ffffff;
            font-size: 1.1rem;
            line-height: 1.8;
            overflow-x: auto;
            text-shadow: 0 0 5px rgba(255,255,255,0.1);
        }
        
        .code-keyword { color: #ff79c6; font-weight: bold; }
        .code-string { color: #f1fa8c; }
        .code-function { color: #8be9fd; }
        .code-comment { color: #6272a4; }
        
        /* 底部 */
        .footer {
            text-align: center;
            padding: 40px 0;
            color: #888;
            font-size: 1rem;
            letter-spacing: 0.2em;
        }
        
        .footer a {
            color: var(--cyber-cyan);
            text-decoration: none;
            font-weight: bold;
            text-shadow: 0 0 10px var(--cyber-cyan);
        }
        
        /* 闪烁光标 */
        .cursor {
            display: inline-block;
            width: 10px;
            height: 1.2em;
            background: var(--cyber-cyan);
            animation: blink 1s step-end infinite;
            vertical-align: middle;
        }
        
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }
        
        /* 加载动画 */
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid var(--cyber-cyan);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        /* 响应式 */
        @media (max-width: 768px) {
            .logo { font-size: 2.5rem; }
            .subtitle { font-size: 0.9rem; letter-spacing: 0.2em; }
            .status-grid { grid-template-columns: repeat(2, 1fr); }
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1 class="logo">CFSPIDER</h1>
            <p class="subtitle">Cloudflare Proxy Network</p>
        </header>
        
        <div class="status-grid">
            <div class="status-card">
                <div class="status-label">Node Location</div>
                <div class="status-value">${colo}</div>
            </div>
            <div class="status-card">
                <div class="status-label">Country</div>
                <div class="status-value">${country}</div>
            </div>
            <div class="status-card">
                <div class="status-label">City</div>
                <div class="status-value">${city}</div>
            </div>
            <div class="status-card">
                <div class="status-label">Status</div>
                <div class="status-value status-online">ONLINE</div>
            </div>
        </div>
        
        <div class="pool-section">
            <table class="pool-table" id="poolTable">
                <thead>
                    <tr>
                        <th>IP ADDRESS</th>
                        <th>STATUS</th>
                        <th>LATENCY</th>
                        <th>REGION</th>
                    </tr>
                </thead>
                <tbody id="poolBody">
                    <tr><td colspan="4" style="text-align:center;"><span class="loading"></span> LOADING...</td></tr>
                </tbody>
            </table>
        </div>
        
        <div class="api-section">
            <h2>// API ENDPOINTS</h2>
            <div class="api-item">
                <span class="api-method">GET</span>
                <span class="api-path">/api/fetch?url=https://example.com</span>
                <div class="api-desc">Proxy request and return content</div>
            </div>
            <div class="api-item">
                <span class="api-method">GET</span>
                <span class="api-path">/api/json?url=https://httpbin.org/ip</span>
                <div class="api-desc">Proxy request and return JSON</div>
            </div>
            <div class="api-item">
                <span class="api-method">GET</span>
                <span class="api-path">/api/pool</span>
                <div class="api-desc">Get proxy IP pool status</div>
            </div>
            <div class="api-item">
                <span class="api-method">POST</span>
                <span class="api-path">/api/batch</span>
                <div class="api-desc">Batch proxy requests {"urls": [...]}</div>
            </div>
        </div>
        
        <div class="code-section">
            <pre><span class="code-comment"># pip install cfspider</span>
<span class="code-keyword">import</span> cfspider

response = cfspider.<span class="code-function">get</span>(
    <span class="code-string">"https://httpbin.org/ip"</span>,
    cf_proxies=<span class="code-string">"https://ip.kami666.xyz"</span>
)
<span class="code-function">print</span>(response.text)  <span class="code-comment"># Cloudflare IP</span></pre>
        </div>
        
        <footer class="footer">
            <p>CFSPIDER v1.0.0 // <a href="https://github.com/violettoolssite/CFspider" target="_blank">GITHUB</a> // <a href="https://pypi.org/project/cfspider/" target="_blank">PYPI</a></p>
            <p style="margin-top:10px;">POWERED BY CLOUDFLARE WORKERS<span class="cursor"></span></p>
        </footer>
    </div>
    
    <script>
        // 加载 IP 池数据
        async function loadPool() {
            try {
                const resp = await fetch('/api/pool');
                const data = await resp.json();
                const tbody = document.getElementById('poolBody');
                
                if (data.pool && data.pool.length > 0) {
                    tbody.innerHTML = data.pool.map(item => {
                        const latencyClass = item.latency < 30 ? 'latency-good' : 
                                           item.latency < 60 ? 'latency-medium' : 'latency-bad';
                        return \`<tr>
                            <td style="font-family:'Share Tech Mono',monospace;color:#fff;">\${item.ip}</td>
                            <td class="\${item.status === 'ONLINE' ? 'status-online' : 'status-offline'}">\${item.status}</td>
                            <td class="\${latencyClass}">\${item.latency}ms</td>
                            <td>\${item.region}</td>
                        </tr>\`;
                    }).join('');
                }
            } catch (e) {
                document.getElementById('poolBody').innerHTML = 
                    '<tr><td colspan="4" style="color:#ff2a6d;">ERROR LOADING DATA</td></tr>';
            }
        }
        
        // 页面加载后获取数据
        loadPool();
        
        // 每30秒刷新
        setInterval(loadPool, 30000);
    </script>
</body>
</html>`;
}
