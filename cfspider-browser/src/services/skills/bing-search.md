# 必应搜索技能

## 基本信息
- **ID**: `bing-search`
- **名称**: 必应搜索
- **描述**: 在必应搜索引擎上搜索关键词
- **触发词**: 搜索, 查找, 找一下, search, 查, 百度一下
- **适用域名**: bing.com, cn.bing.com

## 操作步骤

### 步骤 1: 定位搜索框
- **动作**: scan
- **说明**: 扫描页面找到搜索框

### 步骤 2: 输入搜索关键词
- **动作**: input
- **目标**: `#sb_form_q, input[name="q"], textarea[name="q"]`
- **值**: `{query}`
- **备选方案**:
  - `input[type="search"]`
  - `.search-box input`

### 步骤 3: 点击搜索按钮
- **动作**: click
- **目标**: `#sb_form_go, #search_icon, button[type="submit"]`
- **备选方案**:
  - 按回车键
  - `form button`
- **可选**: true

### 步骤 4: 等待结果加载
- **动作**: wait
- **值**: 1500
- **成功标志**: URL包含 `/search?q=`

## 学习模式

### 已知模式
- 必应国内版（cn.bing.com）无 Copilot 干扰
- 搜索框 ID 固定为 `sb_form_q`
- 搜索按钮可能不可见（可直接回车）

### 常见问题
- 搜索框未聚焦：先点击搜索框再输入
- 搜索结果未加载：等待时间不够，增加到 2 秒

## 成功率
- 初始成功率: 95%
