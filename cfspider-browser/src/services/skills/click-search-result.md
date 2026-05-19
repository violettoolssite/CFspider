# 点击搜索结果技能

## 基本信息
- **ID**: `click-search-result`
- **名称**: 点击搜索结果
- **描述**: 在搜索引擎结果页面中点击指定的链接
- **触发词**: 打开, 点击, 进入, 访问
- **适用域名**: bing.com, cn.bing.com, baidu.com, google.com

## 操作步骤

### 步骤 1: 扫描搜索结果
- **动作**: scan
- **说明**: 使用 scan_interactive_elements 扫描所有可点击链接

### 步骤 2: 识别目标链接
- **动作**: verify
- **说明**: 根据关键词匹配正确的搜索结果
- **过滤规则**:
  - 排除 Copilot/AI 相关链接
  - 排除图片搜索结果
  - 排除山寨网站（github-cn.com等）
  - 排除翻页导航（下一页、上一页）
  - 优先选择主域名（github.com > docs.github.com）

### 步骤 3: 精确点击
- **动作**: click
- **目标**: `click_by_index(type="link", index={index})`
- **备选方案**:
  - `visual_click("{target_name}")`
  - `click_text("{target_domain}")`

### 步骤 4: 验证跳转
- **动作**: verify
- **成功标志**: URL 包含目标域名

## 学习模式

### 已知模式
- 必应搜索结果通常在 `.b_algo` 容器中
- 第一个结果往往最准确（如果域名匹配）
- cite 标签显示真实 URL（可用于验证）

### 常见错误
- **误点到 Copilot**: URL 包含 copilot、sydney 的全部排除
- **误点到图片搜索**: URL 包含 /images/ 的排除
- **误点到翻页按钮**: 文本包含"下一页"的排除

### 纠错策略
- 如果误跳转，记录失败链接，下次自动跳过
- 如果 click_text 失败 2 次以上，改用 click_by_index
- 如果都失败，使用 visual_click 视觉定位

## 成功率
- 初始成功率: 85%
