import { 
  ArrowLeft, 
  ArrowRight, 
  RotateCw, 
  X, 
  Settings 
} from 'lucide-react'
import { useStore } from '../../store'

interface ToolbarProps {
  onBack: () => void
  onForward: () => void
  onReload: () => void
  onStop: () => void
  onSettingsClick: () => void
}

export default function Toolbar({
  onBack,
  onForward,
  onReload,
  onStop,
  onSettingsClick
}: ToolbarProps) {
  const { isLoading } = useStore()

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 border-b border-gray-200">
      {/* 导航按钮 */}
      <button
        onClick={onBack}
        className="p-2 hover:bg-gray-200 rounded-full text-gray-600 hover:text-gray-900"
        title="后退"
      >
        <ArrowLeft size={18} />
      </button>
      
      <button
        onClick={onForward}
        className="p-2 hover:bg-gray-200 rounded-full text-gray-600 hover:text-gray-900"
        title="前进"
      >
        <ArrowRight size={18} />
      </button>
      
      {isLoading ? (
        <button
          onClick={onStop}
          className="p-2 hover:bg-gray-200 rounded-full text-gray-600 hover:text-gray-900"
          title="停止"
        >
          <X size={18} />
        </button>
      ) : (
        <button
          onClick={onReload}
          className="p-2 hover:bg-gray-200 rounded-full text-gray-600 hover:text-gray-900"
          title="刷新"
        >
          <RotateCw size={18} />
        </button>
      )}

      <div className="flex-1" />

      {/* 设置按钮 */}
      <button
        onClick={onSettingsClick}
        className="p-2 hover:bg-gray-200 rounded-full text-gray-600 hover:text-gray-900"
        title="AI 设置"
      >
        <Settings size={18} />
      </button>
    </div>
  )
}
