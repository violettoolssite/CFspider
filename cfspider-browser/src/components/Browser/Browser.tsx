import { useRef, useEffect, useCallback, useState } from 'react'
import AddressBar from './AddressBar'
import Toolbar from './Toolbar'
import TabBar from './TabBar'
import VirtualMouse from './VirtualMouse'
import { useStore } from '../../store'

// 检查是否在 Electron 环境中
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

// 抑制 webview 加载错误（ERR_ABORTED 等非致命错误）
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error
  console.error = (...args) => {
    const message = args[0]?.toString?.() || ''
    // 忽略常见的非致命 webview 错误
    if (message.includes('ERR_ABORTED') || 
        message.includes('GUEST_VIEW_MANAGER_CALL') ||
        message.includes('Unexpected error while loading URL')) {
      return
    }
    originalConsoleError.apply(console, args)
  }
}

interface BrowserProps {
  onSettingsClick: () => void
}

export default function Browser({ onSettingsClick }: BrowserProps) {
  const webviewRef = useRef<HTMLWebViewElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [webviewReady, setWebviewReady] = useState(false)
  const { 
    url, 
    setUrl, 
    setLoading,
    activeTabId,
    updateTab,
    addTab,
    closeTab,
    addHistory,
    selectMode,
    addSelectedElement
  } = useStore()

  // 导航到 URL
  const navigate = useCallback((newUrl: string) => {
    let finalUrl = newUrl
    if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
      finalUrl = 'https://' + newUrl
    }
    setUrl(finalUrl)
    if (isElectron && webviewRef.current) {
      (webviewRef.current as HTMLElement).setAttribute('src', finalUrl)
    } else if (iframeRef.current) {
      iframeRef.current.src = finalUrl
    }
  }, [setUrl])

  // 后退
  const goBack = useCallback(() => {
    if (isElectron) {
      const webview = webviewRef.current as Electron.WebviewTag | null
      if (webview?.canGoBack?.()) {
        webview.goBack()
      }
    } else if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.history.back()
    }
  }, [])

  // 前进
  const goForward = useCallback(() => {
    if (isElectron) {
      const webview = webviewRef.current as Electron.WebviewTag | null
      if (webview?.canGoForward?.()) {
        webview.goForward()
      }
    } else if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.history.forward()
    }
  }, [])

  // 刷新
  const reload = useCallback(() => {
    if (isElectron) {
      const webview = webviewRef.current as Electron.WebviewTag | null
      webview?.reload?.()
    } else if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.location.reload()
    }
  }, [])

  // 停止
  const stop = useCallback(() => {
    if (isElectron) {
      const webview = webviewRef.current as Electron.WebviewTag | null
      webview?.stop?.()
    }
  }, [])

  // 注入辅助脚本（滚动功能 + 高亮功能 + 自动关闭模态框）
  const injectHelperScript = useCallback(() => {
    if (!isElectron || !webviewRef.current) return
    
    const webview = webviewRef.current as Electron.WebviewTag
    if (!webview.executeJavaScript) return

    const script = `
      (function() {
        try {
          if (window.__cfspiderReady) return;
          window.__cfspiderReady = true;
          
          // 注入高亮样式 - 醒目的边框效果
          if (!document.getElementById('cfspider-highlight-style')) {
            const style = document.createElement('style');
            style.id = 'cfspider-highlight-style';
            style.textContent = \`
              .cfspider-highlight {
                position: relative !important;
                background-color: rgba(0, 255, 136, 0.15) !important;
                outline: 3px solid #00ff88 !important;
                outline-offset: 2px !important;
                box-shadow: 
                  0 0 0 3px #00ff88,
                  0 0 15px rgba(0, 255, 136, 0.6),
                  0 0 30px rgba(0, 255, 136, 0.4),
                  inset 0 0 20px rgba(0, 255, 136, 0.1) !important;
                animation: cfspider-glow 1.5s ease-in-out infinite;
                z-index: 9999 !important;
              }
              .cfspider-highlight::before {
                content: '';
                position: absolute;
                top: -6px;
                left: -6px;
                right: -6px;
                bottom: -6px;
                border: 3px solid transparent;
                border-radius: 4px;
                background: linear-gradient(90deg, #00ff88, #00d4ff, #ff00ff, #ff8800, #00ff88) border-box;
                background-size: 400% 100%;
                -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
                mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
                -webkit-mask-composite: destination-out;
                mask-composite: exclude;
                animation: cfspider-border-flow 2s linear infinite;
                pointer-events: none;
              }
              .cfspider-highlight::after {
                content: '';
                position: absolute;
                top: -8px;
                right: -8px;
                width: 16px;
                height: 16px;
                background: #00ff88;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 2px 8px rgba(0, 255, 136, 0.5);
                z-index: 10001;
                pointer-events: none;
              }
              @keyframes cfspider-glow {
                0%, 100% { 
                  box-shadow: 
                    0 0 0 3px #00ff88,
                    0 0 15px rgba(0, 255, 136, 0.6),
                    0 0 30px rgba(0, 255, 136, 0.4),
                    inset 0 0 20px rgba(0, 255, 136, 0.1);
                }
                50% { 
                  box-shadow: 
                    0 0 0 3px #00d4ff,
                    0 0 25px rgba(0, 212, 255, 0.8),
                    0 0 50px rgba(0, 212, 255, 0.5),
                    inset 0 0 30px rgba(0, 212, 255, 0.15);
                }
              }
              @keyframes cfspider-border-flow {
                0% { background-position: 0% 50%; }
                100% { background-position: 400% 50%; }
              }
              .cfspider-highlight-badge {
                position: absolute;
                top: -14px;
                left: -14px;
                background: linear-gradient(135deg, #ff6b00, #ff0080);
                color: white;
                font-size: 12px;
                min-width: 22px;
                height: 22px;
                padding: 0 8px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 11px;
                font-weight: bold;
                z-index: 10002;
                pointer-events: none;
                box-shadow: 0 2px 8px rgba(255, 0, 128, 0.5);
                animation: cfspider-badge-pop 0.3s ease-out;
                white-space: nowrap;
              }
              @keyframes cfspider-badge-pop {
                0% { transform: scale(0); }
                50% { transform: scale(1.2); }
                100% { transform: scale(1); }
              }
            \`;
            document.head.appendChild(style);
          }
          
          // 滚动功能
          window.__cfspiderScroll = function(direction) {
            try {
              if (direction === 'down') window.scrollBy(0, 500);
              else if (direction === 'up') window.scrollBy(0, -500);
              else if (direction === 'bottom') window.scrollTo(0, document.body.scrollHeight);
              else if (direction === 'top') window.scrollTo(0, 0);
            } catch (e) {}
          };
          
          // 高亮功能
          window.__cfspiderHighlight = function(selector, showBadge) {
            try {
              // 清除之前的高亮和徽章
              document.querySelectorAll('.cfspider-highlight').forEach(el => {
                el.classList.remove('cfspider-highlight');
              });
              document.querySelectorAll('.cfspider-highlight-badge').forEach(el => {
                el.remove();
              });
              
              const elements = document.querySelectorAll(selector);
              elements.forEach((el, index) => {
                el.classList.add('cfspider-highlight');
                
                // 添加序号徽章
                if (showBadge && el.style) {
                  el.style.position = el.style.position || 'relative';
                  const badge = document.createElement('span');
                  badge.className = 'cfspider-highlight-badge';
                  badge.textContent = String(index + 1);
                  el.appendChild(badge);
                }
                
                // 滚动第一个元素到视野中
                if (index === 0) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              });
              
              return elements.length;
            } catch (e) {
              console.error('[CFSpider] Highlight error:', e);
              return 0;
            }
          };
          
          // 清除高亮功能
          window.__cfspiderClearHighlight = function() {
            document.querySelectorAll('.cfspider-highlight').forEach(el => {
              el.classList.remove('cfspider-highlight');
            });
            document.querySelectorAll('.cfspider-highlight-badge').forEach(el => {
              el.remove();
            });
          };
          
          // 提取功能
          window.__cfspiderExtract = function(selector, type, attribute) {
            try {
              const elements = document.querySelectorAll(selector);
              const data = [];
              
              elements.forEach((el, index) => {
                let value = '';
                switch (type) {
                  case 'text':
                    value = el.textContent?.trim() || '';
                    break;
                  case 'link':
                    value = el.href || el.getAttribute('href') || '';
                    break;
                  case 'image':
                    value = el.src || el.getAttribute('src') || '';
                    break;
                  case 'attribute':
                    value = el.getAttribute(attribute) || '';
                    break;
                }
                
                if (value) {
                  data.push({
                    index: index + 1,
                    value: value.substring(0, 1000),
                    tag: el.tagName.toLowerCase()
                  });
                }
              });
              
              return data;
            } catch (e) {
              console.error('[CFSpider] Extract error:', e);
              return [];
            }
          };
          
          console.log('[CFSpider] Helper script ready (with highlight support)');
        } catch (e) {}
      })();
    `

    webview.executeJavaScript(script).catch(console.error)
  }, [])

  // 初始化虚拟鼠标 - 常驻显示
  const { showMouse, moveMouse } = useStore()
  
  useEffect(() => {
    if (isElectron) {
      // 浏览器加载后显示虚拟鼠标，初始位置在浏览器中央
      const container = document.getElementById('browser-container')
      if (container) {
        const rect = container.getBoundingClientRect()
        showMouse()
        moveMouse(rect.left + rect.width / 2, rect.top + rect.height / 2, 0)
      }
    }
  }, [])

  // 监听 webview 事件 (仅 Electron 环境)
  useEffect(() => {
    if (!isElectron) return
    
    const webview = webviewRef.current as Electron.WebviewTag | null
    if (!webview) return

    const handleLoadStart = () => {
      setLoading(true)
      setWebviewReady(false)
    }
    const handleLoadStop = async () => {
      setLoading(false)
      injectHelperScript()
      
      // 获取页面标题并更新标签页
      try {
        const title = await webview.executeJavaScript('document.title')
        if (title) {
          updateTab(activeTabId, { title })
          // 添加到历史记录
          const currentUrl = webview.getURL()
          if (currentUrl && !currentUrl.startsWith('about:')) {
            addHistory(currentUrl, title)
          }
        }
      } catch (e) {
        // 忽略错误
      }
    }
    const handleNavigate = (e: Electron.DidNavigateEvent) => {
      setUrl(e.url)
    }
    
    // 处理加载失败
    const handleLoadFail = (e: Electron.DidFailLoadEvent) => {
      // 忽略常见的非致命错误
      const ignoredErrors = [
        -3,   // ERR_ABORTED - 正常的页面跳转
        -7,   // ERR_TIMED_OUT - 超时（可能是后台请求）
        -21,  // ERR_NETWORK_CHANGED
        -100, // ERR_CONNECTION_CLOSED
        -101, // ERR_CONNECTION_RESET
        -102, // ERR_CONNECTION_REFUSED
        -105, // ERR_NAME_NOT_RESOLVED
        -106, // ERR_INTERNET_DISCONNECTED
        -118, // ERR_CONNECTION_TIMED_OUT
        -130, // ERR_PROXY_CONNECTION_FAILED
        -137, // ERR_NAME_RESOLUTION_FAILED
      ]
      
      if (ignoredErrors.includes(e.errorCode)) return
      
      // 忽略登录相关的 URL 加载失败
      const ignoredUrlPatterns = [
        'login.live.com',
        'login.microsoftonline.com',
        'accounts.google.com',
        'passport.',
        'auth.',
        'oauth',
        'signin',
        'login.'
      ]
      
      if (ignoredUrlPatterns.some(pattern => e.validatedURL?.includes(pattern))) {
        return
      }
      
      console.error('Load failed:', e.errorDescription, e.validatedURL)
      setLoading(false)
    }

    webview.addEventListener('did-start-loading', handleLoadStart)
    webview.addEventListener('did-stop-loading', handleLoadStop)
    webview.addEventListener('did-navigate', handleNavigate)
    webview.addEventListener('did-navigate-in-page', handleNavigate)
    webview.addEventListener('did-fail-load', handleLoadFail)

    // 设置 webview 就绪状态
    const handleDomReady = () => {
      setWebviewReady(true)
      injectHelperScript()
    }
    
    webview.addEventListener('dom-ready', handleDomReady)

    // 监听来自 webview 的 console 消息
    const handleConsoleMessage = (e: Electron.ConsoleMessageEvent) => {
      if (e.message.startsWith('[CFSpider]')) {
        console.log(e.message)
      }
    }
    
    webview.addEventListener('console-message', handleConsoleMessage)

    // 拦截新窗口，在当前 webview 中打开
    const handleNewWindow = (e: Electron.NewWindowEvent) => {
      e.preventDefault()
      // 在当前 webview 中导航到新 URL
      const newUrl = e.url
      if (newUrl && !newUrl.startsWith('javascript:')) {
        setUrl(newUrl)
        webview.src = newUrl
      }
    }
    
    webview.addEventListener('new-window', handleNewWindow)

    return () => {
      webview.removeEventListener('did-start-loading', handleLoadStart)
      webview.removeEventListener('did-stop-loading', handleLoadStop)
      webview.removeEventListener('did-navigate', handleNavigate)
      webview.removeEventListener('did-navigate-in-page', handleNavigate)
      webview.removeEventListener('did-fail-load', handleLoadFail)
      webview.removeEventListener('dom-ready', handleDomReady)
      webview.removeEventListener('console-message', handleConsoleMessage)
      webview.removeEventListener('new-window', handleNewWindow)
    }
  }, [setLoading, setUrl, injectHelperScript, activeTabId, updateTab, addHistory])

  // 处理手动选择模式
  useEffect(() => {
    if (!isElectron || !webviewRef.current) return
    
    const webview = webviewRef.current as Electron.WebviewTag
    if (!webview.executeJavaScript) return
    
    if (selectMode) {
      // 先清理之前的状态
      webview.executeJavaScript(`
        window.__cfspiderSelectMode = false;
        window.__cfspiderSelectedResults = [];
      `).catch(() => {})
      
      // 注入选择模式脚本
      const selectScript = `
        (function() {
          // 清理旧的事件监听器和元素
          if (window.__cfspiderMouseMoveHandler) {
            document.removeEventListener('mousemove', window.__cfspiderMouseMoveHandler, true);
          }
          if (window.__cfspiderClickHandler) {
            document.removeEventListener('click', window.__cfspiderClickHandler, true);
          }
          if (window.__cfspiderContextMenuHandler) {
            document.removeEventListener('contextmenu', window.__cfspiderContextMenuHandler, true);
          }
          document.querySelectorAll('[id^="cfspider-"]').forEach(function(el) { el.remove(); });
          document.querySelectorAll('.cfspider-hover-highlight, .cfspider-selected-title, .cfspider-selected-content, .cfspider-selected-link').forEach(function(el) {
            el.classList.remove('cfspider-hover-highlight', 'cfspider-selected-title', 'cfspider-selected-content', 'cfspider-selected-link');
          });
          
          window.__cfspiderSelectMode = true;
          window.__cfspiderSelectedResults = [];  // 支持多选
          
          // 选择模式样式
          var style = document.createElement('style');
          style.id = 'cfspider-select-style';
          style.textContent = \`
            .cfspider-hover-highlight {
              outline: 3px dashed #3b82f6 !important;
              outline-offset: 2px !important;
              background-color: rgba(59, 130, 246, 0.1) !important;
              cursor: crosshair !important;
            }
            .cfspider-selected-title {
              outline: 3px solid #f59e0b !important;
              outline-offset: 2px !important;
              background-color: rgba(245, 158, 11, 0.15) !important;
            }
            .cfspider-selected-content {
              outline: 3px solid #10b981 !important;
              outline-offset: 2px !important;
              background-color: rgba(16, 185, 129, 0.15) !important;
            }
            .cfspider-selected-link {
              outline: 3px solid #ec4899 !important;
              outline-offset: 2px !important;
              background-color: rgba(236, 72, 153, 0.2) !important;
            }
            .cfspider-select-tooltip {
              position: fixed;
              background: #1f2937;
              color: white;
              padding: 8px 14px;
              border-radius: 6px;
              font-size: 13px;
              z-index: 2147483647;
              pointer-events: none;
              max-width: 400px;
              word-break: break-all;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .cfspider-select-hint {
              position: fixed;
              top: 20px;
              left: 50%;
              transform: translateX(-50%);
              background: #3b82f6;
              color: white;
              padding: 12px 24px;
              border-radius: 8px;
              font-size: 14px;
              z-index: 2147483647;
              box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
              font-weight: 500;
            }
            .cfspider-select-status {
              position: fixed;
              bottom: 20px;
              left: 50%;
              transform: translateX(-50%);
              background: white;
              color: #1f2937;
              padding: 12px 20px;
              border-radius: 8px;
              font-size: 13px;
              z-index: 2147483647;
              box-shadow: 0 4px 20px rgba(0,0,0,0.2);
              display: flex;
              gap: 16px;
              align-items: center;
            }
            .cfspider-status-item {
              display: flex;
              align-items: center;
              gap: 6px;
            }
            .cfspider-status-dot {
              width: 12px;
              height: 12px;
              border-radius: 50%;
            }
          \`;
          document.head.appendChild(style);
          
          // 添加提示
          var hint = document.createElement('div');
          hint.className = 'cfspider-select-hint';
          hint.innerHTML = '多选模式 - 右键点击选择元素';
          hint.id = 'cfspider-select-hint';
          document.body.appendChild(hint);
          
          // 创建状态栏
          var status = document.createElement('div');
          status.className = 'cfspider-select-status';
          status.id = 'cfspider-select-status';
          status.innerHTML = '<div class="cfspider-status-item"><span class="cfspider-status-dot" style="background:#f59e0b;"></span>标题: 0</div>' +
                            '<div class="cfspider-status-item"><span class="cfspider-status-dot" style="background:#10b981;"></span>内容: 0</div>' +
                            '<div class="cfspider-status-item"><span class="cfspider-status-dot" style="background:#8b5cf6;"></span>链接: 0</div>';
          document.body.appendChild(status);
          
          // 创建工具提示
          var tooltip = document.createElement('div');
          tooltip.className = 'cfspider-select-tooltip';
          tooltip.id = 'cfspider-select-tooltip';
          tooltip.style.display = 'none';
          document.body.appendChild(tooltip);
          
          var lastHovered = null;
          
          // 生成选择器
          function generateSelector(el) {
            if (el.id && !el.id.startsWith('cfspider-')) return '#' + el.id;
            var path = [];
            var current = el;
            while (current && current.nodeType === 1 && current !== document.body) {
              var selector = current.tagName.toLowerCase();
              if (current.className && typeof current.className === 'string') {
                var classes = current.className.trim().split(/\\s+/).filter(function(c) {
                  return c && !c.startsWith('cfspider-') && c.length < 30;
                }).slice(0, 2);
                if (classes.length) selector += '.' + classes.join('.');
              }
              path.unshift(selector);
              if (current.id && !current.id.startsWith('cfspider-')) {
                path[0] = '#' + current.id;
                break;
              }
              if (path.length > 3) break;
              current = current.parentElement;
            }
            return path.join(' > ');
          }
          
          // 自动判断元素角色
          function autoDetectRole(el) {
            var tag = el.tagName.toLowerCase();
            var className = (el.className || '').toLowerCase();
            var text = (el.textContent || '').trim();
            
            // 标题判断
            if (/^h[1-6]$/.test(tag)) return 'title';
            if (className.includes('title') || className.includes('headline') || className.includes('heading')) return 'title';
            if (el.querySelector('h1, h2, h3, h4')) return 'title';
            
            // 链接判断
            if (tag === 'a' && el.href) return 'link';
            if (el.querySelector('a[href]')) return 'link';
            
            // 内容判断
            if (tag === 'p' || tag === 'article' || tag === 'section') return 'content';
            if (className.includes('content') || className.includes('desc') || className.includes('summary') || className.includes('text')) return 'content';
            if (text.length > 50) return 'content';
            
            return 'auto';
          }
          
          // 更新状态栏
          function updateStatus() {
            var titleCount = window.__cfspiderSelectedResults.filter(function(r) { return r.role === 'title'; }).length;
            var contentCount = window.__cfspiderSelectedResults.filter(function(r) { return r.role === 'content'; }).length;
            var linkCount = window.__cfspiderSelectedResults.filter(function(r) { return r.role === 'link'; }).length;
            
            var status = document.getElementById('cfspider-select-status');
            if (status) {
              status.innerHTML = '<div class="cfspider-status-item"><span class="cfspider-status-dot" style="background:#f59e0b;"></span>标题: ' + titleCount + '</div>' +
                                '<div class="cfspider-status-item"><span class="cfspider-status-dot" style="background:#10b981;"></span>内容: ' + contentCount + '</div>' +
                                '<div class="cfspider-status-item"><span class="cfspider-status-dot" style="background:#8b5cf6;"></span>链接: ' + linkCount + '</div>';
            }
          }
          
          // 添加选择
          function addSelection(el, role) {
            var selector = generateSelector(el);
            var text = (el.textContent || '').trim().substring(0, 100);
            
            // 检查是否已选择
            var existing = window.__cfspiderSelectedResults.find(function(r) { return r.selector === selector; });
            if (existing) {
              // 更新角色
              existing.role = role;
            } else {
              window.__cfspiderSelectedResults.push({
                selector: selector,
                tag: el.tagName.toLowerCase(),
                text: text,
                role: role,
                id: Date.now().toString()
              });
            }
            
            // 更新高亮样式
            el.classList.remove('cfspider-hover-highlight', 'cfspider-selected-title', 'cfspider-selected-content', 'cfspider-selected-link');
            if (role === 'title') el.classList.add('cfspider-selected-title');
            else if (role === 'content') el.classList.add('cfspider-selected-content');
            else if (role === 'link') el.classList.add('cfspider-selected-link');
            
            updateStatus();
            console.log('[CFSpider] Element selected as ' + role + ':', selector);
          }
          
          // 鼠标移动处理
          window.__cfspiderMouseMoveHandler = function(e) {
            if (!window.__cfspiderSelectMode) return;
            
            var el = document.elementFromPoint(e.clientX, e.clientY);
            if (!el) return;
            
            // 忽略选择模式 UI 元素
            if (el.id && el.id.startsWith('cfspider-')) return;
            if (el.className && el.className.toString().includes('cfspider-')) return;
            
            if (lastHovered && lastHovered !== el) {
              // 只移除悬停高亮，保留已选择的高亮
              if (!lastHovered.classList.contains('cfspider-selected-title') && 
                  !lastHovered.classList.contains('cfspider-selected-content') &&
                  !lastHovered.classList.contains('cfspider-selected-link')) {
                lastHovered.classList.remove('cfspider-hover-highlight');
              }
            }
            
            // 只对未选择的元素添加悬停高亮
            if (!el.classList.contains('cfspider-selected-title') && 
                !el.classList.contains('cfspider-selected-content') &&
                !el.classList.contains('cfspider-selected-link')) {
              el.classList.add('cfspider-hover-highlight');
            }
            lastHovered = el;
            
            // 更新工具提示
            var selector = generateSelector(el);
            var autoRole = autoDetectRole(el);
            var roleText = autoRole === 'title' ? '[标题]' : (autoRole === 'content' ? '[内容]' : (autoRole === 'link' ? '[链接]' : '[自动]'));
            var tooltip = document.getElementById('cfspider-select-tooltip');
            if (tooltip) {
              tooltip.innerHTML = '<' + el.tagName.toLowerCase() + '> ' + roleText + '<br>' + selector;
              tooltip.style.display = 'block';
              tooltip.style.left = Math.min(e.clientX + 15, window.innerWidth - 420) + 'px';
              tooltip.style.top = Math.min(e.clientY + 15, window.innerHeight - 80) + 'px';
            }
          };
          
          // 显示标签选择模态框
          function showLabelModal(el, selector, autoRole) {
            // 移除已有模态框
            var existingModal = document.getElementById('cfspider-label-modal');
            if (existingModal) existingModal.remove();
            
            // 创建遮罩
            var overlay = document.createElement('div');
            overlay.id = 'cfspider-label-modal';
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;pointer-events:all;';
            
            // 阻止事件冒泡
            overlay.addEventListener('click', function(e) { e.stopPropagation(); }, true);
            overlay.addEventListener('mousedown', function(e) { e.stopPropagation(); }, true);
            overlay.addEventListener('mouseup', function(e) { e.stopPropagation(); }, true);
            
            // 创建模态框
            var modal = document.createElement('div');
            modal.style.cssText = 'background:white;border-radius:12px;padding:24px;min-width:320px;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.3);pointer-events:all;';
            
            // 阻止模态框内的事件冒泡
            modal.addEventListener('click', function(e) { e.stopPropagation(); }, false);
            
            // 标题
            var titleEl = document.createElement('div');
            titleEl.style.cssText = 'font-size:18px;font-weight:600;color:#1f2937;margin-bottom:12px;text-align:center;';
            titleEl.textContent = '选择元素标签';
            modal.appendChild(titleEl);
            
            // 选择器预览
            var preview = document.createElement('div');
            preview.style.cssText = 'font-size:12px;color:#6b7280;margin-bottom:20px;padding:10px;background:#f3f4f6;border-radius:6px;word-break:break-all;text-align:center;';
            preview.textContent = selector;
            modal.appendChild(preview);
            
            // 标签按钮容器
            var buttons = document.createElement('div');
            buttons.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;';
            
            // 创建标签按钮
            function createLabelBtn(color, text, role, recommended) {
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.style.cssText = 'padding:14px 16px;border:2px solid ' + color + ';background:white;border-radius:10px;cursor:pointer;font-size:14px;color:#1f2937;display:flex;align-items:center;justify-content:center;gap:8px;transition:all 0.15s;pointer-events:all;';
              
              var dot = document.createElement('span');
              dot.style.cssText = 'width:14px;height:14px;border-radius:50%;background:' + color + ';flex-shrink:0;';
              btn.appendChild(dot);
              
              var labelSpan = document.createElement('span');
              labelSpan.style.cssText = 'font-weight:500;';
              labelSpan.textContent = text + (recommended ? ' *' : '');
              btn.appendChild(labelSpan);
              
              btn.onmouseover = function() { 
                this.style.background = color; 
                this.style.color = 'white';
                this.style.transform = 'scale(1.02)';
              };
              btn.onmouseout = function() { 
                this.style.background = 'white'; 
                this.style.color = '#1f2937';
                this.style.transform = 'scale(1)';
              };
              btn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                addSelection(el, role);
                overlay.remove();
              };
              
              return btn;
            }
            
            buttons.appendChild(createLabelBtn('#f59e0b', '标题', 'title', autoRole === 'title'));
            buttons.appendChild(createLabelBtn('#10b981', '内容', 'content', autoRole === 'content'));
            buttons.appendChild(createLabelBtn('#ec4899', '链接', 'link', autoRole === 'link'));
            buttons.appendChild(createLabelBtn('#6b7280', '自动', autoRole || 'auto', false));
            modal.appendChild(buttons);
            
            // 提示文字
            var hintEl = document.createElement('div');
            hintEl.style.cssText = 'font-size:11px;color:#9ca3af;text-align:center;margin-bottom:12px;';
            hintEl.textContent = '* 表示推荐标签';
            modal.appendChild(hintEl);
            
            // 取消按钮
            var cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.style.cssText = 'width:100%;padding:12px;border:none;background:#e5e7eb;border-radius:8px;cursor:pointer;font-size:14px;color:#4b5563;font-weight:500;pointer-events:all;';
            cancelBtn.textContent = '取消';
            cancelBtn.onmouseover = function() { this.style.background = '#d1d5db'; };
            cancelBtn.onmouseout = function() { this.style.background = '#e5e7eb'; };
            cancelBtn.onclick = function(e) { 
              e.preventDefault();
              e.stopPropagation();
              overlay.remove(); 
            };
            modal.appendChild(cancelBtn);
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // 点击遮罩关闭（但不是点击模态框内部）
            overlay.onclick = function(ev) {
              if (ev.target === overlay) {
                overlay.remove();
              }
            };
          }
          
          // 右键直接选择元素，弹出标签模态框
          window.__cfspiderContextMenuHandler = function(e) {
            if (!window.__cfspiderSelectMode) return;
            
            var el = document.elementFromPoint(e.clientX, e.clientY);
            if (!el) return;
            
            // 忽略选择模式 UI 元素
            if (el.id && el.id.startsWith('cfspider-')) return;
            if (el.className && el.className.toString().includes('cfspider-')) return;
            
            // 阻止默认右键菜单
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            var selector = generateSelector(el);
            var autoRole = autoDetectRole(el);
            
            // 高亮选中的元素
            el.classList.add('cfspider-hover-highlight');
            
            // 显示标签选择模态框
            showLabelModal(el, selector, autoRole);
            
            return false;
          };
          
          // 阻止左键点击跳转（但允许模态框内的点击）
          window.__cfspiderClickHandler = function(e) {
            if (!window.__cfspiderSelectMode) return;
            
            var el = e.target;
            if (!el) return;
            
            // 检查是否点击了模态框或其内部元素
            var modal = document.getElementById('cfspider-label-modal');
            if (modal && modal.contains(el)) {
              // 允许模态框内的点击正常工作
              return;
            }
            
            // 检查是否点击了 cfspider UI 元素
            var current = el;
            while (current) {
              if (current.id && current.id.startsWith('cfspider-')) return;
              if (current.className && current.className.toString && current.className.toString().includes('cfspider-')) return;
              current = current.parentElement;
            }
            
            // 阻止其他链接跳转等默认行为
            e.preventDefault();
            e.stopPropagation();
            
            return false;
          };
          
          document.addEventListener('mousemove', window.__cfspiderMouseMoveHandler, true);
          document.addEventListener('click', window.__cfspiderClickHandler, true);
          document.addEventListener('contextmenu', window.__cfspiderContextMenuHandler, true);
          
          // 将函数暴露到 window 供外部调用
          window.generateSelector = generateSelector;
          window.autoDetectRole = autoDetectRole;
          window.showLabelModal = showLabelModal;
          window.addSelection = addSelection;
          
          console.log('[CFSpider] Select mode enabled');
        })();
      `;
      
      webview.executeJavaScript(selectScript).catch(console.error)
      
      // 使用 Electron webview 的 context-menu 事件来捕获右键点击
      const handleContextMenu = async (e: Event) => {
        const event = e as CustomEvent & { params: { x: number; y: number } }
        const x = event.params?.x || 0
        const y = event.params?.y || 0
        
        console.log('[CFSpider] Context menu at:', x, y)
        
        // 在 webview 中触发元素选择
        try {
          await webview.executeJavaScript(`
            (function() {
              if (!window.__cfspiderSelectMode) return;
              
              var el = document.elementFromPoint(${x}, ${y});
              if (!el) return;
              
              // 忽略选择模式 UI 元素
              if (el.id && el.id.startsWith('cfspider-')) return;
              if (el.className && el.className.toString().includes('cfspider-')) return;
              
              var selector = window.generateSelector ? window.generateSelector(el) : '';
              var autoRole = window.autoDetectRole ? window.autoDetectRole(el) : 'auto';
              
              if (selector && window.showLabelModal) {
                el.classList.add('cfspider-hover-highlight');
                window.showLabelModal(el, selector, autoRole);
              }
            })();
          `)
        } catch (err) {
          console.error('[CFSpider] Context menu handler error:', err)
        }
      }
      
      webview.addEventListener('context-menu', handleContextMenu)
      
      // 轮询检查选择结果（支持多选）
      let lastResultCount = 0
      const pollInterval = setInterval(async () => {
        try {
          const results = await webview.executeJavaScript('window.__cfspiderSelectedResults || []')
          if (results && results.length > lastResultCount) {
            // 有新的选择
            const existing = useStore.getState().selectedElements
            
            for (const result of results) {
              if (!result || !result.selector) continue
              
              // 检查是否已经添加过相同选择器
              const alreadyExists = existing.some(e => e.selector === result.selector)
              
              if (!alreadyExists) {
                addSelectedElement({
                  id: result.id || Date.now().toString(),
                  selector: result.selector,
                  text: result.text || '',
                  tag: result.tag || 'unknown',
                  type: 'text',
                  role: result.role || 'auto'
                })
                console.log('[CFSpider] Element added:', result.selector, 'role:', result.role)
              } else {
                // 更新角色
                const state = useStore.getState()
                const element = state.selectedElements.find(e => e.selector === result.selector)
                if (element && element.role !== result.role) {
                  state.updateElementType?.(element.id, element.type, undefined)
                }
              }
            }
            
            lastResultCount = results.length
          }
        } catch (e) {
          // 忽略错误
        }
      }, 300)
      
      return () => {
        clearInterval(pollInterval)
        webview.removeEventListener('context-menu', handleContextMenu)
        // 清理选择模式
        webview.executeJavaScript(`
          (function() {
            window.__cfspiderSelectMode = false;
            window.__cfspiderSelectedResults = [];
            if (window.__cfspiderMouseMoveHandler) {
              document.removeEventListener('mousemove', window.__cfspiderMouseMoveHandler, true);
              window.__cfspiderMouseMoveHandler = null;
            }
            if (window.__cfspiderClickHandler) {
              document.removeEventListener('click', window.__cfspiderClickHandler, true);
              window.__cfspiderClickHandler = null;
            }
            if (window.__cfspiderContextMenuHandler) {
              document.removeEventListener('contextmenu', window.__cfspiderContextMenuHandler, true);
              window.__cfspiderContextMenuHandler = null;
            }
            document.querySelectorAll('[id^="cfspider-"]').forEach(function(el) { el.remove(); });
            document.querySelectorAll('.cfspider-hover-highlight, .cfspider-selected-title, .cfspider-selected-content, .cfspider-selected-link').forEach(function(el) {
              el.classList.remove('cfspider-hover-highlight', 'cfspider-selected-title', 'cfspider-selected-content', 'cfspider-selected-link');
            });
            console.log('[CFSpider] Select mode disabled');
          })();
        `).catch(console.error)
      }
    }
  }, [selectMode, addSelectedElement])

  // 监听快捷键事件
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return

    // F5/Ctrl+R - 刷新
    window.electronAPI.onReloadWebview(() => {
      reload()
    })

    // Alt+Left - 后退
    window.electronAPI.onNavigateBack(() => {
      goBack()
    })

    // Alt+Right - 前进
    window.electronAPI.onNavigateForward(() => {
      goForward()
    })

    // Ctrl+L - 聚焦地址栏
    window.electronAPI.onFocusAddressbar(() => {
      const addressInput = document.querySelector('input[placeholder="搜索或输入网址"]') as HTMLInputElement
      if (addressInput) {
        addressInput.focus()
        addressInput.select()
      }
    })

    // Ctrl+T - 新建标签页
    if (window.electronAPI.onNewTab) {
      window.electronAPI.onNewTab(() => {
        addTab()
      })
    }

    // Ctrl+W - 关闭当前标签页
    if (window.electronAPI.onCloseTab) {
      window.electronAPI.onCloseTab(() => {
        closeTab(activeTabId)
      })
    }
  }, [reload, goBack, goForward, addTab, closeTab, activeTabId])

  return (
    <div className="flex flex-col h-full">
      {/* 标签栏 */}
      <TabBar />
      
      {/* 工具栏 */}
      <Toolbar
        onBack={goBack}
        onForward={goForward}
        onReload={reload}
        onStop={stop}
        onSettingsClick={onSettingsClick}
      />
      
      {/* 地址栏 */}
      <AddressBar url={url} onNavigate={navigate} />
      
        {/* WebView (Electron) 或 iframe (浏览器) */}
      <div className="flex-1 bg-white relative overflow-hidden" id="browser-container">
        {isElectron ? (
          url ? (
            <webview
              ref={webviewRef as React.RefObject<HTMLWebViewElement>}
              src={url}
              style={{ width: '100%', height: '100%', display: 'flex' }}
              partition="persist:cfspider"
              // @ts-ignore - webview attribute
              allowpopups="true"
              useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-50">
              <div className="text-gray-400 text-sm">正在加载...</div>
            </div>
          )
        ) : (
          <>
            <iframe
              ref={iframeRef}
              src={url}
              className="w-full h-full border-none"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
            <div className="absolute top-2 left-2 bg-yellow-500/90 text-black px-3 py-1 rounded-lg text-sm">
              浏览器预览模式 - AI 功能需要在 Electron 中运行
            </div>
          </>
        )}
        
        {/* 虚拟鼠标 - AI 操作时显示 */}
        <VirtualMouse />
      </div>
    </div>
  )
}
