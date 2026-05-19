# 腾讯视频技能

## 基本信息
- **ID**: `tencent-video`
- **名称**: 腾讯视频操作
- **描述**: 在腾讯视频上搜索视频、观看视频、处理弹窗等
- **触发词**: 腾讯视频, qq视频, 腾讯, tencent video, v.qq.com
- **适用域名**: v.qq.com, film.qq.com, m.v.qq.com

## 弹窗处理

### 识别弹窗
腾讯视频常见弹窗：
- VIP 广告弹窗: `.mod_vip_popup`, `.vip-popup`
- 登录弹窗: `.login_dialog`, `.ptlogin_iframe`
- 活动弹窗: `.activity_popup`, `.mod_popup`
- APP下载弹窗: `.app-download-tip`

### 关闭弹窗
- **动作**: click
- **目标**: `.popup_close, .btn_close, .close-btn, [class*="close"]`
- **备选方案**:
  - `.mod_popup .close`
  - `.dialog_close`
  - `[title="关闭"]`
  - 按 ESC 键

## 操作步骤

### 搜索视频

#### 步骤 1: 定位搜索框
- **动作**: scan
- **说明**: 扫描页面找到搜索框

#### 步骤 2: 输入搜索关键词
- **动作**: input
- **目标**: `#searchInput, .search_input input, input[name="query"]`
- **值**: `{query}`
- **备选方案**:
  - `.search-input`
  - `input[type="search"]`

#### 步骤 3: 点击搜索按钮
- **动作**: click
- **目标**: `.search_btn, .btn_search, button[type="submit"]`
- **备选方案**:
  - 按回车键
  - `.search-button`
- **可选**: true

#### 步骤 4: 等待结果加载
- **动作**: wait
- **值**: 2000
- **成功标志**: URL包含 `v.qq.com/x/search`

### 播放视频

#### 步骤 1: 找到视频
- **动作**: scan
- **说明**: 扫描视频列表

#### 步骤 2: 点击视频
- **动作**: click
- **目标**: `.result_item a, .list_item a, .figure a`
- **备选方案**:
  - `.video_item a`
  - `.card_link`

#### 步骤 3: 等待播放器加载
- **动作**: wait
- **值**: 3000
- **成功标志**: 存在 `.txp_video_container` 或 `video` 元素

### 视频操作

#### 暂停/播放
- **动作**: click
- **目标**: `.txp_btn_play, .txp_video, video`

#### 全屏
- **动作**: click
- **目标**: `.txp_btn_fullscreen, [title="全屏"]`

#### 跳过广告
- **动作**: click
- **目标**: `.txp_ad_skip_btn, .ad_skip, .skip-ad`

## 学习模式

### 已知模式
- 腾讯视频首页: `v.qq.com`
- 搜索结果: `v.qq.com/x/search`
- 视频播放页: `v.qq.com/x/cover/` 或 `v.qq.com/x/page/`
- 播放器类名前缀: `txp_`

### 常见问题
- **VIP广告**: 非会员有 15-120 秒广告
- **登录弹窗**: 某些功能需要登录
- **地区限制**: 部分内容有地区限制
- **视频加载慢**: 广告加载可能需要较长时间

### 弹窗关闭选择器（优先级排序）
1. `.popup_close` - 弹窗关闭
2. `.btn_close` - 按钮关闭
3. `.mod_popup .close` - 模块弹窗关闭
4. `.dialog_close` - 对话框关闭
5. `[title="关闭"]` - 标题关闭

## 成功率
- 搜索成功率: 90%
- 视频播放成功率: 85%
- 弹窗关闭成功率: 80%
- 跳过广告成功率: 70%（需要VIP或等待）
