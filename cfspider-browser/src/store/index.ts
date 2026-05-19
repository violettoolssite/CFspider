import { create } from 'zustand'

// 标签页
export interface Tab {
  id: string
  url: string
  title: string
  isLoading: boolean
}

// 历史记录
export interface HistoryItem {
  id: string
  url: string
  title: string
  visitedAt: number
}

export interface SelectedElement {
  id: string
  selector: string
  text: string
  type: 'text' | 'link' | 'image' | 'attribute'
  attribute?: string
  preview?: string
  tag?: string  // HTML 标签名
  role?: 'title' | 'content' | 'link' | 'auto'  // 元素角色
}

export interface ExtractedData {
  selector: string
  values: string[]
}

export interface Rule {
  id: string
  name: string
  urlPattern: string
  elements: SelectedElement[]
  createdAt: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  toolCalls?: Array<{
    name: string
    arguments: object
    result?: string
    comment?: string  // AI's commentary for this specific tool call
  }>
}

// 聊天会话
export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface AIConfig {
  // 工具模型配置
  endpoint: string
  apiKey: string
  model: string
  // 视觉模型配置（可选，双模型模式时使用）
  visionEndpoint?: string   // 视觉模型 API 地址（留空则使用工具模型的地址）
  visionApiKey?: string     // 视觉模型 API Key（留空则使用工具模型的 Key）
  visionModel?: string      // 视觉模型名称
  // 模式设置
  useBuiltIn?: boolean      // 使用内置 AI 服务
  modelMode?: 'dual' | 'single' | 'tool-only'  // dual=双模型, single=单模型, tool-only=仅工具模型
}

export interface SavedAIConfig extends AIConfig {
  id: string
  name: string
  createdAt: number
}

export interface MouseState {
  visible: boolean
  x: number
  y: number
  clicking: boolean
  clickId: number  // 用于触发点击动画
  duration: number // 移动动画时长
  mode: 'normal' | 'fidget' | 'panic'  // 行为模式：正常/思考乱动/紧张乱动
  fidgetIntensity: number  // 乱动强度 0-1
  baseX: number  // 乱动时的基准位置
  baseY: number
}

// 搜索引擎配置
export interface SearchEngine {
  id: string
  name: string
  url: string  // 包含 %s 作为搜索词占位符
  icon?: string
}

// 已下载的图片
export interface DownloadedImage {
  filename: string
  path: string
  url: string
  timestamp: number
}

// 元素选择请求
export interface ElementSelectionRequest {
  id: string
  purpose: string  // 选择目的描述，如 "爬取新闻列表"
  status: 'pending' | 'auto' | 'manual' | 'completed' | 'cancelled'
  selector?: string  // 选择的选择器
}

// 心跳通知
export type HeartbeatNotificationType = 'page_change' | 'reminder' | 'skill_suggestion' | 'task_complete' | 'error_recovery' | 'login_detected'

export interface HeartbeatNotification {
  id: string
  type: HeartbeatNotificationType
  title: string
  message: string
  priority: 'low' | 'medium' | 'high'
  createdAt: number
  actions?: {
    id: string
    label: string
    primary?: boolean
  }[]
  data?: Record<string, unknown>
}

// 浏览器设置
export interface BrowserSettings {
  searchEngine: string  // 搜索引擎 ID
  homepage: string
  defaultZoom: number
}

// 预设搜索引擎
export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'bing', name: 'Bing', url: 'https://cn.bing.com/search?q=%s' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
]

// 搜索引擎首页 URL
export const SEARCH_ENGINE_HOMEPAGES: Record<string, string> = {
  'bing': 'https://cn.bing.com',
  'google': 'https://www.google.com',
  'baidu': 'https://www.baidu.com',
  'duckduckgo': 'https://duckduckgo.com',
}

interface AppState {
  // 标签页
  tabs: Tab[]
  activeTabId: string
  
  // 历史记录
  history: HistoryItem[]
  
  // 浏览器状态
  url: string
  isLoading: boolean
  selectMode: boolean
  
  // 浏览器设置
  browserSettings: BrowserSettings
  
  // 选择的元素
  selectedElements: SelectedElement[]
  
  // 提取的数据
  extractedData: ExtractedData[]
  
  // 规则
  rules: Rule[]
  
  // AI 对话
  messages: Message[]
  isAILoading: boolean
  aiStopRequested: boolean
  currentModelType: 'tool' | 'vision' | null  // 当前正在调用的模型类型
  chatSessions: ChatSession[]
  currentSessionId: string | null
  
  // AI 配置
  aiConfig: AIConfig
  savedConfigs: SavedAIConfig[]
  
  // 虚拟鼠标
  mouseState: MouseState
  
  // 已下载的图片
  downloadedImages: DownloadedImage[]
  
  // 元素选择请求
  elementSelectionRequest: ElementSelectionRequest | null
  
  // 心跳通知
  heartbeatNotifications: HeartbeatNotification[]
  heartbeatEnabled: boolean
  
  // Token 消耗统计
  tokenUsage: {
    total: number
    // 按类型分类
    byType: {
      chat: number      // 普通对话
      tool: number      // 工具调用
      vision: number    // 视觉模型
    }
    models: {
      [modelName: string]: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
        requestCount: number
        type: 'chat' | 'tool' | 'vision'
      }
    }
    // 速率跟踪
    recentChanges: { timestamp: number; amount: number }[]
    currentRate: number // tokens per second
    rateDirection: 'up' | 'down' | 'stable'
  }
  
  // 标签页 Actions
  addTab: (url?: string) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, updates: Partial<Tab>) => void
  
  // 历史记录 Actions
  addHistory: (url: string, title: string) => void
  clearHistory: () => void
  loadHistory: () => Promise<void>
  saveHistory: () => Promise<void>
  
  // Actions
  setUrl: (url: string) => void
  setLoading: (loading: boolean) => void
  setSelectMode: (mode: boolean) => void
  
  addSelectedElement: (element: SelectedElement) => void
  removeSelectedElement: (id: string) => void
  clearSelectedElements: () => void
  updateElementType: (id: string, type: SelectedElement['type'], attribute?: string) => void
  
  setExtractedData: (data: ExtractedData[]) => void
  clearExtractedData: () => void
  
  addRule: (rule: Rule) => void
  deleteRule: (id: string) => void
  loadRules: () => Promise<void>
  saveRules: () => Promise<void>
  
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void
  updateLastMessage: (content: string) => void
  updateLastMessageWithToolCalls: (content: string, toolCalls: Array<{ name: string; arguments: object; result?: string }>) => void
  clearMessages: () => void
  setAILoading: (loading: boolean) => void
  setCurrentModelType: (type: 'tool' | 'vision' | null) => void
  stopAI: () => void
  resetAIStop: () => void
  
  // 聊天会话管理
  newChatSession: () => void
  switchChatSession: (id: string) => void
  deleteChatSession: (id: string) => void
  saveChatSessions: () => Promise<void>
  loadChatSessions: () => Promise<void>
  autoSaveCurrentSession: () => void
  
  setAIConfig: (config: Partial<AIConfig>) => void
  loadConfig: () => Promise<void>
  saveConfig: () => Promise<void>
  
  // 已保存的配置
  addSavedConfig: (name: string) => void
  deleteSavedConfig: (id: string) => void
  applySavedConfig: (id: string) => void
  loadSavedConfigs: () => Promise<void>
  saveSavedConfigs: () => Promise<void>
  
  // 鼠标控制
  showMouse: () => void
  hideMouse: () => void
  moveMouse: (x: number, y: number, duration?: number) => void
  clickMouse: () => void
  fidgetMouse: (intensity?: number) => void  // 思考时微微乱动
  panicMouse: (duration?: number) => void    // 出错时紧张乱动
  stopFidget: () => void                      // 停止乱动
  
  // 浏览器设置
  setBrowserSettings: (settings: Partial<BrowserSettings>, navigateToHomepage?: boolean) => void
  loadBrowserSettings: () => Promise<void>
  saveBrowserSettings: () => Promise<void>
  
  // 下载管理
  setDownloadedImages: (images: DownloadedImage[]) => void
  clearDownloadedImages: () => void
  
  // 元素选择请求
  setElementSelectionRequest: (request: ElementSelectionRequest | null) => void
  respondToElementSelection: (mode: 'auto' | 'manual', selector?: string) => void
  
  // 心跳通知
  setHeartbeatEnabled: (enabled: boolean) => void
  addHeartbeatNotification: (notification: HeartbeatNotification) => void
  removeHeartbeatNotification: (id: string) => void
  clearHeartbeatNotifications: () => void
  handleHeartbeatAction: (notificationId: string, actionId: string) => void
  
  // Token 消耗统计
  addTokenUsage: (modelName: string, promptTokens: number, completionTokens: number, type?: 'chat' | 'tool' | 'vision') => void
  updateTokenRateDirection: () => void
  resetTokenUsage: () => void
  getTokenUsage: () => { total: number; byType: { chat: number; tool: number; vision: number }; models: { [key: string]: { promptTokens: number; completionTokens: number; totalTokens: number; requestCount: number; type: 'chat' | 'tool' | 'vision' } }; recentChanges: { timestamp: number; amount: number }[]; currentRate: number; rateDirection: 'up' | 'down' | 'stable' }
}

export const useStore = create<AppState>((set, get) => ({
  // 初始状态 - 标签页（URL 留空，等待 loadBrowserSettings 加载后设置）
  tabs: [{ id: 'tab-1', url: '', title: '新标签页', isLoading: false }],
  activeTabId: 'tab-1',
  
  // 历史记录
  history: [],
  
  // 浏览器状态（URL 留空，避免重复跳转）
  url: '',
  isLoading: false,
  selectMode: false,
  browserSettings: {
    searchEngine: 'bing',
    homepage: 'https://cn.bing.com',
    defaultZoom: 100
  },
  selectedElements: [],
  extractedData: [],
  rules: [],
  messages: [],
  isAILoading: false,
  aiStopRequested: false,
  currentModelType: null,
  chatSessions: [],
  currentSessionId: null,
  aiConfig: {
    endpoint: '',
    apiKey: '',
    model: '',
    useBuiltIn: true  // 默认使用内置 AI
  },
  savedConfigs: [],
  mouseState: {
    visible: false,
    x: 0,
    y: 0,
    clicking: false,
    clickId: 0,
    duration: 300,
    mode: 'normal' as const,
    fidgetIntensity: 0,
    baseX: 0,
    baseY: 0
  },
  downloadedImages: [],
  elementSelectionRequest: null,
  heartbeatNotifications: [],
  heartbeatEnabled: true,
  tokenUsage: {
    total: 0,
    byType: {
      chat: 0,
      tool: 0,
      vision: 0
    },
    models: {},
    recentChanges: [],
    currentRate: 0,
    rateDirection: 'stable' as const
  },

  // 标签页 Actions
  addTab: (url) => {
    const homepage = SEARCH_ENGINE_HOMEPAGES[get().browserSettings.searchEngine] || 'https://cn.bing.com'
    const newTab: Tab = {
      id: `tab-${Date.now()}`,
      url: url || homepage,
      title: '新标签页',
      isLoading: false
    }
    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
      url: newTab.url
    }))
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get()
    if (tabs.length <= 1) return // 至少保留一个标签页
    
    const newTabs = tabs.filter(t => t.id !== id)
    let newActiveId = activeTabId
    
    // 如果关闭的是当前标签，切换到相邻标签
    if (id === activeTabId) {
      const closedIndex = tabs.findIndex(t => t.id === id)
      const newIndex = closedIndex >= newTabs.length ? newTabs.length - 1 : closedIndex
      newActiveId = newTabs[newIndex].id
    }
    
    const activeTab = newTabs.find(t => t.id === newActiveId)
    set({
      tabs: newTabs,
      activeTabId: newActiveId,
      url: activeTab?.url || ''
    })
  },

  setActiveTab: (id) => {
    const tab = get().tabs.find(t => t.id === id)
    if (tab) {
      set({ activeTabId: id, url: tab.url })
    }
  },

  updateTab: (id, updates) => {
    set((state) => ({
      tabs: state.tabs.map(t => t.id === id ? { ...t, ...updates } : t)
    }))
    // 如果更新的是当前标签的 URL，同步更新全局 url
    if (updates.url && id === get().activeTabId) {
      set({ url: updates.url })
    }
  },

  // 历史记录 Actions
  addHistory: (url, title) => {
    const newItem: HistoryItem = {
      id: `history-${Date.now()}`,
      url,
      title: title || url,
      visitedAt: Date.now()
    }
    set((state) => ({
      history: [newItem, ...state.history.filter(h => h.url !== url)].slice(0, 100)
    }))
    get().saveHistory()
  },

  clearHistory: () => {
    set({ history: [] })
    get().saveHistory()
  },

  loadHistory: async () => {
    if (window.electronAPI?.loadHistory) {
      try {
        const history = await window.electronAPI.loadHistory()
        if (Array.isArray(history)) {
          set({ history })
        }
      } catch (e) {
        console.error('[CFSpider] 加载历史记录失败:', e)
      }
    }
  },

  saveHistory: async () => {
    if (window.electronAPI?.saveHistory) {
      await window.electronAPI.saveHistory(get().history)
    }
  },

  // Actions
  setUrl: (url) => {
    set({ url })
    // 同步更新当前标签页
    const { activeTabId } = get()
    get().updateTab(activeTabId, { url })
  },
  setLoading: (isLoading) => {
    set({ isLoading })
    // 同步更新当前标签页
    const { activeTabId } = get()
    get().updateTab(activeTabId, { isLoading })
  },
  setSelectMode: (selectMode) => set({ selectMode }),

  addSelectedElement: (element) => set((state) => ({
    selectedElements: [...state.selectedElements, element]
  })),

  removeSelectedElement: (id) => set((state) => ({
    selectedElements: state.selectedElements.filter((e) => e.id !== id)
  })),

  clearSelectedElements: () => set({ selectedElements: [], extractedData: [] }),

  updateElementType: (id, type, attribute) => set((state) => ({
    selectedElements: state.selectedElements.map((e) =>
      e.id === id ? { ...e, type, attribute } : e
    )
  })),

  setExtractedData: (data) => set({ extractedData: data }),
  clearExtractedData: () => set({ extractedData: [] }),

  addRule: (rule) => {
    set((state) => ({ rules: [...state.rules, rule] }))
    get().saveRules()
  },

  deleteRule: (id) => {
    set((state) => ({ rules: state.rules.filter((r) => r.id !== id) }))
    get().saveRules()
  },

  loadRules: async () => {
    if (window.electronAPI) {
      const rules = await window.electronAPI.loadRules()
      set({ rules: rules as Rule[] })
    }
  },

  saveRules: async () => {
    if (window.electronAPI) {
      await window.electronAPI.saveRules(get().rules)
    }
  },

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, {
      ...message,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now()
    }]
  })),

  updateLastMessage: (content) => {
    set((state) => {
      const messages = [...state.messages]
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content
        }
      }
      return { messages }
    })
    // 自动保存当前会话
    get().autoSaveCurrentSession()
  },

  updateLastMessageWithToolCalls: (content, toolCalls) => {
    set((state) => {
      const messages = [...state.messages]
      if (messages.length > 0) {
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content,
          toolCalls
        }
      }
      return { messages }
    })
    // 自动保存当前会话
    get().autoSaveCurrentSession()
  },

  clearMessages: () => {
    const { messages, currentSessionId, chatSessions } = get()
    // 保存当前会话到历史
    if (messages.length > 0) {
      const title = messages.find(m => m.role === 'user')?.content.slice(0, 20) || '新对话'
      const now = Date.now()
      const newSession: ChatSession = {
        id: currentSessionId || `session-${now}`,
        title,
        messages: [...messages],
        createdAt: now,
        updatedAt: now
      }
      // 更新或添加会话
      const existingIndex = chatSessions.findIndex(s => s.id === currentSessionId)
      if (existingIndex >= 0) {
        const updated = [...chatSessions]
        updated[existingIndex] = newSession
        set({ chatSessions: updated, messages: [], currentSessionId: null })
      } else {
        set({ chatSessions: [newSession, ...chatSessions].slice(0, 20), messages: [], currentSessionId: null })
      }
      get().saveChatSessions()
    } else {
      set({ messages: [], currentSessionId: null })
    }
    // 清除临时保存的当前会话
    try {
      localStorage.removeItem('cfspider-current-session')
    } catch {}
  },
  
  setAILoading: (isAILoading) => set({ isAILoading }),

  setCurrentModelType: (currentModelType) => set({ currentModelType }),

  stopAI: () => set({ aiStopRequested: true, isAILoading: false, currentModelType: null }),

  resetAIStop: () => set({ aiStopRequested: false, currentModelType: null }),
  
  // 聊天会话管理
  newChatSession: () => {
    const { messages, currentSessionId, chatSessions } = get()
    // 保存当前会话
    if (messages.length > 0) {
      const title = messages.find(m => m.role === 'user')?.content.slice(0, 20) || '新对话'
      const now = Date.now()
      const newSession: ChatSession = {
        id: currentSessionId || `session-${now}`,
        title,
        messages: [...messages],
        createdAt: now,
        updatedAt: now
      }
      const existingIndex = chatSessions.findIndex(s => s.id === currentSessionId)
      if (existingIndex >= 0) {
        const updated = [...chatSessions]
        updated[existingIndex] = newSession
        set({ chatSessions: updated, messages: [], currentSessionId: null })
      } else {
        set({ chatSessions: [newSession, ...chatSessions].slice(0, 20), messages: [], currentSessionId: null })
      }
      get().saveChatSessions()
    } else {
      set({ messages: [], currentSessionId: null })
    }
    // 清除临时保存
    try {
      localStorage.removeItem('cfspider-current-session')
    } catch {}
  },
  
  switchChatSession: (id) => {
    const { messages, currentSessionId, chatSessions } = get()
    // 先保存当前会话
    if (messages.length > 0 && currentSessionId) {
      const existingIndex = chatSessions.findIndex(s => s.id === currentSessionId)
      if (existingIndex >= 0) {
        const updated = [...chatSessions]
        updated[existingIndex] = {
          ...updated[existingIndex],
          messages: [...messages],
          updatedAt: Date.now()
        }
        set({ chatSessions: updated })
        get().saveChatSessions()
      }
    }
    // 切换到目标会话
    const session = get().chatSessions.find(s => s.id === id)
    if (session) {
      set({ messages: [...session.messages], currentSessionId: id })
      // 保存当前会话状态
      get().autoSaveCurrentSession()
    }
  },
  
  deleteChatSession: (id) => {
    set((state) => ({
      chatSessions: state.chatSessions.filter(s => s.id !== id)
    }))
    get().saveChatSessions()
  },
  
  saveChatSessions: async () => {
    try {
      localStorage.setItem('cfspider-chat-sessions', JSON.stringify(get().chatSessions))
    } catch {}
  },
  
  loadChatSessions: async () => {
    try {
      const data = localStorage.getItem('cfspider-chat-sessions')
      if (data) {
        const sessions = JSON.parse(data) as ChatSession[]
        set({ chatSessions: sessions })
      }
      // 加载当前未保存的会话
      const currentData = localStorage.getItem('cfspider-current-session')
      if (currentData) {
        const current = JSON.parse(currentData)
        if (current.messages && current.messages.length > 0) {
          set({ messages: current.messages, currentSessionId: current.id })
        }
      }
    } catch {}
  },
  
  // 自动保存当前会话（每次消息更新时调用）
  autoSaveCurrentSession: () => {
    const { messages, currentSessionId } = get()
    if (messages.length === 0) return
    
    try {
      const sessionId = currentSessionId || `session-${Date.now()}`
      if (!currentSessionId) {
        set({ currentSessionId: sessionId })
      }
      localStorage.setItem('cfspider-current-session', JSON.stringify({
        id: sessionId,
        messages: messages
      }))
    } catch {}
  },

  setAIConfig: (config) => set((state) => ({
    aiConfig: { ...state.aiConfig, ...config }
  })),

  loadConfig: async () => {
    if (window.electronAPI) {
      const config = await window.electronAPI.loadConfig()
      set({ aiConfig: config })
    }
  },

  saveConfig: async () => {
    if (window.electronAPI) {
      await window.electronAPI.saveConfig(get().aiConfig)
    }
  },

  // 已保存的配置
  addSavedConfig: (name) => {
    const { aiConfig, savedConfigs } = get()
    const newConfig: SavedAIConfig = {
      ...aiConfig,
      id: Date.now().toString(),
      name,
      createdAt: Date.now()
    }
    set({ savedConfigs: [...savedConfigs, newConfig] })
    get().saveSavedConfigs()
  },

  deleteSavedConfig: (id) => {
    set((state) => ({
      savedConfigs: state.savedConfigs.filter((c) => c.id !== id)
    }))
    get().saveSavedConfigs()
  },

  applySavedConfig: (id) => {
    const config = get().savedConfigs.find((c) => c.id === id)
    if (config) {
      set({
        aiConfig: {
          endpoint: config.endpoint,
          apiKey: config.apiKey,
          model: config.model
        }
      })
      get().saveConfig()
    }
  },

  loadSavedConfigs: async () => {
    if (window.electronAPI) {
      try {
        const configs = await window.electronAPI.loadSavedConfigs()
        set({ savedConfigs: configs as SavedAIConfig[] })
      } catch {
        set({ savedConfigs: [] })
      }
    }
  },

  saveSavedConfigs: async () => {
    if (window.electronAPI) {
      await window.electronAPI.saveSavedConfigs(get().savedConfigs)
    }
  },

  // 鼠标控制
  showMouse: () => set((state) => ({
    mouseState: { ...state.mouseState, visible: true }
  })),
  
  hideMouse: () => set((state) => ({
    mouseState: { ...state.mouseState, visible: false }
  })),
  
  moveMouse: (x, y, duration = 300) => set((state) => ({
    mouseState: { ...state.mouseState, x, y, duration, visible: true }
  })),
  
  clickMouse: () => set((state) => ({
    mouseState: { 
      ...state.mouseState, 
      clicking: true, 
      clickId: state.mouseState.clickId + 1 
    }
  })),

  // 思考时微微乱动
  fidgetMouse: (intensity = 0.3) => set((state) => ({
    mouseState: { 
      ...state.mouseState, 
      mode: 'fidget' as const,
      fidgetIntensity: intensity,
      baseX: state.mouseState.x,
      baseY: state.mouseState.y
    }
  })),

  // 出错时紧张乱动
  panicMouse: (duration = 1500) => {
    set((state) => ({
      mouseState: { 
        ...state.mouseState, 
        mode: 'panic' as const,
        fidgetIntensity: 1,
        baseX: state.mouseState.x,
        baseY: state.mouseState.y
      }
    }))
    // 自动停止
    setTimeout(() => {
      const currentMode = get().mouseState.mode
      if (currentMode === 'panic') {
        get().stopFidget()
      }
    }, duration)
  },

  // 停止乱动
  stopFidget: () => set((state) => ({
    mouseState: { 
      ...state.mouseState, 
      mode: 'normal' as const,
      fidgetIntensity: 0
    }
  })),

  // 浏览器设置
  setBrowserSettings: (settings, navigateToHomepage = true) => {
    set((state) => ({
      browserSettings: { ...state.browserSettings, ...settings }
    }))
    get().saveBrowserSettings()
    
    // 如果设置了搜索引擎，自动跳转到该搜索引擎首页
    if (settings.searchEngine && navigateToHomepage) {
      const homepage = SEARCH_ENGINE_HOMEPAGES[settings.searchEngine]
      if (homepage) {
        set({ url: homepage })
        // 更新 webview
        const webview = document.querySelector('webview') as HTMLElement & { src?: string }
        if (webview) {
          webview.src = homepage
        }
      }
    }
  },

  loadBrowserSettings: async () => {
    if (window.electronAPI?.loadBrowserSettings) {
      try {
        const settings = await window.electronAPI.loadBrowserSettings()
        console.log('[CFSpider] 加载浏览器设置:', settings)
        if (settings && typeof settings === 'object') {
          const browserSettings = settings as BrowserSettings
          // 根据搜索引擎设置首页 URL
          const homepage = SEARCH_ENGINE_HOMEPAGES[browserSettings.searchEngine] || 'https://cn.bing.com'
          
          // 同时更新第一个标签页的 URL
          const { tabs } = get()
          const updatedTabs = tabs.length > 0 
            ? [{ ...tabs[0], url: homepage }, ...tabs.slice(1)]
            : [{ id: 'tab-1', url: homepage, title: '新标签页', isLoading: false }]
          
          set({ 
            browserSettings,
            url: homepage,
            tabs: updatedTabs
          })
          console.log('[CFSpider] 设置首页 URL:', homepage)
        }
      } catch (e) {
        console.error('[CFSpider] 加载浏览器设置失败:', e)
      }
    }
  },

  saveBrowserSettings: async () => {
    if (window.electronAPI?.saveBrowserSettings) {
      const settings = get().browserSettings
      console.log('[CFSpider] 保存浏览器设置:', settings)
      await window.electronAPI.saveBrowserSettings(settings)
    }
  },

  // 下载管理
  setDownloadedImages: (images) => set({ downloadedImages: images }),
  clearDownloadedImages: () => set({ downloadedImages: [] }),
  
  // 元素选择请求
  setElementSelectionRequest: (request) => set({ elementSelectionRequest: request }),
  respondToElementSelection: (mode, selector) => {
    const request = get().elementSelectionRequest
    if (request) {
      set({
        elementSelectionRequest: {
          ...request,
          status: mode === 'manual' ? 'manual' : (selector ? 'completed' : 'auto'),
          selector: selector
        }
      })
    }
  },
  
  // 心跳通知
  setHeartbeatEnabled: (enabled) => set({ heartbeatEnabled: enabled }),
  
  addHeartbeatNotification: (notification) => set((state) => ({
    heartbeatNotifications: [notification, ...state.heartbeatNotifications].slice(0, 20)
  })),
  
  removeHeartbeatNotification: (id) => set((state) => ({
    heartbeatNotifications: state.heartbeatNotifications.filter(n => n.id !== id)
  })),
  
  clearHeartbeatNotifications: () => set({ heartbeatNotifications: [] }),
  
  handleHeartbeatAction: (notificationId, actionId) => {
    const notification = get().heartbeatNotifications.find(n => n.id === notificationId)
    if (!notification) return
    
    console.log('[Heartbeat] 处理通知动作:', notificationId, actionId, notification.type)
    
    // 根据动作类型处理
    switch (actionId) {
      case 'dismiss':
        get().removeHeartbeatNotification(notificationId)
        break
      case 'close_modal':
        // 触发关闭弹窗操作
        const webview = document.querySelector('webview') as any
        if (webview) {
          webview.executeJavaScript(`
            (function() {
              const closeSelectors = [
                '.modal .close', '.modal-close', '.dialog-close',
                '[aria-label="Close"]', '.popup-close', '.overlay-close',
                '.modal button:contains("关闭")', '.modal button:contains("取消")'
              ];
              for (const sel of closeSelectors) {
                const btn = document.querySelector(sel);
                if (btn) { btn.click(); break; }
              }
            })()
          `)
        }
        get().removeHeartbeatNotification(notificationId)
        break
      case 'retry':
        // 重试操作 - 可以通过消息触发
        get().addMessage({
          role: 'user',
          content: '请重试刚才失败的操作'
        })
        get().removeHeartbeatNotification(notificationId)
        break
      case 'auto_login':
        // 自动登录 - 触发登录选择流程
        get().addMessage({
          role: 'user',
          content: '自动登录'
        })
        get().removeHeartbeatNotification(notificationId)
        break
      case 'manual_login':
        // 手动登录 - 只是移除通知
        get().removeHeartbeatNotification(notificationId)
        break
      case 'create_skill':
        // 创建技能
        const domain = notification.data?.domain as string
        if (domain) {
          get().addMessage({
            role: 'user',
            content: `为 ${domain} 创建一个快捷技能`
          })
        }
        get().removeHeartbeatNotification(notificationId)
        break
      default:
        // 默认移除通知
        get().removeHeartbeatNotification(notificationId)
    }
  },
  
  // Token 消耗统计
  addTokenUsage: (modelName, promptTokens, completionTokens, type = 'tool') => {
    set((state) => {
      const totalTokens = promptTokens + completionTokens
      const now = Date.now()
      
      const currentModel = state.tokenUsage.models[modelName] || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requestCount: 0,
        type
      }
      
      // 记录最近的变化（保留最近 5 秒内的记录）
      const recentChanges = [
        ...state.tokenUsage.recentChanges.filter(c => now - c.timestamp < 5000),
        { timestamp: now, amount: totalTokens }
      ]
      
      // 计算速率（tokens per second）
      const oldestChange = recentChanges[0]
      const timeSpan = (now - oldestChange.timestamp) / 1000 || 1
      const totalRecentTokens = recentChanges.reduce((sum, c) => sum + c.amount, 0)
      const currentRate = totalRecentTokens / timeSpan
      
      // 判断速率方向
      const previousRate = state.tokenUsage.currentRate
      let rateDirection: 'up' | 'down' | 'stable' = 'stable'
      if (currentRate > previousRate * 1.2) {
        rateDirection = 'up'
      } else if (currentRate < previousRate * 0.8 && previousRate > 0) {
        rateDirection = 'down'
      } else if (currentRate > 10) {
        // 如果速率较高，保持向上
        rateDirection = 'up'
      }
      
      // 更新按类型统计
      const byType = { ...state.tokenUsage.byType }
      byType[type] = (byType[type] || 0) + totalTokens
      
      return {
        tokenUsage: {
          total: state.tokenUsage.total + totalTokens,
          byType,
          models: {
            ...state.tokenUsage.models,
            [modelName]: {
              promptTokens: currentModel.promptTokens + promptTokens,
              completionTokens: currentModel.completionTokens + completionTokens,
              totalTokens: currentModel.totalTokens + totalTokens,
              requestCount: currentModel.requestCount + 1,
              type
            }
          },
          recentChanges,
          currentRate,
          rateDirection
        }
      }
    })
  },
  
  // 更新速率方向（用于定时检查）
  updateTokenRateDirection: () => {
    set((state) => {
      const now = Date.now()
      // 清理 5 秒前的记录
      const recentChanges = state.tokenUsage.recentChanges.filter(c => now - c.timestamp < 5000)
      
      if (recentChanges.length === 0) {
        return {
          tokenUsage: {
            ...state.tokenUsage,
            recentChanges: [],
            currentRate: 0,
            rateDirection: 'stable' as const
          }
        }
      }
      
      // 重新计算速率
      const oldestChange = recentChanges[0]
      const timeSpan = (now - oldestChange.timestamp) / 1000 || 1
      const totalRecentTokens = recentChanges.reduce((sum, c) => sum + c.amount, 0)
      const currentRate = totalRecentTokens / timeSpan
      
      // 判断方向
      const previousRate = state.tokenUsage.currentRate
      let rateDirection: 'up' | 'down' | 'stable' = 'stable'
      
      if (recentChanges.length > 0 && now - recentChanges[recentChanges.length - 1].timestamp < 2000) {
        // 最近 2 秒内有变化
        if (currentRate > previousRate * 1.1) {
          rateDirection = 'up'
        } else if (currentRate > 50) {
          rateDirection = 'up'
        } else if (currentRate > 10) {
          rateDirection = currentRate < previousRate * 0.9 ? 'down' : 'up'
        } else {
          rateDirection = 'down'
        }
      }
      
      return {
        tokenUsage: {
          ...state.tokenUsage,
          recentChanges,
          currentRate,
          rateDirection
        }
      }
    })
  },
  
  resetTokenUsage: () => set({
    tokenUsage: {
      total: 0,
      byType: {
        chat: 0,
        tool: 0,
        vision: 0
      },
      models: {},
      recentChanges: [],
      currentRate: 0,
      rateDirection: 'stable' as const
    }
  }),
  
  getTokenUsage: () => get().tokenUsage
}))
