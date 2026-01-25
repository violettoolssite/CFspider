# X27CN

X27CN 代码混淆加密库 - Code obfuscation and encryption library

## 安装

```bash
pip install x27cn
```

## 快速开始

```python
import x27cn

# 加密
encrypted = x27cn.encrypt('Hello World')
print(encrypted)  # <faee><38db>...

# 解密
decrypted = x27cn.decrypt(encrypted)
print(decrypted)  # Hello World

# 使用自定义密钥
encrypted = x27cn.encrypt('敏感数据', key='mySecretKey')
decrypted = x27cn.decrypt(encrypted, key='mySecretKey')
```

## 文件混淆（前端代码保护）

### Python API

```python
import x27cn

# 混淆整个 HTML 文件（生成自解密页面）
x27cn.obfuscate_file('index.html')  # 生成 index.obf.html

# 混淆 JavaScript 文件
x27cn.obfuscate_file('app.js')  # 生成 app.obf.js

# 混淆 CSS 文件
x27cn.obfuscate_file('style.css')  # 生成 style.obf.css

# 自定义输出路径和密钥
x27cn.obfuscate_file('app.html', 'dist/app.html', key='myKey')
```

### 命令行

```bash
# 混淆 HTML
x27cn obfuscate index.html

# 混淆 JS
x27cn obfuscate app.js dist/app.js

# 使用自定义密钥
x27cn obfuscate app.html --key=mySecretKey

# 加密文本
x27cn encrypt -t "Hello World"

# 解密文本
x27cn decrypt -t "<faee><38db>..."
```

### 混淆效果

**原始 HTML:**
```html
<!DOCTYPE html>
<html>
<body>
  <h1>Hello World</h1>
  <script>alert('Secret!');</script>
</body>
</html>
```

**混淆后:**
```html
<!DOCTYPE html>
<html>
<body>
<script>
(function(){var _$='<9525><0d5b>...';var _k=[0x78,0x32,...];...})();
</script>
</body>
</html>
```

浏览器加载混淆后的文件会自动解密并正常显示原始内容。

### 内联混淆

```python
import x27cn

html = '''
<html>
<style>body { color: red; }</style>
<script>alert('hello');</script>
</html>
'''

# 只混淆内联 JS
result = x27cn.obfuscate_inline_js(html)

# 只混淆内联 CSS
result = x27cn.obfuscate_inline_css(html)
```

## API 参考

### 基础加密/解密

```python
# 标准格式（<xxxx> 标签）
encrypted = x27cn.encrypt('text')
decrypted = x27cn.decrypt(encrypted)

# 纯十六进制格式
hex_encrypted = x27cn.encrypt_hex('text')
decrypted = x27cn.decrypt_hex(hex_encrypted)

# Base64 格式
b64_encrypted = x27cn.encrypt_base64('text')
decrypted = x27cn.decrypt_base64(b64_encrypted)
```

### 文件混淆

```python
# 混淆整个文件
x27cn.obfuscate_file(input_path, output_path=None, key='x27cn2026')

# 混淆 HTML 字符串
x27cn.obfuscate_html(html_content, key='x27cn2026')

# 混淆 JS 字符串
x27cn.obfuscate_js(js_content, key='x27cn2026')

# 混淆 CSS 字符串
x27cn.obfuscate_css(css_content, key='x27cn2026')
```

### 密钥管理

```python
# 使用默认密钥
x27cn.encrypt('data')  # 使用 'x27cn2026'

# 自定义密钥
x27cn.encrypt('data', key='myKey')

# 生成随机密钥
random_key = x27cn.generate_key(16)  # 16 字符随机密钥
```

## 算法说明

X27CN v2 使用以下加密步骤:

1. **密钥扩展** - 将密钥扩展为 256 字节
2. **S-Box 替换** - 非线性字节替换
3. **位旋转** - 循环左移 5 位
4. **状态混合** - 使用累积状态值混淆

## 代码压缩混淆（v1.2.0 新增）

除了加密型混淆，X27CN 还提供专业的代码压缩和标识符混淆功能。

### Python API

```python
import x27cn

# 压缩 CSS
minified_css = x27cn.minify_css('body { color: red; }')
# 输出: 'body{color:red}'

# 压缩 JavaScript（带变量名混淆）
minified_js = x27cn.minify_js('function hello() { var name = "world"; return name; }')
# 输出: 'function hello(){var _a="world";return _a}'

# 压缩 HTML（自动处理内联 CSS/JS）
minified_html = x27cn.minify_html('<html>  <body>  </body>  </html>')
# 输出: '<html><body></body></html>'

# 使用 Node.js 工具（效果更好，需安装 terser/clean-css）
minified = x27cn.minify_js_node(js_code)

# 压缩文件
x27cn.minify_file('app.js')  # 生成 app.min.js
x27cn.minify_file('style.css', 'dist/style.css')
```

### 高级混淆

```python
import x27cn

# 标识符混淆（变量名替换为 _$0, _$1, ...）
obfuscated = x27cn.obfuscate_identifiers(js_code)

# 添加死代码（增加逆向难度）
obfuscated = x27cn.add_dead_code(js_code, complexity=3)
```

### 命令行

```bash
# 压缩 JavaScript
x27cn minify app.js

# 压缩 CSS
x27cn minify style.css dist/style.min.css

# 不混淆变量名
x27cn minify app.js --no-mangle

# 不使用 Node.js 工具（纯 Python）
x27cn minify app.js --no-node

# 添加死代码
x27cn minify app.js --dead-code=3

# 额外标识符混淆
x27cn minify app.js --identifiers
```

### Node.js 工具支持

如果安装了以下 npm 包，X27CN 会自动使用它们以获得更好的压缩效果：

```bash
npm install -g terser clean-css-cli html-minifier-terser
```

如果未安装，会自动降级到纯 Python 实现。

### 压缩 vs 加密混淆对比

| 特性 | `minify` | `obfuscate` |
|------|----------|-------------|
| 可读性 | 低 | 极低 |
| 代码可执行 | 直接执行 | 需解密 |
| 密钥需求 | 不需要 | 需要 |
| 文件大小 | 显著减小 | 略增大 |
| 安全性 | 中等 | 较高 |
| 性能影响 | 无 | 有解密开销 |

**推荐使用场景：**
- `minify`: 生产环境部署、减小文件体积、基础代码保护
- `obfuscate`: 需要更强保护的敏感代码、API密钥保护

## 密码安全（v1.3.0 新增）

X27CN 现在提供安全的密码处理功能，适合用户认证场景。

### 密码哈希（存储密码）

```python
import x27cn

# 哈希密码（用于存储）
hashed = x27cn.hash_password('mypassword123')
# 输出: '$x27cn$100000$base64salt$base64hash'

# 验证密码
if x27cn.verify_password('mypassword123', hashed):
    print('登录成功')
else:
    print('密码错误')
```

### 密码强度检测

```python
result = x27cn.check_password_strength('abc123')
print(result['level'])  # 'weak'
print(result['score'])  # 15
print(result['suggestions'])  # ['添加大写字母', '添加特殊字符']
```

### 生成安全密码

```python
# 生成 16 位随机密码
pwd = x27cn.generate_password(16)

# 自定义选项
pwd = x27cn.generate_password(
    length=20,
    include_upper=True,
    include_lower=True,
    include_digits=True,
    include_special=True,
    exclude_ambiguous=True  # 排除 0O1lI 等易混淆字符
)
```

### 基于密码的加密

```python
# 使用密码加密数据（比 key 更安全）
encrypted = x27cn.encrypt_with_password('敏感数据', 'mypassword')
# 输出: <p7d0><xx><xx>...<xxxx><xxxx>... （标准 <xxxx> 格式）

# 解密
decrypted = x27cn.decrypt_with_password(encrypted, 'mypassword')
```

格式说明：
- `<p7d0>` - 魔数标识（表示密码加密）
- 后续 16 个 `<xx>` - 随机盐值
- 剩余部分 - 加密数据

### 快速哈希

```python
# MD5（不推荐用于密码，仅用于校验）
x27cn.md5('hello')  # '5d41402abc4b2a76b9719d911017c592'

# SHA256
x27cn.sha256('hello')  # '2cf24dba5fb0a30e...'

# SHA512
x27cn.sha512('hello')
```

### 命令行

```bash
# 哈希密码
x27cn password hash "mypassword123"

# 验证密码
x27cn password verify "mypassword123" "$x27cn$100000$..."

# 生成密码
x27cn password generate --length=20 --count=5

# 检查密码强度
x27cn password check "abc123"

# 使用密码加密文件
x27cn encrypt secret.txt --password="mypassword"

# 使用密码解密
x27cn decrypt secret.txt.enc --password="mypassword"
```

## 反爬虫保护（v1.4.0 新增）

X27CN 现在提供一键式代码保护，包含反调试、反爬虫、域名锁定等功能。

### 一键保护（推荐）

```python
import x27cn

# 一键完整保护（混淆 + 反爬）
protected = x27cn.full_obfuscate(js_code, level=2)

# 保护级别：
# level=1: 基础 - 压缩 + 变量重命名
# level=2: 中等 - 基础 + 字符串加密 + 死代码
# level=3: 高级 - 中等 + 反调试 + 禁用快捷键

# 快速保护（一行代码）
protected = x27cn.quick_protect(js_code)

# 保护文件
x27cn.obfuscate_file_full('app.js', level=3, anti_crawl=True)
```

### 反调试保护

```python
import x27cn

# 生成反调试代码（无限 debugger + 时间检测 + 控制台检测）
anti_debug = x27cn.generate_anti_debug()

# 生成禁用快捷键代码（F12, Ctrl+Shift+I, 右键等）
disable_shortcuts = x27cn.generate_disable_shortcuts()

# 控制台清除和警告
console_clear = x27cn.generate_console_clear()

# 组合完整保护
protection = x27cn.generate_full_protection(
    anti_debug=True,
    disable_shortcuts=True,
    console_clear=True
)

# 注入保护到代码
protected_code = x27cn.inject_protection(js_code, anti_debug=True)
```

### 域名锁定

```python
# 限制代码只能在指定域名运行
domain_lock = x27cn.generate_domain_lock(['example.com', 'test.com'])

# 或使用 full_obfuscate
protected = x27cn.full_obfuscate(js_code, domain_lock=['example.com'])
```

### 时间限制（许可证过期）

```python
# 代码在指定日期后失效
time_bomb = x27cn.generate_time_bomb('2025-12-31')
```

### 命令行

```bash
# 一键保护（推荐）
x27cn protect app.js

# 指定保护级别
x27cn protect app.js --level=3

# 域名锁定
x27cn protect app.js --domain=example.com --domain=test.com

# 设置过期日期
x27cn protect app.js --expire=2025-12-31

# 不添加反爬
x27cn protect app.js --no-anti-crawl

# 仅生成反调试代码
x27cn anti-debug

# 生成带禁用快捷键的反调试代码
x27cn anti-debug --disable-shortcuts --console-clear
```

### 保护效果

**原始代码:**
```javascript
function getSecret() {
    return "API_KEY_12345";
}
```

**level=3 保护后:**
```javascript
(function(){var ꓳIOⲟꓳаⲣ=function(){var ꓵⲛꓳⲣео=new Date().getTime();debugger;...})();
var ⲙꓺαⲃꓲꓷlꓻ=[120,50,...];var ⲉOеꓷⲓꓵ=[[65,83,...]];
var ⲧIꓶоꓺlⲅ=function(){return ⲅаⲅꓲοꓵⲕ(0)};...
```

### 迷惑性字符集

v1.4.1 使用高度迷惑性字符进行混淆：

| 字符类型 | 示例 | 说明 |
|---------|------|------|
| 拉丁迷惑 | `l`, `I`, `O` | 小写L/大写i/大写O 难以区分 |
| 希腊字母 | `α`, `ο` | 像 a, o 但 Unicode 不同 |
| 西里尔字母 | `а`, `е`, `о` | 外观与拉丁相同但编码不同 |
| 科普特(埃及) | `ⲁ`, `ⲃ`, `ⲅ`, `ⲇ`... | 古埃及科普特字母 |
| Lisu 字母 | `ꓲ`, `ꓳ`, `ꓴ`, `ꓵ`... | 缅甸傈僳族文字 |

混淆效果：
- 变量名：`ⲉOеꓷⲓꓵ`, `ⲙꓺαⲃꓲꓷlꓻ`
- 函数名：`ꓳIOⲟꓳаⲣ`, `ⲅаⲅꓲοꓵⲕ`
- 极难阅读和复制

反调试特性：
- 无限 debugger 断点
- 检测 DevTools 打开
- 时间检测（调试暂停时触发）
- 禁用 F12 / Ctrl+Shift+I / 右键
- 控制台定期清除

## 安全说明

X27CN 提供两种安全级别：

### 1. 代码混淆（encrypt/obfuscate）
设计用于**代码混淆**，不是密码学安全的加密算法。

适用场景:
- 前端代码混淆保护
- API 响应混淆
- 配置文件保护
- 防止代码被轻易复制

### 2. 密码安全（hash_password/encrypt_with_password）
使用行业标准的 **PBKDF2-SHA256** 算法。

适用场景:
- 用户密码存储 ✓
- 敏感数据加密 ✓
- 配置文件加密 ✓

安全特性:
- PBKDF2-SHA256 密钥派生（100000 次迭代）
- 随机盐值防止彩虹表攻击
- 恒定时间比较防止时序攻击

### 不适用场景
- 通信加密（请使用 TLS）
- 金融级加密（请使用 AES-256-GCM）

## 完整 API 参考

| 函数 | 说明 |
|------|------|
| `encrypt(text, key)` | X27CN 加密 |
| `decrypt(text, key)` | X27CN 解密 |
| `obfuscate_file(path)` | 文件混淆加密 |
| `minify(content)` | 代码压缩 |
| `minify_js(js)` | JS 压缩 + 变量混淆 |
| `hash_password(pwd)` | 密码哈希 |
| `verify_password(pwd, hash)` | 验证密码 |
| `generate_password(len)` | 生成随机密码 |
| `check_password_strength(pwd)` | 检测密码强度 |
| `encrypt_with_password(data, pwd)` | 密码加密数据 |
| `decrypt_with_password(data, pwd)` | 密码解密数据 |
| `md5(text)` / `sha256(text)` | 快速哈希 |
| `full_obfuscate(code, level)` | 一键完整混淆 |
| `quick_protect(code)` | 快速保护代码 |
| `obfuscate_file_full(path, level)` | 一键保护文件 |
| `generate_anti_debug()` | 生成反调试代码 |
| `generate_disable_shortcuts()` | 生成禁用快捷键代码 |
| `generate_domain_lock(domains)` | 生成域名锁定代码 |
| `generate_time_bomb(date)` | 生成时间限制代码 |
| `inject_protection(code, ...)` | 注入保护到代码 |

## License

MIT

