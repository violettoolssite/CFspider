# Bilibili 技能

## 基本信息
- **ID**: `bilibili`
- **名称**: B站操作
- **描述**: 在Bilibili上搜索视频、观看视频、处理弹窗等
- **触发词**: bilibili, b站, 哔哩哔哩, B站, 看视频bilibili
- **适用域名**: bilibili.com, www.bilibili.com, search.bilibili.com

## 弹窗处理

### 识别弹窗
B站常见弹窗：
- 登录提示弹窗: `.login-tip`, `.bili-mini-mask`
- APP下载弹窗: `.open-app-dialog`, `.download-app`
- 活动弹窗: `.activity-popup`, `.bili-popup`

### 关闭弹窗
- **动作**: click
- **目标**: `.close-btn, .bili-mini-close, .close-icon, [class*="close"]`
- **备选方案**:
  - `.bili-popup .close`
  - `.mask-close`
  - `button:contains("关闭")`
  - 按 ESC 键

## 操作步骤

### 搜索视频

#### 步骤 1: 定位搜索框
- **动作**: scan
- **说明**: 扫描页面找到搜索框

#### 步骤 2: 输入搜索关键词
- **动作**: input
- **目标**: `.nav-search-input, input.search-input, #nav-searchform input`
- **值**: `{query}`
- **备选方案**:
  - `input[type="search"]`
  - `.search-input-el`

#### 步骤 3: 点击搜索按钮
- **动作**: click
- **目标**: `.nav-search-btn, .search-btn, button[type="submit"]`
- **备选方案**:
  - 按回车键
  - `.search-button`
- **可选**: true

#### 步骤 4: 等待结果加载
- **动作**: wait
- **值**: 1500
- **成功标志**: URL包含 `search.bilibili.com`

### 播放视频

#### 步骤 1: 找到视频
- **动作**: scan
- **说明**: 扫描视频列表

#### 步骤 2: 点击视频
- **动作**: click
- **目标**: `.video-card, .bili-video-card, .video-list-item a`
- **备选方案**:
  - `.video-item a`
  - `.video-name`

#### 步骤 3: 等待播放器加载
- **动作**: wait
- **值**: 2000
- **成功标志**: 存在 `.bilibili-player-video` 或 `video` 元素

### 视频操作

#### 暂停/播放
- **动作**: click
- **目标**: `.bilibili-player-video-btn-start, video`

#### 全屏
- **动作**: click
- **目标**: `.bilibili-player-video-btn-fullscreen, [data-text="全屏"]`

#### 音量控制
- **动作**: click
- **目标**: `.bilibili-player-video-btn-volume`

## 学习模式

### 已知模式
- B站搜索框在顶部导航栏
- 搜索结果页面 URL: `search.bilibili.com`
- 视频页面 URL: `bilibili.com/video/BV...`
- 播放器类名: `bilibili-player`

### 常见问题
- **登录提示**: 某些功能需要登录（如弹幕、收藏）
- **APP下载弹窗**: 移动端经常弹出下载提示
- **视频加载慢**: 等待 2-3 秒确保播放器就绪

### 弹窗关闭选择器（优先级排序）
1. `.bili-mini-close` - 小窗关闭
2. `.close-btn` - 通用关闭
3. `.bili-popup-close` - 弹窗关闭
4. `.mask .close` - 遮罩层关闭
5. `[aria-label="关闭"]` - 无障碍关闭

## 成功率
- 搜索成功率: 95%
- 视频播放成功率: 90%
- 弹窗关闭成功率: 85%
