"""
X27CN 代码压缩混淆模块

提供 HTML/CSS/JS 的专业压缩和混淆功能：
1. 纯Python实现的压缩（无需额外依赖）
2. Node.js工具调用（如果可用，效果更好）
"""

import re
import os
import json
import subprocess
import shutil
from typing import Optional, Dict, Any

# ============== 纯 Python 压缩实现 ==============

def minify_css(css: str) -> str:
    """
    压缩 CSS 代码（纯Python实现）
    
    Args:
        css: CSS 源代码
        
    Returns:
        压缩后的 CSS
        
    Example:
        >>> minify_css('body { color: red; }')
        'body{color:red}'
    """
    # 移除注释
    css = re.sub(r'/\*[\s\S]*?\*/', '', css)
    
    # 移除多余空白
    css = re.sub(r'\s+', ' ', css)
    
    # 移除选择器和属性周围的空白
    css = re.sub(r'\s*([{};:,>+~])\s*', r'\1', css)
    
    # 移除最后的分号
    css = re.sub(r';}', '}', css)
    
    # 移除0值的单位
    css = re.sub(r'(\s|:)0(px|em|rem|%|pt|cm|mm|in|pc|ex|ch|vw|vh|vmin|vmax)', r'\g<1>0', css)
    
    # 简化颜色
    css = re.sub(r'#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3', r'#\1\2\3', css)
    
    # 移除开头结尾空白
    css = css.strip()
    
    return css


def minify_js(js: str, mangle: bool = True) -> str:
    """
    压缩 JavaScript 代码（纯Python实现）
    
    Args:
        js: JavaScript 源代码
        mangle: 是否混淆变量名
        
    Returns:
        压缩后的 JavaScript
        
    Example:
        >>> minify_js('function test() { return 1; }')
        'function test(){return 1}'
    """
    # 先混淆变量名（在原始代码上，保持完整语法）
    if mangle:
        js = _mangle_variables(js)
    
    # 保护字符串和正则表达式
    strings = []
    def save_string(match):
        idx = len(strings)
        strings.append(match.group(0))
        return f'__STR_{idx}__'
    
    # 保护单引号、双引号和反引号字符串
    js = re.sub(r"'(?:[^'\\]|\\.)*'", save_string, js)
    js = re.sub(r'"(?:[^"\\]|\\.)*"', save_string, js)
    js = re.sub(r'`(?:[^`\\]|\\.)*`', save_string, js)
    
    # 移除单行注释
    js = re.sub(r'//[^\n]*', '', js)
    
    # 移除多行注释
    js = re.sub(r'/\*[\s\S]*?\*/', '', js)
    
    # 压缩空白
    js = re.sub(r'\s+', ' ', js)
    
    # 移除操作符周围的空白
    js = re.sub(r'\s*([{}\[\]();,<>=+\-*/%&|!?:])\s*', r'\1', js)
    
    # 关键字后保留空格
    for kw in ['return', 'throw', 'new', 'delete', 'typeof', 'void', 'in', 'instanceof', 'else', 'case', 'var', 'let', 'const', 'function', 'class', 'extends', 'async', 'await', 'yield', 'import', 'export', 'from', 'as', 'of']:
        js = re.sub(rf'({kw})([a-zA-Z_$])', rf'\1 \2', js)
    
    # 恢复字符串
    for i, s in enumerate(strings):
        js = js.replace(f'__STR_{i}__', s)
    
    # 移除开头结尾空白
    js = js.strip()
    
    return js


def _mangle_variables(js: str) -> str:
    """混淆局部变量名"""
    # 保护字符串
    strings = []
    def save_string(match):
        idx = len(strings)
        strings.append(match.group(0))
        return f'__STR_{idx}__'
    
    js = re.sub(r"'(?:[^'\\]|\\.)*'", save_string, js)
    js = re.sub(r'"(?:[^"\\]|\\.)*"', save_string, js)
    js = re.sub(r'`(?:[^`\\]|\\.)*`', save_string, js)
    
    # 找到函数作用域内的变量声明
    var_pattern = re.compile(r'\b(var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)')
    
    # 生成迷惑性变量名
    def gen_name(index):
        # 迷惑性字符集：
        # - l, I, 1 (小写L, 大写i, 数字1)
        # - O, 0 (大写O, 数字0)
        # - α, а (希腊alpha, 西里尔a)
        # - ⲁ, ⲃ, ⲅ (科普特/埃及字母)
        # - ꓲ, ꓳ, ꓴ (Lisu字母，像数字)
        confusing = [
            'l', 'I', 'O',  # 基础迷惑
            'α', 'ο', 'а', 'е', 'о',  # 希腊/西里尔 (像 a, o, e)
            'ⲁ', 'ⲃ', 'ⲅ', 'ⲇ', 'ⲉ', 'ⲏ', 'ⲓ', 'ⲕ', 'ⲙ', 'ⲛ', 'ⲟ', 'ⲣ', 'ⲥ', 'ⲧ',  # 科普特(埃及)
            'ꓲ', 'ꓳ', 'ꓴ', 'ꓵ', 'ꓶ', 'ꓷ', 'ꓸ', 'ꓹ', 'ꓺ', 'ꓻ',  # Lisu
        ]
        base = len(confusing)
        if index < base:
            return confusing[index]
        # 组合生成更多
        first = index // base
        second = index % base
        if first < base:
            return confusing[first] + confusing[second]
        # 三字符
        third = first // base
        first = first % base
        return confusing[third % base] + confusing[first] + confusing[second]
    
    # 收集变量
    var_map = {}
    index = 0
    for match in var_pattern.finditer(js):
        name = match.group(2)
        if name not in var_map and name not in ['undefined', 'null', 'true', 'false', 'NaN', 'Infinity']:
            var_map[name] = gen_name(index)
            index += 1
    
    # 替换变量（从长到短排序避免部分替换）
    for old_name in sorted(var_map.keys(), key=len, reverse=True):
        new_name = var_map[old_name]
        # 只替换完整单词
        js = re.sub(rf'\b{re.escape(old_name)}\b', new_name, js)
    
    # 恢复字符串
    for i, s in enumerate(strings):
        js = js.replace(f'__STR_{i}__', s)
    
    return js


def minify_html(html: str, minify_inline: bool = True) -> str:
    """
    压缩 HTML 代码
    
    Args:
        html: HTML 源代码
        minify_inline: 是否压缩内联的CSS/JS
        
    Returns:
        压缩后的 HTML
    """
    # 保护 <pre>、<script>、<style>、<textarea> 内容
    preserved = []
    
    def save_block(tag_name):
        def replacer(match):
            idx = len(preserved)
            preserved.append(match.group(0))
            return f'__BLOCK_{idx}__'
        return replacer
    
    # 保存这些标签的内容
    for tag in ['pre', 'code', 'textarea']:
        html = re.sub(rf'<{tag}[^>]*>[\s\S]*?</{tag}>', save_block(tag), html, flags=re.IGNORECASE)
    
    # 处理 script 和 style
    if minify_inline:
        # 压缩内联 JS
        def process_script(match):
            attrs = match.group(1)
            content = match.group(2)
            # 跳过外部脚本
            if 'src=' in attrs.lower():
                return match.group(0)
            minified = minify_js(content, mangle=False)
            return f'<script{attrs}>{minified}</script>'
        html = re.sub(r'<script([^>]*)>([\s\S]*?)</script>', process_script, html, flags=re.IGNORECASE)
        
        # 压缩内联 CSS
        def process_style(match):
            attrs = match.group(1)
            content = match.group(2)
            minified = minify_css(content)
            return f'<style{attrs}>{minified}</style>'
        html = re.sub(r'<style([^>]*)>([\s\S]*?)</style>', process_style, html, flags=re.IGNORECASE)
    else:
        # 保护 script 和 style
        html = re.sub(r'<script[^>]*>[\s\S]*?</script>', save_block('script'), html, flags=re.IGNORECASE)
        html = re.sub(r'<style[^>]*>[\s\S]*?</style>', save_block('style'), html, flags=re.IGNORECASE)
    
    # 移除 HTML 注释
    html = re.sub(r'<!--[\s\S]*?-->', '', html)
    
    # 压缩空白（但保留单个空格）
    html = re.sub(r'\s+', ' ', html)
    
    # 移除标签周围的空白
    html = re.sub(r'>\s+<', '><', html)
    
    # 移除属性值周围的引号（可选值）
    # html = re.sub(r'=\s*"([^"\s]+)"', r'=\1', html)
    
    # 移除冗余属性
    html = re.sub(r'\s+type\s*=\s*["\']?text/javascript["\']?', '', html, flags=re.IGNORECASE)
    html = re.sub(r'\s+type\s*=\s*["\']?text/css["\']?', '', html, flags=re.IGNORECASE)
    
    # 恢复保护的内容
    for i, block in enumerate(preserved):
        html = html.replace(f'__BLOCK_{i}__', block)
    
    return html.strip()


# ============== Node.js 工具调用 ==============

def _check_node() -> bool:
    """检查 Node.js 是否可用"""
    return shutil.which('node') is not None


def _check_npm_package(package: str) -> bool:
    """检查 npm 包是否安装"""
    try:
        result = subprocess.run(
            ['npm', 'list', package],
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.returncode == 0
    except:
        return False


def minify_css_node(css: str) -> str:
    """
    使用 clean-css (Node.js) 压缩 CSS
    
    如果 Node.js 不可用，自动降级到纯 Python 实现。
    """
    if not _check_node():
        return minify_css(css)
    
    try:
        # 写入临时文件
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.css', delete=False, encoding='utf-8') as f:
            f.write(css)
            temp_path = f.name
        
        # 调用 cleancss
        result = subprocess.run(
            ['npx', 'cleancss', temp_path],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        os.unlink(temp_path)
        
        if result.returncode == 0 and result.stdout:
            return result.stdout
        else:
            return minify_css(css)
    except Exception:
        return minify_css(css)


def minify_js_node(js: str, mangle: bool = True) -> str:
    """
    使用 Terser (Node.js) 压缩混淆 JavaScript
    
    如果 Node.js 不可用，自动降级到纯 Python 实现。
    """
    if not _check_node():
        return minify_js(js, mangle)
    
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, encoding='utf-8') as f:
            f.write(js)
            temp_path = f.name
        
        cmd = ['npx', 'terser', temp_path, '--compress', '--format', 'comments=false']
        if mangle:
            cmd.append('--mangle')
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        os.unlink(temp_path)
        
        if result.returncode == 0 and result.stdout:
            return result.stdout
        else:
            return minify_js(js, mangle)
    except Exception:
        return minify_js(js, mangle)


def minify_html_node(html: str) -> str:
    """
    使用 html-minifier-terser (Node.js) 压缩 HTML
    
    如果 Node.js 不可用，自动降级到纯 Python 实现。
    """
    if not _check_node():
        return minify_html(html)
    
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8') as f:
            f.write(html)
            temp_path = f.name
        
        result = subprocess.run(
            ['npx', 'html-minifier-terser',
             '--collapse-whitespace',
             '--remove-comments',
             '--minify-css', 'true',
             '--minify-js', 'true',
             temp_path],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        os.unlink(temp_path)
        
        if result.returncode == 0 and result.stdout:
            return result.stdout
        else:
            return minify_html(html)
    except Exception:
        return minify_html(html)


# ============== 高级混淆功能 ==============

def obfuscate_identifiers(js: str) -> str:
    """
    混淆 JavaScript 标识符（变量名、函数名）
    
    Args:
        js: JavaScript 源代码
        
    Returns:
        混淆后的代码
    """
    # 保护字符串和正则
    protected = []
    def save_protected(match):
        idx = len(protected)
        protected.append(match.group(0))
        return f'__PROT_{idx}__'
    
    # 保护字符串
    js = re.sub(r"'(?:[^'\\]|\\.)*'", save_protected, js)
    js = re.sub(r'"(?:[^"\\]|\\.)*"', save_protected, js)
    js = re.sub(r'`(?:[^`\\]|\\.)*`', save_protected, js)
    
    # 保护正则
    js = re.sub(r'/(?![/*])(?:[^/\\]|\\.)+/[gimsuy]*', save_protected, js)
    
    # 收集声明的变量和函数
    declarations = set()
    
    # var/let/const 声明
    for match in re.finditer(r'\b(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)', js):
        declarations.add(match.group(1))
    
    # function 声明
    for match in re.finditer(r'\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)', js):
        declarations.add(match.group(1))
    
    # 生成迷惑性混淆名
    def gen_name(index):
        # 迷惑性字符集：埃及科普特 + 希腊 + 西里尔 + l/I/O/0
        confusing = [
            'l', 'I', 'O',  # l/I, O/0 迷惑
            'α', 'ο', 'а', 'е', 'о',  # 希腊/西里尔 (像 a, o, e)
            'ⲁ', 'ⲃ', 'ⲅ', 'ⲇ', 'ⲉ', 'ⲏ', 'ⲓ', 'ⲕ', 'ⲙ', 'ⲛ', 'ⲟ', 'ⲣ', 'ⲥ', 'ⲧ',  # 科普特(埃及)
            'ꓲ', 'ꓳ', 'ꓴ', 'ꓵ', 'ꓶ', 'ꓷ', 'ꓸ', 'ꓹ', 'ꓺ', 'ꓻ',  # Lisu
        ]
        base = len(confusing)
        if index < base:
            return confusing[index]
        first = index // base
        second = index % base
        if first < base:
            return confusing[first] + confusing[second]
        third = first // base
        first = first % base
        return confusing[third % base] + confusing[first] + confusing[second]
    
    # 过滤保留字和内置对象
    reserved = {
        'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
        'Object', 'Array', 'String', 'Number', 'Boolean', 'Function',
        'Symbol', 'BigInt', 'Math', 'Date', 'RegExp', 'Error',
        'JSON', 'console', 'window', 'document', 'navigator',
        'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
        'Promise', 'async', 'await', 'class', 'extends', 'super',
        'this', 'new', 'delete', 'typeof', 'instanceof', 'in',
        'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
        'continue', 'return', 'throw', 'try', 'catch', 'finally',
        'import', 'export', 'default', 'from', 'as', 'of',
        'arguments', 'eval', 'with', 'debugger',
        'crypto', 'fetch', 'Response', 'Request', 'Headers', 'URL',
        'TextEncoder', 'TextDecoder', 'Uint8Array', 'ArrayBuffer',
        'atob', 'btoa', 'encodeURIComponent', 'decodeURIComponent',
    }
    
    # 创建映射
    name_map = {}
    idx = 0
    for name in sorted(declarations, key=len, reverse=True):
        if name not in reserved and len(name) > 1:
            name_map[name] = gen_name(idx)
            idx += 1
    
    # 替换
    for old_name, new_name in name_map.items():
        js = re.sub(rf'\b{re.escape(old_name)}\b', new_name, js)
    
    # 恢复保护的内容
    for i, p in enumerate(protected):
        js = js.replace(f'__PROT_{i}__', p)
    
    return js


def add_dead_code(js: str, complexity: int = 2) -> str:
    """
    添加无效代码增加逆向难度
    
    Args:
        js: JavaScript 源代码
        complexity: 复杂度 (1-5)
        
    Returns:
        添加死代码后的代码
    """
    dead_code_templates = [
        'var _$d0=function(){return Math.random()>2};',
        'var _$d1=(function(){var _=[];for(var i=0;i<0;i++)_.push(i);return _})();',
        'if(typeof _$d2==="undefined")var _$d2=null;',
        'try{if(false)throw new Error()}catch(_$e){}',
        'var _$d3=Date.now()%1===2?1:0;',
    ]
    
    import random
    dead_codes = random.sample(dead_code_templates, min(complexity, len(dead_code_templates)))
    
    # 在代码开头添加
    return ''.join(dead_codes) + js


# ============== 统一接口 ==============

def minify(
    content: str,
    content_type: str = 'auto',
    use_node: bool = True,
    mangle: bool = True
) -> str:
    """
    统一的压缩混淆接口
    
    Args:
        content: 源代码
        content_type: 类型 ('html', 'css', 'js', 'auto')
        use_node: 是否尝试使用 Node.js 工具
        mangle: 是否混淆变量名（仅 JS）
        
    Returns:
        压缩后的代码
        
    Example:
        >>> minify('body { color: red; }', 'css')
        'body{color:red}'
        >>> minify('<html>...</html>', 'html')
        '<html>...</html>'
    """
    # 自动检测类型
    if content_type == 'auto':
        content_lower = content.strip().lower()
        if content_lower.startswith('<!doctype') or content_lower.startswith('<html'):
            content_type = 'html'
        elif '{' in content and (':' in content or '@' in content):
            # 可能是 CSS
            if re.search(r'[.#]?[\w-]+\s*\{', content):
                content_type = 'css'
            else:
                content_type = 'js'
        else:
            content_type = 'js'
    
    # 调用对应的压缩函数
    if content_type == 'html':
        return minify_html_node(content) if use_node else minify_html(content)
    elif content_type == 'css':
        return minify_css_node(content) if use_node else minify_css(content)
    else:  # js
        result = minify_js_node(content, mangle) if use_node else minify_js(content, mangle)
        return result


def minify_file(
    input_path: str,
    output_path: Optional[str] = None,
    use_node: bool = True,
    mangle: bool = True
) -> str:
    """
    压缩混淆文件
    
    Args:
        input_path: 输入文件路径
        output_path: 输出文件路径（默认添加 .min 后缀）
        use_node: 是否使用 Node.js 工具
        mangle: 是否混淆变量名
        
    Returns:
        输出文件路径
        
    Example:
        >>> minify_file('app.js')
        'app.min.js'
        >>> minify_file('style.css', 'dist/style.css')
        'dist/style.css'
    """
    # 读取文件
    with open(input_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 检测类型
    ext = os.path.splitext(input_path)[1].lower()
    if ext in ['.html', '.htm']:
        content_type = 'html'
    elif ext == '.css':
        content_type = 'css'
    elif ext == '.js':
        content_type = 'js'
    else:
        content_type = 'auto'
    
    # 压缩
    minified = minify(content, content_type, use_node, mangle)
    
    # 输出路径
    if output_path is None:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}.min{ext}"
    
    # 写入
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(minified)
    
    return output_path


# ============== 控制流扁平化 ==============

def flatten_control_flow(js: str, intensity: int = 2) -> str:
    """
    控制流扁平化 - 将顺序执行的代码块打乱为 switch-case 结构
    
    Args:
        js: JavaScript 源代码
        intensity: 扁平化强度 (1-3)
            1: 仅扁平化顶层语句
            2: 扁平化函数体内语句
            3: 递归扁平化所有代码块
        
    Returns:
        扁平化后的 JavaScript 代码
        
    Example:
        原始代码:
            step1(); step2(); step3();
        
        扁平化后:
            var _$s=[2,1,3,0],_$i=0;
            while(_$s[_$i]!==0){
                switch(_$s[_$i++]){
                    case 1:step1();break;
                    case 2:step2();break;
                    case 3:step3();break;
                }
            }
    """
    import random
    
    # 保护字符串和正则
    protected = []
    def save_protected(match):
        idx = len(protected)
        protected.append(match.group(0))
        return f'__PROT_{idx}__'
    
    js = re.sub(r"'(?:[^'\\]|\\.)*'", save_protected, js)
    js = re.sub(r'"(?:[^"\\]|\\.)*"', save_protected, js)
    js = re.sub(r'`(?:[^`\\]|\\.)*`', save_protected, js)
    js = re.sub(r'/(?![/*])(?:[^/\\]|\\.)+/[gimsuy]*', save_protected, js)
    
    def flatten_block(code: str, depth: int = 0) -> str:
        """扁平化一个代码块"""
        if depth >= intensity:
            return code
        
        # 分割语句（简化版本，处理基本情况）
        statements = _split_statements(code)
        
        if len(statements) < 3:
            return code
        
        # 过滤空语句
        statements = [s.strip() for s in statements if s.strip()]
        
        if len(statements) < 3:
            return code
        
        # 生成随机编号
        indices = list(range(1, len(statements) + 1))
        random.shuffle(indices)
        indices.append(0)  # 结束标志
        
        # 生成唯一变量名
        var_s = f'_$s{depth}'
        var_i = f'_$i{depth}'
        
        # 构建 switch 语句
        cases = []
        for i, stmt in enumerate(statements):
            case_num = i + 1
            # 递归扁平化函数体
            if intensity >= 2 and 'function' in stmt:
                stmt = _flatten_function_body(stmt, depth + 1, intensity)
            cases.append(f'case {case_num}:{stmt};break;')
        
        # 组装结果
        order_array = ','.join(str(i) for i in indices)
        result = f'var {var_s}=[{order_array}],{var_i}=0;'
        result += f'while({var_s}[{var_i}]!==0){{'
        result += f'switch({var_s}[{var_i}++]){{'
        result += ''.join(cases)
        result += '}}'
        
        return result
    
    def _split_statements(code: str) -> list:
        """分割语句（简化版本）"""
        statements = []
        current = ''
        brace_depth = 0
        paren_depth = 0
        bracket_depth = 0
        in_string = None
        
        i = 0
        while i < len(code):
            c = code[i]
            
            # 检查字符串
            if c in '"\'`' and (i == 0 or code[i-1] != '\\'):
                if in_string is None:
                    in_string = c
                elif in_string == c:
                    in_string = None
                current += c
                i += 1
                continue
            
            if in_string:
                current += c
                i += 1
                continue
            
            # 跟踪括号
            if c == '{':
                brace_depth += 1
            elif c == '}':
                brace_depth -= 1
            elif c == '(':
                paren_depth += 1
            elif c == ')':
                paren_depth -= 1
            elif c == '[':
                bracket_depth += 1
            elif c == ']':
                bracket_depth -= 1
            
            # 分割点
            if c == ';' and brace_depth == 0 and paren_depth == 0 and bracket_depth == 0:
                if current.strip():
                    statements.append(current.strip())
                current = ''
            elif c == '}' and brace_depth == 0 and paren_depth == 0 and bracket_depth == 0:
                current += c
                if current.strip():
                    statements.append(current.strip())
                current = ''
            else:
                current += c
            
            i += 1
        
        if current.strip():
            statements.append(current.strip())
        
        return statements
    
    def _flatten_function_body(func_code: str, depth: int, intensity: int) -> str:
        """扁平化函数体内容"""
        # 找到函数体
        match = re.search(r'(function[^{]*\{)([\s\S]*)(\})\s*$', func_code)
        if not match:
            return func_code
        
        prefix = match.group(1)
        body = match.group(2)
        suffix = match.group(3)
        
        # 扁平化函数体
        flattened_body = flatten_block(body, depth)
        
        return prefix + flattened_body + suffix
    
    # 处理整个代码
    result = flatten_block(js, 0)
    
    # 恢复保护的内容
    for i, p in enumerate(protected):
        result = result.replace(f'__PROT_{i}__', p)
    
    return result


def flatten_control_flow_safe(js: str) -> str:
    """
    安全的控制流扁平化（仅处理简单函数）
    
    此版本更保守，只处理明确可以扁平化的代码块，
    避免破坏复杂语法结构。
    
    Args:
        js: JavaScript 源代码
        
    Returns:
        扁平化后的代码
    """
    import random
    
    # 保护字符串、正则、模板字符串
    protected = []
    def save_protected(match):
        idx = len(protected)
        protected.append(match.group(0))
        return f'__PROT_{idx}__'
    
    js = re.sub(r"'(?:[^'\\]|\\.)*'", save_protected, js)
    js = re.sub(r'"(?:[^"\\]|\\.)*"', save_protected, js)
    js = re.sub(r'`(?:[^`\\]|\\.)*`', save_protected, js)
    
    # 找到简单的立即执行函数 (IIFE)
    def process_iife(match):
        inner = match.group(1)
        # 分割为简单语句
        stmts = [s.strip() for s in inner.split(';') if s.strip()]
        
        if len(stmts) < 3:
            return match.group(0)
        
        # 过滤包含控制流语句的代码
        for stmt in stmts:
            if any(kw in stmt for kw in ['if', 'for', 'while', 'switch', 'try', 'function']):
                return match.group(0)
        
        # 生成扁平化代码
        indices = list(range(1, len(stmts) + 1))
        random.shuffle(indices)
        indices.append(0)
        
        order = ','.join(str(i) for i in indices)
        cases = ''.join('case {}:{};break;'.format(i+1, stmts[i]) for i in range(len(stmts)))
        
        return '(function(){{var _$f=[{}],_$g=0;while(_$f[_$g]!==0){{switch(_$f[_$g++]){{{}}}}}}}})()'.format(order, cases)
    
    # 处理 IIFE
    js = re.sub(r'\(function\(\)\{([^{}]*)\}\)\(\)', process_iife, js)
    
    # 恢复保护的内容
    for i, p in enumerate(protected):
        js = js.replace(f'__PROT_{i}__', p)
    
    return js

