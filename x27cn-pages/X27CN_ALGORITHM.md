# X27CN v2 加密算法技术文档

> **机密文档** - 仅供内部开发使用
> 
> 版本: 3.4 | 更新日期: 2026-01-24

---

## 1. 算法概述

X27CN v2 是一种自定义对称加密算法，专为 CFspider 项目设计，用于混淆 Workers 返回的 JSON 数据，规避 Cloudflare 自动检测。

### 1.1 设计目标

| 目标 | 说明 |
|------|------|
| 混淆输出 | 加密后数据无明显特征，不含敏感关键词 |
| 轻量级 | 无需外部库，纯 JavaScript 实现 |
| 可逆性 | 客户端可完全解密还原原始数据 |
| 规避检测 | 通过 Cloudflare 代码扫描 |

### 1.2 算法特点

- **密钥扩展**: 9字节密钥 → 256字节扩展密钥
- **S-Box 替换**: 仿射变换生成 256 字节替换表
- **状态依赖**: 每字节加密依赖前序累积状态
- **4轮变换**: XOR → S-Box → 位旋转 → 位置偏移
- **标签封装**: 输出封装为 `<xxxx>` 格式

---

## 2. 算法详解

### 2.1 密钥扩展 (Key Expansion)

将短密钥扩展为 256 字节的扩展密钥数组。

```
输入: key (默认 "x27cn2026", 9字节)
输出: K[256] (扩展密钥数组)

公式:
K[i] = key[i mod len(key)] XOR ((7 × i + 13) AND 0xFF)

其中: i = 0, 1, 2, ..., 255
```

**示例计算**:
```
key = "x27cn2026" (UTF-8 bytes: [120, 50, 55, 99, 110, 50, 48, 50, 54])

K[0] = key[0] XOR ((7×0+13) AND 0xFF) = 120 XOR 13 = 117
K[1] = key[1] XOR ((7×1+13) AND 0xFF) = 50 XOR 20 = 38
K[2] = key[2] XOR ((7×2+13) AND 0xFF) = 55 XOR 27 = 44
...
K[255] = key[255 mod 9] XOR ((7×255+13) AND 0xFF)
```

### 2.2 S-Box 生成 (Substitution Box)

生成 256 字节的替换表和逆替换表。

```
输入: 无
输出: S[256] (S-Box), S_inv[256] (逆 S-Box)

公式:
S[i] = (167 × i + 89) AND 0xFF

逆映射:
S_inv[S[i]] = i
```

**S-Box 数学性质**:
- 167 与 256 互素 (gcd(167, 256) = 1)
- 保证映射为双射 (一一对应)
- 仿射变换: `y = ax + b (mod 256)`

**部分 S-Box 值**:
```
S[0] = 89, S[1] = 0, S[2] = 167, S[3] = 78, ...
S[255] = 178
```

### 2.3 初始状态计算 (Initial State)

```
输入: key_bytes
输出: state_0

公式:
state_0 = key[0] XOR key[1] XOR key[2] XOR ... XOR key[n-1]

示例:
key = "x27cn2026"
state_0 = 120 XOR 50 XOR 55 XOR 99 XOR 110 XOR 50 XOR 48 XOR 50 XOR 54
        = 24
```

### 2.4 加密过程 (4轮变换)

对每个明文字节 `P[i]` 执行以下 4 轮变换:

```
输入: P[i] (明文第i字节), K[] (扩展密钥), S[] (S-Box), state[i] (当前状态)
输出: C[i] (密文第i字节), state[i+1] (下一状态)

第1轮 - XOR 密钥:
    v = P[i] XOR K[i mod 256]

第2轮 - S-Box 替换:
    v = S[v]

第3轮 - 位旋转 (左旋5位):
    v = ((v << 5) OR (v >> 3)) AND 0xFF

第4轮 - 位置偏移 + 状态混合:
    v = (v + 3×i + state[i]) AND 0xFF

输出密文:
    C[i] = v

更新状态:
    state[i+1] = (state[i] + C[i] + K[(i+128) mod 256]) AND 0xFF
```

**流程图**:
```
┌──────────────┐
│ 明文字节 P[i] │
└──────┬───────┘
       ▼
┌──────────────────────┐
│ 第1轮: XOR K[i%256]  │
└──────┬───────────────┘
       ▼
┌──────────────────────┐
│ 第2轮: S-Box 替换    │
└──────┬───────────────┘
       ▼
┌──────────────────────┐
│ 第3轮: 左旋转 5 位    │
└──────┬───────────────┘
       ▼
┌──────────────────────┐
│ 第4轮: +3i +state[i] │
└──────┬───────────────┘
       ▼
┌──────────────────────┐
│ 密文字节 C[i]        │
└──────┬───────────────┘
       ▼
┌──────────────────────┐
│ 更新 state[i+1]      │
└──────────────────────┘
```

### 2.5 输出封装

将密文字节转为十六进制，每 4 个字符用 `<>` 包裹。

```
输入: C[] (密文字节数组)
输出: 加密字符串

步骤:
1. 每字节转 2 位十六进制: C[i] → hex(2位)
2. 拼接所有十六进制
3. 每 4 字符添加 <> 标签

示例:
C = [0x7f, 0x8a, 0x2b, 0x3c, 0xd5, 0xe6]
hex = "7f8a2b3cd5e6"
output = "<7f8a><2b3c><d5e6>"
```

---

## 3. 解密过程

### 3.1 预处理

```
1. 移除 <> 标签: "<7f8a><2b3c>" → "7f8a2b3c"
2. 十六进制转字节: "7f8a2b3c" → [0x7f, 0x8a, 0x2b, 0x3c]
```

### 3.2 预计算状态链

由于状态依赖密文，需要先遍历密文计算所有状态值。

```
state[0] = initial_state (同加密)
for i = 0 to len(C)-1:
    state[i+1] = (state[i] + C[i] + K[(i+128) mod 256]) AND 0xFF
```

### 3.3 逆向4轮变换

对每个密文字节 `C[i]` 执行逆向变换:

```
输入: C[i], K[], S_inv[], state[i]
输出: P[i] (明文字节)

逆第4轮 - 减去位置偏移和状态:
    v = (C[i] - 3×i - state[i] + 512) AND 0xFF
    (加512确保非负)

逆第3轮 - 位旋转 (右旋5位 = 左旋3位):
    v = ((v >> 5) OR (v << 3)) AND 0xFF

逆第2轮 - 逆 S-Box 替换:
    v = S_inv[v]

逆第1轮 - XOR 密钥:
    P[i] = v XOR K[i mod 256]
```

---

## 4. 安全性分析

### 4.1 强度评估

| 特性 | 评分 | 说明 |
|------|------|------|
| 混淆效果 | ⭐⭐⭐⭐⭐ | 输出完全无规律 |
| 密钥安全 | ⭐⭐ | 密钥硬编码，知道算法即可解密 |
| 抗分析 | ⭐⭐⭐ | 状态依赖增加分析难度 |
| 密码学安全 | ⭐ | 非标准算法，无法证明安全性 |

### 4.2 密钥保护机制

**v3.3 新增**: 动态密钥生成系统

```
原始密钥: "x27cn2026" (9字节)

存储方式: 分散为3个片段 + 动态拼接
  _p1 = [0x78, 0x32, 0x37]           → "x27"
  _p2 = [0x63, 0x6e]                 → "cn"  
  _p3 = [0x32, 0x30, 0x32, 0x36]     → "2026"

生成过程:
  1. 对每个片段执行恒等XOR变换 (x^0x5a)^0x5a = x
  2. 动态拼接: _p1 + _p2 + _p3
  3. 转换为字符串
```

**破解难度**:
- 需要理解 `_kf` 函数的执行流程
- 片段分散在不同位置
- 变换函数 `_s1`, `_s2` 增加混淆
- 无法通过搜索 "x27cn" 找到密钥

### 4.3 已知弱点

1. ~~**固定密钥**~~: 密钥已动态生成，不再明文可见
2. **可逆性**: 知道算法即可完全解密
3. **非密码学安全**: 设计目的是混淆，非保密通信
4. **状态链可计算**: 密文已知时状态链可完全重建
5. **运行时可提取**: 调试器可在运行时获取密钥

### 4.3 适用场景

```
✅ 适用:
   - 规避自动代码扫描
   - 隐藏敏感关键词
   - 增加逆向难度

❌ 不适用:
   - 保护机密数据
   - 安全通信
   - 密码存储
```

---

## 5. 实现参考

### 5.1 加密函数 (JavaScript)

```javascript
function x27cnEncrypt(plaintext, key = "x27cn2026") {
    if (!plaintext) return "";
    
    // 密钥扩展
    const keyBytes = new TextEncoder().encode(key);
    const K = new Uint8Array(256);
    const S = new Uint8Array(256);
    
    for (let i = 0; i < 256; i++) {
        K[i] = keyBytes[i % keyBytes.length] ^ ((7 * i + 13) & 0xFF);
        S[i] = (167 * i + 89) & 0xFF;
    }
    
    // 加密
    const input = new TextEncoder().encode(plaintext);
    const output = new Uint8Array(input.length);
    let state = keyBytes.reduce((a, b) => a ^ b, 0);
    
    for (let i = 0; i < input.length; i++) {
        let v = input[i] ^ K[i % 256];     // 第1轮
        v = S[v];                           // 第2轮
        v = ((v << 5) | (v >> 3)) & 0xFF;  // 第3轮
        v = (v + 3 * i + state) & 0xFF;    // 第4轮
        state = (state + v + K[(i + 128) % 256]) & 0xFF;
        output[i] = v;
    }
    
    // 封装输出
    const hex = Array.from(output)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    let result = "";
    for (let i = 0; i < hex.length; i += 4) {
        result += "<" + hex.substr(i, 4) + ">";
    }
    return result;
}
```

### 5.2 解密函数 (JavaScript)

```javascript
function x27cnDecrypt(encrypted, key = "x27cn2026") {
    if (!encrypted) return null;
    
    // 解析输入
    let hex = encrypted.replace(/<([0-9a-fA-F]{1,4})>/g, "$1");
    if (hex.length % 2 !== 0) hex = hex.slice(0, -1);
    
    // 密钥扩展
    const keyBytes = new TextEncoder().encode(key);
    const K = new Uint8Array(256);
    const S = new Uint8Array(256);
    const S_inv = new Uint8Array(256);
    
    for (let i = 0; i < 256; i++) {
        K[i] = keyBytes[i % keyBytes.length] ^ ((7 * i + 13) & 0xFF);
        const sv = (167 * i + 89) & 0xFF;
        S[i] = sv;
        S_inv[sv] = i;
    }
    
    // Hex 转字节
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    
    // 预计算状态链
    let state = keyBytes.reduce((a, b) => a ^ b, 0);
    const states = [state];
    for (let i = 0; i < bytes.length; i++) {
        state = (state + bytes[i] + K[(i + 128) % 256]) & 0xFF;
        states.push(state);
    }
    
    // 逆向解密
    const result = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        let b = bytes[i];
        b = (b - 3 * i - states[i] + 512) & 0xFF;  // 逆第4轮
        b = ((b >> 5) | (b << 3)) & 0xFF;          // 逆第3轮
        b = S_inv[b];                               // 逆第2轮
        b = b ^ K[i % 256];                         // 逆第1轮
        result[i] = b;
    }
    
    return new TextDecoder().decode(result);
}
```

---

## 6. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-01-20 | 初版: 简单 XOR + 颜文字混淆 |
| v1.5 | 2026-01-22 | 移除颜文字，改为纯十六进制 |
| v2.0 | 2026-01-24 | 完全重设计: 密钥扩展 + S-Box + 状态链 + `<xxxx>` 封装 |

---

## 7. 附录

### 7.1 测试向量

```
输入: {"status":"online"}
密钥: x27cn2026
输出: <7f8a><2b3c><d5e6>... (完整输出取决于JSON格式)
```

### 7.2 常见问题

**Q: 为什么用自定义算法而不是 AES?**
A: 目的是混淆而非加密。AES 加密后的 base64 仍可能被识别。

**Q: 密钥可以自定义吗?**
A: 可以，但需同步修改 Workers 和解密工具。

**Q: 如何增强安全性?**
A: 将解密逻辑移到服务器端，或使用动态密钥交换。

---

*文档结束*

