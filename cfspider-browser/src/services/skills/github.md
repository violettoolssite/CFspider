# GitHub 技能

## 基本信息
- **ID**: `github`
- **名称**: GitHub操作
- **描述**: 在GitHub上搜索项目、浏览代码、查看仓库等
- **触发词**: github, git, 代码, 仓库, 项目, repository, 开源
- **适用域名**: github.com, www.github.com

## 弹窗处理

### 识别弹窗
GitHub常见弹窗：
- Cookie 同意弹窗: `.js-cookie-consent`, `[data-view-component="cookie"]`
- 登录提示: `.flash`, `.js-flash-container`
- 操作确认对话框: `.Box-overlay`, `[role="dialog"]`

### 关闭弹窗
- **动作**: click
- **目标**: `.js-cookie-consent-accept, button[data-action="click:analytics-event#accept"]`
- **备选方案**:
  - `.close-button`
  - `[aria-label="Close"]`
  - `.Box-overlay-close`

## 操作步骤

### 搜索项目

#### 步骤 1: 定位搜索框
- **动作**: scan
- **说明**: 扫描页面找到搜索框

#### 步骤 2: 点击搜索框
- **动作**: click
- **目标**: `.header-search-button, .header-search-input, [data-target="qbsearch-input.inputButton"]`
- **说明**: GitHub搜索框需要先点击激活

#### 步骤 3: 输入搜索关键词
- **动作**: input
- **目标**: `#query-builder-test, input[name="query"], .search-input`
- **值**: `{query}`
- **备选方案**:
  - `input[type="search"]`
  - `.header-search-input input`

#### 步骤 4: 提交搜索
- **动作**: click
- **目标**: 按回车键
- **说明**: GitHub搜索主要通过回车提交

#### 步骤 5: 等待结果加载
- **动作**: wait
- **值**: 2000
- **成功标志**: URL包含 `github.com/search`

### 浏览仓库

#### 步骤 1: 点击仓库链接
- **动作**: click
- **目标**: `.search-title a, .repo-list-item a, .v-align-middle`
- **备选方案**:
  - `.text-bold a`
  - `[data-hovercard-type="repository"]`

#### 步骤 2: 等待仓库页面加载
- **动作**: wait
- **值**: 1500
- **成功标志**: 存在 `.repository-content` 或 `#readme`

### 查看代码文件

#### 步骤 1: 点击文件
- **动作**: click
- **目标**: `.js-navigation-open, .Link--primary, .react-directory-row`
- **备选方案**:
  - `.content a`
  - `[role="rowheader"] a`

#### 步骤 2: 等待代码加载
- **动作**: wait
- **值**: 1000
- **成功标志**: 存在 `.blob-code` 或 `.highlight`

### 查看 README

#### 步骤 1: 滚动到 README
- **动作**: scroll
- **目标**: `#readme, .markdown-body`

### Star 仓库

#### 步骤 1: 点击 Star 按钮
- **动作**: click
- **目标**: `.starring-container button, [data-ga-click*="Star"]`
- **注意**: 需要登录

## 学习模式

### 已知模式
- GitHub 首页: `github.com`
- 搜索结果: `github.com/search?q=...`
- 仓库页面: `github.com/{owner}/{repo}`
- 代码页面: `github.com/{owner}/{repo}/blob/...`
- README 通常在页面底部的 `#readme` 锚点

### 常见问题
- **搜索框需要激活**: 需要先点击搜索按钮
- **登录限制**: Star、Fork、Issue 等功能需要登录
- **Rate Limit**: API 请求有频率限制
- **大文件加载慢**: 大型仓库或文件可能需要较长加载时间

### URL 模式
- 仓库首页: `github.com/{owner}/{repo}`
- 代码浏览: `github.com/{owner}/{repo}/tree/{branch}`
- 文件查看: `github.com/{owner}/{repo}/blob/{branch}/{path}`
- Issues: `github.com/{owner}/{repo}/issues`
- Pull Requests: `github.com/{owner}/{repo}/pulls`

### 弹窗关闭选择器（优先级排序）
1. `.js-cookie-consent-accept` - Cookie 同意
2. `[aria-label="Close"]` - 通用关闭
3. `.Box-overlay-close` - 覆盖层关闭
4. `.close-button` - 按钮关闭
5. `.flash .close` - Flash 消息关闭

## 成功率
- 搜索成功率: 95%
- 仓库浏览成功率: 98%
- 代码查看成功率: 95%
- 弹窗关闭成功率: 90%
