import { useState, useEffect } from 'react'
import { X, Search, Bot, ChevronRight, Check, ChevronDown, Clock, Trash2 } from 'lucide-react'
import { useStore, SEARCH_ENGINES } from '../../store'

// 常用模型列表（用于自定义模式）
const COMMON_MODELS = [
  'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo',
  'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229',
  'deepseek-chat', 'deepseek-coder', 'deepseek-reasoner',
  'gemini-pro', 'gemini-1.5-pro',
  'llama-3.3-70b-versatile', 'llama-3.1-8b-instant',
  'qwen-max', 'qwen-plus', 'qwen-turbo',
  'glm-4-plus', 'glm-4'
]

// AI 服务商预设配置
const AI_PRESETS = [
  { id: 'builtin', name: '内置 AI', endpoint: '', models: [], description: '开箱即用，无需配置', isBuiltIn: true },
  { id: 'custom', name: '自定义', endpoint: '', models: COMMON_MODELS, description: '自定义 API 地址，可选择常用模型' },
  { id: 'github', name: 'GitHub Models', endpoint: 'https://models.github.ai/inference/chat/completions', models: ['deepseek/DeepSeek-V3-0324', 'openai/gpt-4o', 'openai/gpt-4o-mini', 'meta/llama-3.3-70b-instruct', 'mistral-ai/mistral-large-2411'], description: '使用 GitHub PAT，免费额度' },
  { id: 'nvidia', name: 'NVIDIA NIM', endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions', models: ['deepseek-ai/deepseek-v3.2', 'moonshotai/kimi-k2.5', 'deepseek-ai/deepseek-r1', 'meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'mistralai/mistral-large-2-instruct'], description: 'NVIDIA 模型平台，免费试用' },
  { id: 'ollama', name: 'Ollama', endpoint: 'http://localhost:11434/v1/chat/completions', models: ['llama3.2', 'llama3.1', 'qwen2.5', 'deepseek-r1', 'mistral', 'codellama', 'phi3'], description: '本地运行，无需 API Key' },
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1/chat/completions', models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'], description: '国产大模型，性价比高' },
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'], description: 'ChatGPT 官方 API' },
  { id: 'anthropic', name: 'Anthropic', endpoint: 'https://api.anthropic.com/v1/messages', models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'], description: 'Claude 系列' },
  { id: 'groq', name: 'Groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'], description: '超快推理速度' },
  { id: 'google', name: 'Google AI', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'], description: 'Gemini 系列' },
  { id: 'moonshot', name: 'Moonshot', endpoint: 'https://api.moonshot.cn/v1/chat/completions', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'], description: 'Kimi 大模型' },
  { id: 'zhipu', name: '智谱 AI', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', models: ['glm-4-plus', 'glm-4', 'glm-4-flash'], description: 'ChatGLM 系列' },
  { id: 'qwen', name: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', models: ['qwen-max', 'qwen-plus', 'qwen-turbo'], description: '阿里云大模型' },
  { id: 'siliconflow', name: 'SiliconFlow', endpoint: 'https://api.siliconflow.cn/v1/chat/completions', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'meta-llama/Llama-3.3-70B-Instruct'], description: '国产模型聚合平台' },
  { id: 'opencode', name: 'OpenCode Zen', endpoint: 'https://opencode.ai/zen/v1/chat/completions', models: ['glm-4.7-free', 'gpt-5-nano', 'kimi-k2.5-free', 'trinity-large-preview-free', 'big-pickle', 'claude-opus-4-5', 'claude-sonnet-4-5', 'gpt-5.2', 'gpt-5', 'gemini-3-pro', 'qwen3-coder', 'kimi-k2.5'], description: '多模型聚合，含免费模型' }
]

interface SettingsModalProps {
  onClose: () => void
}

type SettingsSection = 'search' | 'ai' | 'saved' | 'history'

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { 
    aiConfig, setAIConfig, saveConfig,
    browserSettings, setBrowserSettings,
    savedConfigs, addSavedConfig, deleteSavedConfig, applySavedConfig, loadSavedConfigs,
    history, clearHistory, setUrl
  } = useStore()
  
  const [activeSection, setActiveSection] = useState<SettingsSection>('search')
  const [localConfig, setLocalConfig] = useState(aiConfig)
  const [selectedPreset, setSelectedPreset] = useState('custom')
  const [showPresetDropdown, setShowPresetDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  
  // 显示提示并自动关闭模态框
  const showToastAndClose = (message: string) => {
    setToast(message)
    setTimeout(() => {
      setToast(null)
      onClose()
    }, 1000)
  }
  
  // 只显示提示
  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 2000)
  }

  useEffect(() => {
    setLocalConfig(aiConfig)
    // 如果使用内置 AI 或者没有配置，默认选中内置
    if (aiConfig.useBuiltIn || (!aiConfig.endpoint && !aiConfig.apiKey)) {
      setSelectedPreset('builtin')
    } else {
      const matched = AI_PRESETS.find(p => 
        p.endpoint && aiConfig.endpoint.includes(p.endpoint.replace('/chat/completions', ''))
      )
      setSelectedPreset(matched?.id || 'custom')
    }
  }, [aiConfig])

  useEffect(() => {
    loadSavedConfigs()
  }, [loadSavedConfigs])

  const currentPreset = AI_PRESETS.find(p => p.id === selectedPreset) || AI_PRESETS[0]

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId)
    setShowPresetDropdown(false)
    const preset = AI_PRESETS.find(p => p.id === presetId)
    if (preset) {
      if ((preset as any).isBuiltIn) {
        // 使用内置 AI
        setLocalConfig({
          endpoint: '',
          apiKey: '',
          model: '',
          useBuiltIn: true
        })
      } else if (preset.endpoint) {
        setLocalConfig({
          ...localConfig,
          endpoint: preset.endpoint,
          model: preset.models[0] || '',
          useBuiltIn: false
        })
      } else {
        setLocalConfig({
          ...localConfig,
          useBuiltIn: false
        })
      }
    }
  }

  const handleModelSelect = (model: string) => {
    setLocalConfig({ ...localConfig, model })
    setShowModelDropdown(false)
  }

  const handleSaveAI = async () => {
    setAIConfig(localConfig)
    await saveConfig()
    
    // 自动保存到配置列表
    const existingConfig = savedConfigs.find(
      c => c.endpoint === localConfig.endpoint && c.model === localConfig.model
    )
    
    if (!existingConfig && localConfig.apiKey) {
      const presetName = AI_PRESETS.find(p => p.endpoint === localConfig.endpoint)?.name || '自定义'
      addSavedConfig(`${presetName} - ${localConfig.model}`)
    }
    
    // 显示成功提示并关闭模态框
    showToastAndClose('AI 配置已保存')
  }

  const handleSearchEngineChange = (engineId: string) => {
    const engine = SEARCH_ENGINES.find(e => e.id === engineId)
    if (engine) {
      setBrowserSettings({ 
        searchEngine: engineId,
        homepage: engine.url.replace('?q=%s', '').replace('?wd=%s', '').replace('/search?q=%s', '')
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      {/* Toast 提示 */}
      {toast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-xl z-[60] flex items-center gap-2">
          <Check size={18} />
          {toast}
        </div>
      )}
      
      <div className="bg-white rounded-2xl w-[700px] h-[500px] flex shadow-2xl overflow-hidden">
        {/* 左侧导航 */}
        <div className="w-52 bg-gray-50 border-r border-gray-200 p-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-800">设置</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          
          <nav className="space-y-1">
            <button
              onClick={() => setActiveSection('search')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left ${
                activeSection === 'search' ? 'bg-blue-100 text-blue-600' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Search size={18} />
              <span>搜索引擎</span>
              <ChevronRight size={16} className="ml-auto opacity-50" />
            </button>
            
            <button
              onClick={() => setActiveSection('ai')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left ${
                activeSection === 'ai' ? 'bg-blue-100 text-blue-600' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Bot size={18} />
              <span>AI 配置</span>
              <ChevronRight size={16} className="ml-auto opacity-50" />
            </button>
            
            <button
              onClick={() => setActiveSection('saved')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left ${
                activeSection === 'saved' ? 'bg-blue-100 text-blue-600' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="w-[18px] h-[18px] flex items-center justify-center text-xs bg-blue-500 text-white rounded">
                {savedConfigs.length}
              </span>
              <span>已保存配置</span>
              <ChevronRight size={16} className="ml-auto opacity-50" />
            </button>
            
            <button
              onClick={() => setActiveSection('history')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left ${
                activeSection === 'history' ? 'bg-blue-100 text-blue-600' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Clock size={18} />
              <span>历史记录</span>
              <ChevronRight size={16} className="ml-auto opacity-50" />
            </button>
          </nav>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 p-6 overflow-auto">
          {/* 搜索引擎设置 */}
          {activeSection === 'search' && (
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">搜索引擎</h3>
              <p className="text-sm text-gray-600 mb-6">选择默认搜索引擎（自动保存）</p>
              
              <div className="space-y-2">
                {SEARCH_ENGINES.map(engine => (
                  <label
                    key={engine.id}
                    className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      browserSettings.searchEngine === engine.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="searchEngine"
                      value={engine.id}
                      checked={browserSettings.searchEngine === engine.id}
                      onChange={() => handleSearchEngineChange(engine.id)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      browserSettings.searchEngine === engine.id
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300'
                    }`}>
                      {browserSettings.searchEngine === engine.id && (
                        <Check size={12} className="text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{engine.name}</div>
                      <div className="text-sm text-gray-500">{engine.url.replace('%s', '关键词')}</div>
                    </div>
                    {browserSettings.searchEngine === engine.id && (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">已选择</span>
                    )}
                  </label>
                ))}
              </div>
              
              <div className="mt-6 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                设置会自动保存，下次启动时生效
              </div>
            </div>
          )}

          {/* AI 配置 */}
          {activeSection === 'ai' && (
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">AI 助手配置</h3>
              <p className="text-sm text-gray-600 mb-6">选择 AI 服务</p>
              
              <div className="space-y-5">
                {/* 服务商选择 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">AI 服务</label>
                  <div className="relative">
                    <button
                      onClick={() => setShowPresetDropdown(!showPresetDropdown)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-white border border-gray-300 rounded-lg hover:border-blue-500"
                    >
                      <div className="text-left">
                        <div className="font-semibold text-gray-900">{currentPreset.name}</div>
                        <div className="text-sm text-blue-600">{currentPreset.description}</div>
                      </div>
                      <ChevronDown size={16} className={`text-gray-500 transition-transform ${showPresetDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {showPresetDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-10 max-h-64 overflow-auto">
                        {AI_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => handlePresetSelect(preset.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left ${(preset as any).isBuiltIn ? 'bg-green-50' : ''}`}
                          >
                            <div className="w-5 flex items-center justify-center">
                              {selectedPreset === preset.id && <Check size={14} className="text-blue-500" />}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900">{preset.name}</div>
                              <div className="text-sm text-gray-600">{preset.description}</div>
                            </div>
                            {(preset as any).isBuiltIn && (
                              <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">推荐</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 内置 AI 说明 */}
                {selectedPreset === 'builtin' && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
                      <Check size={16} />
                      内置 AI 服务
                    </div>
                    <p className="text-sm text-green-700">
                      使用内置 AI 服务，无需配置即可直接使用。
                    </p>
                  </div>
                )}

                {/* 自定义配置（非内置时显示） */}
                {selectedPreset !== 'builtin' && (
                  <>
                    {/* API 地址 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">API 地址</label>
                      <input
                        type="text"
                        value={localConfig.endpoint}
                        onChange={(e) => setLocalConfig({ ...localConfig, endpoint: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                        placeholder="https://api.example.com/v1/chat/completions"
                      />
                    </div>

                    {/* API Key */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
                      <input
                        type="password"
                        value={localConfig.apiKey}
                        onChange={(e) => setLocalConfig({ ...localConfig, apiKey: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-gray-900"
                        placeholder="sk-..."
                      />
                    </div>

                    {/* 模型模式选择 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">模型模式</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setLocalConfig({ ...localConfig, modelMode: 'dual' })}
                          className={`px-3 py-2 rounded-lg border text-sm ${
                            localConfig.modelMode === 'dual' 
                              ? 'border-blue-500 bg-blue-50 text-blue-700' 
                              : 'border-gray-300 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          双模型
                        </button>
                        <button
                          onClick={() => setLocalConfig({ ...localConfig, modelMode: 'single' })}
                          className={`px-3 py-2 rounded-lg border text-sm ${
                            localConfig.modelMode === 'single' 
                              ? 'border-blue-500 bg-blue-50 text-blue-700' 
                              : 'border-gray-300 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          单模型
                        </button>
                        <button
                          onClick={() => setLocalConfig({ ...localConfig, modelMode: 'tool-only' })}
                          className={`px-3 py-2 rounded-lg border text-sm ${
                            (localConfig.modelMode === 'tool-only' || !localConfig.modelMode)
                              ? 'border-blue-500 bg-blue-50 text-blue-700' 
                              : 'border-gray-300 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          仅工具
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {localConfig.modelMode === 'dual' && '视觉模型分析页面 + 工具模型执行操作（推荐）'}
                        {localConfig.modelMode === 'single' && '单个模型同时具备视觉和工具调用能力'}
                        {(localConfig.modelMode === 'tool-only' || !localConfig.modelMode) && '仅使用工具模型，不分析页面截图'}
                      </p>
                    </div>

                    {/* 工具模型选择 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {localConfig.modelMode === 'dual' ? '工具模型' : '模型'}
                      </label>
                      <div className="relative">
                        <div className="flex gap-2">
                          {/* 下拉选择 */}
                          <button
                            onClick={() => setShowModelDropdown(!showModelDropdown)}
                            className="flex-1 flex items-center justify-between px-4 py-3 bg-white border border-gray-300 rounded-lg hover:border-blue-500"
                          >
                            <span className="text-gray-900 font-medium truncate">{localConfig.model || '选择模型'}</span>
                            <ChevronDown size={16} className="text-gray-500 flex-shrink-0" />
                          </button>
                        </div>
                        
                        {showModelDropdown && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-10 max-h-64 overflow-auto">
                            {/* 手动输入选项 */}
                            <div className="p-2 border-b border-gray-100">
                              <input
                                type="text"
                                value={localConfig.model}
                                onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="输入自定义模型名..."
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            {/* 预设模型列表 */}
                            {currentPreset.models.map((model) => (
                              <button
                                key={model}
                                onClick={() => handleModelSelect(model)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                              >
                                <div className="w-5 flex items-center justify-center">
                                  {localConfig.model === model && <Check size={14} className="text-blue-500" />}
                                </div>
                                <span className="text-gray-800 text-sm">{model}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 视觉模型配置（仅双模型模式显示） */}
                    {localConfig.modelMode === 'dual' && (
                      <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-gray-700">视觉模型配置</label>
                          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!(localConfig.visionEndpoint)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  // 勾选时，设置默认的 SiliconFlow 地址
                                  setLocalConfig({ 
                                    ...localConfig, 
                                    visionEndpoint: 'https://api.siliconflow.cn/v1/chat/completions',
                                    visionApiKey: '' 
                                  })
                                } else {
                                  // 取消勾选时，清空独立配置
                                  setLocalConfig({ ...localConfig, visionEndpoint: '', visionApiKey: '' })
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                            />
                            使用独立服务商
                          </label>
                        </div>
                        
                        {/* 独立服务商配置 */}
                        {localConfig.visionEndpoint ? (
                          <>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">视觉模型 API 地址</label>
                              <input
                                type="text"
                                value={localConfig.visionEndpoint || ''}
                                onChange={(e) => setLocalConfig({ ...localConfig, visionEndpoint: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                                placeholder="https://api.siliconflow.cn/v1/chat/completions"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">视觉模型 API Key</label>
                              <input
                                type="password"
                                value={localConfig.visionApiKey || ''}
                                onChange={(e) => setLocalConfig({ ...localConfig, visionApiKey: e.target.value })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm font-mono"
                                placeholder="sk-..."
                              />
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-gray-500">
                            默认使用工具模型的 API 地址和 Key
                          </p>
                        )}
                        
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">视觉模型名称</label>
                          <input
                            type="text"
                            value={localConfig.visionModel || ''}
                            onChange={(e) => setLocalConfig({ ...localConfig, visionModel: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 text-sm"
                            placeholder="如 deepseek-ai/DeepSeek-OCR, gpt-4-vision-preview"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            用于分析页面截图，提供更准确的操作上下文
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* 保存按钮 */}
                <button
                  onClick={handleSaveAI}
                  className="w-full py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  保存配置
                </button>
              </div>
            </div>
          )}

          {/* 已保存配置 */}
          {activeSection === 'saved' && (
            <div>
              <h3 className="text-lg font-medium text-gray-800 mb-4">已保存的 AI 配置</h3>
              <p className="text-sm text-gray-500 mb-4">快速切换不同的 AI 配置</p>
              
              {savedConfigs.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  暂无保存的配置
                </div>
              ) : (
                <div className="space-y-2">
                  {savedConfigs.map(config => (
                    <div
                      key={config.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{config.name}</div>
                        <div className="text-xs text-gray-500">{config.model}</div>
                      </div>
                      <button
                        onClick={() => {
                          applySavedConfig(config.id)
                          showToastAndClose('已应用配置')
                        }}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        使用
                      </button>
                      <button
                        onClick={() => {
                          deleteSavedConfig(config.id)
                          showToast('已删除')
                        }}
                        className="px-3 py-1 text-sm text-red-500 hover:text-red-600"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 历史记录 */}
          {activeSection === 'history' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">历史记录</h3>
                  <p className="text-sm text-gray-600">最近访问的网页</p>
                </div>
                {history.length > 0 && (
                  <button
                    onClick={() => {
                      clearHistory()
                      showToast('已清空历史')
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                    清空
                  </button>
                )}
              </div>
              
              {history.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Clock size={48} className="mx-auto mb-3 opacity-50" />
                  <p>暂无历史记录</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-[350px] overflow-auto">
                  {history.map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setUrl(item.url)
                        onClose()
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 text-left transition-colors"
                    >
                      <Clock size={14} className="text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 truncate">{item.title}</div>
                        <div className="text-xs text-gray-500 truncate">{item.url}</div>
                      </div>
                      <div className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(item.visitedAt).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
