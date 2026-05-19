import { useState, KeyboardEvent, useRef, useEffect } from 'react'
import { Send, Loader2, Square } from 'lucide-react'
import { useStore } from '../../store'

interface InputBoxProps {
  onSend: (content: string) => void
  disabled?: boolean
}

export default function InputBox({ onSend, disabled }: InputBoxProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { stopAI } = useStore()

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const scrollHeight = textareaRef.current.scrollHeight
      // 最大高度 120px (约5行)
      textareaRef.current.style.height = Math.min(scrollHeight, 120) + 'px'
    }
  }, [input])

  const handleSend = () => {
    if (!input.trim() || disabled) return
    onSend(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="p-3 border-t border-gray-100">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="输入指令... (Enter发送, Shift+Enter换行)"
          rows={1}
          className="flex-1 text-sm bg-gray-100 text-gray-800 border-0 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 resize-none overflow-y-auto"
          style={{ minHeight: '40px', maxHeight: '120px' }}
        />
        {disabled ? (
          <button
            onClick={stopAI}
            className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 flex-shrink-0 animate-pulse"
            title="Stop AI"
          >
            <Square size={16} fill="white" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
