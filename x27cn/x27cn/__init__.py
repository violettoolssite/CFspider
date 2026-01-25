"""
X27CN - 代码混淆加密库
Code obfuscation and encryption library

使用方法:
    import x27cn
    
    # 加密
    encrypted = x27cn.encrypt('Hello World')
    
    # 解密
    decrypted = x27cn.decrypt(encrypted)
    
    # 自定义密钥
    encrypted = x27cn.encrypt('data', key='mySecretKey')
    decrypted = x27cn.decrypt(encrypted, key='mySecretKey')
    
    # 文件混淆
    x27cn.obfuscate_file('app.html')  # 生成 app.obf.html
    x27cn.obfuscate_file('script.js')  # 生成 script.obf.js
"""

from .core import (
    encrypt,
    decrypt,
    encrypt_hex,
    decrypt_hex,
    encrypt_base64,
    decrypt_base64,
    generate_key,
    DEFAULT_KEY,
)

from .obfuscate import (
    obfuscate_html,
    obfuscate_js,
    obfuscate_css,
    obfuscate_file,
    obfuscate_inline_js,
    obfuscate_inline_css,
)

from .minify import (
    minify,
    minify_file,
    minify_css,
    minify_js,
    minify_html,
    minify_css_node,
    minify_js_node,
    minify_html_node,
    obfuscate_identifiers,
    add_dead_code,
    flatten_control_flow,
    flatten_control_flow_safe,
)

from .password import (
    hash_password,
    verify_password,
    check_password_strength,
    generate_password,
    encrypt_with_password,
    decrypt_with_password,
    quick_hash,
    md5,
    sha256,
    sha512,
)

__version__ = '1.3.0'
__author__ = 'CFspider'
__all__ = [
    # 核心加密
    'encrypt',
    'decrypt',
    'encrypt_hex',
    'decrypt_hex',
    'encrypt_base64',
    'decrypt_base64',
    'generate_key',
    'DEFAULT_KEY',
    # 文件混淆（加密型）
    'obfuscate_html',
    'obfuscate_js',
    'obfuscate_css',
    'obfuscate_file',
    'obfuscate_inline_js',
    'obfuscate_inline_css',
    # 代码压缩混淆
    'minify',
    'minify_file',
    'minify_css',
    'minify_js',
    'minify_html',
    'minify_css_node',
    'minify_js_node',
    'minify_html_node',
    'obfuscate_identifiers',
    'add_dead_code',
    'flatten_control_flow',
    'flatten_control_flow_safe',
    # 密码安全
    'hash_password',
    'verify_password',
    'check_password_strength',
    'generate_password',
    'encrypt_with_password',
    'decrypt_with_password',
    'quick_hash',
    'md5',
    'sha256',
    'sha512',
]

