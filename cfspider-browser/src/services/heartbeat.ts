/**
 * CFSpider 心跳服务
 * 实现后台定时检查和主动通知机制
 */

import { useStore } from '../store'

// ========== 类型定义 ==========

export type NotificationType = 'page_change' | 'reminder' | 'skill_suggestion' | 'task_complete' | 'error_recovery' | 'login_detected'

export type NotificationPriority = 'low' | 'medium' | 'high'

export interface HeartbeatNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  priority: NotificationPriority
  createdAt: number
  actions?: {
    id: string
    label: string
    primary?: boolean
  }[]
  data?: Record<string, unknown>
}

export interface HeartbeatTask {
  id: string
  type: 'page_monitor' | 'reminder' | 'skill_check' | 'task_check'
  interval: number // 检查间隔（毫秒）
  lastCheck: number
  enabled: boolean
  data?: Record<string, unknown>
}

export interface PageState {
  url: string
  title: string
  domain: string
  hasLoginForm: boolean
  hasModal: boolean
  hasVideo: boolean
  timestamp: number
}

// ========== 状态管理 ==========

let heartbeatEnabled = false
let heartbeatInterval: ReturnType<typeof setInterval> | null = null
let lastPageState: PageState | null = null
let notifications: HeartbeatNotification[] = []
let tasks: HeartbeatTask[] = []
let notificationCallback: ((notification: HeartbeatNotification) => void) | null = null

// 默认任务配置
const DEFAULT_TASKS: HeartbeatTask[] = [
  {
    id: 'page_monitor',
    type: 'page_monitor',
    interval: 30000, // 30秒
    lastCheck: 0,
    enabled: true
  },
  {
    id: 'skill_check',
    type: 'skill_check',
    interval: 3600000, // 1小时
    lastCheck: 0,
    enabled: true
  },
  {
    id: 'task_check',
    type: 'task_check',
    interval: 10000, // 10秒
    lastCheck: 0,
    enabled: true
  }
]

// ========== 核心函数 ==========

/**
 * 启动心跳服务
 */
export function startHeartbeat(onNotification?: (notification: HeartbeatNotification) => void): void {
  if (heartbeatEnabled) return
  
  heartbeatEnabled = true
  tasks = [...DEFAULT_TASKS]
  notificationCallback = onNotification || null
  
  console.log('[Heartbeat] 心跳服务启动')
  
  // 主心跳循环（每5秒检查一次）
  heartbeatInterval = setInterval(async () => {
    await heartbeatTick()
  }, 5000)
  
  // 立即执行一次
  heartbeatTick()
}

/**
 * 停止心跳服务
 */
export function stopHeartbeat(): void {
  if (!heartbeatEnabled) return
  
  heartbeatEnabled = false
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
  
  console.log('[Heartbeat] 心跳服务停止')
}

/**
 * 心跳执行周期
 */
async function heartbeatTick(): Promise<void> {
  if (!heartbeatEnabled) return
  
  const now = Date.now()
  
  for (const task of tasks) {
    if (!task.enabled) continue
    if (now - task.lastCheck < task.interval) continue
    
    task.lastCheck = now
    
    try {
      switch (task.type) {
        case 'page_monitor':
          await checkPageChanges()
          break
        case 'skill_check':
          await checkSkillSuggestions()
          break
        case 'task_check':
          await checkPendingTasks()
          break
      }
    } catch (e) {
      console.error('[Heartbeat] 任务执行失败:', task.type, e)
    }
  }
}

/**
 * 尝试自动关闭弹窗 - 使用更全面的选择器列表
 */
async function tryCloseModal(webview: any): Promise<{ closed: boolean; method?: string }> {
  try {
    // 第一轮：点击关闭按钮
    const clickResult = await webview.executeJavaScript(`
      (function() {
        // 按优先级排列的关闭按钮选择器（与 close_popup 工具保持一致）
        const closeSelectors = [
          // 通用关闭按钮
          '.close', '.close-btn', '.btn-close', '.icon-close', '.close-icon',
          '[class*="close"]', '[aria-label="关闭"]', '[aria-label="Close"]',
          '[title="关闭"]', '[title="Close"]', '.modal-close', '.dialog-close',
          
          // 淘宝专用
          '.fm-btn-close', '.login-box .close', '.J_CloseLogin', '.sufei-dialog-close',
          '.baxia-dialog-close', '.next-dialog-close', '.next-icon-close',
          
          // 京东专用  
          '.jd-close', '.JDJRV-bigimg .close',
          
          // Bilibili专用
          '.bili-mini-close', '.bili-popup-close', '.close-container',
          '.bili-modal__close', '.bpx-player-ending-panel-close',
          
          // 腾讯视频专用
          '.popup_close', '.dialog_close', '.mod_popup .close', '.btn_close',
          '.player_close', '.txp_popup_close',
          
          // GitHub专用
          '.js-cookie-consent-accept', '.Box-overlay-close', '.flash-close',
          
          // 微博/微信等
          '.woo-dialog-close', '.weui-dialog__btn', '.W_close',
          
          // 常见广告关闭
          '.ad-close', '.ad-skip', '.skip-ad', '[class*="ad"] .close',
          '.advertisement-close', '.ads-close'
        ];
        
        for (const sel of closeSelectors) {
          try {
            const elements = document.querySelectorAll(sel);
            for (const el of elements) {
              const style = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              // 确保元素可见且可点击
              if (style.display !== 'none' && style.visibility !== 'hidden' &&
                  parseFloat(style.opacity) > 0 && rect.width > 0 && rect.height > 0) {
                el.click();
                return { closed: true, method: '点击关闭按钮: ' + sel };
              }
            }
          } catch (e) {}
        }
        return { closed: false };
      })()
    `)
    
    if (clickResult.closed) {
      return clickResult
    }
    
    // 第二轮：按 ESC 键
    await webview.executeJavaScript(`
      document.dispatchEvent(new KeyboardEvent('keydown', { 
        key: 'Escape', 
        keyCode: 27, 
        code: 'Escape',
        bubbles: true 
      }));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { 
        key: 'Escape', 
        keyCode: 27,
        code: 'Escape', 
        bubbles: true 
      }));
    `)
    
    // 等待一下检查是否关闭
    await new Promise(resolve => setTimeout(resolve, 300))
    
    const stillHasPopup = await webview.executeJavaScript(`
      (function() {
        const modals = document.querySelectorAll('.modal, .popup, .dialog, [role="dialog"], .overlay, .mask');
        for (const m of modals) {
          const style = window.getComputedStyle(m);
          const rect = m.getBoundingClientRect();
          if (style.display !== 'none' && style.visibility !== 'hidden' && 
              rect.width > 100 && rect.height > 100) {
            return true;
          }
        }
        return false;
      })()
    `)
    
    if (!stillHasPopup) {
      return { closed: true, method: '按 ESC 键' }
    }
    
    // 第三轮：点击遮罩层外部
    await webview.executeJavaScript(`
      // 点击页面四角尝试关闭
      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      document.elementFromPoint(10, 10)?.dispatchEvent(clickEvent);
    `)
    
    await new Promise(resolve => setTimeout(resolve, 200))
    
    const finalCheck = await webview.executeJavaScript(`
      (function() {
        const modals = document.querySelectorAll('.modal, .popup, .dialog, [role="dialog"]');
        for (const m of modals) {
          const style = window.getComputedStyle(m);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return true;
          }
        }
        return false;
      })()
    `)
    
    if (!finalCheck) {
      return { closed: true, method: '点击外部区域' }
    }
    
    return { closed: false }
  } catch (e) {
    console.error('[Heartbeat] 关闭弹窗失败:', e)
    return { closed: false }
  }
}

/**
 * 检查页面变化
 */
async function checkPageChanges(): Promise<void> {
  const webview = document.querySelector('webview') as any
  if (!webview) return
  
  try {
    const pageInfo = await webview.executeJavaScript(`
      (function() {
        // 登录表单选择器（增强版）
        const loginSelectors = [
          'input[type="password"]',
          'input[name*="pass"]',
          'input[name*="pwd"]',
          'input[placeholder*="密码"]',
          'input[placeholder*="password"]',
          'form[action*="login"]',
          'form[action*="signin"]',
          '.login-form',
          '#login-form',
          '#J_LoginBox',
          '.login-box',
          '.login-panel',
          '.login-dialog',
          '[class*="login-modal"]',
          '[class*="login-popup"]'
        ];
        
        // 模态框/弹窗选择器（增强版，包括淘宝、京东等）
        const modalSelectors = [
          '.modal:not([style*="display: none"])',
          '.dialog:not([style*="display: none"])',
          '[role="dialog"]:not([aria-hidden="true"])',
          '.popup:not(.hidden)',
          '.overlay:not(.hidden)',
          // 淘宝登录框
          '.login-box',
          '.J_LoginBox',
          '#J_LoginBox',
          '.login-mod',
          '.login-panel',
          '.fm-login',
          // 京东登录框
          '.modal-wrap',
          '.login-wrap',
          '#loginModal',
          // 通用遮罩层
          '[class*="mask"]:not([style*="display: none"])',
          '[class*="overlay"]:not([style*="display: none"])',
          '.baxia-dialog',
          '.sufei-dialog'
        ];
        
        // 检测是否有登录表单
        const hasLoginForm = loginSelectors.some(sel => {
          const el = document.querySelector(sel);
          if (!el) return false;
          // 检查元素是否可见
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
        
        // 检测是否有模态框遮挡
        let hasModal = false;
        let modalInfo = '';
        for (const sel of modalSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            // 检查元素是否可见且有一定大小
            if (style.display !== 'none' && style.visibility !== 'hidden' && 
                rect.width > 100 && rect.height > 100) {
              hasModal = true;
              modalInfo = el.className || el.id || sel;
              break;
            }
          }
        }
        
        // 检测是否被登录框遮挡（检查固定定位的大元素）
        const fixedElements = document.querySelectorAll('[style*="position: fixed"], [style*="position:fixed"]');
        for (const el of fixedElements) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (rect.width > 200 && rect.height > 200 && 
              style.display !== 'none' && style.visibility !== 'hidden' &&
              parseFloat(style.zIndex) > 100) {
            // 检查是否包含登录相关内容
            const text = el.textContent || '';
            if (text.includes('登录') || text.includes('密码') || text.includes('账号') || 
                text.includes('Login') || text.includes('Sign in')) {
              hasModal = true;
              hasLoginForm = true;
              modalInfo = '登录弹窗';
              break;
            }
          }
        }
        
        const hasVideo = !!document.querySelector('video, iframe[src*="youtube"], iframe[src*="bilibili"]');
        
        return {
          url: window.location.href,
          title: document.title,
          domain: window.location.hostname,
          hasLoginForm: hasLoginForm,
          hasModal: hasModal,
          hasVideo: hasVideo,
          modalInfo: modalInfo
        };
      })()
    `)
    
    const currentState: PageState = {
      ...pageInfo,
      timestamp: Date.now()
    }
    
    // 检测变化或首次检测到登录框
    const isFirstCheck = !lastPageState
    const loginFormAppeared = isFirstCheck ? currentState.hasLoginForm : 
                              (!lastPageState.hasLoginForm && currentState.hasLoginForm)
    
    // 检测登录表单出现
    if (loginFormAppeared && currentState.hasLoginForm) {
      addNotification({
        id: `login-${Date.now()}`,
        type: 'login_detected',
        title: '检测到登录弹窗',
        message: `页面被登录框遮挡，需要登录后才能继续操作。${pageInfo.modalInfo ? '\n(' + pageInfo.modalInfo + ')' : ''}`,
        priority: 'high',
        createdAt: Date.now(),
        actions: [
          { id: 'auto_login', label: '自动登录', primary: true },
          { id: 'manual_login', label: '手动登录' },
          { id: 'dismiss', label: '忽略' }
        ]
      })
    }
    
    // 检测模态框出现（非登录框，可能是广告）- 自动尝试关闭
    const modalAppeared = isFirstCheck ? (currentState.hasModal && !currentState.hasLoginForm) :
                          (!lastPageState?.hasModal && currentState.hasModal && !currentState.hasLoginForm)
    if (modalAppeared) {
      console.log('[Heartbeat] 检测到弹窗，自动尝试关闭...')
      // 自动尝试关闭弹窗
      const closeResult = await tryCloseModal(webview)
      if (closeResult.closed) {
        addNotification({
          id: `modal-closed-${Date.now()}`,
          type: 'page_change',
          title: '已自动关闭弹窗',
          message: closeResult.method || '弹窗已关闭',
          priority: 'low',
          createdAt: Date.now()
        })
      } else {
        // 关闭失败，通知用户
        addNotification({
          id: `modal-${Date.now()}`,
          type: 'page_change',
          title: '检测到弹窗',
          message: '自动关闭失败，需要手动处理',
          priority: 'medium',
          createdAt: Date.now(),
          actions: [
            { id: 'close_modal', label: '重试关闭', primary: true },
            { id: 'dismiss', label: '忽略' }
          ]
        })
      }
    }
    
    // 检测页面跳转
    if (lastPageState && lastPageState.url !== currentState.url) {
      console.log('[Heartbeat] 页面跳转:', lastPageState.url, '->', currentState.url)
      
      // 如果跳转到新域名，可能需要提示
      if (lastPageState.domain !== currentState.domain) {
        addNotification({
          id: `navigate-${Date.now()}`,
          type: 'page_change',
          title: '页面已跳转',
          message: `已到达 ${currentState.domain}`,
          priority: 'low',
          createdAt: Date.now()
        })
      }
    }
    
    lastPageState = currentState
    
  } catch (e) {
    console.error('[Heartbeat] 页面检查失败:', e)
  }
}

/**
 * 检查技能建议
 */
async function checkSkillSuggestions(): Promise<void> {
  try {
    // 动态导入 skills 模块避免循环依赖
    const { getOperationStats, getAllSkills } = await import('./skills')
    
    const stats = getOperationStats()
    const skills = await getAllSkills()
    
    // 如果用户在同一域名上操作很多次，但没有相关技能
    if (stats.total >= 10 && stats.domains.length === 1) {
      const domain = stats.domains[0]
      const hasSkillForDomain = skills.some(s => 
        s.domains.includes(domain) && !s.isBuiltIn
      )
      
      if (!hasSkillForDomain && stats.successRate >= 70) {
        addNotification({
          id: `skill-suggest-${Date.now()}`,
          type: 'skill_suggestion',
          title: '技能建议',
          message: `我注意到你经常在 ${domain} 上操作，要不要我创建一个快捷技能?`,
          priority: 'low',
          createdAt: Date.now(),
          actions: [
            { id: 'create_skill', label: '创建技能', primary: true },
            { id: 'dismiss', label: '以后再说' }
          ],
          data: { domain }
        })
      }
    }
  } catch (e) {
    console.error('[Heartbeat] 技能建议检查失败:', e)
  }
}

/**
 * 检查待完成任务
 */
async function checkPendingTasks(): Promise<void> {
  // 这里可以扩展检查用户设置的定时任务、监控任务等
  // 目前作为占位符
}

/**
 * 添加通知
 */
export function addNotification(notification: HeartbeatNotification): void {
  // 检查是否有重复通知（同类型5分钟内）
  const duplicate = notifications.find(n => 
    n.type === notification.type && 
    Date.now() - n.createdAt < 300000
  )
  
  if (duplicate) {
    console.log('[Heartbeat] 跳过重复通知:', notification.type)
    return
  }
  
  notifications.push(notification)
  
  // 只保留最近 20 条
  if (notifications.length > 20) {
    notifications = notifications.slice(-20)
  }
  
  console.log('[Heartbeat] 新通知:', notification.type, notification.message)
  
  // 触发回调
  if (notificationCallback) {
    notificationCallback(notification)
  }
  
  // 同步到 store
  try {
    const store = useStore.getState()
    if (store.addHeartbeatNotification) {
      store.addHeartbeatNotification(notification)
    }
  } catch (e) {
    console.error('[Heartbeat] 同步通知到 store 失败:', e)
  }
}

/**
 * 获取所有通知
 */
export function getNotifications(): HeartbeatNotification[] {
  return [...notifications]
}

/**
 * 移除通知
 */
export function removeNotification(id: string): void {
  notifications = notifications.filter(n => n.id !== id)
  
  try {
    const store = useStore.getState()
    if (store.removeHeartbeatNotification) {
      store.removeHeartbeatNotification(id)
    }
  } catch (e) {
    console.error('[Heartbeat] 同步移除通知失败:', e)
  }
}

/**
 * 清除所有通知
 */
export function clearNotifications(): void {
  notifications = []
  
  try {
    const store = useStore.getState()
    if (store.clearHeartbeatNotifications) {
      store.clearHeartbeatNotifications()
    }
  } catch (e) {
    console.error('[Heartbeat] 同步清除通知失败:', e)
  }
}

/**
 * 手动触发错误恢复通知
 */
export function notifyErrorRecovery(error: string, suggestion: string): void {
  addNotification({
    id: `error-${Date.now()}`,
    type: 'error_recovery',
    title: '操作失败',
    message: `${error}\n\n建议: ${suggestion}`,
    priority: 'high',
    createdAt: Date.now(),
    actions: [
      { id: 'retry', label: '重试', primary: true },
      { id: 'dismiss', label: '忽略' }
    ],
    data: { error, suggestion }
  })
}

/**
 * 手动触发任务完成通知
 */
export function notifyTaskComplete(taskName: string, details?: string): void {
  addNotification({
    id: `complete-${Date.now()}`,
    type: 'task_complete',
    title: '任务完成',
    message: `${taskName}${details ? '\n' + details : ''}`,
    priority: 'medium',
    createdAt: Date.now()
  })
}

/**
 * 添加自定义提醒任务
 */
export function addReminderTask(message: string, delayMs: number): string {
  const taskId = `reminder-${Date.now()}`
  
  const task: HeartbeatTask = {
    id: taskId,
    type: 'reminder',
    interval: delayMs,
    lastCheck: Date.now(),
    enabled: true,
    data: { message }
  }
  
  tasks.push(task)
  
  // 一次性任务：触发后禁用
  setTimeout(() => {
    addNotification({
      id: taskId,
      type: 'reminder',
      title: '提醒',
      message,
      priority: 'medium',
      createdAt: Date.now()
    })
    
    // 移除任务
    tasks = tasks.filter(t => t.id !== taskId)
  }, delayMs)
  
  return taskId
}

/**
 * 获取心跳状态
 */
export function getHeartbeatStatus(): {
  enabled: boolean
  lastPageState: PageState | null
  notificationCount: number
  taskCount: number
} {
  return {
    enabled: heartbeatEnabled,
    lastPageState,
    notificationCount: notifications.length,
    taskCount: tasks.length
  }
}
