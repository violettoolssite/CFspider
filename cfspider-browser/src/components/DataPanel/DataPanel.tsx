import { useState } from 'react'
import { Trash2, Play, X, Type, Link, Image, Code, Save, FileJson, FileSpreadsheet, FileText } from 'lucide-react'
import { useStore, SelectedElement } from '../../store'
import { saveCurrentAsRule } from '../../services/rules'
import { toTXT, toExcel, toJSON } from '../../services/extractor'

export default function DataPanel() {
  const { 
    selectedElements, 
    removeSelectedElement, 
    clearSelectedElements,
    updateElementType,
    extractedData,
    setExtractedData
  } = useStore()
  
  const [activeTab, setActiveTab] = useState<'elements' | 'data'>('elements')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [ruleName, setRuleName] = useState('')

  // 保存规则
  const handleSaveRule = () => {
    if (!ruleName.trim()) return
    saveCurrentAsRule(ruleName.trim())
    setRuleName('')
    setShowSaveDialog(false)
  }

  // 提取数据
  const handleExtract = async () => {
    // 获取 webview 并执行提取
    const webview = document.querySelector('webview') as Electron.WebviewTag
    if (!webview || selectedElements.length === 0) return

    try {
      const result = await webview.executeJavaScript(`
        window.__cfspiderExtract(${JSON.stringify(selectedElements)})
      `)
      setExtractedData(result)
      setActiveTab('data')
    } catch (error) {
      console.error('Extract error:', error)
    }
  }

  // 导出数据
  const handleExport = async (format: 'json' | 'csv' | 'excel' | 'txt') => {
    if (extractedData.length === 0) return

    const timestamp = Date.now()
    let content: string | Blob
    let filename: string
    let mimeType: string

    switch (format) {
      case 'json':
        content = toJSON(extractedData)
        filename = `cfspider-data-${timestamp}.json`
        mimeType = 'application/json'
        break
      case 'csv': {
        // 转换为 CSV
        const rows: string[][] = []
        const headers = extractedData.map(d => d.selector)
        rows.push(headers)
        
        const maxLength = Math.max(...extractedData.map(d => d.values.length))
        for (let i = 0; i < maxLength; i++) {
          rows.push(extractedData.map(d => d.values[i] || ''))
        }
        
        content = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
        filename = `cfspider-data-${timestamp}.csv`
        mimeType = 'text/csv'
        break
      }
      case 'txt':
        content = toTXT(extractedData)
        filename = `cfspider-data-${timestamp}.txt`
        mimeType = 'text/plain'
        break
      case 'excel': {
        const blob = await toExcel(extractedData)
        if (!blob) {
          console.error('Failed to generate Excel file')
          return
        }
        content = blob
        filename = `cfspider-data-${timestamp}.xlsx`
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        break
      }
    }

    // 保存文件（用户选择路径）
    if (window.electronAPI) {
      let result
      if (content instanceof Blob) {
        // Excel blob 需要特殊处理
        const arrayBuffer = await content.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
        result = await window.electronAPI.saveFile({ 
          filename, 
          content: base64, 
          type: 'excel',
          isBase64: true
        })
      } else {
        result = await window.electronAPI.saveFile({ filename, content, type: format })
      }
      
      // 显示保存结果
      if (result?.success) {
        console.log(`文件已保存到: ${result.filePath}`)
      } else if (result?.error) {
        console.error(result.error)
      }
      // 如果用户取消，不做任何处理
    } else {
      // 浏览器环境下载
      const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const getTypeIcon = (type: SelectedElement['type']) => {
    switch (type) {
      case 'text': return <Type size={14} />
      case 'link': return <Link size={14} />
      case 'image': return <Image size={14} />
      case 'attribute': return <Code size={14} />
    }
  }

  return (
    <div className="flex flex-col h-full bg-dark-100">
      {/* 标签栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('elements')}
            className={`px-3 py-1 text-sm rounded-lg ${
              activeTab === 'elements' 
                ? 'bg-primary text-black' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            已选择 ({selectedElements.length})
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`px-3 py-1 text-sm rounded-lg ${
              activeTab === 'data' 
                ? 'bg-primary text-black' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            提取数据 ({extractedData.reduce((a, d) => a + d.values.length, 0)})
          </button>
        </div>

        <div className="flex gap-2">
          {activeTab === 'elements' ? (
            <>
              <button
                onClick={handleExtract}
                disabled={selectedElements.length === 0}
                className="flex items-center gap-1 px-3 py-1 text-sm bg-primary text-black rounded-lg hover:bg-green-400 disabled:opacity-50"
              >
                <Play size={14} />
                提取
              </button>
              <button
                onClick={() => setShowSaveDialog(true)}
                disabled={selectedElements.length === 0}
                className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 disabled:opacity-50"
              >
                <Save size={14} />
                保存规则
              </button>
              <button
                onClick={clearSelectedElements}
                disabled={selectedElements.length === 0}
                className="flex items-center gap-1 px-3 py-1 text-sm bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-50"
              >
                <Trash2 size={14} />
                清空
              </button>
            </>
          ) : (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => handleExport('json')}
                disabled={extractedData.length === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                title="导出为 JSON"
              >
                <FileJson size={12} />
                JSON
              </button>
              <button
                onClick={() => handleExport('csv')}
                disabled={extractedData.length === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                title="导出为 CSV"
              >
                <FileSpreadsheet size={12} />
                CSV
              </button>
              <button
                onClick={() => handleExport('excel')}
                disabled={extractedData.length === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50"
                title="导出为 Excel"
              >
                <FileSpreadsheet size={12} />
                Excel
              </button>
              <button
                onClick={() => handleExport('txt')}
                disabled={extractedData.length === 0}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                title="导出为纯文本"
              >
                <FileText size={12} />
                TXT
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-3">
        {activeTab === 'elements' ? (
          selectedElements.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              点击"选择元素"按钮，然后在网页上点击要提取的元素
            </div>
          ) : (
            <div className="space-y-2">
              {selectedElements.map((el) => (
                <div
                  key={el.id}
                  className="flex items-center gap-3 p-2 bg-dark-300 rounded-lg"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-primary">{getTypeIcon(el.type)}</span>
                    <code className="text-xs text-gray-400 truncate">
                      {el.selector}
                    </code>
                  </div>
                  <span className="text-sm text-gray-300 truncate max-w-[200px]">
                    {el.preview}
                  </span>
                  <select
                    value={el.type}
                    onChange={(e) => updateElementType(el.id, e.target.value as SelectedElement['type'])}
                    className="text-xs bg-dark-200 border border-gray-600 rounded px-2 py-1"
                  >
                    <option value="text">文本</option>
                    <option value="link">链接</option>
                    <option value="image">图片</option>
                    <option value="attribute">属性</option>
                  </select>
                  <button
                    onClick={() => removeSelectedElement(el.id)}
                    className="p-1 text-gray-500 hover:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          extractedData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              点击"提取"按钮获取数据
            </div>
          ) : (
            <div className="space-y-3">
              {extractedData.map((data, index) => (
                <div key={index} className="bg-dark-300 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-2 font-mono">
                    {data.selector}
                  </div>
                  <div className="space-y-1">
                    {data.values.slice(0, 5).map((value, i) => (
                      <div key={i} className="text-sm text-gray-200 truncate">
                        {value}
                      </div>
                    ))}
                    {data.values.length > 5 && (
                      <div className="text-xs text-gray-500">
                        ... 还有 {data.values.length - 5} 条
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* 保存规则弹窗 */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-100 rounded-xl p-6 w-80">
            <h3 className="text-lg font-medium mb-4">保存规则</h3>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="输入规则名称..."
              className="w-full mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSaveRule()}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                取消
              </button>
              <button
                onClick={handleSaveRule}
                disabled={!ruleName.trim()}
                className="px-4 py-2 bg-primary text-black rounded-lg hover:bg-green-400 disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
