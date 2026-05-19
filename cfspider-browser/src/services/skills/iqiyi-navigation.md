# 爱奇艺导航技能

## 基本信息
- **ID**: `iqiyi-navigation`
- **名称**: 爱奇艺导航
- **描述**: 在爱奇艺网站上导航和搜索视频
- **触发词**: 搜索视频, 找电影, 看剧, 播放
- **适用域名**: iqiyi.com

## 操作步骤

### 步骤 1: 定位搜索框
- **动作**: scan
- **目标**: `input[class*="search"], .search-input`

### 步骤 2: 输入搜索关键词
- **动作**: input
- **目标**: `.search-input, input[placeholder*="搜索"]`
- **值**: `{query}`

### 步骤 3: 点击搜索按钮
- **动作**: click
- **目标**: `.search-btn, button[class*="search"]`
- **备选方案**: 按回车键

### 步骤 4: 等待结果
- **动作**: wait
- **值**: 2000
- **成功标志**: URL 包含 `/search/`

## 学习模式

### 页面特征
- 爱奇艺使用大量动态类名
- 搜索框通常在页面顶部
- 视频结果使用卡片布局

### 常见元素
- 搜索框: `.search-input`, `input[placeholder*="搜"]`
- 搜索按钮: `.search-btn`
- 视频卡片: `.site-piclist_pic`, `.qy-mod-link`
- 播放按钮: `.play-btn`

### 注意事项
- 页面加载可能较慢，需要足够的等待时间
- 广告弹窗可能出现，需要识别并关闭

## 成功率
- 初始成功率: 80%
