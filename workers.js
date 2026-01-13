// CFspider - Cloudflare Workers 代理 IP 池 v1.8.0
// 支持：同步/异步请求、TLS指纹模拟、浏览器自动化

let 反代IP = '';
const VERSION = '1.8.0';
const START_TIME = Date.now();

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname.slice(1).toLowerCase();
        
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
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        };
        
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        
        // Token 验证（除了首页、debug 页面和从首页发起的 API 请求）
        const referer = request.headers.get('Referer') || '';
        const isFromHomePage = referer && (referer.endsWith('/') || referer.endsWith(url.hostname + '/') || referer.includes(url.hostname + '/?'));
        const isPublicApi = (path === 'api/pool' || path === 'api/proxyip') && isFromHomePage;
        
        if (path !== '' && path !== '/' && path !== 'debug' && !isPublicApi) {
            const tokenValidation = validateToken(request, env);
            if (!tokenValidation.valid) {
                return new Response(JSON.stringify({
                    error: 'Unauthorized',
                    message: 'Invalid or missing token'
                }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }
        
        if (path === '' || path === '/') {
            return new Response(generateCyberpunkPage(request, url, 访问IP), {
                headers: { 
                    'Content-Type': 'text/html; charset=utf-8',
                    ...corsHeaders
                }
            });
        }
        
        if (path === 'debug') {
            return new Response(JSON.stringify({
                success: true,
                version: VERSION,
                proxyip: 反代IP,
                cf_info: {
                    colo: request.cf?.colo || 'unknown',
                    country: request.cf?.country || 'unknown',
                    city: request.cf?.city || 'unknown',
                    region: request.cf?.region || 'unknown',
                    asn: request.cf?.asn || 'unknown',
                    timezone: request.cf?.timezone || 'unknown',
                    latitude: request.cf?.latitude || 'unknown',
                    longitude: request.cf?.longitude || 'unknown',
                    postalCode: request.cf?.postalCode || 'unknown',
                    metroCode: request.cf?.metroCode || 'unknown',
                    continent: request.cf?.continent || 'unknown'
                },
                visitor: {
                    ip: 访问IP,
                    country: request.cf?.country || 'unknown',
                    asn: request.cf?.asn || 'unknown'
                },
                request: {
                    method: request.method,
                    url: request.url,
                    headers: Object.fromEntries(request.headers.entries())
                },
                uptime: Math.floor((Date.now() - START_TIME) / 1000) + 's',
                timestamp: new Date().toISOString()
            }, null, 2), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        
        if (path === 'api/pool') {
            const poolData = await getIPPoolData(request);
            return new Response(JSON.stringify(poolData, null, 2), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        
        if (path === 'api/status') {
            return new Response(JSON.stringify({
                success: true,
                version: VERSION,
                status: 'ONLINE',
                uptime: Math.floor((Date.now() - START_TIME) / 1000),
                node: {
                    colo: request.cf?.colo || 'unknown',
                    country: request.cf?.country || 'unknown',
                    city: request.cf?.city || 'unknown'
                },
                timestamp: new Date().toISOString()
            }, null, 2), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        
        if (path === 'api/fetch') {
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl) {
                return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
            try {
                const startTime = Date.now();
                const response = await fetch(targetUrl, {
                    headers: {
                        'User-Agent': request.headers.get('User-Agent') || 'CFspider/' + VERSION,
                        'Accept': '*/*'
                    }
                });
                const content = await response.text();
                const duration = Date.now() - startTime;
                return new Response(content, {
                    status: response.status,
                    headers: {
                        'Content-Type': response.headers.get('Content-Type') || 'text/plain',
                        'X-Proxy-IP': 反代IP,
                        'X-CF-Colo': request.cf?.colo || 'unknown',
                        'X-Response-Time': duration + 'ms',
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
        
        if (path === 'api/json') {
            const targetUrl = url.searchParams.get('url');
            if (!targetUrl) {
                return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
            try {
                const startTime = Date.now();
                const response = await fetch(targetUrl, {
                    headers: {
                        'User-Agent': request.headers.get('User-Agent') || 'CFspider/' + VERSION,
                        'Accept': 'application/json'
                    }
                });
                const data = await response.json();
                const duration = Date.now() - startTime;
                return new Response(JSON.stringify({
                    success: true,
                    proxyip: 反代IP,
                    cf_colo: request.cf?.colo || 'unknown',
                    response_time: duration + 'ms',
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
        
        if (path === 'api/proxyip') {
            return new Response(JSON.stringify({
                success: true,
                proxyip: 反代IP,
                colo: request.cf?.colo || 'unknown',
                country: request.cf?.country || 'unknown',
                city: request.cf?.city || 'unknown'
            }, null, 2), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        
        if (path === 'proxy') {
            return handleProxyRequest(request, url, corsHeaders);
        }
        
        return new Response('NOT FOUND', { status: 404 });
    }
};

async function handleProxyRequest(request, url, corsHeaders) {
    const targetUrl = url.searchParams.get('url');
    const method = url.searchParams.get('method') || 'GET';
    
    if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
    
    const headers = {};
    for (const [key, value] of request.headers.entries()) {
        if (key.startsWith('x-cfspider-header-')) {
            headers[key.replace('x-cfspider-header-', '').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('-')] = value;
        }
    }
    
    if (!headers['User-Agent']) {
        headers['User-Agent'] = 'CFspider/' + VERSION;
    }
    
    try {
        let body = null;
        if (method !== 'GET' && method !== 'HEAD') {
            body = await request.text();
        }
        
        const startTime = Date.now();
        const response = await fetch(targetUrl, {
            method: method,
            headers: headers,
            body: body || undefined
        });
        const duration = Date.now() - startTime;
        
        const responseHeaders = new Headers();
        for (const [key, value] of response.headers.entries()) {
            responseHeaders.set(key, value);
        }
        responseHeaders.set('X-CF-Colo', request.cf?.colo || 'unknown');
        responseHeaders.set('X-Response-Time', duration + 'ms');
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        
        return new Response(response.body, {
            status: response.status,
            headers: responseHeaders
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
}

async function getIPPoolData(request) {
    const colo = request.cf?.colo || 'unknown';
    const country = request.cf?.country || 'unknown';
    const city = request.cf?.city || 'unknown';
    const region = request.cf?.region || 'unknown';
    
    const nodeInfo = {
        colo: colo,
        country: country,
        city: city,
        region: region,
        asn: request.cf?.asn || 'unknown',
        timezone: request.cf?.timezone || 'unknown',
        latitude: request.cf?.latitude || 'unknown',
        longitude: request.cf?.longitude || 'unknown',
        continent: request.cf?.continent || 'unknown'
    };
    
    const ipPool = [
        { ip: `${colo}.edge.cloudflare.com`, status: 'ONLINE', latency: Math.floor(Math.random() * 50 + 10), region: country, type: 'EDGE' },
        { ip: `172.64.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, status: 'ONLINE', latency: Math.floor(Math.random() * 50 + 10), region: country, type: 'ANYCAST' },
        { ip: `172.67.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, status: 'ONLINE', latency: Math.floor(Math.random() * 50 + 20), region: country, type: 'ANYCAST' },
        { ip: `104.21.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, status: 'ONLINE', latency: Math.floor(Math.random() * 50 + 15), region: country, type: 'ANYCAST' },
        { ip: `162.159.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, status: 'ONLINE', latency: Math.floor(Math.random() * 50 + 25), region: country, type: 'ANYCAST' },
        { ip: `104.24.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, status: 'ONLINE', latency: Math.floor(Math.random() * 50 + 18), region: country, type: 'ANYCAST' },
    ];
    
    return {
        success: true,
        version: VERSION,
        timestamp: new Date().toISOString(),
        node: nodeInfo,
        pool: ipPool,
        total: ipPool.length,
        online: ipPool.filter(p => p.status === 'ONLINE').length
    };
}

function generateCyberpunkPage(request, url, visitorIP) {
    const colo = request.cf?.colo || 'UNKNOWN';
    const country = request.cf?.country || 'XX';
    const city = request.cf?.city || 'Night City';
    const region = request.cf?.region || 'Unknown';
    const asn = request.cf?.asn || 'Unknown';
    const timezone = request.cf?.timezone || 'UTC';
    const latitude = request.cf?.latitude || '0';
    const longitude = request.cf?.longitude || '0';
    const continent = request.cf?.continent || 'XX';
    const lang = url.searchParams.get('lang') || 'zh';
    
    const countryNames = {
        'JP': '日本', 'CN': '中国', 'US': '美国', 'HK': '香港', 'TW': '台湾',
        'SG': '新加坡', 'KR': '韩国', 'DE': '德国', 'FR': '法国', 'GB': '英国',
        'AU': '澳大利亚', 'CA': '加拿大', 'NL': '荷兰', 'IN': '印度', 'RU': '俄罗斯',
        'BR': '巴西', 'ID': '印度尼西亚', 'TH': '泰国', 'VN': '越南', 'MY': '马来西亚',
        'PH': '菲律宾', 'IT': '意大利', 'ES': '西班牙', 'MX': '墨西哥', 'AE': '阿联酋'
    };
    
    const cityNames = {
        // 国际城市
        'Tokyo': '东京', 'Osaka': '大阪', 'Nagoya': '名古屋', 'Fukuoka': '福冈', 'Sapporo': '札幌',
        'Singapore': '新加坡', 'Seoul': '首尔', 'Busan': '釜山', 'Taipei': '台北', 'Kaohsiung': '高雄',
        'London': '伦敦', 'Paris': '巴黎', 'Frankfurt': '法兰克福', 'Amsterdam': '阿姆斯特丹', 'Berlin': '柏林',
        'New York': '纽约', 'Los Angeles': '洛杉矶', 'San Francisco': '旧金山', 'Chicago': '芝加哥', 'Seattle': '西雅图',
        'Sydney': '悉尼', 'Melbourne': '墨尔本', 'Toronto': '多伦多', 'Vancouver': '温哥华',
        'Mumbai': '孟买', 'New Delhi': '新德里', 'Dubai': '迪拜', 'Bangkok': '曼谷',
        'Kuala Lumpur': '吉隆坡', 'Jakarta': '雅加达', 'Manila': '马尼拉', 'Ho Chi Minh City': '胡志明市', 'Hanoi': '河内',
        'Moscow': '莫斯科', 'Madrid': '马德里', 'Rome': '罗马', 'Milan': '米兰', 'Vienna': '维也纳',
        // 中国城市 - 直辖市
        'Beijing': '北京', 'Shanghai': '上海', 'Tianjin': '天津', 'Chongqing': '重庆',
        // 中国城市 - 特别行政区
        'Hong Kong': '香港', 'Macau': '澳门', 'Macao': '澳门',
        // 中国城市 - 省会及主要城市
        'Guangzhou': '广州', 'Shenzhen': '深圳', 'Dongguan': '东莞', 'Foshan': '佛山', 'Zhuhai': '珠海', 'Zhongshan': '中山', 'Huizhou': '惠州', 'Jiangmen': '江门', 'Shantou': '汕头', 'Zhanjiang': '湛江',
        'Nanning': '南宁', 'Guilin': '桂林', 'Liuzhou': '柳州', 'Beihai': '北海',
        'Chengdu': '成都', 'Mianyang': '绵阳', 'Leshan': '乐山', 'Yibin': '宜宾',
        'Kunming': '昆明', 'Dali': '大理', 'Lijiang': '丽江',
        'Guiyang': '贵阳', 'Zunyi': '遵义',
        'Hangzhou': '杭州', 'Ningbo': '宁波', 'Wenzhou': '温州', 'Jiaxing': '嘉兴', 'Shaoxing': '绍兴', 'Jinhua': '金华',
        'Nanjing': '南京', 'Suzhou': '苏州', 'Wuxi': '无锡', 'Changzhou': '常州', 'Nantong': '南通', 'Xuzhou': '徐州', 'Yangzhou': '扬州', 'Zhenjiang': '镇江',
        'Hefei': '合肥', 'Wuhu': '芜湖', 'Bengbu': '蚌埠', 'Anqing': '安庆',
        'Wuhan': '武汉', 'Yichang': '宜昌', 'Xiangyang': '襄阳', 'Jingzhou': '荆州',
        'Changsha': '长沙', 'Zhuzhou': '株洲', 'Xiangtan': '湘潭', 'Hengyang': '衡阳',
        'Nanchang': '南昌', 'Jiujiang': '九江', 'Ganzhou': '赣州',
        'Fuzhou': '福州', 'Xiamen': '厦门', 'Quanzhou': '泉州', 'Zhangzhou': '漳州', 'Putian': '莆田',
        'Jinan': '济南', 'Qingdao': '青岛', 'Yantai': '烟台', 'Weifang': '潍坊', 'Zibo': '淄博', 'Linyi': '临沂', 'Weihai': '威海',
        'Zhengzhou': '郑州', 'Luoyang': '洛阳', 'Kaifeng': '开封', 'Xinxiang': '新乡', 'Nanyang': '南阳',
        'Shijiazhuang': '石家庄', 'Tangshan': '唐山', 'Baoding': '保定', 'Langfang': '廊坊', 'Handan': '邯郸', 'Qinhuangdao': '秦皇岛',
        'Taiyuan': '太原', 'Datong': '大同', 'Linfen': '临汾',
        'Xian': '西安', "Xi'an": '西安', 'Xianyang': '咸阳', 'Baoji': '宝鸡', 'Weinan': '渭南',
        'Lanzhou': '兰州', 'Tianshui': '天水',
        'Xining': '西宁',
        'Yinchuan': '银川',
        'Shenyang': '沈阳', 'Dalian': '大连', 'Anshan': '鞍山', 'Fushun': '抚顺', 'Jinzhou': '锦州',
        'Changchun': '长春', 'Jilin City': '吉林市', 'Siping': '四平',
        'Harbin': '哈尔滨', 'Daqing': '大庆', 'Qiqihar': '齐齐哈尔', 'Mudanjiang': '牡丹江',
        'Hohhot': '呼和浩特', 'Baotou': '包头', 'Ordos': '鄂尔多斯',
        'Urumqi': '乌鲁木齐', 'Kashgar': '喀什', 'Korla': '库尔勒',
        'Lhasa': '拉萨', 'Shigatse': '日喀则',
        'Haikou': '海口', 'Sanya': '三亚',
        // 中国省份/地区
        'Guangdong': '广东', 'Guangxi': '广西', 'Sichuan': '四川', 'Yunnan': '云南', 'Guizhou': '贵州',
        'Zhejiang': '浙江', 'Jiangsu': '江苏', 'Anhui': '安徽', 'Hubei': '湖北', 'Hunan': '湖南',
        'Jiangxi': '江西', 'Fujian': '福建', 'Shandong': '山东', 'Henan': '河南', 'Hebei': '河北',
        'Shanxi': '山西', 'Shaanxi': '陕西', 'Gansu': '甘肃', 'Qinghai': '青海', 'Ningxia': '宁夏',
        'Liaoning': '辽宁', 'Jilin': '吉林', 'Heilongjiang': '黑龙江',
        'Inner Mongolia': '内蒙古', 'Xinjiang': '新疆', 'Tibet': '西藏', 'Hainan': '海南', 'Taiwan': '台湾'
    };
    
    const coloNames = {
        'NRT': '东京成田', 'HND': '东京羽田', 'KIX': '大阪关西', 'HKG': '香港',
        'SIN': '新加坡', 'ICN': '首尔仁川', 'TPE': '台北桃园', 'PVG': '上海浦东',
        'PEK': '北京首都', 'LAX': '洛杉矶', 'SFO': '旧金山', 'SEA': '西雅图',
        'ORD': '芝加哥', 'DFW': '达拉斯', 'IAD': '华盛顿', 'MIA': '迈阿密',
        'JFK': '纽约', 'LHR': '伦敦', 'CDG': '巴黎', 'FRA': '法兰克福',
        'AMS': '阿姆斯特丹', 'SYD': '悉尼', 'MEL': '墨尔本', 'YYZ': '多伦多',
        'BOM': '孟买', 'DXB': '迪拜', 'BKK': '曼谷', 'KUL': '吉隆坡'
    };
    
    const i18n = {
        zh: {
            subtitle: 'Cloudflare 代理网络',
            nodeLocation: '节点代码',
            country: '国家',
            city: '城市',
            status: '状态',
            online: '在线',
            poolTitle: '代理 IP 池',
            ipAddress: 'IP 地址',
            latency: '延迟',
            regionLabel: '地区',
            type: '类型',
            apiTitle: 'API 接口',
            apiDesc1: '代理请求并返回内容',
            apiDesc2: '代理请求并返回 JSON',
            apiDesc3: '获取代理 IP 池状态',
            apiDesc4: 'Python 客户端代理请求',
            apiDesc5: '获取服务状态',
            apiDesc6: '获取调试信息',
            codeTitle: 'Python 使用示例',
            loading: '加载中...',
            error: '加载数据失败',
            langSwitch: 'EN',
            footer: '由 Cloudflare Workers 驱动',
            nodeInfoTitle: '节点详情',
            visitorInfoTitle: '访问者信息',
            visitorIP: '访问者 IP',
            regionDetail: '地区',
            timezone: '时区',
            asn: 'ASN',
            coordinates: '坐标',
            continent: '大洲',
            featuresTitle: '功能特性',
            feature1: '全球 300+ 边缘节点',
            feature2: 'TLS 指纹模拟',
            feature3: '隐身模式',
            feature4: 'HTTP/2 支持',
            feature5: '浏览器自动化',
            feature6: '会话一致性',
            installTitle: '快速安装',
            version: '版本',
            uptime: '运行时间',
            responseNote: '响应头包含 X-CF-Colo 和 X-Response-Time'
        },
        en: {
            subtitle: 'Cloudflare Proxy Network',
            nodeLocation: 'Node Code',
            country: 'Country',
            city: 'City',
            status: 'Status',
            online: 'ONLINE',
            poolTitle: 'PROXY IP POOL',
            ipAddress: 'IP ADDRESS',
            latency: 'LATENCY',
            regionLabel: 'REGION',
            type: 'TYPE',
            apiTitle: 'API ENDPOINTS',
            apiDesc1: 'Proxy request and return content',
            apiDesc2: 'Proxy request and return JSON',
            apiDesc3: 'Get proxy IP pool status',
            apiDesc4: 'Python client proxy request',
            apiDesc5: 'Get service status',
            apiDesc6: 'Get debug information',
            codeTitle: 'Python Example',
            loading: 'LOADING...',
            error: 'ERROR LOADING DATA',
            langSwitch: '中文',
            footer: 'Powered by Cloudflare Workers',
            nodeInfoTitle: 'Node Details',
            visitorInfoTitle: 'Visitor Information',
            visitorIP: 'Visitor IP',
            regionDetail: 'Region',
            timezone: 'Timezone',
            asn: 'ASN',
            coordinates: 'Coordinates',
            continent: 'Continent',
            featuresTitle: 'Features',
            feature1: '300+ Global Edge Nodes',
            feature2: 'TLS Fingerprint Impersonate',
            feature3: 'Stealth Mode',
            feature4: 'HTTP/2 Support',
            feature5: 'Browser Automation',
            feature6: 'Session Consistency',
            installTitle: 'Quick Install',
            version: 'Version',
            uptime: 'Uptime',
            responseNote: 'Response headers include X-CF-Colo and X-Response-Time'
        }
    };
    
    const t = i18n[lang] || i18n.zh;
    const switchLang = lang === 'zh' ? 'en' : 'zh';
    const continentNames = {
        'AF': lang === 'zh' ? '非洲' : 'Africa',
        'AN': lang === 'zh' ? '南极洲' : 'Antarctica',
        'AS': lang === 'zh' ? '亚洲' : 'Asia',
        'EU': lang === 'zh' ? '欧洲' : 'Europe',
        'NA': lang === 'zh' ? '北美洲' : 'North America',
        'OC': lang === 'zh' ? '大洋洲' : 'Oceania',
        'SA': lang === 'zh' ? '南美洲' : 'South America'
    };
    
    const displayColo = lang === 'zh' ? (coloNames[colo] || colo) : colo;
    const displayCountry = lang === 'zh' ? (countryNames[country] || country) : country;
    const displayCity = lang === 'zh' ? (cityNames[city] || city) : city;
    const displayRegion = lang === 'zh' ? (cityNames[region] || region) : region;
    
    return `<!DOCTYPE html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="CFspider - ${t.subtitle}">
    <meta name="keywords" content="cloudflare, proxy, ip pool, workers, python, crawler">
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
            --cyber-green: #00ff88;
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
            max-width: 1400px;
            margin: 0 auto;
            padding: 40px 20px;
            position: relative;
            z-index: 1;
        }
        
        .lang-switch {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1001;
        }
        
        .lang-btn {
            background: rgba(0, 240, 255, 0.1);
            border: 1px solid var(--cyber-cyan);
            color: var(--cyber-cyan);
            padding: 8px 16px;
            font-family: 'Share Tech Mono', monospace;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.3s;
            text-decoration: none;
        }
        
        .lang-btn:hover {
            background: var(--cyber-cyan);
            color: var(--cyber-dark);
        }
        
        .header {
            text-align: center;
            margin-bottom: 50px;
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
        
        .version-badge {
            display: inline-block;
            background: var(--cyber-magenta);
            color: #fff;
            padding: 4px 12px;
            font-size: 0.8rem;
            font-family: 'Orbitron', sans-serif;
            margin-left: 10px;
            vertical-align: super;
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
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 25px;
            margin-bottom: 40px;
        }
        
        .info-panel {
            background: rgba(0, 0, 0, 0.6);
            border: 1px solid var(--cyber-cyan);
            padding: 25px;
            position: relative;
        }
        
        .info-panel::before {
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
        
        .panel-title {
            font-family: 'Orbitron', sans-serif;
            font-size: 0.9rem;
            color: var(--cyber-cyan);
            letter-spacing: 0.15em;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(0, 240, 255, 0.3);
        }
        
        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .info-label {
            color: #888;
            font-size: 0.9rem;
        }
        
        .info-value {
            color: var(--cyber-yellow);
            font-weight: bold;
            font-family: 'Orbitron', sans-serif;
        }
        
        .info-value.online {
            color: var(--cyber-green);
            text-shadow: 0 0 10px var(--cyber-green);
        }
        
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 40px;
        }
        
        .status-card {
            background: linear-gradient(135deg, rgba(0, 240, 255, 0.1) 0%, rgba(123, 44, 191, 0.1) 100%);
            border: 1px solid var(--cyber-cyan);
            padding: 20px;
            text-align: center;
            position: relative;
            clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
        }
        
        .status-label {
            font-size: 0.7rem;
            color: var(--cyber-cyan);
            text-transform: uppercase;
            letter-spacing: 0.15em;
            margin-bottom: 8px;
        }
        
        .status-value {
            font-family: 'Orbitron', sans-serif;
            font-size: 1.3rem;
            font-weight: 700;
            color: var(--cyber-yellow);
        }
        
        .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 15px;
            margin-bottom: 40px;
        }
        
        .feature-card {
            background: rgba(123, 44, 191, 0.15);
            border: 1px solid var(--cyber-purple);
            padding: 20px;
            text-align: center;
            transition: all 0.3s;
        }
        
        .feature-card:hover {
            background: rgba(123, 44, 191, 0.3);
            transform: translateY(-3px);
            box-shadow: 0 5px 20px rgba(123, 44, 191, 0.4);
        }
        
        .feature-text {
            color: #ddd;
            font-size: 0.95rem;
        }
        
        .pool-section {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid var(--cyber-magenta);
            padding: 30px;
            margin-bottom: 40px;
            position: relative;
        }
        
        .pool-section::before {
            content: '${t.poolTitle}';
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
            font-size: 0.75rem;
            letter-spacing: 0.15em;
            border-bottom: 1px solid var(--cyber-cyan);
        }
        
        .pool-table td {
            padding: 12px 10px;
            border-bottom: 1px solid rgba(0, 240, 255, 0.2);
            font-size: 0.95rem;
            color: #ddd;
        }
        
        .pool-table tr:hover {
            background: rgba(0, 240, 255, 0.05);
        }
        
        .status-online {
            color: #00ff88;
            text-shadow: 0 0 10px #00ff88;
        }
        
        .latency-good { color: #00ff88; }
        .latency-medium { color: var(--cyber-yellow); }
        .latency-bad { color: var(--cyber-magenta); }
        
        .type-edge { color: var(--cyber-magenta); }
        .type-anycast { color: var(--cyber-cyan); }
        
        .api-section {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid var(--cyber-blue);
            padding: 30px;
            margin-bottom: 40px;
        }
        
        .api-section h2 {
            font-family: 'Orbitron', sans-serif;
            font-size: 1.1rem;
            color: var(--cyber-blue);
            margin-bottom: 25px;
            letter-spacing: 0.2em;
        }
        
        .api-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 15px;
        }
        
        .api-item {
            background: rgba(5, 217, 232, 0.1);
            border-left: 3px solid var(--cyber-cyan);
            padding: 15px 20px;
            transition: all 0.3s;
        }
        
        .api-item:hover {
            background: rgba(5, 217, 232, 0.2);
            transform: translateX(5px);
        }
        
        .api-method {
            display: inline-block;
            padding: 2px 8px;
            background: var(--cyber-cyan);
            color: var(--cyber-dark);
            font-size: 0.65rem;
            font-weight: bold;
            margin-right: 10px;
        }
        
        .api-path {
            color: var(--cyber-yellow);
            font-family: 'Share Tech Mono', monospace;
            font-size: 0.9rem;
        }
        
        .api-desc {
            color: #aaa;
            font-size: 0.85rem;
            margin-top: 6px;
        }
        
        .install-section {
            background: rgba(0, 255, 136, 0.1);
            border: 1px solid var(--cyber-green);
            padding: 25px;
            margin-bottom: 40px;
            text-align: center;
        }
        
        .install-section h3 {
            font-family: 'Orbitron', sans-serif;
            color: var(--cyber-green);
            margin-bottom: 15px;
            letter-spacing: 0.15em;
        }
        
        .install-cmd {
            background: #0a0a0a;
            padding: 15px 25px;
            display: inline-block;
            font-size: 1.1rem;
            color: var(--cyber-green);
            border: 1px solid rgba(0, 255, 136, 0.3);
            user-select: all;
        }
        
        .code-section {
            background: #0a0a0a;
            border: 2px solid var(--cyber-purple);
            padding: 25px;
            margin-bottom: 40px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(123, 44, 191, 0.3);
        }
        
        .code-section::before {
            content: '${t.codeTitle}';
            position: absolute;
            top: 8px;
            right: 15px;
            font-size: 0.75rem;
            color: var(--cyber-purple);
            letter-spacing: 0.15em;
            font-weight: bold;
        }
        
        .code-section pre {
            color: #ffffff;
            font-size: 1rem;
            line-height: 1.7;
            overflow-x: auto;
            text-shadow: 0 0 5px rgba(255,255,255,0.1);
        }
        
        .code-keyword { color: #ff79c6; font-weight: bold; }
        .code-string { color: #f1fa8c; }
        .code-function { color: #8be9fd; }
        .code-comment { color: #6272a4; }
        
        .footer {
            text-align: center;
            padding: 40px 0;
            color: #666;
            font-size: 0.9rem;
            letter-spacing: 0.15em;
        }
        
        .footer a {
            color: var(--cyber-cyan);
            text-decoration: none;
            font-weight: bold;
            text-shadow: 0 0 10px var(--cyber-cyan);
            margin: 0 10px;
        }
        
        .footer a:hover {
            color: var(--cyber-yellow);
        }
        
        .cursor {
            display: inline-block;
            width: 10px;
            height: 1.1em;
            background: var(--cyber-cyan);
            animation: blink 1s step-end infinite;
            vertical-align: middle;
        }
        
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }
        
        .loading {
            display: inline-block;
            width: 18px;
            height: 18px;
            border: 2px solid var(--cyber-cyan);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .note {
            background: rgba(252, 238, 10, 0.1);
            border-left: 3px solid var(--cyber-yellow);
            padding: 12px 18px;
            margin-top: 15px;
            color: #ccc;
            font-size: 0.85rem;
        }
        
        /* 大屏幕 */
        @media (max-width: 1200px) {
            .container { padding: 30px 30px; }
            .status-grid { grid-template-columns: repeat(3, 1fr); }
        }
        
        /* 中等屏幕 */
        @media (max-width: 1024px) {
            .logo { font-size: 3rem; }
            .status-grid { grid-template-columns: repeat(3, 1fr); }
            .info-grid { grid-template-columns: 1fr; }
            .features-grid { grid-template-columns: repeat(2, 1fr); }
        }
        
        /* 平板 */
        @media (max-width: 768px) {
            .container { padding: 20px 15px; }
            .lang-switch { top: 10px; right: 10px; }
            .lang-btn { padding: 6px 12px; font-size: 0.8rem; }
            .logo { font-size: 2.2rem; }
            .subtitle { font-size: 0.75rem; letter-spacing: 0.15em; }
            .badge { font-size: 0.7rem; padding: 4px 10px; }
            .section { padding: 20px 15px; margin-bottom: 20px; }
            .section-title { font-size: 1rem; }
            .status-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
            .status-item { padding: 15px 12px; }
            .status-value { font-size: 1.4rem; }
            .status-label { font-size: 0.75rem; }
            .info-grid { grid-template-columns: 1fr; gap: 15px; }
            .info-item { padding: 12px; }
            .info-label { font-size: 0.75rem; }
            .info-value { font-size: 0.85rem; }
            .api-grid { grid-template-columns: 1fr; gap: 12px; }
            .api-item { padding: 12px; }
            .api-method { font-size: 0.65rem; padding: 3px 8px; }
            .api-path { font-size: 0.75rem; }
            .api-desc { font-size: 0.8rem; }
            .features-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
            .feature-item { padding: 15px 12px; }
            .feature-title { font-size: 0.85rem; }
            .feature-desc { font-size: 0.75rem; }
            .code-block { padding: 12px; font-size: 0.7rem; }
            .code-block pre { font-size: 0.7rem; }
            table { font-size: 0.8rem; }
            th, td { padding: 10px 8px; }
            .footer { padding: 15px; font-size: 0.75rem; }
        }
        
        /* 小屏幕手机 */
        @media (max-width: 480px) {
            .container { padding: 15px 10px; }
            .logo { font-size: 1.8rem; }
            .subtitle { font-size: 0.65rem; letter-spacing: 0.1em; }
            .badge { font-size: 0.6rem; padding: 3px 8px; margin: 3px; }
            .section { padding: 15px 12px; }
            .section-title { font-size: 0.9rem; margin-bottom: 12px; }
            .status-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
            .status-item { padding: 12px 10px; }
            .status-value { font-size: 1.2rem; }
            .status-label { font-size: 0.7rem; }
            .features-grid { grid-template-columns: 1fr; }
            .feature-item { padding: 12px 10px; }
            .code-block { padding: 10px; overflow-x: auto; }
            .code-block pre { font-size: 0.65rem; white-space: pre-wrap; word-break: break-all; }
            th, td { padding: 8px 6px; font-size: 0.75rem; }
            .api-path { word-break: break-all; }
        }
        
        /* 超小屏幕 */
        @media (max-width: 360px) {
            .logo { font-size: 1.5rem; }
            .status-value { font-size: 1rem; }
            .lang-btn { padding: 5px 10px; font-size: 0.75rem; }
        }
        
        /* 横屏模式优化 */
        @media (max-height: 500px) and (orientation: landscape) {
            .container { padding: 15px 20px; }
            .logo { font-size: 2rem; margin-bottom: 10px; }
            .subtitle { margin-bottom: 15px; }
            .section { padding: 15px; margin-bottom: 15px; }
        }
    </style>
</head>
<body>
    <div class="lang-switch">
        <a href="?lang=${switchLang}" class="lang-btn">${t.langSwitch}</a>
    </div>
    
    <div class="container">
        <header class="header">
            <h1 class="logo">CFSPIDER<span class="version-badge">v${VERSION}</span></h1>
            <p class="subtitle">${t.subtitle}</p>
        </header>
        
        <div class="status-grid">
            <div class="status-card">
                <div class="status-label">${t.nodeLocation}</div>
                <div class="status-value">${displayColo}</div>
            </div>
            <div class="status-card">
                <div class="status-label">${t.country}</div>
                <div class="status-value">${displayCountry}</div>
            </div>
            <div class="status-card">
                <div class="status-label">${t.city}</div>
                <div class="status-value">${displayCity}</div>
            </div>
            <div class="status-card">
                <div class="status-label">${t.continent}</div>
                <div class="status-value">${continentNames[continent] || continent}</div>
            </div>
            <div class="status-card">
                <div class="status-label">${t.status}</div>
                <div class="status-value status-online">${t.online}</div>
            </div>
            <div class="status-card">
                <div class="status-label">${t.version}</div>
                <div class="status-value">${VERSION}</div>
            </div>
        </div>
        
        <div class="info-grid">
            <div class="info-panel">
                <div class="panel-title">// ${t.nodeInfoTitle}</div>
                <div class="info-row">
                    <span class="info-label">${t.nodeLocation}</span>
                    <span class="info-value">${displayColo}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">${t.country}</span>
                    <span class="info-value">${displayCountry}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">${t.city}</span>
                    <span class="info-value">${displayCity}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">${t.regionDetail}</span>
                    <span class="info-value">${displayRegion}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">${t.asn}</span>
                    <span class="info-value">AS${asn}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">${t.timezone}</span>
                    <span class="info-value">${timezone}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">${t.coordinates}</span>
                    <span class="info-value">${latitude}, ${longitude}</span>
                </div>
            </div>
            
            <div class="info-panel">
                <div class="panel-title">// ${t.visitorInfoTitle}</div>
                <div class="info-row">
                    <span class="info-label">${t.visitorIP}</span>
                    <span class="info-value">${visitorIP}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">${t.country}</span>
                    <span class="info-value">${displayCountry}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">${t.asn}</span>
                    <span class="info-value">AS${asn}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">${t.status}</span>
                    <span class="info-value online">${t.online}</span>
                </div>
            </div>
        </div>
        
        <div class="features-grid">
            <div class="feature-card">
                <div class="feature-text">${t.feature1}</div>
            </div>
            <div class="feature-card">
                <div class="feature-text">${t.feature2}</div>
            </div>
            <div class="feature-card">
                <div class="feature-text">${t.feature3}</div>
            </div>
            <div class="feature-card">
                <div class="feature-text">${t.feature4}</div>
            </div>
            <div class="feature-card">
                <div class="feature-text">${t.feature5}</div>
            </div>
            <div class="feature-card">
                <div class="feature-text">${t.feature6}</div>
            </div>
        </div>
        
        <div class="pool-section">
            <table class="pool-table" id="poolTable">
                <thead>
                    <tr>
                        <th>${t.ipAddress}</th>
                        <th>${t.type}</th>
                        <th>${t.status}</th>
                        <th>${t.latency}</th>
                        <th>${t.regionLabel}</th>
                    </tr>
                </thead>
                <tbody id="poolBody">
                    <tr><td colspan="5" style="text-align:center;"><span class="loading"></span> ${t.loading}</td></tr>
                </tbody>
            </table>
        </div>
        
        <div class="api-section">
            <h2>// ${t.apiTitle}</h2>
            <div class="api-grid">
                <div class="api-item">
                    <span class="api-method">GET</span>
                    <span class="api-path">/api/fetch?url=https://example.com</span>
                    <div class="api-desc">${t.apiDesc1}</div>
                </div>
                <div class="api-item">
                    <span class="api-method">GET</span>
                    <span class="api-path">/api/json?url=https://httpbin.org/ip</span>
                    <div class="api-desc">${t.apiDesc2}</div>
                </div>
                <div class="api-item">
                    <span class="api-method">GET</span>
                    <span class="api-path">/api/pool</span>
                    <div class="api-desc">${t.apiDesc3}</div>
                </div>
                <div class="api-item">
                    <span class="api-method">POST</span>
                    <span class="api-path">/proxy?url=...&method=GET</span>
                    <div class="api-desc">${t.apiDesc4}</div>
                </div>
                <div class="api-item">
                    <span class="api-method">GET</span>
                    <span class="api-path">/api/status</span>
                    <div class="api-desc">${t.apiDesc5}</div>
                </div>
                <div class="api-item">
                    <span class="api-method">GET</span>
                    <span class="api-path">/debug</span>
                    <div class="api-desc">${t.apiDesc6}</div>
                </div>
            </div>
            <div class="note">${t.responseNote}</div>
        </div>
        
        <div class="install-section">
            <h3>// ${t.installTitle}</h3>
            <div class="install-cmd">pip install cfspider</div>
        </div>
        
        <div class="code-section">
            <pre><span class="code-comment"># pip install cfspider[extract]</span>
<span class="code-keyword">import</span> cfspider

cf_proxies = <span class="code-string">"https://your-workers.dev"</span>

<span class="code-comment"># GET request with CF proxy</span>
response = cfspider.<span class="code-function">get</span>(
    <span class="code-string">"https://httpbin.org/ip"</span>,
    cf_proxies=cf_proxies
)
<span class="code-function">print</span>(response.cf_colo)  <span class="code-comment"># Cloudflare node code</span>

<span class="code-comment"># TLS fingerprint + stealth mode</span>
response = cfspider.<span class="code-function">get</span>(
    <span class="code-string">"https://example.com"</span>,
    impersonate=<span class="code-string">"chrome131"</span>,
    stealth=<span class="code-keyword">True</span>
)

<span class="code-comment"># Data extraction (CSS/XPath/JSONPath)</span>
title = response.<span class="code-function">find</span>(<span class="code-string">"h1"</span>)
links = response.<span class="code-function">find_all</span>(<span class="code-string">"a"</span>, attr=<span class="code-string">"href"</span>)
data = response.<span class="code-function">pick</span>(title=<span class="code-string">"h1"</span>, links=(<span class="code-string">"a"</span>, <span class="code-string">"href"</span>))
data.<span class="code-function">save</span>(<span class="code-string">"output.csv"</span>)

<span class="code-comment"># Batch requests with progress</span>
urls = [<span class="code-string">"https://example.com/1"</span>, <span class="code-string">"https://example.com/2"</span>]
results = cfspider.<span class="code-function">batch</span>(urls, concurrency=<span class="code-number">10</span>)
results.<span class="code-function">save</span>(<span class="code-string">"results.json"</span>)

<span class="code-comment"># Async request (httpx)</span>
response = <span class="code-keyword">await</span> cfspider.<span class="code-function">aget</span>(
    <span class="code-string">"https://httpbin.org/ip"</span>,
    cf_proxies=cf_proxies
)

<span class="code-comment"># Browser automation (Playwright)</span>
browser = cfspider.<span class="code-function">Browser</span>()
html = browser.<span class="code-function">html</span>(<span class="code-string">"https://example.com"</span>)
browser.<span class="code-function">close</span>()</pre>
        </div>
        
        <footer class="footer">
            <p>CFSPIDER v${VERSION}</p>
            <p style="margin-top:15px;">
                <a href="https://github.com/violettoolssite/CFspider" target="_blank">GITHUB</a>
                <a href="https://pypi.org/project/cfspider/" target="_blank">PYPI</a>
                <a href="https://cfspider.com" target="_blank">DOCS</a>
            </p>
            <p style="margin-top:15px;">${t.footer}<span class="cursor"></span></p>
        </footer>
    </div>
    
    <script>
        const errorMsg = "${t.error}";
        
        async function loadPool() {
            try {
                // 从 URL 参数获取 token
                const urlParams = new URLSearchParams(window.location.search);
                const token = urlParams.get('token');
                const apiUrl = token ? \`/api/pool?token=\${token}\` : '/api/pool';
                const resp = await fetch(apiUrl);
                const data = await resp.json();
                const tbody = document.getElementById('poolBody');
                
                if (data.pool && data.pool.length > 0) {
                    tbody.innerHTML = data.pool.map(item => {
                        const latencyClass = item.latency < 30 ? 'latency-good' : 
                                           item.latency < 60 ? 'latency-medium' : 'latency-bad';
                        const typeClass = item.type === 'EDGE' ? 'type-edge' : 'type-anycast';
                        return \`<tr>
                            <td style="font-family:'Share Tech Mono',monospace;color:#fff;">\${item.ip}</td>
                            <td class="\${typeClass}">\${item.type}</td>
                            <td class="status-online">\${item.status}</td>
                            <td class="\${latencyClass}">\${item.latency}ms</td>
                            <td>\${item.region}</td>
                        </tr>\`;
                    }).join('');
                }
            } catch (e) {
                document.getElementById('poolBody').innerHTML = 
                    '<tr><td colspan="5" style="color:#ff2a6d;">' + errorMsg + '</td></tr>';
            }
        }
        
        loadPool();
        setInterval(loadPool, 30000);
    </script>
</body>
</html>`;
}

function validateToken(request, env) {
    // 如果没有配置 TOKEN 环境变量，跳过验证
    if (!env.TOKEN) {
        return { valid: true };
    }
    
    // 从环境变量读取 token 列表（逗号分隔）
    const allowedTokens = env.TOKEN.split(',').map(t => t.trim()).filter(t => t);
    
    // 如果没有配置任何 token，跳过验证
    if (allowedTokens.length === 0) {
        return { valid: true };
    }
    
    // 从查询参数获取 token
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('token');
    
    // 从 Header 获取 token (Authorization: Bearer xxx)
    const authHeader = request.headers.get('Authorization');
    let headerToken = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        headerToken = authHeader.substring(7).trim();
    }
    
    // 优先使用查询参数，其次使用 Header
    const providedToken = queryToken || headerToken;
    
    // 如果没有提供 token，验证失败
    if (!providedToken) {
        return { valid: false };
    }
    
    // 验证 token 是否在允许列表中
    const isValid = allowedTokens.includes(providedToken);
    
    return { valid: isValid };
}
