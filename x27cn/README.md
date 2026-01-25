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

## License

MIT

