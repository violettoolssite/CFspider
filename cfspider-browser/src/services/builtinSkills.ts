/**
 * 内置技能定义
 * 从 Markdown 文件解析而来
 */
import { Skill } from './skills'

export const BUILT_IN_SKILLS: Skill[] = [
  // 必应搜索技能
  {
    id: 'bing-search',
    name: '必应搜索',
    description: '在必应搜索引擎上搜索关键词',
    triggers: ['搜索', '查找', '找一下', 'search', '查', '百度一下'],
    domains: ['bing.com', 'cn.bing.com'],
    steps: [
      {
        action: 'scan',
      },
      {
        action: 'input',
        target: '#sb_form_q, input[name="q"], textarea[name="q"]',
        value: '{query}',
        fallbacks: ['input[type="search"]', '.search-box input']
      },
      {
        action: 'click',
        target: '#sb_form_go, #search_icon, button[type="submit"]',
        fallbacks: ['按回车键', 'form button'],
        optional: true
      },
      {
        action: 'wait',
        value: '1500',
        successIndicator: 'URL包含 /search?q='
      }
    ],
    successRate: 95,
    usageCount: 0,
    lastUsed: 0,
    learnedPatterns: [],
    isBuiltIn: true,
    version: 1
  },

  // 点击搜索结果技能
  {
    id: 'click-search-result',
    name: '点击搜索结果',
    description: '在搜索引擎结果页面中点击指定的链接',
    triggers: ['打开', '点击', '进入', '访问'],
    domains: ['bing.com', 'cn.bing.com', 'baidu.com', 'google.com'],
    steps: [
      {
        action: 'scan',
      },
      {
        action: 'verify',
        value: '识别目标链接，排除 Copilot、图片搜索、山寨网站、翻页按钮'
      },
      {
        action: 'click',
        target: 'click_by_index(type="link", index={index})',
        fallbacks: ['visual_click("{target_name}")', 'click_text("{target_domain}")']
      },
      {
        action: 'wait',
        value: '2000'
      },
      {
        action: 'verify',
        successIndicator: 'URL 包含目标域名'
      }
    ],
    successRate: 85,
    usageCount: 0,
    lastUsed: 0,
    learnedPatterns: [],
    isBuiltIn: true,
    version: 1
  },

  // 访问网站技能
  {
    id: 'navigate-to-website',
    name: '访问网站',
    description: '通过搜索引擎搜索并访问目标网站官网',
    triggers: ['打开', '进入', '访问', '去', '跳转到'],
    domains: [], // 通用技能
    steps: [
      {
        action: 'verify',
        value: '检查是否已经在目标网站或搜索引擎'
      },
      {
        action: 'navigate',
        target: 'https://cn.bing.com',
        optional: true,
        successIndicator: '如果当前不在搜索引擎'
      },
      {
        action: 'input',
        target: '#sb_form_q',
        value: '{site_name}'
      },
      {
        action: 'click',
        target: '#sb_form_go'
      },
      {
        action: 'wait',
        value: '1500'
      },
      {
        action: 'scan'
      },
      {
        action: 'click',
        target: 'click_by_index(type="link", index={index})',
        value: '验证链接 href 包含目标域名'
      },
      {
        action: 'wait',
        value: '2000'
      },
      {
        action: 'verify',
        successIndicator: 'URL 包含目标域名'
      }
    ],
    successRate: 90,
    usageCount: 0,
    lastUsed: 0,
    learnedPatterns: [],
    isBuiltIn: true,
    version: 1
  },

  // 爱奇艺导航技能
  {
    id: 'iqiyi-navigation',
    name: '爱奇艺导航',
    description: '在爱奇艺网站上导航和搜索视频',
    triggers: ['搜索视频', '找电影', '看剧', '播放'],
    domains: ['iqiyi.com'],
    steps: [
      {
        action: 'scan'
      },
      {
        action: 'input',
        target: '.search-input, input[placeholder*="搜索"]',
        value: '{query}'
      },
      {
        action: 'click',
        target: '.search-btn, button[class*="search"]',
        fallbacks: ['按回车键']
      },
      {
        action: 'wait',
        value: '2000',
        successIndicator: 'URL 包含 /search/'
      }
    ],
    successRate: 80,
    usageCount: 0,
    lastUsed: 0,
    learnedPatterns: [],
    isBuiltIn: true,
    version: 1
  },

  // 通用表单填写技能
  {
    id: 'fill-form',
    name: '填写表单',
    description: '智能识别并填写网页表单',
    triggers: ['填写', '输入信息', '注册', '登录'],
    domains: [], // 通用
    steps: [
      {
        action: 'scan'
      },
      {
        action: 'input',
        target: '{detected_input}',
        value: '{value}'
      },
      {
        action: 'verify',
        value: '确认输入成功'
      }
    ],
    successRate: 85,
    usageCount: 0,
    lastUsed: 0,
    learnedPatterns: [],
    isBuiltIn: true,
    version: 1
  },

  // 滚动查看内容技能
  {
    id: 'scroll-and-read',
    name: '滚动查看',
    description: '滚动页面并阅读完整内容',
    triggers: ['阅读', '查看', '总结', '看看'],
    domains: [], // 通用
    steps: [
      {
        action: 'verify',
        value: '获取当前滚动位置'
      },
      {
        action: 'scroll',
        target: 'down',
        value: '500'
      },
      {
        action: 'wait',
        value: '500'
      },
      {
        action: 'verify',
        value: '检查是否到达页面底部'
      }
    ],
    successRate: 95,
    usageCount: 0,
    lastUsed: 0,
    learnedPatterns: [],
    isBuiltIn: true,
    version: 1
  },
  
  // 智能登录技能
  {
    id: 'auto-login',
    name: '智能登录',
    description: '检测登录需求，智能处理自动登录或手动登录',
    triggers: ['登录', 'login', '注册', 'signup', '需要登录'],
    domains: [], // 通用
    steps: [
      {
        action: 'verify',
        value: 'detect_login 检测是否需要登录'
      },
      {
        action: 'verify',
        value: 'request_login_choice 询问用户选择'
      },
      {
        action: 'input',
        value: 'auto_login 或等待手动登录'
      },
      {
        action: 'wait',
        value: '2000'
      },
      {
        action: 'verify',
        value: '验证登录成功'
      }
    ],
    successRate: 70,
    usageCount: 0,
    lastUsed: 0,
    learnedPatterns: [],
    isBuiltIn: true,
    version: 1
  }
]
