# 智能登录技能

## 基本信息
- **ID**: `auto-login`
- **名称**: 智能登录
- **描述**: 检测登录需求，智能处理自动登录或手动登录
- **触发词**: 登录, login, 注册, signup
- **适用域名**: * (通用)

## 操作步骤

### 步骤 1: 检测登录需求
- **动作**: verify
- **工具**: detect_login(domain="{domain}")
- **说明**: 检测是否在登录页面或需要登录

### 步骤 2: 询问用户选择
- **动作**: verify
- **工具**: request_login_choice(domain="{domain}", has_saved_credentials={has_saved})
- **说明**: 让用户选择自动登录或手动登录
- **条件**: 如果检测到需要登录

### 步骤 3a: 自动登录
- **动作**: input
- **工具**: auto_login(domain, username_selector, password_selector, submit_selector, save_credentials=true)
- **说明**: 自动填写账号密码并提交
- **备选方案**:
  - 如果没有保存账号，提示用户提供
  - 如果选择器错误，使用 scan_interactive_elements 查找

### 步骤 3b: 手动登录
- **动作**: wait
- **说明**: 等待用户手动登录完成
- **成功标志**: 页面 URL 或标题变化

### 步骤 4: 验证登录成功
- **动作**: verify
- **成功标志**: URL 不再包含 login/signin，或页面标题变化

## 学习模式

### 常见登录表单选择器
- 用户名/邮箱:
  - `input[type="email"]`
  - `input[name*="user"]`
  - `input[name*="email"]`
  - `input[placeholder*="用户"]`
  - `input[placeholder*="邮箱"]`
  
- 密码:
  - `input[type="password"]`
  
- 提交按钮:
  - `button[type="submit"]`
  - `button:contains("登录")`
  - `button:contains("Login")`

### 网站特殊处理

**GitHub**:
- 用户名: `#login_field`
- 密码: `#password`
- 提交: `input[type="submit"]`

**京东/淘宝**:
- 多种登录方式（手机号、扫码）
- 需要验证码

**爱奇艺/腾讯视频**:
- 扫码登录为主
- 账号密码登录需要切换

### 安全说明
- 密码使用简单 XOR 加密存储
- 保存在用户本地（credentials.json）
- 不上传到任何服务器
- 用户可选择不保存

## 成功率
- 初始成功率: 70%
- 自动登录成功后学习选择器，提升到 90%+
