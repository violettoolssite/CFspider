# 访问网站技能

## 基本信息
- **ID**: `navigate-to-website`
- **名称**: 访问网站
- **描述**: 通过搜索引擎搜索并访问目标网站官网
- **触发词**: 打开, 进入, 访问, 去, 跳转到
- **适用域名**: * (通用)

## 操作步骤

### 步骤 1: 检查当前状态
- **动作**: verify
- **说明**: 检查是否已经在目标网站或搜索引擎

### 步骤 2: 导航到搜索引擎（如需要）
- **动作**: navigate
- **目标**: `https://cn.bing.com`
- **可选**: true
- **条件**: 如果当前不在搜索引擎

### 步骤 3: 搜索网站名称
- **动作**: input
- **目标**: `#sb_form_q`
- **值**: `{site_name}`

### 步骤 4: 点击搜索
- **动作**: click
- **目标**: `#sb_form_go`

### 步骤 5: 扫描搜索结果
- **动作**: scan
- **说明**: 使用 scan_interactive_elements

### 步骤 6: 点击官网链接
- **动作**: click
- **目标**: `click_by_index(type="link", index={index})`
- **验证**: 
  - 链接 href 包含目标域名
  - 链接文本包含"官网"或网站名称

### 步骤 7: 确认到达
- **动作**: verify
- **成功标志**: URL 包含目标域名

## 学习模式

### 网站映射表
常见网站的官方域名：
- GitHub -> github.com
- 京东 -> jd.com
- 淘宝 -> taobao.com
- 爱奇艺 -> iqiyi.com
- YouTube -> youtube.com
- 哔哩哔哩 -> bilibili.com

### 域名识别规则
- 主域名优先（www.github.com > docs.github.com）
- 排除子域名：home., account., login., passport.
- 排除山寨域名：-cn.com, .cn（对于国际网站）

### 纠错策略
- 如果点击后到达错误网站，记录并返回重试
- 如果搜索无结果，尝试英文名称
- 如果已在目标网站，跳过导航步骤

## 成功率
- 初始成功率: 90%
