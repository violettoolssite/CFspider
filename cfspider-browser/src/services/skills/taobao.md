# 淘宝技能

## 基本信息
- **ID**: `taobao`
- **名称**: 淘宝操作
- **描述**: 在淘宝网站上搜索商品、浏览、处理登录弹窗等
- **触发词**: 淘宝, taobao, 淘宝搜索, 淘宝商品, 淘宝购物
- **适用域名**: taobao.com, www.taobao.com, s.taobao.com, login.taobao.com

## 登录弹窗处理

### 识别登录弹窗
淘宝的登录弹窗特征：
- 选择器: `.login-box`, `#J_LoginBox`, `.fm-login`, `.login-panel`
- 包含文本: "密码登录", "短信登录", "扫码登录更安全"
- 固定定位遮罩层

### 关闭登录弹窗
- **动作**: click
- **目标**: `.login-box .close`, `.fm-btn-close`, `.icon-close`, `[class*="close"]`
- **备选方案**:
  - 点击遮罩层外部区域
  - 按 ESC 键
  - `.login-overlay .close`

### 自动处理策略
1. 检测到登录弹窗时，优先尝试关闭
2. 如果无法关闭，提示用户选择登录方式
3. 记住关闭按钮的选择器供下次使用

## 操作步骤

### 搜索商品

#### 步骤 1: 定位搜索框
- **动作**: scan
- **说明**: 扫描页面找到搜索框

#### 步骤 2: 输入搜索关键词
- **动作**: input
- **目标**: `#q, input[name="q"], .search-input input`
- **值**: `{query}`
- **备选方案**:
  - `.tb-searchbar input`
  - `input[type="search"]`
  - `.search-combobox-input`

#### 步骤 3: 点击搜索按钮
- **动作**: click
- **目标**: `.btn-search, button[type="submit"], .search-btn`
- **备选方案**:
  - 按回车键
  - `.searchbar-button`
- **可选**: true

#### 步骤 4: 等待结果加载
- **动作**: wait
- **值**: 2000
- **成功标志**: URL包含 `s.taobao.com/search`

### 点击商品

#### 步骤 1: 找到商品链接
- **动作**: scan
- **说明**: 扫描搜索结果页面

#### 步骤 2: 点击商品
- **动作**: click
- **目标**: `.item .title a, .Card--doubleCard a, .Content--title`
- **备选方案**:
  - `.m-itemlist .item a`
  - `[data-item] a`
  - `.list-item a`

## 学习模式

### 已知模式
- 淘宝搜索框 ID 为 `q`
- 搜索结果在 `s.taobao.com`
- 商品详情在 `detail.tmall.com` 或 `item.taobao.com`
- 经常会弹出登录框遮挡页面

### 常见问题
- **登录弹窗遮挡**: 需要先关闭登录弹窗或登录后才能继续操作
- **验证码**: 可能需要滑块验证
- **页面加载慢**: 淘宝页面较重，等待时间需要 2-3 秒

### 登录弹窗关闭选择器（优先级排序）
1. `.fm-btn-close` - 表单关闭按钮
2. `.login-box .close` - 登录框关闭
3. `.icon-close` - 图标关闭
4. `.J_CloseLogin` - JS 关闭钩子
5. `[aria-label="关闭"]` - 无障碍关闭

## 成功率
- 初始成功率: 70%
- 登录弹窗关闭成功率: 60%
