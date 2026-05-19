import { useRef, useEffect } from 'react'
import MessageList from './MessageList'
import InputBox from './InputBox'
import { useStore } from '../../store'
import { sendAIMessage } from '../../services/ai'

export default function AIChat() {
  const { messages, isAILoading } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async (content: string) => {
    await sendAIMessage(content)
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm px-6">
            <p>告诉我你想做什么</p>
            <p className="text-xs mt-2 text-gray-300">例如: 搜索京东、点击登录按钮</p>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>

      {/* 输入框 */}
      <InputBox onSend={handleSend} disabled={isAILoading} />
    </div>
  )
}
