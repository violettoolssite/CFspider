# cfspider-智能浏览器

AI 驱动的智能浏览器 - 通过自然语言对话控制浏览器，像真人一样操作网页

## 功能特性

### 核心功能
- **AI 智能助手**: 通过自然语言对话控制浏览器，支持多种 AI 模型
- **真人模拟操作**: AI 像真人一样点击、输入、滚动，完整展示操作过程
- **虚拟鼠标**: 可视化鼠标移动和点击动画，直观展示 AI 操作
- **真人学习系统**: 像真人一样学习，记住成功经验，避免重复错误
- **视频总结**: 通过视觉模型分析视频内容，支持最多 40 帧分析

### 智能学习系统 (NEW)
- **遗忘曲线**: 长期不用的技能会逐渐遗忘，符合真人记忆特点
- **熟练度等级**: 新手 -> 入门 -> 熟练 -> 精通 -> 大师
- **经验回忆**: 执行操作前会尝试回忆相关经验
- **渐进学习**: 不是每次都记住，成功40%概率保存，失败20%概率保存
- **永久持久化**: 学习数据保存在用户目录，永不丢失

### 视频分析 (NEW)
- **智能抽帧**: 从视频中均匀抽取关键帧进行分析
- **多平台支持**: 支持原生 video 元素和嵌入式视频（YouTube/Bilibili 等）
- **可选重点**: 可指定分析重点如"人物"、"产品"、"教程步骤"
- **自动总结**: 分析完成后自动生成视频摘要

### 浏览器功能
- **多标签页**: 支持新建、关闭、切换标签页（Ctrl+T/Ctrl+W）
- **历史记录**: 自动记录访问历史，支持查看和清空
- **搜索引擎切换**: 支持 Bing、Google、百度、DuckDuckGo
- **自动点击验证**: 自动点击年龄验证、Cookie 同意等弹窗
- **页面状态检测**: 自动检测当前页面状态，避免重复操作

### 快捷键
- `Ctrl+T` - 新建标签页
- `Ctrl+W` - 关闭当前标签页
- `Ctrl+R` / `F5` - 刷新页面
- `Alt+←` / `Alt+→` - 后退/前进
- `Ctrl+L` - 聚焦地址栏
- `F12` - 开发者工具

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run electron:dev
```

### 构建应用

```bash
# Windows
npm run electron:build-win

# macOS
npm run electron:build-mac
```

## 使用方法

### 1. 配置 AI

1. 点击右上角设置按钮
2. 选择 AI 服务商或自定义 API 地址
3. 输入 API 密钥
4. 选择模型

支持的 AI 服务商：
- **Ollama** - 本地运行，无需 API Key（推荐）
- OpenAI (GPT-4, GPT-3.5)
- DeepSeek
- Groq
- Moonshot (Kimi)
- 智谱 AI
- 通义千问
- SiliconFlow
- 其他 OpenAI 兼容 API

**支持自定义模型名称**：在模型下拉框中可直接输入任意模型名称

### 2. 与 AI 对话

点击右下角蓝色按钮打开 AI 对话框，输入自然语言指令：

- "打开 GitHub" - AI 会通过搜索引擎搜索并点击打开
- "搜索 Python 教程" - 在当前搜索引擎搜索
- "把搜索引擎改成谷歌" - 切换默认搜索引擎
- "在 GitHub 搜索 vue" - 先打开 GitHub 再搜索
- "返回上一页" - 点击后退

### 3. 搜索引擎设置

1. 打开设置 → 搜索引擎
2. 选择默认搜索引擎
3. 设置会自动保存

## 技术栈

- **Electron** - 桌面应用框架
- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Tailwind CSS** - 样式
- **Zustand** - 状态管理
- **Vite** - 构建工具

## 项目结构

```
cfspider-browser/
├── electron/           # Electron 主进程
│   ├── main.ts        # 主进程入口（含技能持久化IPC）
│   └── preload.ts     # 预加载脚本
├── src/
│   ├── components/    # React 组件
│   │   ├── Browser/   # 浏览器面板
│   │   │   ├── Browser.tsx
│   │   │   ├── TabBar.tsx      # 标签栏
│   │   │   ├── Toolbar.tsx     # 工具栏
│   │   │   ├── AddressBar.tsx  # 地址栏
│   │   │   └── VirtualMouse.tsx # 虚拟鼠标
│   │   ├── AIChat/    # AI 对话
│   │   └── Settings/  # 设置
│   ├── services/      # 服务层
│   │   ├── ai.ts           # AI API 和工具
│   │   ├── skills.ts       # 技能系统（真人学习）
│   │   └── builtinSkills.ts # 内置技能定义
│   └── store/         # Zustand 状态管理
└── package.json
```

## 数据存储

应用数据保存在用户目录下（%AppData%/cfspider 或 ~/Library/Application Support/cfspider）：

| 文件 | 说明 |
|------|------|
| `ai-config.json` | AI 配置 |
| `saved-configs.json` | 已保存的 AI 配置 |
| `browser-settings.json` | 浏览器设置（搜索引擎等） |
| `history.json` | 历史记录 |
| `skills.json` | 技能学习数据（永久保存） |
| `learning-memory.json` | 学习记忆数据 |
| `chat-sessions.json` | 聊天会话历史 |

## 许可证

MIT
