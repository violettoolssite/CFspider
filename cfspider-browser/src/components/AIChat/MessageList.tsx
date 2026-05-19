import { useState } from 'react'
import { Loader2, Check, FileJson, FileSpreadsheet, FileText, MousePointer2, Wand2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Message, useStore } from '../../store'
import { toExcel, toJSON } from '../../services/extractor'
import { sendAIMessage } from '../../services/ai'

interface MessageListProps {
  messages: Message[]
}

// 爬取结果卡片组件
function CrawlResultCard({ content }: { content: string }) {
  const store = useStore()
  
  // 解析爬取结果
  const lines = content.split('\n').filter(l => l.trim())
  
  // 提取数据项（带原始序号）
  const items: { index: number; value: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('提示：')) break
    
    // 匹配多种格式：
    // 1. "**数字. 标题**" (full 模式)
    // 2. "数字. 内容" (普通模式)
    const fullMatch = line.match(/^\*\*(\d+)\.\s+(.+?)\*\*$/)
    const simpleMatch = line.match(/^(\d+)\.\s+(.+)$/)
    
    if (fullMatch) {
      items.push({
        index: parseInt(fullMatch[1]),
        value: fullMatch[2]
      })
    } else if (simpleMatch) {
      items.push({
        index: parseInt(simpleMatch[1]),
        value: simpleMatch[2]
      })
    }
  }
  
  // 使用实际解析到的数量，而不是从标题解析
  const count = items.length
  
  // 导出功能（用户选择保存路径）
  const handleExport = async (format: 'json' | 'csv' | 'excel' | 'txt') => {
    const { extractedData } = store
    if (!extractedData || extractedData.length === 0) return
    
    const flatData = extractedData.flatMap(d => d.values)
    const timestamp = Date.now()
    let exportContent = ''
    let filename = `crawl_data_${timestamp}`
    
    switch (format) {
      case 'json':
        exportContent = toJSON(extractedData)
        filename += '.json'
        break
      case 'csv':
        exportContent = 'index,value\n' + flatData.map((v, i) => `${i + 1},"${v.replace(/"/g, '""')}"`).join('\n')
        filename += '.csv'
        break
      case 'txt':
        exportContent = flatData.join('\n')
        filename += '.txt'
        break
      case 'excel': {
        filename += '.xlsx'
        // 使用 xlsx 库生成 Excel
        const blob = await toExcel(extractedData)
        if (blob && window.electronAPI?.saveFile) {
          const arrayBuffer = await blob.arrayBuffer()
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
          await window.electronAPI.saveFile({
            content: base64,
            filename,
            type: 'excel',
            isBase64: true
          })
        }
        return
      }
    }
    
    // 保存文件（用户选择路径）
    if (window.electronAPI?.saveFile) {
      await window.electronAPI.saveFile({
        content: exportContent,
        filename,
        type: format
      })
    } else {
      // 浏览器环境回退
      const blob = new Blob([exportContent], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }
  }
  
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-yellow-800 font-medium flex items-center gap-2">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
          爬取到 {count} 条数据
        </div>
      </div>
      
      {/* 数据列表 */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {items.slice(0, 10).map((item, i) => (
          <div key={i} className="bg-white px-2 py-1.5 rounded text-sm flex items-start gap-2 border border-yellow-100">
            <span className="text-yellow-600 font-mono text-xs bg-yellow-100 px-1.5 py-0.5 rounded flex-shrink-0">
              {item.index}
            </span>
            <span className="font-mono text-gray-700 break-all text-xs leading-relaxed">
              {item.value.length > 150 ? item.value.slice(0, 150) + '...' : item.value}
            </span>
          </div>
        ))}
        {items.length > 10 && (
          <div className="text-center text-xs text-gray-500 py-1">
            ... 还有 {items.length - 10} 条数据
          </div>
        )}
      </div>
      
      {/* 导出按钮 */}
      <div className="mt-3 pt-2 border-t border-yellow-200 flex flex-wrap gap-2">
        <button
          onClick={() => handleExport('json')}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          <FileJson size={12} />
          JSON
        </button>
        <button
          onClick={() => handleExport('csv')}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
        >
          <FileSpreadsheet size={12} />
          CSV
        </button>
        <button
          onClick={() => handleExport('excel')}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 transition-colors"
        >
          <FileSpreadsheet size={12} />
          Excel
        </button>
        <button
          onClick={() => handleExport('txt')}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
        >
          <FileText size={12} />
          TXT
        </button>
      </div>
    </div>
  )
}

// 元素选择卡片组件
function ElementSelectionCard({ data }: { data: { id: string; purpose: string; suggestedSelector: string } }) {
  const store = useStore()
  const [selected, setSelected] = useState<'auto' | 'manual' | null>(null)
  const [isManualMode, setIsManualMode] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  
  const handleAutoSelect = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (isProcessing || selected) return
    setIsProcessing(true)
    setSelected('auto')
    
    // 确保手动选择模式关闭
    store.setSelectMode(false)
    store.setElementSelectionRequest(null)
    
    // 继续让 AI 使用建议的选择器进行爬取
    await sendAIMessage(`使用选择器 "${data.suggestedSelector}" 进行爬取`)
    setIsProcessing(false)
  }
  
  const handleManualSelect = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (isProcessing || selected) return
    setSelected('manual')
    setIsManualMode(true)
    
    // 清空之前的选择
    const state = useStore.getState()
    if (state.clearSelectedElements) {
      state.clearSelectedElements()
    }
    
    store.setSelectMode(true)
  }
  
  const handleConfirmManual = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const { selectedElements } = useStore.getState()
    if (selectedElements.length > 0) {
      store.setSelectMode(false)
      setIsManualMode(false)
      store.setElementSelectionRequest(null)
      
      // 构建选择器信息
      const titleSelectors = selectedElements.filter(e => e.role === 'title').map(e => e.selector)
      const contentSelectors = selectedElements.filter(e => e.role === 'content').map(e => e.selector)
      const linkSelectors = selectedElements.filter(e => e.role === 'link').map(e => e.selector)
      const autoSelectors = selectedElements.filter(e => e.role === 'auto' || !e.role).map(e => e.selector)
      
      let message = '用户已选择以下元素:\n'
      if (titleSelectors.length > 0) message += `标题选择器: ${titleSelectors.join(', ')}\n`
      if (contentSelectors.length > 0) message += `内容选择器: ${contentSelectors.join(', ')}\n`
      if (linkSelectors.length > 0) message += `链接选择器: ${linkSelectors.join(', ')}\n`
      if (autoSelectors.length > 0) message += `其他选择器: ${autoSelectors.join(', ')}\n`
      message += '请使用这些选择器进行爬取'
      
      await sendAIMessage(message)
    } else {
      alert('请先在页面上右键点击选择元素')
    }
  }
  
  if (selected === 'auto') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-2">
        <div className="flex items-center gap-2 text-green-700">
          <Check size={16} />
          <span>已选择自动模式，正在爬取...</span>
        </div>
      </div>
    )
  }
  
  if (isManualMode) {
    const selectedElements = useStore.getState().selectedElements
    const titleCount = selectedElements.filter(e => e.role === 'title').length
    const contentCount = selectedElements.filter(e => e.role === 'content').length
    const linkCount = selectedElements.filter(e => e.role === 'link').length
    const totalCount = selectedElements.length
    
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
        <div className="text-blue-800 font-medium mb-2 flex items-center gap-2">
          <MousePointer2 size={16} />
          多选模式 - 右键选择元素类型
        </div>
        <p className="text-sm text-blue-600 mb-2">
          右键点击元素选择，弹出窗口选择标签类型
        </p>
        
        {/* 已选择的元素统计 */}
        <div className="flex gap-3 mb-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            标题: {titleCount}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            内容: {contentCount}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-pink-500"></span>
            链接: {linkCount}
          </span>
        </div>
        
        {/* 已选择的元素列表 */}
        {totalCount > 0 && (
          <div className="mb-3 max-h-32 overflow-y-auto">
            {selectedElements.map((el, idx) => (
              <div key={el.id} className="flex items-center gap-2 text-xs py-1 border-b border-blue-100 last:border-0">
                <span className={`w-2 h-2 rounded-full ${
                  el.role === 'title' ? 'bg-amber-500' : 
                  el.role === 'content' ? 'bg-emerald-500' : 
                  el.role === 'link' ? 'bg-violet-500' : 'bg-gray-400'
                }`}></span>
                <span className="text-blue-700 truncate flex-1" title={el.selector}>
                  {el.selector}
                </span>
                <button
                  onClick={() => store.removeSelectedElement?.(el.id)}
                  className="text-red-400 hover:text-red-600 px-1"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex gap-2">
          <button
            onClick={handleConfirmManual}
            disabled={totalCount === 0}
            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
              totalCount > 0 
                ? 'bg-blue-500 text-white hover:bg-blue-600' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            确认选择 ({totalCount})
          </button>
          <button
            onClick={() => {
              setIsManualMode(false)
              setSelected(null)
              store.setSelectMode(false)
              useStore.getState().clearSelectedElements?.()
            }}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
          >
            取消
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mt-2">
      <div className="text-purple-800 font-medium mb-2">
        {data.purpose}
      </div>
      <p className="text-sm text-purple-600 mb-3">
        请选择元素选择方式：
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleAutoSelect}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all text-sm font-medium shadow-md hover:shadow-lg"
        >
          <Wand2 size={18} />
          <span>自动选择</span>
        </button>
        <button
          onClick={handleManualSelect}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 hover:border-purple-400 transition-all text-sm font-medium"
        >
          <MousePointer2 size={18} />
          <span>手动选择</span>
        </button>
      </div>
      <p className="text-xs text-purple-400 mt-2 text-center">
        自动选择使用 AI 推荐的选择器 · 手动选择可在页面上点击元素
      </p>
    </div>
  )
}

// 继续按钮组件 - 当达到操作限制时显示
function ContinueButton() {
  const [isLoading, setIsLoading] = useState(false)
  const { isAILoading } = useStore()
  
  const handleContinue = async () => {
    if (isLoading || isAILoading) return
    setIsLoading(true)
    try {
      await sendAIMessage('继续')
    } finally {
      setIsLoading(false)
    }
  }
  
  if (isAILoading) return null
  
  return (
    <div className="flex justify-center mt-3">
      <button
        onClick={handleContinue}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-md"
      >
        {isLoading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            继续中...
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            继续执行
          </>
        )}
      </button>
    </div>
  )
}

// 获取工具调用的友好描述
function getToolDescription(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'navigate_to': {
      const url = (args.url as string) || ''
      // 简化 URL 显示
      try {
        const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url)
        return `跳转: ${urlObj.hostname}${urlObj.pathname.length > 20 ? urlObj.pathname.slice(0, 20) + '...' : urlObj.pathname}`
      } catch {
        return `跳转: ${url.slice(0, 30)}${url.length > 30 ? '...' : ''}`
      }
    }
    case 'click_element': {
      const selector = (args.selector as string) || ''
      // 识别常见的搜索按钮
      if (selector.includes('search') || selector.includes('submit') || selector === '#su' || selector === '#search_icon') {
        return '点击搜索按钮'
      }
      if (selector.includes('button') || selector.includes('btn')) {
        return '点击按钮'
      }
      if (selector.includes('input') || selector.includes('#kw') || selector.includes('#q')) {
        return '点击输入框'
      }
      return '点击元素'
    }
    case 'click_text': {
      const text = (args.text as string) || ''
      return `点击: ${text.slice(0, 20)}${text.length > 20 ? '...' : ''}`
    }
    case 'input_text': {
      const text = (args.text as string) || ''
      return `输入: ${text.slice(0, 15)}${text.length > 15 ? '...' : ''}`
    }
    case 'scroll_page': {
      const dirs: Record<string, string> = { up: '上滚', down: '下滚', top: '顶部', bottom: '底部' }
      return dirs[args.direction as string] || '滚动'
    }
    case 'wait':
      return `等待 ${((args.ms as number) || 1000) / 1000}s`
    case 'extract_elements':
      return '提取内容'
    case 'get_page_info':
      return '获取页面信息'
    case 'go_back':
      return '返回上一页'
    case 'go_forward':
      return '前进到下一页'
    case 'get_images':
      return '获取图片列表'
    case 'get_main_image':
      return '获取主图URL'
    case 'download_image': {
      const filename = (args.filename as string) || ''
      return `下载: ${filename}`
    }
    case 'add_selector':
      return '添加选择器'
    case 'set_search_engine': {
      const engineNames: Record<string, string> = {
        'bing': 'Bing',
        'google': 'Google',
        'baidu': '百度',
        'duckduckgo': 'DuckDuckGo'
      }
      const engine = args.engine as string
      return `设置搜索引擎: ${engineNames[engine] || engine}`
    }
    case 'get_settings':
      return '获取设置'
    case 'crawl_elements': {
      const selector = (args.selector as string) || ''
      const type = (args.type as string) || 'text'
      const typeNames: Record<string, string> = { text: '文本', link: '链接', image: '图片', attribute: '属性' }
      return `爬取${typeNames[type] || type}: ${selector.slice(0, 20)}${selector.length > 20 ? '...' : ''}`
    }
    case 'export_data': {
      const format = (args.format as string) || ''
      return `导出 ${format.toUpperCase()}`
    }
    case 'clear_highlight':
      return '清除高亮'
    case 'request_element_selection': {
      const purpose = (args.purpose as string) || ''
      return `请求元素选择: ${purpose}`
    }
    case 'click_search_button':
      return '点击搜索按钮'
    case 'press_enter':
      return '按下回车键'
    case 'analyze_page':
      return '分析页面'
    case 'scan_interactive_elements':
      return '扫描交互元素'
    case 'get_page_content':
      return '获取页面内容'
    case 'find_element': {
      const desc = (args.description as string) || ''
      return `查找元素: ${desc.slice(0, 15)}${desc.length > 15 ? '...' : ''}`
    }
    case 'check_element_exists': {
      const selector = (args.selector as string) || ''
      return `检查元素: ${selector.slice(0, 15)}${selector.length > 15 ? '...' : ''}`
    }
    case 'verify_action':
      return '验证操作结果'
    case 'retry_with_alternative':
      return '尝试其他方法'
    default:
      return toolName
  }
}

export default function MessageList({ messages }: MessageListProps) {
  return (
    <div className="p-3 space-y-3">
      {messages.map((message) => {
        const isThinking = message.content === 'thinking'
        const hasToolsExecuting = message.toolCalls?.some(t => t.result === '执行中...')
        const hasTools = message.toolCalls && message.toolCalls.length > 0
        const hasContent = message.content && message.content !== 'thinking'
        
        return (
          <div key={message.id}>
            {/* 用户消息 */}
            {message.role === 'user' && (
              <div className="flex justify-end">
                <div className="bg-blue-500 text-white px-3 py-2 rounded-2xl rounded-br-md text-sm max-w-[85%] break-words whitespace-pre-wrap overflow-hidden">
                  {message.content}
                </div>
              </div>
            )}

            {/* AI 消息 */}
            {message.role === 'assistant' && (
              <div className="text-sm space-y-2">
                {/* 思考中 */}
                {isThinking && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 size={12} className="animate-spin" />
                    <span>思考中...</span>
                  </div>
                )}
                
                {/* 工具调用 - 每个工具单独一行显示，带 AI 评论 */}
                {hasTools && (
                  <div className="space-y-1 bg-gray-50 rounded-lg p-2">
                    {message.toolCalls!.map((tool, index) => {
                      const isExecuting = tool.result === '执行中...'
                      const isSuccess = tool.result && tool.result !== '执行中...' && !tool.result.startsWith('错误') && !tool.result.startsWith('未找到')
                      const description = getToolDescription(tool.name, tool.arguments as Record<string, unknown>)
                      const comment = (tool as any).comment as string | undefined
                      
                      return (
                        <div key={index} className="space-y-0.5">
                          {/* AI comment before this tool call */}
                          {comment && (
                            <div className="text-xs text-blue-600 italic pl-3 py-0.5 border-l-2 border-blue-300 bg-blue-50/50 rounded-r">
                              {comment}
                            </div>
                          )}
                          {/* Tool execution status */}
                          <div className="flex items-center gap-1.5 text-xs py-0.5">
                            {isExecuting ? (
                              <Loader2 size={10} className="text-blue-500 animate-spin flex-shrink-0" />
                            ) : isSuccess ? (
                              <Check size={10} className="text-green-500 flex-shrink-0" />
                            ) : (
                              <span className="text-gray-400 flex-shrink-0 w-2.5">•</span>
                            )}
                            <span className={isSuccess ? 'text-gray-700' : 'text-gray-400'}>
                              {description}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                
                {/* 元素选择卡片 */}
                {message.toolCalls?.some(t => t.result?.includes('__ELEMENT_SELECTION_REQUEST__')) && (() => {
                  const tool = message.toolCalls?.find(t => t.result?.includes('__ELEMENT_SELECTION_REQUEST__'))
                  if (tool?.result) {
                    const match = tool.result.match(/__ELEMENT_SELECTION_REQUEST__(.+?)__END__/)
                    if (match) {
                      try {
                        const data = JSON.parse(match[1])
                        return <ElementSelectionCard data={data} />
                      } catch {
                        return null
                      }
                    }
                  }
                  return null
                })()}
                
                {/* 爬取结果卡片 */}
                {hasContent && message.content?.includes('【爬取结果】') && (
                  <CrawlResultCard content={message.content} />
                )}
                
                {/* 达到限制时显示继续按钮 */}
                {hasContent && (message.content?.includes('Max iterations reached') || message.content?.includes('达到最大操作次数')) && (
                  <ContinueButton />
                )}
                
                {/* Final AI message - normal Markdown rendering */}
                {hasContent && !message.content?.includes('【爬取结果】') && !message.content?.includes('__ELEMENT_SELECTION_REQUEST__') && (
                  <div className="text-gray-700 leading-relaxed mt-2 break-words overflow-hidden text-sm">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="break-words">{children}</li>,
                        code: ({ children, className, ...props }) => {
                          const match = /language-(\w+)/.exec(className || '')
                          const codeString = String(children).replace(/\n$/, '')
                          
                          if (match) {
                            return (
                              <div className="my-2 rounded-lg overflow-hidden">
                                <div className="bg-gray-800 px-3 py-1 text-xs text-gray-400 border-b border-gray-700">
                                  {match[1]}
                                </div>
                                <SyntaxHighlighter
                                  style={oneDark}
                                  language={match[1]}
                                  PreTag="div"
                                  customStyle={{
                                    margin: 0,
                                    padding: '12px',
                                    fontSize: '12px',
                                    borderRadius: '0 0 8px 8px',
                                  }}
                                  {...props}
                                >
                                  {codeString}
                                </SyntaxHighlighter>
                              </div>
                            )
                          }
                          
                          return (
                            <code className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-xs font-mono border border-gray-200">
                              {children}
                            </code>
                          )
                        },
                        pre: ({ children }) => <>{children}</>,
                        a: ({ href, children }) => (
                          <a href={href} className="text-blue-500 hover:underline break-all" target="_blank" rel="noopener noreferrer">
                            {children}
                          </a>
                        ),
                        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mb-2 mt-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-3 border-blue-400 pl-3 py-1 text-gray-600 my-2 bg-blue-50 rounded-r">{children}</blockquote>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
                
                {/* 处理中 */}
                {!hasContent && !isThinking && hasTools && !hasToolsExecuting && (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 size={12} className="animate-spin" />
                    <span>处理中...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
