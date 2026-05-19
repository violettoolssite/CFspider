import { contextBridge, ipcRenderer } from 'electron'

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // AI 相关（非流式）
  aiChat: (params: {
    endpoint: string
    apiKey: string
    model: string
    messages: Array<{ role: string; content: string }>
    tools?: Array<object>
  }) => ipcRenderer.invoke('ai:chat', params),

  // AI 流式调用
  aiChatStream: (params: {
    requestId: string
    endpoint: string
    apiKey: string
    model: string
    messages: Array<{ role: string; content: string }>
  }) => ipcRenderer.send('ai:chat-stream', params),

  // 监听流式数据
  onStreamData: (callback: (data: { requestId: string; content: string }) => void) => {
    ipcRenderer.on('ai:chat-stream-data', (_event, data) => callback(data))
  },
  onStreamEnd: (callback: (data: { requestId: string }) => void) => {
    ipcRenderer.on('ai:chat-stream-end', (_event, data) => callback(data))
  },
  onStreamError: (callback: (data: { requestId: string; error: string }) => void) => {
    ipcRenderer.on('ai:chat-stream-error', (_event, data) => callback(data))
  },
  removeStreamListeners: () => {
    ipcRenderer.removeAllListeners('ai:chat-stream-data')
    ipcRenderer.removeAllListeners('ai:chat-stream-end')
    ipcRenderer.removeAllListeners('ai:chat-stream-error')
  },

  // 文件操作（支持用户自定义保存路径）
  saveFile: (params: { 
    filename: string; 
    content: string; 
    type: string;
    isBase64?: boolean;
  }) => ipcRenderer.invoke('file:save', params),

  // 规则管理
  loadRules: () => ipcRenderer.invoke('rules:load'),
  saveRules: (rules: object[]) => ipcRenderer.invoke('rules:save', rules),

  // 配置管理
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config: object) => ipcRenderer.invoke('config:save', config),
  
  // 已保存的配置管理
  loadSavedConfigs: () => ipcRenderer.invoke('saved-configs:load'),
  saveSavedConfigs: (configs: object[]) => ipcRenderer.invoke('saved-configs:save', configs),

  // 浏览器设置
  loadBrowserSettings: () => ipcRenderer.invoke('browser-settings:load'),
  saveBrowserSettings: (settings: object) => ipcRenderer.invoke('browser-settings:save', settings),

  // 历史记录
  loadHistory: () => ipcRenderer.invoke('history:load'),
  saveHistory: (history: object[]) => ipcRenderer.invoke('history:save', history),

  // 下载功能
  downloadImage: (url: string, filename: string) => ipcRenderer.invoke('download:image', url, filename),
  openDownloadFolder: () => ipcRenderer.invoke('download:openFolder'),

  // 学习记忆
  loadLearningMemory: () => ipcRenderer.invoke('learning-memory:load'),
  saveLearningMemory: (memories: object[]) => ipcRenderer.invoke('learning-memory:save', memories),

  // 聊天会话
  loadChatSessions: () => ipcRenderer.invoke('chat-sessions:load'),
  saveChatSessions: (sessions: object[]) => ipcRenderer.invoke('chat-sessions:save', sessions),

  // 快捷键事件
  onToggleDevtools: (callback: () => void) => {
    ipcRenderer.on('toggle-devtools', () => callback())
  },
  onReloadWebview: (callback: () => void) => {
    ipcRenderer.on('reload-webview', () => callback())
  },
  onNavigateBack: (callback: () => void) => {
    ipcRenderer.on('navigate-back', () => callback())
  },
  onNavigateForward: (callback: () => void) => {
    ipcRenderer.on('navigate-forward', () => callback())
  },
  onFocusAddressbar: (callback: () => void) => {
    ipcRenderer.on('focus-addressbar', () => callback())
  },
  onNewTab: (callback: () => void) => {
    ipcRenderer.on('new-tab', () => callback())
  },
  onCloseTab: (callback: () => void) => {
    ipcRenderer.on('close-tab', () => callback())
  },

  // 系统操作 API
  checkApp: (appName: string) => ipcRenderer.invoke('system:check-app', appName),
  runApp: (params: { appName?: string; path?: string; args?: string[]; url?: string }) => 
    ipcRenderer.invoke('system:run-app', params),
  openPath: (path: string) => ipcRenderer.invoke('system:open-path', path),
  runCommand: (params: { command: string; cwd?: string; timeout?: number }) => 
    ipcRenderer.invoke('system:run-command', params),
  listApps: () => ipcRenderer.invoke('system:list-apps'),
  getSystemInfo: () => ipcRenderer.invoke('system:info'),

  // 键盘鼠标模拟 API
  typeText: (params: { text: string; delay?: number }) => 
    ipcRenderer.invoke('input:type-text', params),
  pressKey: (params: { key: string }) => 
    ipcRenderer.invoke('input:press-key', params),
  mouseClick: (params: { x: number; y: number; button?: 'left' | 'right' | 'middle'; clicks?: number }) => 
    ipcRenderer.invoke('input:mouse-click', params),
  mouseMove: (params: { x: number; y: number; smooth?: boolean }) => 
    ipcRenderer.invoke('input:mouse-move', params),
  mouseDrag: (params: { fromX: number; fromY: number; toX: number; toY: number }) => 
    ipcRenderer.invoke('input:mouse-drag', params),
  focusWindow: (params: { title?: string; process?: string }) => 
    ipcRenderer.invoke('input:focus-window', params),
  getMousePos: () => ipcRenderer.invoke('input:get-mouse-pos'),

  // 剪贴板 API
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (params: { text?: string; html?: string; image?: string }) => 
    ipcRenderer.invoke('clipboard:write', params),

  // 系统通知 API
  sendNotification: (params: { title: string; body: string; icon?: string; silent?: boolean }) => 
    ipcRenderer.invoke('notify:send', params),

  // 文件系统 API
  fsReadFile: (params: { path: string; encoding?: string }) => 
    ipcRenderer.invoke('fs:read-file', params),
  fsWriteFile: (params: { path: string; content: string; encoding?: string }) => 
    ipcRenderer.invoke('fs:write-file', params),
  fsListDirectory: (params: { path: string; recursive?: boolean }) => 
    ipcRenderer.invoke('fs:list-directory', params),
  fsCreateDirectory: (params: { path: string }) => 
    ipcRenderer.invoke('fs:create-directory', params),
  fsDelete: (params: { path: string; recursive?: boolean }) => 
    ipcRenderer.invoke('fs:delete', params),
  fsMove: (params: { from: string; to: string }) => 
    ipcRenderer.invoke('fs:move', params),
  fsSearch: (params: { path: string; pattern: string; maxResults?: number }) => 
    ipcRenderer.invoke('fs:search', params),
  fsGetInfo: (params: { path: string }) => 
    ipcRenderer.invoke('fs:get-info', params),

  // 进程管理 API
  listProcesses: () => ipcRenderer.invoke('process:list'),
  killProcess: (params: { pid?: number; name?: string }) => 
    ipcRenderer.invoke('process:kill', params),
  getSystemUsage: () => ipcRenderer.invoke('process:usage'),

  // 屏幕截图 API
  captureScreen: () => ipcRenderer.invoke('screen:capture'),
  listWindows: () => ipcRenderer.invoke('screen:list-windows'),
  captureWindow: (params: { name: string }) => 
    ipcRenderer.invoke('screen:capture-window', params),

  // 定时任务 API
  createReminder: (params: { title: string; message: string; delay: number }) => 
    ipcRenderer.invoke('scheduler:create-reminder', params),
  createScheduledTask: (params: { title: string; message: string; time: string; repeat?: string }) => 
    ipcRenderer.invoke('scheduler:create-task', params),
  listScheduledTasks: () => ipcRenderer.invoke('scheduler:list'),
  cancelScheduledTask: (params: { id: string }) => 
    ipcRenderer.invoke('scheduler:cancel', params),
  onTaskTriggered: (callback: (task: object) => void) => {
    ipcRenderer.on('task:triggered', (_event, task) => callback(task))
  }
})

// 类型声明
declare global {
  interface Window {
    electronAPI: {
      aiChat: (params: {
        endpoint: string
        apiKey: string
        model: string
        messages: Array<{ role: string; content: string }>
        tools?: Array<object>
      }) => Promise<object>
      aiChatStream: (params: {
        requestId: string
        endpoint: string
        apiKey: string
        model: string
        messages: Array<{ role: string; content: string }>
      }) => void
      onStreamData: (callback: (data: { requestId: string; content: string }) => void) => void
      onStreamEnd: (callback: (data: { requestId: string }) => void) => void
      onStreamError: (callback: (data: { requestId: string; error: string }) => void) => void
      removeStreamListeners: () => void
      saveFile: (params: { 
        filename: string; 
        content: string; 
        type: string;
        isBase64?: boolean;
      }) => Promise<{ success: boolean; filePath?: string; error?: string; canceled?: boolean }>
      loadRules: () => Promise<object[]>
      saveRules: (rules: object[]) => Promise<boolean>
      loadConfig: () => Promise<{ endpoint: string; apiKey: string; model: string }>
      saveConfig: (config: object) => Promise<boolean>
      loadSavedConfigs: () => Promise<object[]>
      saveSavedConfigs: (configs: object[]) => Promise<boolean>
      loadBrowserSettings: () => Promise<object>
      saveBrowserSettings: (settings: object) => Promise<boolean>
      loadHistory: () => Promise<object[]>
      saveHistory: (history: object[]) => Promise<boolean>
      downloadImage: (url: string, filename: string) => Promise<{ success: boolean; filename?: string; path?: string; error?: string }>
      openDownloadFolder: () => Promise<boolean>
      loadLearningMemory: () => Promise<object[]>
      saveLearningMemory: (memories: object[]) => Promise<boolean>
      loadChatSessions: () => Promise<object[]>
      saveChatSessions: (sessions: object[]) => Promise<boolean>
      onToggleDevtools: (callback: () => void) => void
      onReloadWebview: (callback: () => void) => void
      onNavigateBack: (callback: () => void) => void
      onNavigateForward: (callback: () => void) => void
      onFocusAddressbar: (callback: () => void) => void
      onNewTab: (callback: () => void) => void
      onCloseTab: (callback: () => void) => void
      // 系统操作
      checkApp: (appName: string) => Promise<{ installed: boolean; path?: string; isShortcut?: boolean }>
      runApp: (params: { appName?: string; path?: string; args?: string[]; url?: string }) => 
        Promise<{ success: boolean; message?: string; error?: string; pid?: number }>
      openPath: (path: string) => Promise<{ success: boolean; error?: string }>
      runCommand: (params: { command: string; cwd?: string; timeout?: number }) => 
        Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }>
      listApps: () => Promise<Array<{ name: string; path: string }>>
      getSystemInfo: () => Promise<{
        platform: string
        arch: string
        hostname: string
        username: string
        homedir: string
        tmpdir: string
        cpus: number
        memory: { total: number; free: number }
      }>
      // 键盘鼠标模拟
      typeText: (params: { text: string; delay?: number }) => 
        Promise<{ success: boolean; typed?: number; error?: string }>
      pressKey: (params: { key: string }) => 
        Promise<{ success: boolean; key?: string; error?: string }>
      mouseClick: (params: { x: number; y: number; button?: 'left' | 'right' | 'middle'; clicks?: number }) => 
        Promise<{ success: boolean; x?: number; y?: number; error?: string }>
      mouseMove: (params: { x: number; y: number; smooth?: boolean }) => 
        Promise<{ success: boolean; x?: number; y?: number; error?: string }>
      mouseDrag: (params: { fromX: number; fromY: number; toX: number; toY: number }) => 
        Promise<{ success: boolean; error?: string }>
      focusWindow: (params: { title?: string; process?: string }) => 
        Promise<{ success: boolean; message?: string; error?: string }>
      getMousePos: () => Promise<{ success: boolean; x?: number; y?: number; error?: string }>
      // 剪贴板
      readClipboard: () => Promise<{ success: boolean; type?: string; content?: string; error?: string }>
      writeClipboard: (params: { text?: string; html?: string; image?: string }) => 
        Promise<{ success: boolean; type?: string; error?: string }>
      // 系统通知
      sendNotification: (params: { title: string; body: string; icon?: string; silent?: boolean }) => 
        Promise<{ success: boolean; error?: string }>
      // 文件系统
      fsReadFile: (params: { path: string; encoding?: string }) => 
        Promise<{ success: boolean; content?: string; error?: string }>
      fsWriteFile: (params: { path: string; content: string; encoding?: string }) => 
        Promise<{ success: boolean; path?: string; error?: string }>
      fsListDirectory: (params: { path: string; recursive?: boolean }) => 
        Promise<{ success: boolean; items?: Array<object>; error?: string }>
      fsCreateDirectory: (params: { path: string }) => 
        Promise<{ success: boolean; error?: string }>
      fsDelete: (params: { path: string; recursive?: boolean }) => 
        Promise<{ success: boolean; error?: string }>
      fsMove: (params: { from: string; to: string }) => 
        Promise<{ success: boolean; error?: string }>
      fsSearch: (params: { path: string; pattern: string; maxResults?: number }) => 
        Promise<{ success: boolean; files?: string[]; error?: string }>
      fsGetInfo: (params: { path: string }) => 
        Promise<{ success: boolean; info?: object; error?: string }>
      // 进程管理
      listProcesses: () => Promise<{ success: boolean; processes?: Array<object>; error?: string }>
      killProcess: (params: { pid?: number; name?: string }) => 
        Promise<{ success: boolean; error?: string }>
      getSystemUsage: () => Promise<{ success: boolean; cpu?: object; memory?: object; error?: string }>
      // 屏幕截图
      captureScreen: () => Promise<{ success: boolean; image?: string; size?: object; error?: string }>
      listWindows: () => Promise<{ success: boolean; windows?: Array<object>; error?: string }>
      captureWindow: (params: { name: string }) => 
        Promise<{ success: boolean; image?: string; error?: string }>
      // 定时任务
      createReminder: (params: { title: string; message: string; delay: number }) => 
        Promise<{ success: boolean; id?: string; triggerTime?: string; error?: string }>
      createScheduledTask: (params: { title: string; message: string; time: string; repeat?: string }) => 
        Promise<{ success: boolean; id?: string; triggerTime?: string; error?: string }>
      listScheduledTasks: () => Promise<{ success: boolean; tasks?: Array<object>; error?: string }>
      cancelScheduledTask: (params: { id: string }) => 
        Promise<{ success: boolean; error?: string }>
      onTaskTriggered: (callback: (task: object) => void) => void
    }
  }
}
