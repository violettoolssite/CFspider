import { useState, useEffect, KeyboardEvent } from 'react'
import { Globe, Lock } from 'lucide-react'

interface AddressBarProps {
  url: string
  onNavigate: (url: string) => void
}

export default function AddressBar({ url, onNavigate }: AddressBarProps) {
  const [inputValue, setInputValue] = useState(url)

  useEffect(() => {
    setInputValue(url)
  }, [url])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onNavigate(inputValue)
    }
  }

  const isSecure = url.startsWith('https://')

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-100">
      <div className="flex items-center flex-1 gap-2 px-4 py-2 bg-white rounded-full border border-gray-200 hover:shadow-sm transition-shadow">
        {isSecure ? (
          <Lock size={14} className="text-green-600 flex-shrink-0" />
        ) : (
          <Globe size={14} className="text-gray-400 flex-shrink-0" />
        )}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent border-none outline-none text-sm text-gray-800"
          placeholder="搜索或输入网址"
        />
      </div>
    </div>
  )
}
