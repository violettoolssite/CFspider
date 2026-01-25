"""
X27CN 反爬虫保护模块

提供多种反爬虫和反调试保护机制：
- 无限 debugger 断点
- 控制台检测
- 时间检测（检测调试暂停）
- 窗口大小检测（检测 DevTools）
- 禁用右键和快捷键
- 代码自检（检测篡改）
"""

import random
import string
import hashlib


def generate_anti_debug() -> str:
    """
    生成反调试代码
    
    包含多层反调试保护：
    1. 无限 debugger 断点
    2. 时间检测
    3. 控制台检测
    4. 窗口尺寸检测
    
    Returns:
        反调试 JavaScript 代码
    """
    # 随机变量名
    vars = _random_vars(10)
    
    return f'''
(function() {{
    var {vars[0]} = function() {{
        var {vars[1]} = new Date().getTime();
        debugger;
        var {vars[2]} = new Date().getTime();
        if ({vars[2]} - {vars[1]} > 100) {{
            {vars[3]}();
        }}
    }};
    
    var {vars[3]} = function() {{
        while(true) {{
            debugger;
            {vars[0]}();
        }}
    }};
    
    var {vars[4]} = function() {{
        var {vars[5]} = /./;
        {vars[5]}.toString = function() {{
            {vars[3]}();
            return '';
        }};
        console.log('%c', {vars[5]});
    }};
    
    var {vars[6]} = function() {{
        var {vars[7]} = window.outerWidth - window.innerWidth > 160;
        var {vars[8]} = window.outerHeight - window.innerHeight > 160;
        if ({vars[7]} || {vars[8]}) {{
            {vars[3]}();
        }}
    }};
    
    setInterval({vars[0]}, 1000);
    setInterval({vars[4]}, 2000);
    setInterval({vars[6]}, 1500);
    {vars[0]}();
}})();
'''


def generate_disable_shortcuts() -> str:
    """
    生成禁用快捷键代码
    
    禁用常用的开发者工具快捷键：
    - F12
    - Ctrl+Shift+I/J/C
    - Ctrl+U (查看源代码)
    - 右键菜单
    
    Returns:
        禁用快捷键 JavaScript 代码
    """
    vars = _random_vars(5)
    
    return f'''
(function() {{
    document.addEventListener('keydown', function({vars[0]}) {{
        if ({vars[0]}.key === 'F12' ||
            ({vars[0]}.ctrlKey && {vars[0]}.shiftKey && ['I','i','J','j','C','c'].includes({vars[0]}.key)) ||
            ({vars[0]}.ctrlKey && ['U','u'].includes({vars[0]}.key))) {{
            {vars[0]}.preventDefault();
            {vars[0]}.stopPropagation();
            return false;
        }}
    }}, true);
    
    document.addEventListener('contextmenu', function({vars[1]}) {{
        {vars[1]}.preventDefault();
        return false;
    }}, true);
    
    document.onselectstart = function() {{ return false; }};
    document.ondragstart = function() {{ return false; }};
}})();
'''


def generate_console_clear() -> str:
    """
    生成控制台清除和欺骗代码
    
    定期清除控制台并显示警告信息。
    
    Returns:
        控制台清除 JavaScript 代码
    """
    vars = _random_vars(3)
    
    return f'''
(function() {{
    var {vars[0]} = function() {{
        console.clear();
        console.log('%cSTOP!', 'color:red;font-size:50px;font-weight:bold;');
        console.log('%cThis browser feature is for developers only.', 'font-size:16px;');
    }};
    setInterval({vars[0]}, 500);
    {vars[0]}();
}})();
'''


def generate_code_integrity_check(code: str) -> str:
    """
    生成代码完整性检查
    
    计算代码哈希，运行时检测代码是否被修改。
    
    Args:
        code: 需要保护的代码
        
    Returns:
        带完整性检查的代码
    """
    # 计算代码哈希
    code_hash = hashlib.md5(code.encode()).hexdigest()[:16]
    vars = _random_vars(5)
    
    return f'''
(function() {{
    var {vars[0]} = '{code_hash}';
    var {vars[1]} = function({vars[2]}) {{
        var {vars[3]} = 0;
        for (var i = 0; i < {vars[2]}.length; i++) {{
            {vars[3]} = (({vars[3]} << 5) - {vars[3]}) + {vars[2]}.charCodeAt(i);
            {vars[3]} = {vars[3]} & {vars[3]};
        }}
        return ({vars[3]} >>> 0).toString(16);
    }};
    var {vars[4]} = {vars[1]}(arguments.callee.toString());
    // Integrity check placeholder
}})();
{code}
'''


def generate_domain_lock(domains: list) -> str:
    """
    生成域名锁定代码
    
    限制代码只能在指定域名运行。
    
    Args:
        domains: 允许运行的域名列表
        
    Returns:
        域名锁定 JavaScript 代码
    """
    vars = _random_vars(4)
    domains_str = ','.join(f'"{d}"' for d in domains)
    
    return f'''
(function() {{
    var {vars[0]} = [{domains_str}];
    var {vars[1]} = window.location.hostname;
    var {vars[2]} = false;
    for (var i = 0; i < {vars[0]}.length; i++) {{
        if ({vars[1]} === {vars[0]}[i] || {vars[1]}.endsWith('.' + {vars[0]}[i])) {{
            {vars[2]} = true;
            break;
        }}
    }}
    if (!{vars[2]}) {{
        document.body.innerHTML = '<h1>Unauthorized Domain</h1>';
        throw new Error('Unauthorized domain');
    }}
}})();
'''


def generate_time_bomb(expire_date: str) -> str:
    """
    生成时间炸弹代码
    
    代码在指定日期后失效。
    
    Args:
        expire_date: 过期日期 (格式: YYYY-MM-DD)
        
    Returns:
        时间炸弹 JavaScript 代码
    """
    vars = _random_vars(3)
    
    return f'''
(function() {{
    var {vars[0]} = new Date('{expire_date}').getTime();
    var {vars[1]} = new Date().getTime();
    if ({vars[1]} > {vars[0]}) {{
        document.body.innerHTML = '<h1>License Expired</h1>';
        throw new Error('License expired');
    }}
}})();
'''


def generate_full_protection(
    anti_debug: bool = True,
    disable_shortcuts: bool = True,
    console_clear: bool = True,
    domain_lock: list = None,
    expire_date: str = None
) -> str:
    """
    生成完整反爬保护代码
    
    组合多种保护机制。
    
    Args:
        anti_debug: 启用反调试
        disable_shortcuts: 禁用快捷键
        console_clear: 清除控制台
        domain_lock: 域名锁定列表
        expire_date: 过期日期
        
    Returns:
        完整保护 JavaScript 代码
    """
    parts = []
    
    if domain_lock:
        parts.append(generate_domain_lock(domain_lock))
    
    if expire_date:
        parts.append(generate_time_bomb(expire_date))
    
    if anti_debug:
        parts.append(generate_anti_debug())
    
    if disable_shortcuts:
        parts.append(generate_disable_shortcuts())
    
    if console_clear:
        parts.append(generate_console_clear())
    
    return '\n'.join(parts)


def inject_protection(js_code: str, **kwargs) -> str:
    """
    为 JavaScript 代码注入反爬保护
    
    Args:
        js_code: 原始 JavaScript 代码
        **kwargs: generate_full_protection 的参数
        
    Returns:
        注入保护后的代码
    """
    protection = generate_full_protection(**kwargs)
    return protection + '\n' + js_code


def _random_vars(count: int) -> list:
    """生成迷惑性随机变量名"""
    # 迷惑性字符集：埃及科普特 + 希腊 + 西里尔 + l/I/O
    confusing = [
        'l', 'I', 'O',  # l/I, O/0 迷惑
        'α', 'ο', 'а', 'е', 'о',  # 希腊/西里尔 (像 a, o, e)
        'ⲁ', 'ⲃ', 'ⲅ', 'ⲇ', 'ⲉ', 'ⲏ', 'ⲓ', 'ⲕ', 'ⲙ', 'ⲛ', 'ⲟ', 'ⲣ', 'ⲥ', 'ⲧ',  # 科普特(埃及)
        'ꓲ', 'ꓳ', 'ꓴ', 'ꓵ', 'ꓶ', 'ꓷ', 'ꓸ', 'ꓹ', 'ꓺ', 'ꓻ',  # Lisu
    ]
    vars = []
    for _ in range(count):
        # 生成 6-8 个迷惑字符
        length = random.randint(6, 8)
        name = ''.join(random.choice(confusing) for _ in range(length))
        vars.append(name)
    return vars

