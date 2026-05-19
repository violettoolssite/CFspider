import { Plus, X } from 'lucide-react'
import { useStore } from '../../store'

export default function TabBar() {
  const { tabs, activeTabId, addTab, closeTab, setActiveTab } = useStore()

  return (
    <div className="flex items-center bg-gray-100 border-b border-gray-200 h-9 px-1">
      {/* 标签页列表 */}
      <div className="flex items-center flex-1 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              group flex items-center gap-1 px-3 py-1.5 min-w-[120px] max-w-[200px]
              cursor-pointer rounded-t-lg
              ${tab.id === activeTabId 
                ? 'bg-white border-t border-l border-r border-gray-200' 
                : 'hover:bg-gray-200'
              }
            `}
          >
            {/* 加载指示器 */}
            {tab.isLoading && (
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
            
            {/* 标题 */}
            <span className="flex-1 text-xs truncate text-gray-700">
              {tab.title || '新标签页'}
            </span>
            
            {/* 关闭按钮 */}
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className="p-0.5 rounded hover:bg-gray-300 opacity-0 group-hover:opacity-100"
              >
                <X size={12} className="text-gray-500" />
              </button>
            )}
          </div>
        ))}
      </div>
      
      {/* 新建标签页按钮 */}
      <button
        onClick={() => addTab()}
        className="p-1.5 rounded hover:bg-gray-200 ml-1"
        title="新建标签页 (Ctrl+T)"
      >
        <Plus size={16} className="text-gray-600" />
      </button>
    </div>
  )
}
