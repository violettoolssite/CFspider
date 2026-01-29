import { useState, useEffect, useRef } from 'react'
import { MessageCircle, X, History, Trash2, Plus, ChevronDown, Bell, AlertCircle, Lightbulb, CheckCircle2, LogIn, Coins, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react'
import Browser from './components/Browser/Browser'
import AIChat from './components/AIChat/AIChat'
import SettingsModal from './components/Settings/SettingsModal'
import { useStore, HeartbeatNotification } from './store'
import { startHeartbeat, stopHeartbeat } from './services/heartbeat'

// 格式化 token 数量显示
function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'K'
  }
  return count.toString()
}

// 动画数字 hook - 实现数字渐变效果
function useAnimatedNumber(targetValue: number, duration: number = 500): number {
  const [displayValue, setDisplayValue] = useState(targetValue)
  const animationRef = useRef<number | null>(null)
  const startValueRef = useRef(targetValue)
  const startTimeRef = useRef<number | null>(null)
  
  useEffect(() => {
    if (targetValue === displayValue) return
    
    // 取消之前的动画
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    
    startValueRef.current = displayValue
    startTimeRef.current = null
    
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp
      }
      
      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      
      // 使用 easeOutQuad 缓动函数
      const easeProgress = 1 - (1 - progress) * (1 - progress)
      
      const currentValue = Math.round(
        startValueRef.current + (targetValue - startValueRef.current) * easeProgress
      )
      
      setDisplayValue(currentValue)
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }
    
    animationRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [targetValue, duration])
  
  return displayValue
}

// 从模型名称获取简短的 AI 助手名称
function getShortModelName(model: string): string {
  if (!model) return ''
  const lowerModel = model.toLowerCase()
  if (lowerModel.includes('gpt-4')) return 'GPT-4'
  if (lowerModel.includes('gpt-3')) return 'GPT-3.5'
  if (lowerModel.includes('claude')) return 'Claude'
  if (lowerModel.includes('gemini')) return 'Gemini'
  if (lowerModel.includes('deepseek-v3')) return 'DeepSeek-V3'
  if (lowerModel.includes('deepseek-ocr')) return 'DeepSeek-OCR'
  if (lowerModel.includes('deepseek')) return 'DeepSeek'
  if (lowerModel.includes('qwen')) return 'Qwen'
  if (lowerModel.includes('glm')) return 'GLM'
  if (lowerModel.includes('llama')) return 'LLaMA'
  if (lowerModel.includes('mistral')) return 'Mistral'
  // 显示模型名称的后部分
  return model.split('/').pop()?.split(':')[0] || model
}

// 从配置获取 AI 显示名称
function getAIDisplayInfo(config: any): { name: string; isDual: boolean; models: string[] } {
  // 使用内置 AI
  if (config.useBuiltIn || (!config.endpoint && !config.apiKey)) {
    return {
      name: 'DeepSeek',
      isDual: true,
      models: ['DeepSeek-V3 (工具)', 'DeepSeek-OCR (视觉)']
    }
  }
  
  // 双模型模式
  if (config.modelMode === 'dual' && config.visionModel) {
    const toolName = getShortModelName(config.model)
    const visionName = getShortModelName(config.visionModel)
    return {
      name: toolName,
      isDual: true,
      models: [`${toolName} (工具)`, `${visionName} (视觉)`]
    }
  }
  
  // 单模型模式
  return {
    name: getShortModelName(config.model) || 'AI 助手',
    isDual: false,
    models: [config.model]
  }
}

// 通知图标组件
function NotificationIcon({ type }: { type: HeartbeatNotification['type'] }) {
  switch (type) {
    case 'login_detected': return <LogIn size={12} />
    case 'error_recovery': return <AlertCircle size={12} />
    case 'skill_suggestion': return <Lightbulb size={12} />
    case 'task_complete': return <CheckCircle2 size={12} />
    default: return <Bell size={12} />
  }
}

function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showTokenDetails, setShowTokenDetails] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const { 
    loadConfig, loadSavedConfigs, loadBrowserSettings, loadChatSessions,
    aiConfig, chatSessions, clearMessages, newChatSession, 
    switchChatSession, deleteChatSession,
    heartbeatNotifications, heartbeatEnabled, handleHeartbeatAction, removeHeartbeatNotification,
    tokenUsage, resetTokenUsage, updateTokenRateDirection
  } = useStore()
  
  // 定时更新 token 速率方向
  useEffect(() => {
    const interval = setInterval(() => {
      updateTokenRateDirection()
    }, 500) // 每 500ms 更新一次
    return () => clearInterval(interval)
  }, [updateTokenRateDirection])
  
  const aiInfo = getAIDisplayInfo(aiConfig)
  const [showModelDetails, setShowModelDetails] = useState(false)
  const { currentModelType, isAILoading } = useStore()
  
  // 使用动画数字显示 token
  const animatedTokenTotal = useAnimatedNumber(tokenUsage.total, 800)
  
  // 启动心跳服务
  useEffect(() => {
    if (heartbeatEnabled) {
      startHeartbeat()
    }
    return () => stopHeartbeat()
  }, [heartbeatEnabled])

  useEffect(() => {
    // 并行加载所有配置
    Promise.all([
      loadConfig(),
      loadSavedConfigs(),
      loadBrowserSettings(),
      loadChatSessions()
    ]).then(() => setIsReady(true))
  }, [])

  // 等待设置加载完成（简化加载界面）
  if (!isReady) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-white">
      {/* 浏览器 - 占满整个窗口 */}
      <Browser onSettingsClick={() => setShowSettings(true)} />

      {/* AI 悬浮按钮 */}
      {!showAI && (
        <button
          onClick={() => setShowAI(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-500/90 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center z-[99999]"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* AI 对话悬浮窗 - 半透明以便观察操作过程 */}
      {showAI && (
        <div className="fixed bottom-6 right-6 w-[420px] h-[600px] bg-white/85 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200/50 flex flex-col overflow-hidden z-[99999]">
          {/* 悬浮窗头部 */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-500/90 text-white">
            <div className="flex items-center gap-2">
              {/* 模型名称，双模型显示 +2 标识 */}
              <div className="relative">
                <button
                  onClick={() => aiInfo.isDual && setShowModelDetails(!showModelDetails)}
                  className={`font-medium flex items-center gap-1 ${aiInfo.isDual ? 'hover:bg-white/20 px-2 py-0.5 rounded cursor-pointer' : ''}`}
                >
                  {aiInfo.name}
                  {aiInfo.isDual && (
                    <span className="text-xs bg-white/30 px-1.5 py-0.5 rounded-full">+2</span>
                  )}
                  {/* 当前调用模型类型指示器 */}
                  {currentModelType && (
                    <span className={`text-xs px-1.5 py-0.5 rounded animate-pulse ${
                      currentModelType === 'vision' ? 'bg-purple-400' : 'bg-green-400'
                    }`}>
                      {currentModelType === 'vision' ? '视' : '工'}
                    </span>
                  )}
                </button>
                {/* 模型详情下拉 */}
                {showModelDetails && aiInfo.isDual && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
                    <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-100">双模型配置</div>
                    {aiInfo.models.map((model, i) => (
                      <div key={i} className="px-3 py-1.5 text-sm text-gray-700">
                        {model}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* 历史记录下拉 */}
              <div className="relative">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="p-1 hover:bg-white/20 rounded flex items-center gap-1 text-sm"
                  title="历史记录"
                >
                  <History size={16} />
                  <ChevronDown size={14} />
                </button>
                {showHistory && (
                  <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 max-h-80 overflow-auto">
                    <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-500">历史记录</span>
                      <button
                        onClick={() => { newChatSession(); setShowHistory(false); }}
                        className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
                      >
                        <Plus size={12} />
                        新对话
                      </button>
                    </div>
                    {chatSessions.length === 0 ? (
                      <div className="px-3 py-4 text-center text-gray-400 text-xs">暂无历史记录</div>
                    ) : (
                      chatSessions.map(session => (
                        <div
                          key={session.id}
                          className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between group"
                          onClick={() => { switchChatSession(session.id); setShowHistory(false); }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-700 truncate">{session.title}</div>
                            <div className="text-xs text-gray-400">{new Date(session.updatedAt).toLocaleDateString()}</div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteChatSession(session.id); }}
                            className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Token 消耗显示 */}
              <div className="relative">
                <button
                  onClick={() => setShowTokenDetails(!showTokenDetails)}
                  className="flex items-center gap-1 px-2 py-1 hover:bg-white/20 rounded text-xs"
                  title={`Token 消耗: ${tokenUsage.total}${tokenUsage.currentRate > 0 ? ` (${Math.round(tokenUsage.currentRate)} tokens/s)` : ''}`}
                >
                  <Coins size={14} />
                  <span className={`transition-colors duration-300 ${tokenUsage.rateDirection === 'up' ? 'text-green-300' : tokenUsage.rateDirection === 'down' ? 'text-yellow-300' : ''}`}>
                    {formatTokenCount(animatedTokenTotal)}
                  </span>
                  {tokenUsage.rateDirection === 'up' && (
                    <TrendingUp size={12} className="text-green-300 animate-pulse" />
                  )}
                  {tokenUsage.rateDirection === 'down' && (
                    <TrendingDown size={12} className="text-yellow-300" />
                  )}
                </button>
                {/* Token 详情下拉列表 */}
                {showTokenDetails && (
                  <div className="absolute top-full right-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
                    <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-500 font-medium">Token 消耗统计</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          resetTokenUsage()
                        }}
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded"
                        title="重置统计"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                    <div className="px-3 py-2 border-b border-gray-100">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-700 font-medium">总计</span>
                        <span className="text-sm text-blue-600 font-bold">{formatTokenCount(tokenUsage.total)}</span>
                      </div>
                      {/* 按类型分类 */}
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        <div className="text-center p-1 bg-blue-50 rounded">
                          <div className="text-gray-400">工具</div>
                          <div className="text-blue-600 font-medium">{formatTokenCount(tokenUsage.byType?.tool || 0)}</div>
                        </div>
                        <div className="text-center p-1 bg-purple-50 rounded">
                          <div className="text-gray-400">视觉</div>
                          <div className="text-purple-600 font-medium">{formatTokenCount(tokenUsage.byType?.vision || 0)}</div>
                        </div>
                        <div className="text-center p-1 bg-gray-50 rounded">
                          <div className="text-gray-400">对话</div>
                          <div className="text-gray-600 font-medium">{formatTokenCount(tokenUsage.byType?.chat || 0)}</div>
                        </div>
                      </div>
                    </div>
                    {Object.keys(tokenUsage.models).length === 0 ? (
                      <div className="px-3 py-4 text-center text-gray-400 text-xs">暂无消耗记录</div>
                    ) : (
                      <div className="max-h-60 overflow-auto">
                        {Object.entries(tokenUsage.models).map(([modelName, usage]) => (
                          <div key={modelName} className="px-3 py-2 border-b border-gray-50 hover:bg-gray-50">
                            <div className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${
                                usage.type === 'vision' ? 'bg-purple-500' :
                                usage.type === 'tool' ? 'bg-blue-500' : 'bg-gray-400'
                              }`}></span>
                              <span className="text-xs text-gray-800 font-medium truncate flex-1" title={modelName}>
                                {getShortModelName(modelName)}
                              </span>
                              <span className={`text-xs px-1 rounded ${
                                usage.type === 'vision' ? 'bg-purple-100 text-purple-600' :
                                usage.type === 'tool' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {usage.type === 'vision' ? '视觉' : usage.type === 'tool' ? '工具' : '对话'}
                              </span>
                            </div>
                            <div className="mt-1 grid grid-cols-3 gap-1 text-xs">
                              <div className="text-gray-500">
                                <span className="text-gray-400">输入:</span> {formatTokenCount(usage.promptTokens)}
                              </div>
                              <div className="text-gray-500">
                                <span className="text-gray-400">输出:</span> {formatTokenCount(usage.completionTokens)}
                              </div>
                              <div className="text-gray-500">
                                <span className="text-gray-400">次数:</span> {usage.requestCount}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {/* 通知按钮 */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-1 hover:bg-white/20 rounded relative"
                  title="通知"
                >
                  <Bell size={16} />
                  {heartbeatNotifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {heartbeatNotifications.length > 9 ? '9+' : heartbeatNotifications.length}
                    </span>
                  )}
                </button>
                {/* 通知下拉列表 */}
                {showNotifications && (
                  <div className="absolute top-full right-0 mt-1 w-72 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 max-h-80 overflow-auto">
                    <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-500 font-medium">通知</span>
                      {heartbeatNotifications.length > 0 && (
                        <button
                          onClick={() => useStore.getState().clearHeartbeatNotifications()}
                          className="text-xs text-gray-400 hover:text-red-500"
                        >
                          清空
                        </button>
                      )}
                    </div>
                    {heartbeatNotifications.length === 0 ? (
                      <div className="px-3 py-6 text-center text-gray-400 text-xs">暂无通知</div>
                    ) : (
                      heartbeatNotifications.slice(0, 10).map(notification => (
                        <div
                          key={notification.id}
                          className={`px-3 py-2 border-b border-gray-50 hover:bg-gray-50 ${
                            notification.priority === 'high' ? 'bg-red-50/50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className={`mt-0.5 ${
                              notification.type === 'error_recovery' ? 'text-red-500' :
                              notification.type === 'task_complete' ? 'text-green-500' :
                              notification.type === 'login_detected' ? 'text-amber-500' :
                              notification.type === 'skill_suggestion' ? 'text-purple-500' :
                              'text-blue-500'
                            }`}>
                              <NotificationIcon type={notification.type} />
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-gray-800 font-medium">{notification.title}</div>
                              <div className="text-xs text-gray-500 line-clamp-2">{notification.message}</div>
                              {notification.actions && notification.actions.length > 0 && (
                                <div className="flex gap-1 mt-1.5">
                                  {notification.actions.slice(0, 2).map(action => (
                                    <button
                                      key={action.id}
                                      onClick={() => {
                                        handleHeartbeatAction(notification.id, action.id)
                                        setShowNotifications(false)
                                      }}
                                      className={`px-2 py-0.5 text-xs rounded ${
                                        action.primary
                                          ? 'bg-blue-500 text-white hover:bg-blue-600'
                                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                      }`}
                                    >
                                      {action.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <div className="text-xs text-gray-400 mt-1">
                                {new Date(notification.createdAt).toLocaleTimeString()}
                              </div>
                            </div>
                            <button
                              onClick={() => removeHeartbeatNotification(notification.id)}
                              className="text-gray-300 hover:text-gray-500 p-0.5"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              {/* 清空对话按钮 */}
              <button
                onClick={clearMessages}
                className="p-1 hover:bg-white/20 rounded"
                title="清空对话"
              >
                <Trash2 size={16} />
              </button>
              {/* 关闭按钮 */}
              <button
                onClick={() => setShowAI(false)}
                className="p-1 hover:bg-white/20 rounded"
                title="关闭"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          {/* 对话内容 */}
          <div className="flex-1 overflow-hidden">
            <AIChat />
          </div>
        </div>
      )}

      {/* 设置 */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
