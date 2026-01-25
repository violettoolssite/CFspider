"""
X27CN 密码加密模块

提供安全的密码哈希和验证功能：
- PBKDF2-SHA256 密码哈希（适合密码存储）
- 密码强度检测
- 基于密码的加密/解密
"""

import os
import re
import hashlib
import hmac
import base64
import secrets
from typing import Tuple, Optional


# ============== 密码哈希 ==============

def hash_password(
    password: str,
    salt: Optional[bytes] = None,
    iterations: int = 100000
) -> str:
    """
    使用 PBKDF2-SHA256 哈希密码
    
    Args:
        password: 明文密码
        salt: 盐值（可选，默认自动生成16字节）
        iterations: 迭代次数（默认100000，越高越安全但越慢）
        
    Returns:
        格式化的哈希字符串: $x27cn$iterations$salt$hash
        
    Example:
        >>> hashed = hash_password('mypassword123')
        >>> print(hashed)
        '$x27cn$100000$abc123...$def456...'
    """
    if salt is None:
        salt = os.urandom(16)
    
    # PBKDF2-SHA256 派生
    dk = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt,
        iterations,
        dklen=32
    )
    
    # 编码为 base64
    salt_b64 = base64.b64encode(salt).decode('ascii')
    hash_b64 = base64.b64encode(dk).decode('ascii')
    
    return f'$x27cn${iterations}${salt_b64}${hash_b64}'


def verify_password(password: str, hashed: str) -> bool:
    """
    验证密码是否匹配哈希
    
    Args:
        password: 待验证的明文密码
        hashed: hash_password 返回的哈希字符串
        
    Returns:
        密码是否正确
        
    Example:
        >>> hashed = hash_password('mypassword123')
        >>> verify_password('mypassword123', hashed)
        True
        >>> verify_password('wrongpassword', hashed)
        False
    """
    try:
        parts = hashed.split('$')
        if len(parts) != 5 or parts[1] != 'x27cn':
            return False
        
        iterations = int(parts[2])
        salt = base64.b64decode(parts[3])
        expected_hash = base64.b64decode(parts[4])
        
        # 重新计算
        dk = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt,
            iterations,
            dklen=32
        )
        
        # 使用恒定时间比较防止时序攻击
        return hmac.compare_digest(dk, expected_hash)
    except Exception:
        return False


# ============== 密码强度 ==============

def check_password_strength(password: str) -> dict:
    """
    检测密码强度
    
    Args:
        password: 待检测的密码
        
    Returns:
        包含强度信息的字典:
        - score: 分数 (0-100)
        - level: 等级 ('weak', 'fair', 'good', 'strong', 'excellent')
        - suggestions: 改进建议列表
        
    Example:
        >>> result = check_password_strength('abc123')
        >>> print(result['level'])
        'weak'
    """
    score = 0
    suggestions = []
    
    length = len(password)
    
    # 长度评分
    if length >= 16:
        score += 30
    elif length >= 12:
        score += 25
    elif length >= 8:
        score += 15
    elif length >= 6:
        score += 10
    else:
        suggestions.append('密码长度至少需要8个字符')
    
    # 复杂性评分
    has_lower = bool(re.search(r'[a-z]', password))
    has_upper = bool(re.search(r'[A-Z]', password))
    has_digit = bool(re.search(r'[0-9]', password))
    has_special = bool(re.search(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~]', password))
    
    complexity = sum([has_lower, has_upper, has_digit, has_special])
    score += complexity * 15
    
    if not has_lower:
        suggestions.append('添加小写字母')
    if not has_upper:
        suggestions.append('添加大写字母')
    if not has_digit:
        suggestions.append('添加数字')
    if not has_special:
        suggestions.append('添加特殊字符 (!@#$%^&* 等)')
    
    # 熵评分（字符多样性）
    unique_chars = len(set(password))
    if unique_chars >= 10:
        score += 10
    elif unique_chars >= 6:
        score += 5
    
    # 常见模式扣分
    common_patterns = [
        r'123', r'abc', r'qwerty', r'password', r'admin',
        r'111', r'000', r'aaa', r'(.)\1{2,}'  # 连续重复字符
    ]
    for pattern in common_patterns:
        if re.search(pattern, password.lower()):
            score -= 10
            if pattern == r'(.)\1{2,}':
                suggestions.append('避免连续重复的字符')
            else:
                suggestions.append('避免使用常见模式')
            break
    
    # 限制分数范围
    score = max(0, min(100, score))
    
    # 确定等级
    if score >= 80:
        level = 'excellent'
    elif score >= 60:
        level = 'strong'
    elif score >= 40:
        level = 'good'
    elif score >= 20:
        level = 'fair'
    else:
        level = 'weak'
    
    return {
        'score': score,
        'level': level,
        'suggestions': suggestions,
        'length': length,
        'has_lower': has_lower,
        'has_upper': has_upper,
        'has_digit': has_digit,
        'has_special': has_special,
    }


# ============== 密码生成 ==============

def generate_password(
    length: int = 16,
    include_upper: bool = True,
    include_lower: bool = True,
    include_digits: bool = True,
    include_special: bool = True,
    exclude_ambiguous: bool = True
) -> str:
    """
    生成安全的随机密码
    
    Args:
        length: 密码长度（默认16）
        include_upper: 包含大写字母
        include_lower: 包含小写字母
        include_digits: 包含数字
        include_special: 包含特殊字符
        exclude_ambiguous: 排除易混淆字符 (0O1lI)
        
    Returns:
        随机密码
        
    Example:
        >>> pwd = generate_password(20)
        >>> print(len(pwd))
        20
    """
    chars = ''
    required = []
    
    lower_chars = 'abcdefghijkmnopqrstuvwxyz' if exclude_ambiguous else 'abcdefghijklmnopqrstuvwxyz'
    upper_chars = 'ABCDEFGHJKMNPQRSTUVWXYZ' if exclude_ambiguous else 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    digit_chars = '23456789' if exclude_ambiguous else '0123456789'
    special_chars = '!@#$%^&*-_=+?'
    
    if include_lower:
        chars += lower_chars
        required.append(secrets.choice(lower_chars))
    if include_upper:
        chars += upper_chars
        required.append(secrets.choice(upper_chars))
    if include_digits:
        chars += digit_chars
        required.append(secrets.choice(digit_chars))
    if include_special:
        chars += special_chars
        required.append(secrets.choice(special_chars))
    
    if not chars:
        raise ValueError('至少需要选择一种字符类型')
    
    # 生成剩余字符
    remaining = length - len(required)
    password_chars = required + [secrets.choice(chars) for _ in range(remaining)]
    
    # 打乱顺序
    secrets.SystemRandom().shuffle(password_chars)
    
    return ''.join(password_chars)


# ============== 基于密码的加密 ==============

def encrypt_with_password(plaintext: str, password: str) -> str:
    """
    使用密码加密数据
    
    使用 PBKDF2 派生加密密钥，然后用 X27CN 算法加密。
    输出格式为 <xxxx> 标准格式，盐值编码在开头。
    
    Args:
        plaintext: 明文数据
        password: 加密密码
        
    Returns:
        加密后的密文（<xxxx> 格式，包含盐值）
        
    Example:
        >>> encrypted = encrypt_with_password('secret data', 'mypassword')
        >>> # 输出: <p7d0><salt16bytes><encrypted...>
        >>> decrypted = decrypt_with_password(encrypted, 'mypassword')
        >>> print(decrypted)
        'secret data'
    """
    from .core import encrypt
    
    # 生成随机盐（16字节）
    salt = os.urandom(16)
    
    # 派生密钥
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt,
        50000,
        dklen=32
    )
    key_str = base64.b64encode(key).decode('ascii')[:32]
    
    # 加密数据
    encrypted = encrypt(plaintext, key_str)
    
    # 将盐值编码为 <xxxx> 格式
    salt_hex = ''.join(f'<{b:02x}>' for b in salt)
    
    # 添加魔数标识 <p7d0> 表示密码加密
    return f'<p7d0>{salt_hex}{encrypted}'


def decrypt_with_password(ciphertext: str, password: str) -> str:
    """
    使用密码解密数据
    
    Args:
        ciphertext: encrypt_with_password 返回的密文（<xxxx> 格式）
        password: 解密密码
        
    Returns:
        解密后的明文
        
    Raises:
        ValueError: 密码错误或数据损坏
        
    Example:
        >>> encrypted = encrypt_with_password('hello', 'pass123')
        >>> decrypt_with_password(encrypted, 'pass123')
        'hello'
    """
    from .core import decrypt
    
    try:
        # 检查魔数
        if not ciphertext.startswith('<p7d0>'):
            raise ValueError('无效的密文格式（缺少密码加密标识）')
        
        # 移除魔数
        data = ciphertext[6:]  # 去掉 <p7d0>
        
        # 提取盐值（16字节 = 16个 <xx> 块 = 64字符）
        salt_part = data[:64]  # 16 * 4 = 64
        encrypted_data = data[64:]
        
        # 解析盐值
        salt_bytes = []
        import re
        salt_matches = re.findall(r'<([0-9a-fA-F]{2})>', salt_part)
        if len(salt_matches) != 16:
            raise ValueError('无效的盐值格式')
        salt = bytes(int(h, 16) for h in salt_matches)
        
        # 派生密钥
        key = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt,
            50000,
            dklen=32
        )
        key_str = base64.b64encode(key).decode('ascii')[:32]
        
        # 解密
        return decrypt(encrypted_data, key_str)
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f'解密失败（密码可能错误）: {e}')


# ============== 快速哈希 ==============

def quick_hash(data: str, algorithm: str = 'sha256') -> str:
    """
    快速计算字符串哈希值
    
    Args:
        data: 要哈希的数据
        algorithm: 算法 ('md5', 'sha1', 'sha256', 'sha512')
        
    Returns:
        十六进制哈希值
        
    Example:
        >>> quick_hash('hello')
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    """
    h = hashlib.new(algorithm)
    h.update(data.encode('utf-8'))
    return h.hexdigest()


def md5(data: str) -> str:
    """计算 MD5 哈希"""
    return quick_hash(data, 'md5')


def sha256(data: str) -> str:
    """计算 SHA256 哈希"""
    return quick_hash(data, 'sha256')


def sha512(data: str) -> str:
    """计算 SHA512 哈希"""
    return quick_hash(data, 'sha512')

