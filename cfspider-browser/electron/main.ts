import { app, BrowserWindow, ipcMain, session, Menu, webContents, dialog, shell, clipboard, Notification, desktopCapturer, nativeImage } from 'electron'
import { join } from 'path'
import { writeFile, mkdir, readdir, access, stat } from 'fs/promises'
import { existsSync } from 'fs'
import https from 'https'
import http from 'http'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let mainWindow: BrowserWindow | null = null
let webviewContents: Electron.WebContents | null = null

function createWindow() {
  // 隐藏菜单栏
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'cfspider-智能浏览器',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  })

  // 开发模式加载本地服务器
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5174')
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 注册快捷键
  registerShortcuts()
}

// 注册快捷键
function registerShortcuts() {
  if (!mainWindow) return

  // 监听快捷键
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F12 - 打开/关闭 webview 的开发者工具（内嵌在底部）
    if (input.key === 'F12') {
      if (webviewContents && !webviewContents.isDestroyed()) {
        if (webviewContents.isDevToolsOpened()) {
          webviewContents.closeDevTools()
        } else {
          // 使用 'bottom' 模式让开发者工具显示在底部，像真实浏览器一样
          webviewContents.openDevTools({ mode: 'bottom' })
        }
      }
      event.preventDefault()
    }
    
    // Ctrl+Shift+I - 打开主窗口开发者工具（调试 Electron 应用本身）
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow?.webContents.openDevTools({ mode: 'right' })
      }
      event.preventDefault()
    }
    
    // F5 或 Ctrl+R - 刷新 webview
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow?.webContents.send('reload-webview')
      event.preventDefault()
    }
    
    // Alt+Left - 后退
    if (input.alt && input.key === 'ArrowLeft') {
      mainWindow?.webContents.send('navigate-back')
      event.preventDefault()
    }
    
    // Alt+Right - 前进
    if (input.alt && input.key === 'ArrowRight') {
      mainWindow?.webContents.send('navigate-forward')
      event.preventDefault()
    }
    
    // Ctrl+L - 聚焦地址栏
    if (input.control && input.key.toLowerCase() === 'l') {
      mainWindow?.webContents.send('focus-addressbar')
      event.preventDefault()
    }
    
    // Ctrl+T - 新建标签页
    if (input.control && input.key.toLowerCase() === 't') {
      mainWindow?.webContents.send('new-tab')
      event.preventDefault()
    }
    
    // Ctrl+W - 关闭当前标签页
    if (input.control && input.key.toLowerCase() === 'w') {
      mainWindow?.webContents.send('close-tab')
      event.preventDefault()
    }
  })
}

app.whenReady().then(() => {
  // 配置 webview 的独立 session（persist: 前缀确保数据持久化到磁盘）
  const webviewSession = session.fromPartition('persist:cfspider')
  
  // 设置 Edge 浏览器的 User-Agent，避免 Bing 显示 Copilot 广告
  // Edge 用户不会看到 Copilot 推广，因为 Edge 本身集成了 Copilot
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
  webviewSession.setUserAgent(userAgent)
  
  // 设置默认 session 的 User-Agent（某些情况会用到）
  session.defaultSession.setUserAgent(userAgent)

  // 移除 X-Frame-Options 和 CSP 限制，允许在 webview 中加载任何网站
  webviewSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    
    // 移除阻止嵌入的响应头
    delete headers['x-frame-options']
    delete headers['X-Frame-Options']
    delete headers['content-security-policy']
    delete headers['Content-Security-Policy']
    delete headers['content-security-policy-report-only']
    delete headers['Content-Security-Policy-Report-Only']
    
    callback({ responseHeaders: headers })
  })

  // 允许所有权限请求
  webviewSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true)
  })

  // 处理 webview 中的新窗口请求
  app.on('web-contents-created', (_event, contents) => {
    // 处理 webview 类型的 webContents
    if (contents.getType() === 'webview') {
      // 保存 webview 的 webContents 引用
      webviewContents = contents
      
      // 拦截新窗口请求，在当前 webview 中打开
      contents.setWindowOpenHandler(({ url }) => {
        // 不允许打开新窗口，改为在当前页面导航
        if (url && !url.startsWith('javascript:')) {
          contents.loadURL(url)
        }
        return { action: 'deny' }
      })
      
      // 当 webview 被销毁时清除引用
      contents.on('destroyed', () => {
        if (webviewContents === contents) {
          webviewContents = null
        }
      })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC 处理：AI API 调用（非流式，用于工具调用）
ipcMain.handle('ai:chat', async (_event, { endpoint, apiKey, model, messages, tools }) => {
  try {
    // 验证 endpoint
    if (!endpoint || typeof endpoint !== 'string') {
      throw new Error('请先配置 API 地址')
    }
    
    // Local/LAN services (Ollama etc.) do not require API Key
    const isLocalEndpoint = (url: string) => {
      return url.includes('localhost') || 
             url.includes('127.0.0.1') ||
             url.includes('192.168.') ||
             url.includes('10.') ||
             /172\.(1[6-9]|2[0-9]|3[01])\./.test(url) ||
             url.includes(':11434')  // Ollama default port
    }
    if (!isLocalEndpoint(endpoint) && (!apiKey || typeof apiKey !== 'string')) {
      throw new Error('请先配置 API Key')
    }

    // 添加超时控制（增加到 180 秒，因为大模型响应可能较慢）
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 180000) // 180秒超时

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          tools,
          stream: false
        }),
        signal: controller.signal
      })

      clearTimeout(timeout)

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`API 错误 ${response.status}: ${errorText.slice(0, 100) || response.statusText}`)
      }

      return await response.json()
    } catch (fetchError) {
      clearTimeout(timeout)
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error('请求超时（180秒），可能原因：\n1. 网络连接不稳定\n2. API 服务器响应慢\n3. 需要科学上网访问该 API')
      }
      throw fetchError
    }
  } catch (error) {
    console.error('AI API error:', error)
    const message = error instanceof Error ? error.message : '未知错误'
    // 友好的错误信息
    if (message.includes('fetch failed') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      throw new Error('网络连接失败，请检查：\n1. 网络是否正常\n2. API 地址是否正确\n3. 是否需要代理')
    }
    throw new Error(message)
  }
})

// IPC 处理：AI API 流式调用
ipcMain.on('ai:chat-stream', async (event, { requestId, endpoint, apiKey, model, messages }) => {
  try {
    // Local/LAN services do not require API Key
    const isLocalEndpoint = (url: string) => {
      return url?.includes('localhost') || 
             url?.includes('127.0.0.1') ||
             url?.includes('192.168.') ||
             url?.includes('10.') ||
             /172\.(1[6-9]|2[0-9]|3[01])\./.test(url || '') ||
             url?.includes(':11434')  // Ollama default port
    }
    if (!endpoint || (!isLocalEndpoint(endpoint) && !apiKey)) {
      event.sender.send('ai:chat-stream-error', { requestId, error: '请先配置 API 地址和 Key' })
      return
    }

    // 添加超时控制（增加到 180 秒）
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 180000)

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          stream: true
        }),
        signal: controller.signal
      })
      clearTimeout(timeout)
    } catch (fetchError) {
      clearTimeout(timeout)
      const msg = fetchError instanceof Error && fetchError.name === 'AbortError' 
        ? '请求超时' 
        : '网络连接失败，请检查网络和 API 配置'
      event.sender.send('ai:chat-stream-error', { requestId, error: msg })
      return
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      event.sender.send('ai:chat-stream-error', { requestId, error: `API 错误 ${response.status}: ${errorText.slice(0, 100) || response.statusText}` })
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      event.sender.send('ai:chat-stream-error', { requestId, error: 'No response body' })
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue

        try {
          const json = JSON.parse(trimmed.slice(6))
          const content = json.choices?.[0]?.delta?.content
          if (content) {
            event.sender.send('ai:chat-stream-data', { requestId, content })
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }

    event.sender.send('ai:chat-stream-end', { requestId })
  } catch (error) {
    console.error('AI stream error:', error)
    event.sender.send('ai:chat-stream-error', { 
      requestId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    })
  }
})

// IPC 处理：保存文件（支持用户自定义路径）
ipcMain.handle('file:save', async (_event, { filename, content, type, isBase64 }) => {
  const fs = await import('fs/promises')

  // 根据类型设置过滤器
  let filters: Electron.FileFilter[]
  switch (type) {
    case 'json':
      filters = [{ name: 'JSON 文件', extensions: ['json'] }]
      break
    case 'csv':
      filters = [{ name: 'CSV 文件', extensions: ['csv'] }]
      break
    case 'excel':
      filters = [{ name: 'Excel 文件', extensions: ['xlsx'] }]
      break
    case 'txt':
      filters = [{ name: '文本文件', extensions: ['txt'] }]
      break
    default:
      filters = [{ name: '所有文件', extensions: ['*'] }]
  }

  // 显示保存对话框让用户选择路径
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: '保存文件',
    defaultPath: filename,
    filters,
    properties: ['showOverwriteConfirmation']
  })

  if (!result.canceled && result.filePath) {
    try {
      // 处理 base64 编码的内容（用于 Excel）
      if (isBase64) {
        const buffer = Buffer.from(content, 'base64')
        await fs.writeFile(result.filePath, buffer)
      } else {
        await fs.writeFile(result.filePath, content, 'utf-8')
      }
      return { success: true, filePath: result.filePath }
    } catch (error) {
      return { success: false, error: `保存失败: ${error}` }
    }
  }
  return { success: false, canceled: true }
})

// IPC 处理：读取保存的规则
ipcMain.handle('rules:load', async () => {
  const fs = await import('fs/promises')
  const rulesPath = join(app.getPath('userData'), 'rules.json')
  
  try {
    const content = await fs.readFile(rulesPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
})

// IPC 处理：保存规则
ipcMain.handle('rules:save', async (_event, rules) => {
  const fs = await import('fs/promises')
  const rulesPath = join(app.getPath('userData'), 'rules.json')
  
  await fs.writeFile(rulesPath, JSON.stringify(rules, null, 2))
  return true
})

// IPC 处理：读取 AI 配置
ipcMain.handle('config:load', async () => {
  const fs = await import('fs/promises')
  const configPath = join(app.getPath('userData'), 'ai-config.json')

  try {
    const content = await fs.readFile(configPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    // 默认使用内置 AI
    return {
      endpoint: '',
      apiKey: '',
      model: '',
      useBuiltIn: true
    }
  }
})

// IPC 处理：保存 AI 配置
ipcMain.handle('config:save', async (_event, config) => {
  const fs = await import('fs/promises')
  const configPath = join(app.getPath('userData'), 'ai-config.json')
  
  await fs.writeFile(configPath, JSON.stringify(config, null, 2))
  return true
})

// IPC 处理：读取已保存的配置列表
ipcMain.handle('saved-configs:load', async () => {
  const fs = await import('fs/promises')
  const configsPath = join(app.getPath('userData'), 'saved-configs.json')
  
  try {
    const content = await fs.readFile(configsPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
})

// IPC 处理：保存配置列表
ipcMain.handle('saved-configs:save', async (_event, configs) => {
  const fs = await import('fs/promises')
  const configsPath = join(app.getPath('userData'), 'saved-configs.json')
  
  await fs.writeFile(configsPath, JSON.stringify(configs, null, 2))
  return true
})

// IPC 处理：读取浏览器设置
ipcMain.handle('browser-settings:load', async () => {
  const fs = await import('fs/promises')
  const settingsPath = join(app.getPath('userData'), 'browser-settings.json')
  
  try {
    const content = await fs.readFile(settingsPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {
      searchEngine: 'bing',
      homepage: 'https://www.bing.com',
      defaultZoom: 100
    }
  }
})

// IPC 处理：保存浏览器设置
ipcMain.handle('browser-settings:save', async (_event, settings) => {
  const fs = await import('fs/promises')
  const settingsPath = join(app.getPath('userData'), 'browser-settings.json')
  
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2))
  return true
})

// IPC 处理：读取历史记录
ipcMain.handle('history:load', async () => {
  const fs = await import('fs/promises')
  const historyPath = join(app.getPath('userData'), 'history.json')
  
  try {
    const content = await fs.readFile(historyPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
})

// IPC 处理：保存历史记录
ipcMain.handle('history:save', async (_event, history) => {
  const fs = await import('fs/promises')
  const historyPath = join(app.getPath('userData'), 'history.json')
  
  await fs.writeFile(historyPath, JSON.stringify(history, null, 2))
  return true
})

// IPC 处理：下载图片
ipcMain.handle('download:image', async (_event, url: string, filename: string) => {
  try {
    // 创建下载目录
    const downloadsPath = join(app.getPath('downloads'), 'cfspider-images')
    if (!existsSync(downloadsPath)) {
      await mkdir(downloadsPath, { recursive: true })
    }
    
    // 从 URL 获取扩展名
    const urlObj = new URL(url)
    let ext = '.jpg'
    const pathExt = urlObj.pathname.split('.').pop()?.toLowerCase()
    if (pathExt && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(pathExt)) {
      ext = `.${pathExt}`
    }
    
    // 清理文件名
    const cleanFilename = filename.replace(/[<>:"/\\|?*]/g, '_')
    const fullFilename = `${cleanFilename}${ext}`
    const filePath = join(downloadsPath, fullFilename)
    
    // 下载图片
    const protocol = url.startsWith('https') ? https : http
    
    return new Promise((resolve) => {
      const request = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/*,*/*;q=0.8',
          'Referer': urlObj.origin
        }
      }, async (response) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            // 递归处理重定向
            const result = await ipcMain.emit('download:image', _event, redirectUrl, filename)
            resolve(result)
            return
          }
        }
        
        if (response.statusCode !== 200) {
          resolve({ success: false, error: `HTTP ${response.statusCode}` })
          return
        }
        
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks)
            await writeFile(filePath, buffer)
            resolve({ 
              success: true, 
              filename: fullFilename,
              path: filePath 
            })
          } catch (writeError) {
            resolve({ success: false, error: `写入失败: ${writeError}` })
          }
        })
        response.on('error', (err) => {
          resolve({ success: false, error: `下载失败: ${err.message}` })
        })
      })
      
      request.on('error', (err) => {
        resolve({ success: false, error: `请求失败: ${err.message}` })
      })
      
      request.setTimeout(30000, () => {
        request.destroy()
        resolve({ success: false, error: '下载超时' })
      })
    })
  } catch (error) {
    return { success: false, error: `下载失败: ${error}` }
  }
})

// IPC 处理：打开下载文件夹
ipcMain.handle('download:openFolder', async () => {
  const { shell } = await import('electron')
  const downloadsPath = join(app.getPath('downloads'), 'cfspider-images')
  if (!existsSync(downloadsPath)) {
    await mkdir(downloadsPath, { recursive: true })
  }
  shell.openPath(downloadsPath)
  return true
})

// IPC 处理：加载学习记忆
ipcMain.handle('learning-memory:load', async () => {
  const fs = await import('fs/promises')
  const memoryPath = join(app.getPath('userData'), 'learning-memory.json')
  
  try {
    const content = await fs.readFile(memoryPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
})

// IPC 处理：保存学习记忆
ipcMain.handle('learning-memory:save', async (_event, memories) => {
  const fs = await import('fs/promises')
  const memoryPath = join(app.getPath('userData'), 'learning-memory.json')
  
  await fs.writeFile(memoryPath, JSON.stringify(memories, null, 2))
  return true
})

// IPC 处理：读取聊天会话历史
ipcMain.handle('chat-sessions:load', async () => {
  const fs = await import('fs/promises')
  const sessionsPath = join(app.getPath('userData'), 'chat-sessions.json')
  
  try {
    const content = await fs.readFile(sessionsPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
})

// IPC 处理：保存聊天会话历史
ipcMain.handle('chat-sessions:save', async (_event, sessions) => {
  const fs = await import('fs/promises')
  const sessionsPath = join(app.getPath('userData'), 'chat-sessions.json')
  
  await fs.writeFile(sessionsPath, JSON.stringify(sessions, null, 2))
  return true
})

// ==================== 系统操作 API ====================

// 常见应用程序路径映射（Windows）
const APP_PATHS: Record<string, string[]> = {
  // 浏览器
  'chrome': ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'],
  'edge': ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'],
  'firefox': ['C:\\Program Files\\Mozilla Firefox\\firefox.exe', 'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'],
  
  // 视频/音乐 - B站客户端多个可能路径
  'bilibili': [
    '%LOCALAPPDATA%\\bilibili\\哔哩哔哩.exe',
    '%LOCALAPPDATA%\\Programs\\bilibili\\哔哩哔哩.exe',
    '%APPDATA%\\bilibili\\哔哩哔哩.exe',
    '%LOCALAPPDATA%\\bilibili\\app\\哔哩哔哩.exe',
    'C:\\Program Files\\bilibili\\哔哩哔哩.exe',
    'C:\\Program Files (x86)\\bilibili\\哔哩哔哩.exe',
  ],
  'b站': [
    '%LOCALAPPDATA%\\bilibili\\哔哩哔哩.exe',
    '%LOCALAPPDATA%\\Programs\\bilibili\\哔哩哔哩.exe',
  ],
  '哔哩哔哩': [
    '%LOCALAPPDATA%\\bilibili\\哔哩哔哩.exe',
    '%LOCALAPPDATA%\\Programs\\bilibili\\哔哩哔哩.exe',
  ],
  'potplayer': ['C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe', 'C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini.exe'],
  'vlc': ['C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'],
  'qqmusic': ['%LOCALAPPDATA%\\QQMusic\\QQMusic.exe', 'C:\\Program Files (x86)\\Tencent\\QQMusic\\QQMusic.exe'],
  'neteasemusic': ['%LOCALAPPDATA%\\NetEase\\CloudMusic\\cloudmusic.exe'],
  
  // 社交/通讯
  'wechat': ['C:\\Program Files\\Tencent\\WeChat\\WeChat.exe', 'C:\\Program Files (x86)\\Tencent\\WeChat\\WeChat.exe'],
  'qq': ['C:\\Program Files\\Tencent\\QQ\\Bin\\QQ.exe', 'C:\\Program Files (x86)\\Tencent\\QQ\\Bin\\QQ.exe'],
  'dingtalk': ['%LOCALAPPDATA%\\DingDing\\DingDing.exe'],
  'telegram': ['%APPDATA%\\Telegram Desktop\\Telegram.exe'],
  
  // 开发工具
  'vscode': ['%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe', 'C:\\Program Files\\Microsoft VS Code\\Code.exe'],
  'cursor': ['%LOCALAPPDATA%\\Programs\\cursor\\Cursor.exe'],
  'idea': ['C:\\Program Files\\JetBrains\\IntelliJ IDEA\\bin\\idea64.exe'],
  'pycharm': ['C:\\Program Files\\JetBrains\\PyCharm\\bin\\pycharm64.exe'],
  
  // 办公
  'word': ['C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE', 'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\WINWORD.EXE'],
  'excel': ['C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE', 'C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\EXCEL.EXE'],
  'powerpoint': ['C:\\Program Files\\Microsoft Office\\root\\Office16\\POWERPNT.EXE'],
  'notepad': ['C:\\Windows\\System32\\notepad.exe'],
  
  // 系统工具
  'cmd': ['C:\\Windows\\System32\\cmd.exe'],
  'powershell': ['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'],
  'explorer': ['C:\\Windows\\explorer.exe'],
  'calculator': ['calc.exe'],
  'settings': ['ms-settings:'],
}

// 展开环境变量
function expandEnvVars(path: string): string {
  return path.replace(/%([^%]+)%/g, (_, key) => process.env[key] || '')
}

// 检查文件是否存在
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(expandEnvVars(path))
    return true
  } catch {
    return false
  }
}

// IPC 处理：检查应用是否安装
ipcMain.handle('system:check-app', async (_event, appName: string) => {
  const normalizedName = appName.toLowerCase().replace(/\s+/g, '')
  const paths = APP_PATHS[normalizedName] || []
  
  for (const path of paths) {
    if (await fileExists(path)) {
      return { installed: true, path: expandEnvVars(path) }
    }
  }
  
  // 尝试通过 where 命令查找
  try {
    const { stdout } = await execAsync(`where ${normalizedName}`, { timeout: 5000 })
    if (stdout.trim()) {
      return { installed: true, path: stdout.trim().split('\n')[0] }
    }
  } catch {
    // 命令失败，应用未找到
  }
  
  // 尝试在开始菜单中搜索
  try {
    const startMenuPaths = [
      join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs'),
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
    ]
    
    for (const menuPath of startMenuPaths) {
      try {
        const files = await readdir(menuPath, { recursive: true })
        const match = files.find(f => 
          f.toLowerCase().includes(normalizedName) && f.endsWith('.lnk')
        )
        if (match) {
          return { installed: true, path: join(menuPath, match as string), isShortcut: true }
        }
      } catch {
        // 目录读取失败，继续
      }
    }
  } catch {
    // 搜索失败
  }
  
  return { installed: false }
})

// IPC 处理：运行应用程序
ipcMain.handle('system:run-app', async (_event, params: { 
  appName?: string; 
  path?: string; 
  args?: string[];
  url?: string;
}) => {
  try {
    const { appName, path: appPath, args = [], url } = params
    
    // 如果提供了 URL，使用默认浏览器打开
    if (url) {
      await shell.openExternal(url)
      return { success: true, message: 'URL opened in default browser' }
    }
    
    let targetPath = appPath
    
    // 如果提供了应用名称，查找路径
    if (appName && !targetPath) {
      const normalizedName = appName.toLowerCase().replace(/\s+/g, '')
      const paths = APP_PATHS[normalizedName] || []
      
      for (const p of paths) {
        if (await fileExists(p)) {
          targetPath = expandEnvVars(p)
          break
        }
      }
      
      // 如果是特殊协议（如 ms-settings:）
      if (!targetPath && paths.length > 0 && paths[0].includes(':')) {
        await shell.openExternal(paths[0])
        return { success: true, message: 'Opened ' + appName }
      }
    }
    
    if (!targetPath) {
      return { success: false, error: 'Application not found: ' + (appName || appPath) }
    }
    
    // 展开环境变量
    targetPath = expandEnvVars(targetPath)
    
    // 如果是快捷方式，使用 shell.openPath
    if (targetPath.endsWith('.lnk')) {
      await shell.openPath(targetPath)
      return { success: true, message: 'Launched via shortcut' }
    }
    
    // 启动应用程序
    const child = spawn(targetPath, args, {
      detached: true,
      stdio: 'ignore',
      shell: true
    })
    child.unref()
    
    return { success: true, message: 'Launched ' + (appName || targetPath), pid: child.pid }
  } catch (error) {
    return { success: false, error: 'Failed to launch: ' + error }
  }
})

// IPC 处理：打开文件或文件夹
ipcMain.handle('system:open-path', async (_event, path: string) => {
  try {
    const result = await shell.openPath(expandEnvVars(path))
    if (result) {
      return { success: false, error: result }
    }
    return { success: true }
  } catch (error) {
    return { success: false, error: 'Failed to open: ' + error }
  }
})

// IPC 处理：运行系统命令
ipcMain.handle('system:run-command', async (_event, params: {
  command: string;
  cwd?: string;
  timeout?: number;
}) => {
  try {
    const { command, cwd, timeout = 30000 } = params
    
    // 安全检查：禁止危险命令
    const dangerousPatterns = [
      /\brm\s+-rf\s+[\/\\]/i,
      /\bformat\s+[a-z]:/i,
      /\bdel\s+\/[sf]/i,
      /\bshutdown\b/i,
      /\bregedit\b/i,
    ]
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return { success: false, error: 'Dangerous command blocked for safety' }
      }
    }
    
    const { stdout, stderr } = await execAsync(command, { 
      cwd: cwd ? expandEnvVars(cwd) : undefined,
      timeout,
      windowsHide: true
    })
    
    return { 
      success: true, 
      stdout: stdout.slice(0, 5000), // 限制输出大小
      stderr: stderr.slice(0, 1000)
    }
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || 'Command failed',
      stdout: error.stdout?.slice(0, 2000),
      stderr: error.stderr?.slice(0, 1000)
    }
  }
})

// IPC 处理：列出已安装的常见应用
ipcMain.handle('system:list-apps', async () => {
  const installedApps: Array<{ name: string; path: string }> = []
  
  for (const [name, paths] of Object.entries(APP_PATHS)) {
    for (const path of paths) {
      if (await fileExists(path)) {
        installedApps.push({ name, path: expandEnvVars(path) })
        break
      }
    }
  }
  
  return installedApps
})

// IPC 处理：获取系统信息
ipcMain.handle('system:info', async () => {
  const os = await import('os')
  return {
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    username: os.userInfo().username,
    homedir: os.homedir(),
    tmpdir: os.tmpdir(),
    cpus: os.cpus().length,
    memory: {
      total: os.totalmem(),
      free: os.freemem()
    }
  }
})

// ==================== 键盘鼠标模拟 API ====================

// PowerShell 脚本模板
const PS_MOUSE_SETUP = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);
    
    public struct POINT { public int X; public int Y; }
    
    public const int MOUSEEVENTF_LEFTDOWN = 0x02;
    public const int MOUSEEVENTF_LEFTUP = 0x04;
    public const int MOUSEEVENTF_RIGHTDOWN = 0x08;
    public const int MOUSEEVENTF_RIGHTUP = 0x10;
    public const int MOUSEEVENTF_MIDDLEDOWN = 0x20;
    public const int MOUSEEVENTF_MIDDLEUP = 0x40;
}
"@
`

// IPC 处理：模拟键盘输入（逐字打字）
ipcMain.handle('input:type-text', async (_event, params: {
  text: string;
  delay?: number;  // 每个字符之间的延迟（毫秒）
}) => {
  try {
    const { text, delay = 50 } = params
    
    // 使用 PowerShell 的 SendKeys
    // 需要转义特殊字符
    const escapedText = text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '`$')
      .replace(/\+/g, '{+}')
      .replace(/\^/g, '{^}')
      .replace(/%/g, '{%}')
      .replace(/~/g, '{~}')
      .replace(/\(/g, '{(}')
      .replace(/\)/g, '{)}')
      .replace(/\[/g, '{[}')
      .replace(/\]/g, '{]}')
      .replace(/\{/g, '{{}')
      .replace(/\}/g, '{}}')
    
    // 逐字符输入以实现打字效果
    const chars = [...text]
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i]
      let sendChar = char
        .replace(/\+/g, '{+}')
        .replace(/\^/g, '{^}')
        .replace(/%/g, '{%}')
        .replace(/~/g, '{~}')
        .replace(/\(/g, '{(}')
        .replace(/\)/g, '{)}')
        .replace(/\[/g, '{[}')
        .replace(/\]/g, '{]}')
        .replace(/\{/g, '{{}')
        .replace(/\}/g, '{}}')
      
      // 处理换行
      if (char === '\n') {
        sendChar = '{ENTER}'
      } else if (char === '\t') {
        sendChar = '{TAB}'
      }
      
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait("${sendChar.replace(/"/g, '`"')}")
      `
      
      await execAsync(`powershell -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        windowsHide: true,
        timeout: 5000
      })
      
      // 添加延迟模拟真人打字
      if (delay > 0 && i < chars.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay + Math.random() * 30))
      }
    }
    
    return { success: true, typed: text.length }
  } catch (error) {
    return { success: false, error: 'Type failed: ' + error }
  }
})

// IPC 处理：按下特定按键
ipcMain.handle('input:press-key', async (_event, params: {
  key: string;  // 如 'enter', 'tab', 'escape', 'ctrl+s', 'alt+f4' 等
}) => {
  try {
    const { key } = params
    
    // 按键映射
    const keyMap: Record<string, string> = {
      'enter': '{ENTER}',
      'tab': '{TAB}',
      'escape': '{ESC}',
      'esc': '{ESC}',
      'backspace': '{BACKSPACE}',
      'delete': '{DELETE}',
      'del': '{DELETE}',
      'home': '{HOME}',
      'end': '{END}',
      'pageup': '{PGUP}',
      'pagedown': '{PGDN}',
      'up': '{UP}',
      'down': '{DOWN}',
      'left': '{LEFT}',
      'right': '{RIGHT}',
      'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}',
      'f5': '{F5}', 'f6': '{F6}', 'f7': '{F7}', 'f8': '{F8}',
      'f9': '{F9}', 'f10': '{F10}', 'f11': '{F11}', 'f12': '{F12}',
      'space': ' ',
    }
    
    let sendKey = key.toLowerCase()
    
    // 处理组合键 (ctrl+s, alt+f4 等)
    if (sendKey.includes('+')) {
      const parts = sendKey.split('+')
      let prefix = ''
      let mainKey = parts[parts.length - 1]
      
      for (let i = 0; i < parts.length - 1; i++) {
        const mod = parts[i].toLowerCase()
        if (mod === 'ctrl' || mod === 'control') prefix += '^'
        else if (mod === 'alt') prefix += '%'
        else if (mod === 'shift') prefix += '+'
      }
      
      mainKey = keyMap[mainKey] || mainKey.toUpperCase()
      sendKey = prefix + mainKey
    } else {
      sendKey = keyMap[sendKey] || sendKey
    }
    
    const script = `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SendKeys]::SendWait("${sendKey}")
    `
    
    await execAsync(`powershell -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      windowsHide: true,
      timeout: 5000
    })
    
    return { success: true, key: sendKey }
  } catch (error) {
    return { success: false, error: 'Key press failed: ' + error }
  }
})

// IPC 处理：鼠标点击
ipcMain.handle('input:mouse-click', async (_event, params: {
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle';
  clicks?: number;  // 1=单击, 2=双击
}) => {
  try {
    const { x, y, button = 'left', clicks = 1 } = params
    
    let downFlag = 0x02  // MOUSEEVENTF_LEFTDOWN
    let upFlag = 0x04    // MOUSEEVENTF_LEFTUP
    
    if (button === 'right') {
      downFlag = 0x08  // MOUSEEVENTF_RIGHTDOWN
      upFlag = 0x10    // MOUSEEVENTF_RIGHTUP
    } else if (button === 'middle') {
      downFlag = 0x20  // MOUSEEVENTF_MIDDLEDOWN
      upFlag = 0x40    // MOUSEEVENTF_MIDDLEUP
    }
    
    const clickScript = `
      ${PS_MOUSE_SETUP}
      [MouseOps]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
      Start-Sleep -Milliseconds 50
      ${Array(clicks).fill(`
        [MouseOps]::mouse_event(${downFlag}, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 30
        [MouseOps]::mouse_event(${upFlag}, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 50
      `).join('')}
    `
    
    await execAsync(`powershell -Command "${clickScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      windowsHide: true,
      timeout: 10000
    })
    
    return { success: true, x, y, button, clicks }
  } catch (error) {
    return { success: false, error: 'Mouse click failed: ' + error }
  }
})

// IPC 处理：移动鼠标
ipcMain.handle('input:mouse-move', async (_event, params: {
  x: number;
  y: number;
  smooth?: boolean;  // 是否平滑移动
}) => {
  try {
    const { x, y, smooth = true } = params
    
    if (smooth) {
      // 平滑移动 - 获取当前位置，分步移动
      const script = `
        ${PS_MOUSE_SETUP}
        $point = New-Object MouseOps+POINT
        [MouseOps]::GetCursorPos([ref]$point)
        $startX = $point.X
        $startY = $point.Y
        $endX = ${Math.round(x)}
        $endY = ${Math.round(y)}
        $steps = 20
        for ($i = 1; $i -le $steps; $i++) {
          $curX = [int]($startX + ($endX - $startX) * $i / $steps)
          $curY = [int]($startY + ($endY - $startY) * $i / $steps)
          [MouseOps]::SetCursorPos($curX, $curY)
          Start-Sleep -Milliseconds 10
        }
      `
      await execAsync(`powershell -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        windowsHide: true,
        timeout: 10000
      })
    } else {
      const script = `
        ${PS_MOUSE_SETUP}
        [MouseOps]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
      `
      await execAsync(`powershell -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        windowsHide: true,
        timeout: 5000
      })
    }
    
    return { success: true, x, y }
  } catch (error) {
    return { success: false, error: 'Mouse move failed: ' + error }
  }
})

// IPC 处理：鼠标拖拽
ipcMain.handle('input:mouse-drag', async (_event, params: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}) => {
  try {
    const { fromX, fromY, toX, toY } = params
    
    const script = `
      ${PS_MOUSE_SETUP}
      [MouseOps]::SetCursorPos(${Math.round(fromX)}, ${Math.round(fromY)})
      Start-Sleep -Milliseconds 100
      [MouseOps]::mouse_event(0x02, 0, 0, 0, 0)
      Start-Sleep -Milliseconds 50
      
      $steps = 20
      for ($i = 1; $i -le $steps; $i++) {
        $curX = [int](${Math.round(fromX)} + (${Math.round(toX)} - ${Math.round(fromX)}) * $i / $steps)
        $curY = [int](${Math.round(fromY)} + (${Math.round(toY)} - ${Math.round(fromY)}) * $i / $steps)
        [MouseOps]::SetCursorPos($curX, $curY)
        Start-Sleep -Milliseconds 15
      }
      
      Start-Sleep -Milliseconds 50
      [MouseOps]::mouse_event(0x04, 0, 0, 0, 0)
    `
    
    await execAsync(`powershell -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      windowsHide: true,
      timeout: 15000
    })
    
    return { success: true, from: { x: fromX, y: fromY }, to: { x: toX, y: toY } }
  } catch (error) {
    return { success: false, error: 'Mouse drag failed: ' + error }
  }
})

// IPC 处理：激活/聚焦窗口
ipcMain.handle('input:focus-window', async (_event, params: {
  title?: string;   // 窗口标题（模糊匹配）
  process?: string; // 进程名
}) => {
  try {
    const { title, process: processName } = params
    
    let script = ''
    if (title) {
      script = `
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
        $windows = Get-Process | Where-Object { $_.MainWindowTitle -like "*${title.replace(/"/g, '`"')}*" }
        if ($windows.Count -gt 0) {
          $hwnd = $windows[0].MainWindowHandle
          [WinAPI]::ShowWindow($hwnd, 9)
          [WinAPI]::SetForegroundWindow($hwnd)
          Write-Output "Focused: $($windows[0].MainWindowTitle)"
        } else {
          Write-Output "Window not found"
        }
      `
    } else if (processName) {
      script = `
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
        $proc = Get-Process -Name "${processName.replace(/"/g, '`"')}" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($proc -and $proc.MainWindowHandle -ne 0) {
          [WinAPI]::ShowWindow($proc.MainWindowHandle, 9)
          [WinAPI]::SetForegroundWindow($proc.MainWindowHandle)
          Write-Output "Focused: $($proc.ProcessName)"
        } else {
          Write-Output "Process not found or no window"
        }
      `
    } else {
      return { success: false, error: 'Must provide title or process name' }
    }
    
    const { stdout } = await execAsync(`powershell -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      windowsHide: true,
      timeout: 10000
    })
    
    const focused = !stdout.includes('not found')
    return { success: focused, message: stdout.trim() }
  } catch (error) {
    return { success: false, error: 'Focus window failed: ' + error }
  }
})

// IPC 处理：获取鼠标当前位置
ipcMain.handle('input:get-mouse-pos', async () => {
  try {
    const script = `
      ${PS_MOUSE_SETUP}
      $point = New-Object MouseOps+POINT
      [MouseOps]::GetCursorPos([ref]$point)
      Write-Output "$($point.X),$($point.Y)"
    `
    
    const { stdout } = await execAsync(`powershell -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      windowsHide: true,
      timeout: 5000
    })
    
    const [x, y] = stdout.trim().split(',').map(Number)
    return { success: true, x, y }
  } catch (error) {
    return { success: false, error: 'Get mouse pos failed: ' + error }
  }
})

// ==================== 剪贴板 API ====================

// IPC 处理：读取剪贴板
ipcMain.handle('clipboard:read', async () => {
  try {
    // 尝试读取文本
    const text = clipboard.readText()
    if (text) {
      return { success: true, type: 'text', content: text }
    }
    
    // 尝试读取图片
    const image = clipboard.readImage()
    if (!image.isEmpty()) {
      const base64 = image.toDataURL()
      return { success: true, type: 'image', content: base64, size: image.getSize() }
    }
    
    // 尝试读取 HTML
    const html = clipboard.readHTML()
    if (html) {
      return { success: true, type: 'html', content: html }
    }
    
    return { success: true, type: 'empty', content: '' }
  } catch (error) {
    return { success: false, error: 'Read clipboard failed: ' + error }
  }
})

// IPC 处理：写入剪贴板
ipcMain.handle('clipboard:write', async (_event, params: {
  text?: string;
  html?: string;
  image?: string;  // base64 data URL
}) => {
  try {
    const { text, html, image } = params
    
    if (image) {
      const img = nativeImage.createFromDataURL(image)
      clipboard.writeImage(img)
      return { success: true, type: 'image' }
    }
    
    if (html) {
      clipboard.writeHTML(html)
      return { success: true, type: 'html' }
    }
    
    if (text) {
      clipboard.writeText(text)
      return { success: true, type: 'text' }
    }
    
    return { success: false, error: 'No content provided' }
  } catch (error) {
    return { success: false, error: 'Write clipboard failed: ' + error }
  }
})

// ==================== 系统通知 API ====================

// IPC 处理：发送系统通知
ipcMain.handle('notify:send', async (_event, params: {
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
}) => {
  try {
    const { title, body, icon, silent = false } = params
    
    const notification = new Notification({
      title,
      body,
      icon: icon || undefined,
      silent
    })
    
    notification.show()
    
    return { success: true }
  } catch (error) {
    return { success: false, error: 'Send notification failed: ' + error }
  }
})

// ==================== 文件系统 API ====================

// 安全路径检查
function isPathSafe(targetPath: string): boolean {
  const dangerous = [
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\ProgramData',
    'C:\\$',
    'System32',
  ]
  const normalized = targetPath.replace(/\//g, '\\')
  return !dangerous.some(d => normalized.toLowerCase().startsWith(d.toLowerCase()))
}

// IPC 处理：读取文件
ipcMain.handle('fs:read-file', async (_event, params: {
  path: string;
  encoding?: string;
}) => {
  try {
    const fs = await import('fs/promises')
    const { path: filePath, encoding = 'utf-8' } = params
    
    const expandedPath = expandEnvVars(filePath)
    const content = await fs.readFile(expandedPath, encoding as BufferEncoding)
    
    return { success: true, content, path: expandedPath }
  } catch (error) {
    return { success: false, error: 'Read file failed: ' + error }
  }
})

// IPC 处理：写入文件
ipcMain.handle('fs:write-file', async (_event, params: {
  path: string;
  content: string;
  encoding?: string;
}) => {
  try {
    const fs = await import('fs/promises')
    const { path: filePath, content, encoding = 'utf-8' } = params
    
    const expandedPath = expandEnvVars(filePath)
    
    // 安全检查
    if (!isPathSafe(expandedPath)) {
      return { success: false, error: 'Cannot write to system directory' }
    }
    
    // 确保目录存在
    const dir = expandedPath.substring(0, expandedPath.lastIndexOf('\\'))
    await fs.mkdir(dir, { recursive: true }).catch(() => {})
    
    await fs.writeFile(expandedPath, content, encoding as BufferEncoding)
    
    return { success: true, path: expandedPath }
  } catch (error) {
    return { success: false, error: 'Write file failed: ' + error }
  }
})

// IPC 处理：列出目录
ipcMain.handle('fs:list-directory', async (_event, params: {
  path: string;
  recursive?: boolean;
}) => {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const { path: dirPath, recursive = false } = params
    
    const expandedPath = expandEnvVars(dirPath)
    const entries = await fs.readdir(expandedPath, { withFileTypes: true })
    
    const items = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(expandedPath, entry.name)
      let stats = null
      try {
        stats = await fs.stat(fullPath)
      } catch {}
      
      return {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        size: stats?.size || 0,
        modified: stats?.mtime?.toISOString() || ''
      }
    }))
    
    return { success: true, items, path: expandedPath }
  } catch (error) {
    return { success: false, error: 'List directory failed: ' + error }
  }
})

// IPC 处理：创建目录
ipcMain.handle('fs:create-directory', async (_event, params: { path: string }) => {
  try {
    const fs = await import('fs/promises')
    const expandedPath = expandEnvVars(params.path)
    
    if (!isPathSafe(expandedPath)) {
      return { success: false, error: 'Cannot create directory in system location' }
    }
    
    await fs.mkdir(expandedPath, { recursive: true })
    return { success: true, path: expandedPath }
  } catch (error) {
    return { success: false, error: 'Create directory failed: ' + error }
  }
})

// IPC 处理：删除文件/目录
ipcMain.handle('fs:delete', async (_event, params: { path: string; recursive?: boolean }) => {
  try {
    const fs = await import('fs/promises')
    const expandedPath = expandEnvVars(params.path)
    
    if (!isPathSafe(expandedPath)) {
      return { success: false, error: 'Cannot delete system files' }
    }
    
    await fs.rm(expandedPath, { recursive: params.recursive || false })
    return { success: true, path: expandedPath }
  } catch (error) {
    return { success: false, error: 'Delete failed: ' + error }
  }
})

// IPC 处理：移动/重命名文件
ipcMain.handle('fs:move', async (_event, params: { from: string; to: string }) => {
  try {
    const fs = await import('fs/promises')
    const fromPath = expandEnvVars(params.from)
    const toPath = expandEnvVars(params.to)
    
    if (!isPathSafe(toPath)) {
      return { success: false, error: 'Cannot move to system location' }
    }
    
    await fs.rename(fromPath, toPath)
    return { success: true, from: fromPath, to: toPath }
  } catch (error) {
    return { success: false, error: 'Move failed: ' + error }
  }
})

// IPC 处理：搜索文件
ipcMain.handle('fs:search', async (_event, params: {
  path: string;
  pattern: string;
  maxResults?: number;
}) => {
  try {
    const { path: searchPath, pattern, maxResults = 100 } = params
    const expandedPath = expandEnvVars(searchPath)
    
    // 使用 PowerShell 搜索
    const script = `Get-ChildItem -Path "${expandedPath}" -Recurse -Filter "${pattern}" -ErrorAction SilentlyContinue | Select-Object -First ${maxResults} | ForEach-Object { $_.FullName }`
    
    const { stdout } = await execAsync(`powershell -Command "${script}"`, {
      windowsHide: true,
      timeout: 30000
    })
    
    const files = stdout.trim().split('\n').filter(f => f.trim())
    return { success: true, files, count: files.length }
  } catch (error) {
    return { success: false, error: 'Search failed: ' + error }
  }
})

// IPC 处理：获取文件信息
ipcMain.handle('fs:get-info', async (_event, params: { path: string }) => {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const expandedPath = expandEnvVars(params.path)
    
    const stats = await fs.stat(expandedPath)
    
    return {
      success: true,
      info: {
        path: expandedPath,
        name: path.basename(expandedPath),
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        size: stats.size,
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString()
      }
    }
  } catch (error) {
    return { success: false, error: 'Get info failed: ' + error }
  }
})

// ==================== 进程管理 API ====================

// IPC 处理：列出进程
ipcMain.handle('process:list', async () => {
  try {
    const { stdout } = await execAsync('tasklist /FO CSV /NH', {
      windowsHide: true,
      timeout: 10000
    })
    
    const processes = stdout.trim().split('\n').map(line => {
      const parts = line.split('","').map(p => p.replace(/"/g, ''))
      return {
        name: parts[0],
        pid: parseInt(parts[1]) || 0,
        memory: parts[4] || ''
      }
    }).filter(p => p.pid > 0)
    
    return { success: true, processes }
  } catch (error) {
    return { success: false, error: 'List processes failed: ' + error }
  }
})

// IPC 处理：结束进程
ipcMain.handle('process:kill', async (_event, params: { pid?: number; name?: string }) => {
  try {
    const { pid, name } = params
    
    // 安全检查 - 禁止杀死系统进程
    const protectedProcesses = ['explorer', 'csrss', 'winlogon', 'services', 'lsass', 'svchost']
    if (name && protectedProcesses.some(p => name.toLowerCase().includes(p))) {
      return { success: false, error: 'Cannot kill system process' }
    }
    
    let cmd = ''
    if (pid) {
      cmd = `taskkill /PID ${pid} /F`
    } else if (name) {
      cmd = `taskkill /IM "${name}" /F`
    } else {
      return { success: false, error: 'Must provide PID or process name' }
    }
    
    await execAsync(cmd, { windowsHide: true, timeout: 10000 })
    return { success: true }
  } catch (error) {
    return { success: false, error: 'Kill process failed: ' + error }
  }
})

// IPC 处理：获取系统资源使用情况
ipcMain.handle('process:usage', async () => {
  try {
    const os = await import('os')
    
    // CPU 使用率（简化版）
    const cpus = os.cpus()
    let totalIdle = 0
    let totalTick = 0
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type]
      }
      totalIdle += cpu.times.idle
    }
    const cpuUsage = 100 - (totalIdle / totalTick * 100)
    
    // 内存使用
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const memUsage = (usedMem / totalMem) * 100
    
    return {
      success: true,
      cpu: {
        usage: Math.round(cpuUsage),
        cores: cpus.length
      },
      memory: {
        total: Math.round(totalMem / 1024 / 1024 / 1024 * 10) / 10,
        used: Math.round(usedMem / 1024 / 1024 / 1024 * 10) / 10,
        free: Math.round(freeMem / 1024 / 1024 / 1024 * 10) / 10,
        usage: Math.round(memUsage)
      }
    }
  } catch (error) {
    return { success: false, error: 'Get usage failed: ' + error }
  }
})

// ==================== 屏幕截图 API ====================

// IPC 处理：截取屏幕
ipcMain.handle('screen:capture', async () => {
  try {
    // 首先尝试使用 desktopCapturer
    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      })
      
      if (sources.length > 0) {
        const source = sources[0]
        const image = source.thumbnail
        if (!image.isEmpty()) {
          const base64 = image.toDataURL()
          const size = image.getSize()
          
          return { 
            success: true, 
            image: base64, 
            size,
            name: source.name
          }
        }
      }
    } catch (e) {
      console.log('[CFSpider] desktopCapturer failed, trying PowerShell:', e)
    }
    
    // 备选方案：使用 PowerShell 截图
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')
    
    const tempPath = path.join(os.tmpdir(), 'cfspider_screenshot_' + Date.now() + '.png')
    
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen
      $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
      $bitmap.Save("${tempPath.replace(/\\/g, '\\\\')}")
      $graphics.Dispose()
      $bitmap.Dispose()
      Write-Output "$($screen.Bounds.Width),$($screen.Bounds.Height)"
    `
    
    const { stdout } = await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      windowsHide: true,
      timeout: 15000
    })
    
    // 读取截图文件
    const imageBuffer = await fs.readFile(tempPath)
    const base64 = 'data:image/png;base64,' + imageBuffer.toString('base64')
    
    // 解析尺寸
    const [width, height] = stdout.trim().split(',').map(Number)
    
    // 删除临时文件
    await fs.unlink(tempPath).catch(() => {})
    
    return { 
      success: true, 
      image: base64, 
      size: { width, height },
      name: 'Screen (PowerShell)'
    }
  } catch (error) {
    return { success: false, error: 'Screen capture failed: ' + error }
  }
})

// IPC 处理：列出窗口
ipcMain.handle('screen:list-windows', async () => {
  try {
    const sources = await desktopCapturer.getSources({ 
      types: ['window'],
      thumbnailSize: { width: 200, height: 150 }
    })
    
    const windows = sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL()
    }))
    
    return { success: true, windows }
  } catch (error) {
    return { success: false, error: 'List windows failed: ' + error }
  }
})

// IPC 处理：截取指定窗口
ipcMain.handle('screen:capture-window', async (_event, params: { name: string }) => {
  try {
    // 首先尝试使用 desktopCapturer
    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['window'],
        thumbnailSize: { width: 1920, height: 1080 }
      })
      
      const source = sources.find(s => s.name.toLowerCase().includes(params.name.toLowerCase()))
      
      if (source && !source.thumbnail.isEmpty()) {
        const image = source.thumbnail
        const base64 = image.toDataURL()
        const size = image.getSize()
        
        return { 
          success: true, 
          image: base64, 
          size,
          name: source.name
        }
      }
    } catch (e) {
      console.log('[CFSpider] desktopCapturer for window failed:', e)
    }
    
    // 备选方案：先激活窗口，再截取整个屏幕
    // 激活窗口
    const focusScript = `
      Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinAPI {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
      $windows = Get-Process | Where-Object { $_.MainWindowTitle -like "*${params.name.replace(/"/g, '`"')}*" }
      if ($windows.Count -gt 0) {
        $hwnd = $windows[0].MainWindowHandle
        [WinAPI]::ShowWindow($hwnd, 9)
        [WinAPI]::SetForegroundWindow($hwnd)
        Write-Output $windows[0].MainWindowTitle
      } else {
        Write-Output "NOT_FOUND"
      }
    `
    
    const { stdout: focusResult } = await execAsync(`powershell -Command "${focusScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      windowsHide: true,
      timeout: 5000
    })
    
    if (focusResult.trim() === 'NOT_FOUND') {
      return { success: false, error: 'Window not found: ' + params.name }
    }
    
    // 等待窗口激活
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // 截取当前屏幕（窗口已在前台）
    const fs = await import('fs/promises')
    const path = await import('path')
    const os = await import('os')
    
    const tempPath = path.join(os.tmpdir(), 'cfspider_window_' + Date.now() + '.png')
    
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $screen = [System.Windows.Forms.Screen]::PrimaryScreen
      $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
      $bitmap.Save("${tempPath.replace(/\\/g, '\\\\')}")
      $graphics.Dispose()
      $bitmap.Dispose()
      Write-Output "$($screen.Bounds.Width),$($screen.Bounds.Height)"
    `
    
    const { stdout } = await execAsync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      windowsHide: true,
      timeout: 15000
    })
    
    const imageBuffer = await fs.readFile(tempPath)
    const base64 = 'data:image/png;base64,' + imageBuffer.toString('base64')
    const [width, height] = stdout.trim().split(',').map(Number)
    
    await fs.unlink(tempPath).catch(() => {})
    
    return { 
      success: true, 
      image: base64, 
      size: { width, height },
      name: focusResult.trim()
    }
  } catch (error) {
    return { success: false, error: 'Capture window failed: ' + error }
  }
})

// ==================== 定时任务 API ====================

interface ScheduledTask {
  id: string
  type: 'reminder' | 'scheduled'
  title: string
  message: string
  triggerTime: number  // Unix timestamp
  interval?: number    // 重复间隔（毫秒），0 表示不重复
  created: number
  active: boolean
}

// 内存中的任务列表
let scheduledTasks: ScheduledTask[] = []
const taskTimers: Map<string, NodeJS.Timeout> = new Map()

// 加载保存的任务
async function loadScheduledTasks() {
  try {
    const fs = await import('fs/promises')
    const tasksPath = join(app.getPath('userData'), 'scheduled-tasks.json')
    const content = await fs.readFile(tasksPath, 'utf-8')
    scheduledTasks = JSON.parse(content)
    
    // 恢复活动的任务
    for (const task of scheduledTasks) {
      if (task.active) {
        scheduleTask(task)
      }
    }
    
    console.log('[CFSpider] Loaded', scheduledTasks.length, 'scheduled tasks')
  } catch {
    scheduledTasks = []
  }
}

// 保存任务
async function saveScheduledTasks() {
  try {
    const fs = await import('fs/promises')
    const tasksPath = join(app.getPath('userData'), 'scheduled-tasks.json')
    await fs.writeFile(tasksPath, JSON.stringify(scheduledTasks, null, 2))
  } catch (e) {
    console.error('[CFSpider] Save tasks failed:', e)
  }
}

// 调度单个任务
function scheduleTask(task: ScheduledTask) {
  // 清除旧的定时器
  const existingTimer = taskTimers.get(task.id)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }
  
  const now = Date.now()
  let delay = task.triggerTime - now
  
  // 如果时间已过，对于重复任务计算下一次触发时间
  if (delay < 0) {
    if (task.interval && task.interval > 0) {
      // 计算下一次触发时间
      const missedIntervals = Math.ceil(-delay / task.interval)
      task.triggerTime += missedIntervals * task.interval
      delay = task.triggerTime - now
    } else {
      // 非重复任务已过期，标记为不活动
      task.active = false
      saveScheduledTasks()
      return
    }
  }
  
  const timer = setTimeout(() => {
    // 触发任务 - 发送通知
    const notification = new Notification({
      title: task.title,
      body: task.message
    })
    notification.show()
    
    // 通知渲染进程
    if (mainWindow) {
      mainWindow.webContents.send('task:triggered', task)
    }
    
    // 如果是重复任务，重新调度
    if (task.interval && task.interval > 0) {
      task.triggerTime += task.interval
      scheduleTask(task)
      saveScheduledTasks()
    } else {
      // 非重复任务，标记为不活动
      task.active = false
      taskTimers.delete(task.id)
      saveScheduledTasks()
    }
  }, Math.min(delay, 2147483647)) // setTimeout 最大值约 24.8 天
  
  taskTimers.set(task.id, timer)
}

// 生成任务 ID
function generateTaskId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// 在应用启动时加载任务
app.whenReady().then(() => {
  loadScheduledTasks()
})

// IPC 处理：创建提醒
ipcMain.handle('scheduler:create-reminder', async (_event, params: {
  title: string
  message: string
  delay: number  // 延迟时间（毫秒）
}) => {
  try {
    const { title, message, delay } = params
    
    const task: ScheduledTask = {
      id: generateTaskId(),
      type: 'reminder',
      title,
      message,
      triggerTime: Date.now() + delay,
      interval: 0,
      created: Date.now(),
      active: true
    }
    
    scheduledTasks.push(task)
    scheduleTask(task)
    await saveScheduledTasks()
    
    const triggerDate = new Date(task.triggerTime)
    return { 
      success: true, 
      id: task.id,
      triggerTime: triggerDate.toLocaleString()
    }
  } catch (error) {
    return { success: false, error: 'Create reminder failed: ' + error }
  }
})

// IPC 处理：创建定时任务
ipcMain.handle('scheduler:create-task', async (_event, params: {
  title: string
  message: string
  time: string  // ISO 时间字符串或 HH:MM 格式
  repeat?: 'daily' | 'hourly' | 'weekly' | 'none'
}) => {
  try {
    const { title, message, time, repeat = 'none' } = params
    
    let triggerTime: number
    
    // 解析时间
    if (time.includes('T') || time.includes('-')) {
      // ISO 格式
      triggerTime = new Date(time).getTime()
    } else if (time.includes(':')) {
      // HH:MM 格式，今天的这个时间
      const [hours, minutes] = time.split(':').map(Number)
      const now = new Date()
      now.setHours(hours, minutes, 0, 0)
      if (now.getTime() < Date.now()) {
        // 如果今天已过，设为明天
        now.setDate(now.getDate() + 1)
      }
      triggerTime = now.getTime()
    } else {
      return { success: false, error: 'Invalid time format' }
    }
    
    // 计算重复间隔
    let interval = 0
    switch (repeat) {
      case 'hourly': interval = 60 * 60 * 1000; break
      case 'daily': interval = 24 * 60 * 60 * 1000; break
      case 'weekly': interval = 7 * 24 * 60 * 60 * 1000; break
    }
    
    const task: ScheduledTask = {
      id: generateTaskId(),
      type: 'scheduled',
      title,
      message,
      triggerTime,
      interval,
      created: Date.now(),
      active: true
    }
    
    scheduledTasks.push(task)
    scheduleTask(task)
    await saveScheduledTasks()
    
    const triggerDate = new Date(task.triggerTime)
    return { 
      success: true, 
      id: task.id,
      triggerTime: triggerDate.toLocaleString(),
      repeat
    }
  } catch (error) {
    return { success: false, error: 'Create task failed: ' + error }
  }
})

// IPC 处理：列出所有任务
ipcMain.handle('scheduler:list', async () => {
  try {
    const tasks = scheduledTasks.map(t => ({
      id: t.id,
      type: t.type,
      title: t.title,
      message: t.message,
      triggerTime: new Date(t.triggerTime).toLocaleString(),
      repeat: t.interval ? (
        t.interval >= 7 * 24 * 60 * 60 * 1000 ? 'weekly' :
        t.interval >= 24 * 60 * 60 * 1000 ? 'daily' :
        t.interval >= 60 * 60 * 1000 ? 'hourly' : 'custom'
      ) : 'none',
      active: t.active
    }))
    
    return { success: true, tasks }
  } catch (error) {
    return { success: false, error: 'List tasks failed: ' + error }
  }
})

// IPC 处理：取消任务
ipcMain.handle('scheduler:cancel', async (_event, params: { id: string }) => {
  try {
    const { id } = params
    
    const taskIndex = scheduledTasks.findIndex(t => t.id === id)
    if (taskIndex === -1) {
      return { success: false, error: 'Task not found' }
    }
    
    // 清除定时器
    const timer = taskTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      taskTimers.delete(id)
    }
    
    // 从列表中移除
    scheduledTasks.splice(taskIndex, 1)
    await saveScheduledTasks()
    
    return { success: true }
  } catch (error) {
    return { success: false, error: 'Cancel task failed: ' + error }
  }
})
