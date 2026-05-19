# GitHub 导航技能

## 基本信息
- **ID**: `github-navigation`
- **名称**: GitHub 导航
- **描述**: 在 GitHub 上搜索仓库、浏览代码
- **触发词**: 搜索仓库, 找项目, search, 查找代码
- **适用域名**: github.com

## 操作步骤

### 步骤 1: 定位搜索框
- **动作**: scan
- **说明**: GitHub 搜索框通常在页面顶部

### 步骤 2: 输入搜索关键词
- **动作**: input
- **目标**: `input[name="q"], .header-search-input, [aria-label="Search GitHub"]`
- **值**: `{query}`

### 步骤 3: 点击搜索或回车
- **动作**: click
- **目标**: `button[type="submit"]`
- **备选方案**: 按回车键

### 步骤 4: 等待结果
- **动作**: wait
- **值**: 2000
- **成功标志**: URL 包含 `/search?`

## 学习模式

### 已知模式
- GitHub 使用动态类名
- 搜索框 placeholder: "Search or jump to..."
- 仓库结果在列表中，每个有星标数

### 页面特征
- 深色/浅色主题切换
- 响应式布局
- 使用 Primer 设计系统

### 常见操作
- 搜索仓库: `/search?q=xxx&type=repositories`
- 查看代码: 点击文件名
- 克隆仓库: 点击 "Code" 按钮

## 成功率
- 初始成功率: 85%
