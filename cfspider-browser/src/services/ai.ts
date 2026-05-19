import { useStore } from '../store'
import { matchSkill, updateSkillLearning, createSkill, getAllSkills, logOperation, autoExtractSkill, type Skill, type SkillStep } from './skills'
import { notifyErrorRecovery, notifyTaskComplete } from './heartbeat'

const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined

// 内置 AI 服务配置（双模型架构）
const BUILT_IN_AI = {
  endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
  // 工具模型：DeepSeek-V3 支持 function calling
  model: 'deepseek-ai/DeepSeek-V3',
  // 视觉模型：用于分析页面内容（OCR）
  visionModel: 'deepseek-ai/DeepSeek-OCR',
  // 模型模式: dual=双模型, single=单模型, tool-only=仅工具模型
  modelMode: 'dual' as const,
  // 服务密钥 (base64 encoded for basic obfuscation)
  _k: 'c2stYm13emduYWlhZnJ6ZGphcHhucG9nandsbmVicnJ6Y2t0dmRodmt0ZmF3Y3JoZWNv'
}

// 获取内置服务密钥
function getBuiltInKey(): string {
  try {
    return atob(BUILT_IN_AI._k)
  } catch {
    return ''
  }
}

// 统一的 AI 调用函数，自动统计 token 消耗
async function callAIWithTokenTracking(
  params: {
    endpoint: string
    apiKey: string
    model: string
    messages: any[]
    tools?: any[]
  },
  tokenType: 'chat' | 'tool' | 'vision' = 'tool'
): Promise<any> {
  const response = await (window as any).electronAPI.aiChat(params)
  
  // 统计 token 消耗
  if (response && response.usage) {
    const store = useStore.getState()
    store.addTokenUsage(
      params.model,
      response.usage.prompt_tokens || 0,
      response.usage.completion_tokens || 0,
      tokenType
    )
  }
  
  return response
}

// 操作失败时的语气词反应库（包含真实的口语化反应）
const PANIC_REACTIONS = [
  '啊，好像点错了...',
  '呃，操作失败了...',
  '不对不对，让我再试试...',
  '咦？怎么回事...',
  '哎呀，这里出问题了...',
  '嗯...换个方法试试',
  '糟糕，没找到...',
  '等等，好像不太对...',
  '奇怪，应该不是这样的...',
  '让我想想...再来一次',
  // 更真实的反应（轻微吐槽/脏话）
  '靠，点歪了...',
  '我去，这页面怎么回事...',
  '卧槽，加载这么慢...',
  '什么鬼，怎么找不到...',
  '草，又失败了...',
  '艹，这破网站...',
  '妈的，元素跑哪去了...',
  '服了，这页面真难搞...',
  '无语，这也能出错...',
  '我靠，换个方式吧...',
]

// 获取随机的错误反应语气词
function getRandomPanicReaction(): string {
  return PANIC_REACTIONS[Math.floor(Math.random() * PANIC_REACTIONS.length)]
}

// ========== 错误记忆系统 ==========
// 记录点击失败的元素，避免重复点击
interface ClickErrorRecord {
  selector: string       // 元素选择器
  text: string          // 元素文本
  url: string           // 页面 URL
  reason: string        // 失败原因
  timestamp: number     // 记录时间
  attempts: number      // 尝试次数
}

// 错误记忆存储（会话级别）
const clickErrorMemory: ClickErrorRecord[] = []

// 记录一个点击错误
function recordClickError(selector: string, text: string, url: string, reason: string): void {
  // 先清理过期记录
  clearExpiredErrorMemory()
  
  const existing = clickErrorMemory.find(e => e.selector === selector && e.url === url)
  if (existing) {
    existing.attempts++
    existing.timestamp = Date.now()
    existing.reason = reason
  } else {
    clickErrorMemory.push({
      selector,
      text,
      url,
      reason,
      timestamp: Date.now(),
      attempts: 1
    })
  }
  // 只保留最近 50 条记录
  if (clickErrorMemory.length > 50) {
    clickErrorMemory.shift()
  }
  console.log('[CFSpider] Recorded click error:', { selector, text, reason, attempts: existing?.attempts || 1 })
}

// 检查元素是否在错误记录中
function isKnownBadElement(selector: string, text: string, url: string): ClickErrorRecord | null {
  return clickErrorMemory.find(e => 
    (e.selector === selector || e.text.toLowerCase() === text.toLowerCase()) && 
    e.url === url &&
    e.attempts >= 1
  ) || null
}

// 获取当前页面的所有错误记录（用于 AI 决策）
function getPageErrorHistory(url: string): string[] {
  return clickErrorMemory
    .filter(e => e.url === url)
    .map(e => `- 已尝试失败 ${e.attempts} 次: "${e.text}" (${e.reason})`)
}

// 清除过期的错误记忆（30分钟后自动过期）
function clearExpiredErrorMemory(): void {
  const now = Date.now()
  const expireTime = 30 * 60 * 1000 // 30 分钟
  const before = clickErrorMemory.length
  
  // 过滤掉过期的记录
  const valid = clickErrorMemory.filter(e => now - e.timestamp < expireTime)
  clickErrorMemory.length = 0
  clickErrorMemory.push(...valid)
  
  if (before !== clickErrorMemory.length) {
    console.log('[CFSpider] Cleared expired error memory:', before - clickErrorMemory.length)
  }
}


// ========== 仿人类学习记忆系统 ==========
// 像真人一样学习：错误不再犯，正确的更熟练，有时会遗忘

interface LearningMemory {
  id: string
  type: 'success' | 'error' | 'tip'  // 成功经验、失败教训、操作技巧
  domain: string           // 网站域名（如 github.com, bing.com）
  action: string           // 操作类型（click, input, navigate, scroll）
  target: string           // 目标描述（如"搜索按钮"、"登录链接"）
  selector?: string        // 可选的选择器
  lesson: string           // 学到的经验/教训
  strength: number         // 记忆强度 0-100（决定遗忘概率）
  lastRecall: number       // 上次回忆/使用时间
  createdAt: number        // 创建时间
  recallCount: number      // 成功使用次数（强化记忆）
  emotional: boolean       // 是否有情绪标记（更难忘记）
}

// 遗忘时的反应语
const FORGET_REACTIONS = [
  '我靠，我忘记了...',
  '等等，让我想想...',
  '我记得明明是...',
  '奇怪，我之前好像知道的...',
  '糟糕，想不起来了...',
  '唔...这个我之前遇到过...',
  '嗯？我有印象但是...',
]

// 回忆起来时的反应
const RECALL_REACTIONS = [
  '对了！我想起来了！',
  '哦~上次就是这样搞定的！',
  '这个我熟！',
  '没问题，我记得怎么做',
  '这我有经验~',
]

// 学习成功时的反应
const LEARN_REACTIONS = [
  '记住了！',
  '下次就知道了~',
  '学到了学到了',
  '原来是这样啊',
  '记下了！',
]

// 内存中的学习记忆缓存
let learningMemoryCache: LearningMemory[] = []
let memoryLoaded = false
let pendingSaves: LearningMemory[] = []  // 待保存队列

// 生成记忆ID
function generateMemoryId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// 计算记忆强度衰减（模拟遗忘曲线）
function calculateStrengthDecay(memory: LearningMemory): number {
  const now = Date.now()
  const daysSinceLastRecall = (now - memory.lastRecall) / (1000 * 60 * 60 * 24)
  const daysSinceCreated = (now - memory.createdAt) / (1000 * 60 * 60 * 24)
  
  // 基础衰减：每天 -3 到 -8 点（随机）
  let decay = daysSinceLastRecall * (3 + Math.random() * 5)
  
  // 情绪记忆衰减更慢
  if (memory.emotional) {
    decay *= 0.5
  }
  
  // 使用次数多的记忆更稳固
  decay *= Math.max(0.3, 1 - memory.recallCount * 0.1)
  
  // 错误类型的记忆更难忘（教训深刻）
  if (memory.type === 'error') {
    decay *= 0.6
  }
  
  // 老记忆如果还在，说明很重要，衰减更慢
  if (daysSinceCreated > 7) {
    decay *= 0.7
  }
  
  return Math.max(0, memory.strength - decay)
}

// 检查记忆是否"遗忘"了（强度低于阈值有概率遗忘）
function isMemoryForgotten(memory: LearningMemory): boolean {
  const currentStrength = calculateStrengthDecay(memory)
  
  // 强度 > 60：不会忘
  if (currentStrength > 60) return false
  
  // 强度 30-60：小概率遗忘
  if (currentStrength > 30) {
    return Math.random() < 0.1 * (1 - currentStrength / 60)
  }
  
  // 强度 10-30：较大概率遗忘
  if (currentStrength > 10) {
    return Math.random() < 0.3
  }
  
  // 强度 < 10：大概率遗忘
  return Math.random() < 0.6
}

// 加载持久化的记忆
async function loadLearningMemory(): Promise<void> {
  if (memoryLoaded || !isElectron) return
  
  try {
    const memories = await (window as any).electronAPI.loadLearningMemory()
    if (Array.isArray(memories)) {
      learningMemoryCache = memories
      console.log('[CFSpider] Loaded learning memories:', memories.length)
    }
    memoryLoaded = true
  } catch (e) {
    console.log('[CFSpider] No saved learning memories found')
    memoryLoaded = true
  }
}

// 保存一条记忆到持久化存储（渐进式，每次只保存一点）
async function saveLearningMemoryIncremental(): Promise<void> {
  if (!isElectron || pendingSaves.length === 0) return
  
  // 随机决定是否保存（30% 概率，模拟"有时候记住，有时候没记住"）
  if (Math.random() > 0.3) {
    console.log('[CFSpider] This time did not remember to save... (human-like)')
    return
  }
  
  // 每次只保存 1-2 条（渐进学习）
  const saveCount = Math.min(pendingSaves.length, 1 + Math.floor(Math.random() * 2))
  const toSave = pendingSaves.splice(0, saveCount)
  
  try {
    // 合并到现有记忆
    const existing = await (window as any).electronAPI.loadLearningMemory() || []
    const merged = [...existing]
    
    for (const mem of toSave) {
      const idx = merged.findIndex(m => m.id === mem.id)
      if (idx >= 0) {
        merged[idx] = mem
      } else {
        merged.push(mem)
      }
    }
    
    // 限制总量（像人脑容量有限）
    if (merged.length > 200) {
      // 按强度排序，删除最弱的记忆
      merged.sort((a, b) => calculateStrengthDecay(b) - calculateStrengthDecay(a))
      merged.length = 200
    }
    
    await (window as any).electronAPI.saveLearningMemory(merged)
    console.log('[CFSpider] Saved learning memories:', toSave.length, '- Total:', merged.length)
  } catch (e) {
    console.error('[CFSpider] Failed to save learning memory:', e)
    // 保存失败的放回队列
    pendingSaves.unshift(...toSave)
  }
}

// 创建新记忆
function createLearningMemory(
  type: 'success' | 'error' | 'tip',
  domain: string,
  action: string,
  target: string,
  lesson: string,
  options?: { selector?: string; emotional?: boolean; initialStrength?: number }
): LearningMemory {
  const memory: LearningMemory = {
    id: generateMemoryId(),
    type,
    domain,
    action,
    target,
    selector: options?.selector,
    lesson,
    strength: options?.initialStrength ?? (type === 'error' ? 60 : 40), // 错误记忆初始更强
    lastRecall: Date.now(),
    createdAt: Date.now(),
    recallCount: 0,
    emotional: options?.emotional ?? (type === 'error') // 错误默认带情绪
  }
  
  // 添加到缓存
  learningMemoryCache.push(memory)
  
  // 添加到待保存队列
  pendingSaves.push(memory)
  
  // 触发渐进保存
  saveLearningMemoryIncremental()
  
  return memory
}

// 记录一次学习（成功/失败经验）
function learnFromExperience(
  type: 'success' | 'error',
  domain: string,
  action: string,
  target: string,
  lesson: string,
  options?: { selector?: string; emotional?: boolean }
): string {
  // 先加载已有记忆
  loadLearningMemory()
  
  // 检查是否已有类似记忆
  const existing = learningMemoryCache.find(m => 
    m.domain === domain && 
    m.action === action && 
    m.target.toLowerCase().includes(target.toLowerCase().slice(0, 20))
  )
  
  if (existing) {
    // 强化已有记忆
    existing.recallCount++
    existing.lastRecall = Date.now()
    existing.strength = Math.min(100, existing.strength + (type === 'success' ? 15 : 25))
    
    // 如果之前是错误现在成功了，更新类型
    if (existing.type === 'error' && type === 'success') {
      existing.type = 'success'
      existing.lesson = lesson
      existing.emotional = true // 克服困难，印象深刻
    }
    
    pendingSaves.push(existing)
    saveLearningMemoryIncremental()
    
    return LEARN_REACTIONS[Math.floor(Math.random() * LEARN_REACTIONS.length)]
  }
  
  // 创建新记忆
  createLearningMemory(type, domain, action, target, lesson, options)
  
  return LEARN_REACTIONS[Math.floor(Math.random() * LEARN_REACTIONS.length)]
}

// 尝试回忆相关经验（用于操作前参考）
function recallExperience(domain: string, action: string, target: string): {
  found: boolean
  memory?: LearningMemory
  forgotten?: boolean
  vagueMemory?: string
  reaction?: string
} {
  // 确保加载了记忆
  loadLearningMemory()
  
  // 查找相关记忆
  const related = learningMemoryCache.filter(m => 
    (m.domain === domain || m.domain === '*') &&
    (m.action === action || m.action === '*') &&
    (target.toLowerCase().includes(m.target.toLowerCase()) || 
     m.target.toLowerCase().includes(target.toLowerCase().slice(0, 15)))
  )
  
  if (related.length === 0) {
    return { found: false }
  }
  
  // 按强度排序
  related.sort((a, b) => calculateStrengthDecay(b) - calculateStrengthDecay(a))
  const best = related[0]
  
  // 检查是否遗忘
  if (isMemoryForgotten(best)) {
    // 遗忘了，但可能有模糊记忆
    const vagueMemory = best.lesson.slice(0, 30) + '...'
    return {
      found: true,
      forgotten: true,
      vagueMemory,
      reaction: FORGET_REACTIONS[Math.floor(Math.random() * FORGET_REACTIONS.length)] + 
                ` 我记得好像是「${vagueMemory}」但不太确定了...`
    }
  }
  
  // 成功回忆，强化记忆
  best.recallCount++
  best.lastRecall = Date.now()
  best.strength = Math.min(100, best.strength + 5)
  
  pendingSaves.push(best)
  saveLearningMemoryIncremental()
  
  return {
    found: true,
    memory: best,
    reaction: RECALL_REACTIONS[Math.floor(Math.random() * RECALL_REACTIONS.length)]
  }
}

// 获取某个域名的所有有效经验（用于 AI 决策）
function getDomainExperiences(domain: string): string[] {
  loadLearningMemory()
  
  const experiences = learningMemoryCache
    .filter(m => m.domain === domain || m.domain === '*')
    .filter(m => !isMemoryForgotten(m))
    .sort((a, b) => calculateStrengthDecay(b) - calculateStrengthDecay(a))
    .slice(0, 5) // 最多返回5条
    .map(m => {
      const prefix = m.type === 'error' ? '[教训]' : m.type === 'tip' ? '[技巧]' : '[经验]'
      return `${prefix} ${m.action} "${m.target}": ${m.lesson}`
    })
  
  return experiences
}

// 生成随机偏移（用于瞄准行为）
function randomOffset(range: number = 30): number {
  return (Math.random() - 0.5) * range
}

// 模拟人类的瞄准行为：先粗略移动到目标附近，再精确移动到目标位置
async function aimAndMoveMouse(
  store: any, 
  targetX: number, 
  targetY: number, 
  options?: { skipAim?: boolean }
): Promise<void> {
  store.showMouse()
  
  if (options?.skipAim) {
    // 跳过瞄准直接移动
    store.moveMouse(targetX, targetY, 300)
    await new Promise(resolve => setTimeout(resolve, 400))
    return
  }
  
  // 第一步：快速移动到目标附近（带随机偏移）
  const offsetX = randomOffset(40)
  const offsetY = randomOffset(40)
  store.moveMouse(targetX + offsetX, targetY + offsetY, 200)
  await new Promise(resolve => setTimeout(resolve, 250))
  
  // 第二步：精确移动到目标位置
  store.moveMouse(targetX, targetY, 150)
  await new Promise(resolve => setTimeout(resolve, 200))
}

// 视觉模型配置接口
interface VisionConfig {
  endpoint: string
  apiKey: string
  model: string
}

// 使用视觉模型分析页面内容
async function analyzePageWithVision(config: VisionConfig): Promise<string> {
  const webview = document.querySelector('webview') as any
  if (!webview) return ''

  try {
    // 获取页面截图
    const image = await webview.capturePage()
    if (!image) return ''

    const base64Image = image.toDataURL().replace(/^data:image\/\w+;base64,/, '')

    // 调用视觉模型分析 - 输出结构化的页面信息
    const response = await callAIWithTokenTracking({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      model: config.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `你是一个网页分析专家。请详细分析这个网页截图，输出结构化的信息供浏览器自动化工具使用。

## 输出格式要求（请严格按此格式输出）

### 页面状态判断（重要！）
- 是否为搜索引擎：是/否（必应、百度、Google、搜狗等都算搜索引擎）
- 搜索引擎名称：必应/百度/Google/无
- 页面类型：搜索引擎首页 / 搜索结果页 / 电商网站 / 社交网站 / 其他网站 / 空白页
- 可直接搜索：是/否（如果页面有搜索框可以直接输入搜索）

### 当前页面信息
- 网站名称：xxx
- 页面标题：xxx
- 主要内容：xxx（简述）

### 搜索框状态
- 存在搜索框：是/否
- 搜索框位置：顶部/中央/无
- 当前搜索内容：xxx（如果有已输入的内容）
- 建议选择器：input[name=q] 或其他

### 可操作元素
列出页面上重要的可点击元素：
1. [元素描述] - 建议操作
2. ...

### 下一步建议
根据页面状态给出操作建议：
- 如果已在搜索引擎：直接在搜索框输入内容，无需跳转
- 如果在目标网站：说明可进行的操作
- 如果是其他页面：建议跳转到搜索引擎

请用中文回复，重点判断是否在搜索引擎上，这决定了是否需要导航。`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ]
    }, 'vision')

    if (response.content) {
      return response.content
    }
    return ''
  } catch (error) {
    console.error('视觉模型分析失败:', error)
    return ''
  }
}

// 视觉定位：让视觉模型找到元素的具体位置
// config 参数可选，如果不提供则使用内置配置（仅当有内置视觉模型时）
async function visualLocateElement(
  targetDescription: string, 
  config?: { endpoint: string; apiKey: string; model: string } | null
): Promise<{ found: boolean; x?: number; y?: number; confidence?: string; suggestion?: string }> {
  const webview = document.querySelector('webview') as any
  if (!webview) return { found: false, suggestion: '无法访问页面' }

  // 确定使用的配置
  const visionConfig = config || (BUILT_IN_AI.visionModel ? {
    endpoint: BUILT_IN_AI.endpoint,
    apiKey: getBuiltInKey(),
    model: BUILT_IN_AI.visionModel
  } : null)
  
  // 如果没有视觉模型配置，直接返回
  if (!visionConfig || !visionConfig.model) {
    return { found: false, suggestion: '视觉模型未配置，无法进行视觉定位' }
  }

  try {
    const image = await webview.capturePage()
    if (!image) return { found: false, suggestion: '无法截取页面' }

    // 获取页面尺寸
    const pageSize = await webview.executeJavaScript(`({ width: window.innerWidth, height: window.innerHeight })`)
    
    const base64Image = image.toDataURL().replace(/^data:image\/\w+;base64,/, '')

    const response = await callAIWithTokenTracking({
      endpoint: visionConfig.endpoint,
      apiKey: visionConfig.apiKey,
      model: visionConfig.model,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `你是一个精确的视觉定位专家。请在这个网页截图中找到用户想要点击的元素。

用户想要点击的目标：「${targetDescription}」

页面尺寸：宽度 ${pageSize.width}px，高度 ${pageSize.height}px

## 任务
又点到其他位置1. 仔细观察截图，找到与目标描述最匹配的**可点击元素**
2. 估算该元素中心点的坐标位置（x, y）
3. 坐标从左上角(0,0)开始计算

## 搜索结果页面特别说明（重要！）
如果这是一个搜索引擎的结果页面（如必应、Google、百度）：
- **正确目标**：搜索结果列表中的蓝色标题链接（通常在页面中间区域，y坐标大于300）
- **错误目标**（不要点击）：
  - 页面顶部的导航栏、标签按钮（全部、视频、图片等）
  - AI生成内容区域（如Copilot、AI生成的卡片）
  - 搜索框旁边的图标或按钮
  - 广告或推广内容
  - 侧边栏的内容

## 输出格式（严格按此格式，方便解析）
如果找到目标元素：
FOUND: YES
X: [x坐标数字]
Y: [y坐标数字]
CONFIDENCE: HIGH/MEDIUM/LOW
ELEMENT: [元素描述]

如果没有找到：
FOUND: NO
SUGGESTION: [建议，如"需要滚动页面"或"该元素不存在"]

## 定位技巧
- 坐标必须是具体数字，不要用百分比
- 搜索结果链接通常：有蓝色标题 + 下方有绿色URL + 描述文字
- 优先选择主搜索结果区域（页面中央偏左）的链接
- 避免点击顶部导航（y < 200）或右侧边栏
- 如果目标是"GitHub"，找显示 "github.com" 的搜索结果标题`
          },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${base64Image}` }
          }
        ]
      }]
    })

    const content = response.content || ''
    console.log('[CFSpider] 视觉定位结果:', content)

    // 解析响应
    const foundMatch = content.match(/FOUND:\s*(YES|NO)/i)
    if (!foundMatch || foundMatch[1].toUpperCase() === 'NO') {
      const suggestionMatch = content.match(/SUGGESTION:\s*(.+)/i)
      return { 
        found: false, 
        suggestion: suggestionMatch ? suggestionMatch[1].trim() : '未找到目标元素' 
      }
    }

    const xMatch = content.match(/X:\s*(\d+)/i)
    const yMatch = content.match(/Y:\s*(\d+)/i)
    const confidenceMatch = content.match(/CONFIDENCE:\s*(HIGH|MEDIUM|LOW)/i)
    const elementMatch = content.match(/ELEMENT:\s*(.+)/i)

    if (xMatch && yMatch) {
      return {
        found: true,
        x: parseInt(xMatch[1]),
        y: parseInt(yMatch[1]),
        confidence: confidenceMatch ? confidenceMatch[1] : 'MEDIUM',
        suggestion: elementMatch ? elementMatch[1].trim() : undefined
      }
    }

    return { found: false, suggestion: '无法解析坐标' }
  } catch (error) {
    console.error('视觉定位失败:', error)
    return { found: false, suggestion: '视觉定位出错: ' + error }
  }
}

// 操作后快速视觉确认 - 简化版分析
// config 参数可选，如果不提供则使用内置配置
async function quickVisualFeedback(
  actionType: string,
  config?: { endpoint: string; apiKey: string; model: string } | null
): Promise<string> {
  const webview = document.querySelector('webview') as any
  if (!webview) return ''

  // 确定使用的配置
  const visionConfig = config || (BUILT_IN_AI.visionModel ? {
    endpoint: BUILT_IN_AI.endpoint,
    apiKey: getBuiltInKey(),
    model: BUILT_IN_AI.visionModel
  } : null)
  
  // 如果没有视觉模型配置，直接返回
  if (!visionConfig || !visionConfig.model) {
    return ''
  }

  try {
    // 等待页面稳定
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const image = await webview.capturePage()
    if (!image) return ''

    const base64Image = image.toDataURL().replace(/^data:image\/\w+;base64,/, '')

    // 使用简化的提示词快速分析
    const response = await callAIWithTokenTracking({
      endpoint: visionConfig.endpoint,
      apiKey: visionConfig.apiKey,
      model: visionConfig.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `刚刚执行了"${actionType}"操作。请简短描述（20字以内）：
1. 页面当前状态
2. 操作是否成功

只需一句话回复，例如："搜索结果已显示" 或 "已跳转到京东首页" 或 "输入框已填入内容"`
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64Image}` }
            }
          ]
        }
      ]
    })

    return response.content || ''
  } catch (error) {
    console.error('视觉反馈失败:', error)
    return ''
  }
}

// Website risk checking
const riskyPatterns = [
  // Phishing patterns
  { pattern: /login.*\.(?!com|org|net|gov|edu)/i, risk: 'phishing', message: 'Suspicious login page' },
  { pattern: /paypal.*(?!paypal\.com)/i, risk: 'phishing', message: 'Possible PayPal phishing' },
  { pattern: /bank.*(?!\.com|\.org)/i, risk: 'phishing', message: 'Suspicious banking site' },
  // Suspicious TLDs
  { pattern: /\.(tk|ml|ga|cf|gq|xyz|top|loan|work|click)$/i, risk: 'suspicious', message: 'Suspicious domain extension' },
  // Too many subdomains
  { pattern: /(\.[^.]+){5,}/i, risk: 'suspicious', message: 'Unusual URL structure' },
  // IP address URLs
  { pattern: /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i, risk: 'suspicious', message: 'IP address URL' },
  // Common scam keywords
  { pattern: /(free-?iphone|win-?prize|lottery|bitcoin-?double)/i, risk: 'scam', message: 'Possible scam site' },
]

const trustedDomains = [
  'google.com', 'bing.com', 'baidu.com', 'github.com', 'microsoft.com',
  'apple.com', 'amazon.com', 'jd.com', 'taobao.com', 'tmall.com',
  'bilibili.com', 'zhihu.com', 'weibo.com', 'qq.com', 'alipay.com',
  'youtube.com', 'twitter.com', 'facebook.com', 'instagram.com',
  'linkedin.com', 'stackoverflow.com', 'reddit.com', 'wikipedia.org'
]

function checkWebsiteRisk(url: string): { isRisky: boolean; riskLevel: string; message: string } {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    
    // Check if it's a trusted domain
    for (const trusted of trustedDomains) {
      if (hostname === trusted || hostname.endsWith('.' + trusted)) {
        return { isRisky: false, riskLevel: 'safe', message: '' }
      }
    }
    
    // Check against risky patterns
    for (const { pattern, risk, message } of riskyPatterns) {
      if (pattern.test(url)) {
        return { isRisky: true, riskLevel: risk, message }
      }
    }
    
    // Check for HTTPS
    if (urlObj.protocol !== 'https:' && !hostname.includes('localhost')) {
      return { isRisky: true, riskLevel: 'warning', message: 'Non-HTTPS connection' }
    }
    
    return { isRisky: false, riskLevel: 'unknown', message: '' }
  } catch {
    return { isRisky: false, riskLevel: 'unknown', message: '' }
  }
}

async function showRiskWarning(webview: any, riskLevel: string, message: string) {
  const colors = {
    phishing: { bg: '#dc2626', border: '#b91c1c', icon: '??' },
    scam: { bg: '#dc2626', border: '#b91c1c', icon: '??' },
    suspicious: { bg: '#f59e0b', border: '#d97706', icon: '??' },
    warning: { bg: '#eab308', border: '#ca8a04', icon: '?' }
  }
  
  const color = colors[riskLevel as keyof typeof colors] || colors.warning
  
  await webview.executeJavaScript(`
    (function() {
      // Remove existing warning
      var existing = document.getElementById('cfspider-risk-warning');
      if (existing) existing.remove();
      
      // Create overlay
      var overlay = document.createElement('div');
      overlay.id = 'cfspider-risk-warning';
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:2147483647;display:flex;align-items:center;justify-content:center;animation:cfspider-fade-in 0.3s ease;';
      
      // Create modal
      var modal = document.createElement('div');
      modal.style.cssText = 'background:white;border-radius:16px;padding:32px 48px;text-align:center;max-width:500px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);border:4px solid ${color.border};animation:cfspider-scale-in 0.3s ease;';
      
      modal.innerHTML = \`
        <div style="font-size:64px;margin-bottom:16px;">${color.icon}</div>
        <h2 style="margin:0 0 12px 0;font-size:28px;color:#1f2937;font-weight:bold;">Security Warning</h2>
        <p style="margin:0 0 8px 0;font-size:18px;color:${color.bg};font-weight:600;">${message}</p>
        <p style="margin:0;font-size:14px;color:#6b7280;">Risk Level: ${riskLevel.toUpperCase()}</p>
        <p style="margin:16px 0 0 0;font-size:12px;color:#9ca3af;">This warning will disappear in 3 seconds</p>
      \`;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      // Add animation styles
      var style = document.createElement('style');
      style.textContent = \`
        @keyframes cfspider-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cfspider-scale-in { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes cfspider-fade-out { from { opacity: 1; } to { opacity: 0; } }
      \`;
      document.head.appendChild(style);
      
      // Auto-dismiss after 3 seconds
      setTimeout(function() {
        overlay.style.animation = 'cfspider-fade-out 0.3s ease forwards';
        setTimeout(function() {
          overlay.remove();
          style.remove();
        }, 300);
      }, 3000);
    })()
  `)
}

export const aiTools = [
  // ==================== 标签页管理工具 ====================
  {
    type: 'function',
    function: {
      name: 'new_tab',
      description: '新建标签页并可选择导航到指定URL。用于同时处理多个任务，如一边看邮件一边在另一个页面操作',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '新标签页要打开的URL（可选，不提供则打开空白页）' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'switch_tab',
      description: '切换到指定标签页。可以通过索引或标题切换',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'number', description: '标签页索引（从0开始）' },
          title: { type: 'string', description: '标签页标题（模糊匹配）' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'close_tab',
      description: '关闭当前标签页或指定标签页',
      parameters: {
        type: 'object',
        properties: {
          index: { type: 'number', description: '要关闭的标签页索引（可选，不提供则关闭当前标签页）' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'close_popup',
      description: '关闭页面上的弹窗、模态框、广告遮罩等。会尝试多种方法：点击关闭按钮、按ESC、点击遮罩层外部等。',
      parameters: {
        type: 'object',
        properties: {
          method: { 
            type: 'string', 
            enum: ['auto', 'click_close', 'press_escape', 'click_outside', 'specific_selector'],
            description: '关闭方法：auto(自动尝试所有方法)、click_close(点击关闭按钮)、press_escape(按ESC键)、click_outside(点击外部)、specific_selector(使用指定选择器)' 
          },
          selector: { type: 'string', description: '当method为specific_selector时，指定要点击的关闭按钮选择器' },
          max_attempts: { type: 'number', description: '最大尝试次数，默认3次' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tabs',
      description: '列出所有打开的标签页，显示索引、标题和URL',
      parameters: { type: 'object', properties: {} }
    }
  },
  // ==================== 导航工具 ====================
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: 'ONLY for search engine homepage (bing.com, baidu.com, google.com). NEVER use for other websites like jd.com, taobao.com, etc.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'ONLY search engine URL like https://cn.bing.com' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click_element',
      description: 'Click an element using CSS selector',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click_text',
      description: 'Click element containing specific text (for clicking search results)',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text content to find and click' }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'input_text',
      description: 'Type text into an input field',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for input field' },
          text: { type: 'string', description: 'Text to type' }
        },
        required: ['selector', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'scroll_page',
      description: 'Scroll the page',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'], description: 'Scroll direction' }
        },
        required: ['direction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_full_page',
      description: '阅读完整页面内容。像真人一样慢慢滚动页面，每次滚动后分析可见内容，最后汇总。适用于总结页面、阅读文档等任务。',
      parameters: {
        type: 'object',
        properties: {
          max_scrolls: { type: 'number', description: '最大滚动次数，默认10次' }
        }
      }
    }
  },
  // ==================== 视觉模型专用工具 ====================
  {
    type: 'function',
    function: {
      name: 'solve_captcha',
      description: '识别并处理验证码。会自动检测验证码类型，返回详细信息和下一步操作建议。遇到验证码时立即调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          captcha_type: {
            type: 'string',
            enum: ['auto', 'text', 'slider', 'click'],
            description: '验证码类型：auto=自动检测(推荐), text=图形文字验证码, slider=滑块验证码, click=点选验证码'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_image',
      description: '分析页面中的图片内容，描述图片展示的信息。可用于理解产品图片、图表、截图等',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: '图片的 CSS 选择器，如 img.product-image 或 #banner-img' },
          question: { type: 'string', description: '关于图片的问题，如"这张图片展示了什么产品？"' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'visual_click',
      description: '根据视觉描述找到并点击元素。当 CSS 选择器无法准确定位时使用视觉识别',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: '元素的视觉描述，如"红色的购买按钮"、"页面右上角的登录链接"' }
        },
        required: ['description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compare_screenshots',
      description: '截图比对。先保存当前截图，执行操作后比较变化，用于验证操作是否成功',
      parameters: {
        type: 'object',
        properties: {
          action: { 
            type: 'string', 
            enum: ['save', 'compare'], 
            description: 'save=保存当前截图作为基准, compare=与之前保存的截图比较' 
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'extract_chart_data',
      description: '从页面中的图表（柱状图、折线图、饼图等）提取数据',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: '图表的 CSS 选择器（可选，不提供则分析整个页面）' },
          chart_type: { type: 'string', description: '图表类型（可选）：bar/line/pie/table 等' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ocr_image',
      description: '使用 OCR 提取页面图片中的文字。适用于扫描文档、海报、截图等',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: '图片的 CSS 选择器' }
        },
        required: ['selector']
      }
    }
  },
  // ==================== 基础工具 ====================
  {
    type: 'function',
    function: {
      name: 'wait',
      description: 'Wait for page to load',
      parameters: {
        type: 'object',
        properties: {
          ms: { type: 'number', description: 'Milliseconds to wait, default 1000' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_page_info',
      description: 'Get current page title and URL',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'go_back',
      description: 'Go back to previous page',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'go_forward',
      description: 'Go forward to next page',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'press_enter',
      description: 'Press Enter key to submit search form (use after input_text)',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the input field to press Enter on' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'drag_element',
      description: '拖拽元素。用于滑动验证码、拖放操作等。模拟真人操作，有平滑动画。',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: '要拖动的元素选择器，如滑块' },
          distance_x: { type: 'number', description: '水平拖动距离（像素）' },
          distance_y: { type: 'number', description: '垂直拖动距离（像素，默认0）' },
          duration: { type: 'number', description: '拖动持续时间（毫秒，默认500）' }
        },
        required: ['selector', 'distance_x']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click_search_button',
      description: 'Click the search button on the page. Use this after input_text to submit search.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click_button',
      description: '点击页面上的按钮。专门用于点击"加入购物车"、"立即购买"、"提交"、"确认"等按钮。会智能查找 button、可点击 div、span 等元素。',
      parameters: {
        type: 'object',
        properties: {
          text: { 
            type: 'string', 
            description: '按钮上的文字，如"加入购物车"、"立即购买"、"提交"、"确认"等' 
          },
          fallback_selectors: {
            type: 'array',
            items: { type: 'string' },
            description: '备选的 CSS 选择器列表，如果按文字找不到可以尝试这些选择器'
          }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'verify_action',
      description: 'Verify if the previous action was successful. Call this after important actions to check results. Returns details about current page state.',
      parameters: {
        type: 'object',
        properties: {
          expected_result: { 
            type: 'string', 
            description: 'What you expected to happen (e.g., "page should show search results", "input should contain text", "should be on github.com")' 
          }
        },
        required: ['expected_result']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'retry_with_alternative',
      description: 'Try an alternative method when the previous action failed. Use different selectors or approaches.',
      parameters: {
        type: 'object',
        properties: {
          action_type: { 
            type: 'string', 
            enum: ['input', 'click', 'search'],
            description: 'Type of action to retry' 
          },
          target_description: { 
            type: 'string', 
            description: 'Description of what you are trying to do (e.g., "input search text", "click search button")' 
          }
        },
        required: ['action_type', 'target_description']
      }
    }
  },
  // Page analysis tool
  {
    type: 'function',
    function: {
      name: 'analyze_page',
      description: 'Analyze the current page structure, find key elements, understand page purpose. Call this when unsure what to do.',
      parameters: { type: 'object', properties: {} }
    }
  },
  // Information gathering tools
  {
    type: 'function',
    function: {
      name: 'scan_interactive_elements',
      description: 'Scan and list all interactive elements on the page (buttons, links, inputs). Use to discover available actions. Returns indexed list for use with click_by_index.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'click_by_index',
      description: '通过索引点击元素。先调用 scan_interactive_elements 获取元素列表，然后使用此工具通过索引点击。',
      parameters: {
        type: 'object',
        properties: {
          category: { 
            type: 'string', 
            description: '元素类别: inputs, buttons, links, selects',
            enum: ['inputs', 'buttons', 'links', 'selects']
          },
          index: { 
            type: 'number', 
            description: '元素索引号（从1开始）' 
          }
        },
        required: ['category', 'index']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_page_content',
      description: 'Get the main text content of the page. Use to understand what the page is about.',
      parameters: {
        type: 'object',
        properties: {
          max_length: { type: 'number', description: 'Maximum characters to return (default 500)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_element',
      description: 'Find an element by description. Use when you dont know the exact selector.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Description of element to find (e.g., "search button", "login link", "submit form")' }
        },
        required: ['description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_element_exists',
      description: 'Check if a specific element exists and is visible on the page.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to check' }
        },
        required: ['selector']
      }
    }
  },
  // ==================== 视频分析工具 ====================
  {
    type: 'function',
    function: {
      name: 'summarize_video',
      description: '总结页面上正在播放的视频内容。通过抽取关键帧进行视觉分析，生成视频摘要。需要视觉模型支持。',
      parameters: {
        type: 'object',
        properties: {
          frame_count: { 
            type: 'number', 
            description: '要分析的帧数（默认10帧，最多40帧）' 
          },
          focus: { 
            type: 'string', 
            description: '分析重点，如 "人物"、"产品"、"教程步骤" 等（可选）' 
          }
        }
      }
    }
  },
  // ==================== 自我扩展工具 ====================
  {
    type: 'function',
    function: {
      name: 'create_skill',
      description: '创建新技能。当发现某个操作序列可以复用时，AI 可以主动创建技能。技能会永久保存，下次可以直接使用。',
      parameters: {
        type: 'object',
        properties: {
          name: { 
            type: 'string', 
            description: '技能名称，如"京东搜索商品"' 
          },
          description: { 
            type: 'string', 
            description: '技能描述，说明这个技能能做什么' 
          },
          triggers: { 
            type: 'array', 
            items: { type: 'string' },
            description: '触发词列表，如["搜索商品", "找商品", "查商品"]' 
          },
          domains: { 
            type: 'array', 
            items: { type: 'string' },
            description: '适用的域名列表，如["jd.com"]。空数组表示通用技能' 
          },
          steps: { 
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', description: '动作类型: click, input, scroll, wait, navigate, scan, verify' },
                target: { type: 'string', description: 'CSS选择器或元素描述' },
                value: { type: 'string', description: '输入值或参数' }
              }
            },
            description: '操作步骤列表' 
          }
        },
        required: ['name', 'triggers', 'steps']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: '列出所有已学习的技能，包括内置技能和自定义技能。',
      parameters: { type: 'object', properties: {} }
    }
  },
  // ==================== 系统操作工具 ====================
  {
    type: 'function',
    function: {
      name: 'run_app',
      description: '运行用户电脑上的本地应用程序。支持常见应用如：bilibili(B站客户端)、wechat(微信)、qq、vscode、chrome、edge、potplayer(视频播放器)、qqmusic(QQ音乐)、word、excel等。注意：当用户明确说要打开"客户端"时，只尝试本地应用，找不到就告知用户，不要自动切换到浏览器！',
      parameters: {
        type: 'object',
        properties: {
          app_name: {
            type: 'string',
            description: '应用名称，如 bilibili、wechat、vscode、chrome、potplayer 等'
          },
          path: {
            type: 'string',
            description: '可选，应用程序的完整路径。如果提供了 app_name 则不需要'
          },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: '可选，传递给应用的命令行参数。例如视频播放器打开视频时可传入视频路径'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_url',
      description: '使用系统默认浏览器打开网址。只有当用户明确要求在浏览器中打开时才使用，不要作为找不到客户端的替代方案！',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要打开的网址URL'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_app',
      description: '检查用户电脑是否安装了某个应用程序。',
      parameters: {
        type: 'object',
        properties: {
          app_name: {
            type: 'string',
            description: '要检查的应用名称，如 bilibili、wechat、vscode、potplayer 等'
          }
        },
        required: ['app_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_installed_apps',
      description: '列出用户电脑上已安装的常见应用程序。',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_file',
      description: '使用系统默认程序打开文件或文件夹。视频文件会自动播放，文档会用对应程序打开。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件或文件夹的完整路径'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: '运行系统命令（Windows CMD/PowerShell）。用于执行简单的系统操作。危险命令会被阻止。',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的命令，如 dir、echo、start 等'
          },
          cwd: {
            type: 'string',
            description: '可选，命令执行的工作目录'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_system_info',
      description: '获取用户电脑的系统信息，包括操作系统、用户名、主目录等。',
      parameters: { type: 'object', properties: {} }
    }
  },
  // ==================== 键盘鼠标模拟工具 ====================
  {
    type: 'function',
    function: {
      name: 'type_text',
      description: '模拟键盘逐字输入文本，像真人打字一样。可用于在任何程序中输入文字。',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '要输入的文本内容'
          },
          delay: {
            type: 'number',
            description: '每个字符之间的延迟（毫秒），默认50ms。设为0则快速输入'
          }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'press_key',
      description: '按下特定按键或组合键。支持：enter, tab, escape, backspace, delete, 方向键(up/down/left/right), F1-F12, 以及组合键如 ctrl+s, alt+f4, ctrl+shift+s 等',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: '按键名称。单键如: enter, tab, escape, f5。组合键如: ctrl+s, alt+f4, ctrl+shift+n'
          }
        },
        required: ['key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mouse_click',
      description: '在屏幕指定坐标位置点击鼠标。可用于操作桌面应用。',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '屏幕X坐标' },
          y: { type: 'number', description: '屏幕Y坐标' },
          button: { 
            type: 'string', 
            enum: ['left', 'right', 'middle'],
            description: '鼠标按键，默认left' 
          },
          clicks: { 
            type: 'number', 
            description: '点击次数，1=单击，2=双击，默认1' 
          }
        },
        required: ['x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mouse_move',
      description: '移动鼠标到屏幕指定位置',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '目标X坐标' },
          y: { type: 'number', description: '目标Y坐标' },
          smooth: { type: 'boolean', description: '是否平滑移动（像真人），默认true' }
        },
        required: ['x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mouse_drag',
      description: '鼠标拖拽操作，从一个位置拖动到另一个位置',
      parameters: {
        type: 'object',
        properties: {
          from_x: { type: 'number', description: '起始X坐标' },
          from_y: { type: 'number', description: '起始Y坐标' },
          to_x: { type: 'number', description: '目标X坐标' },
          to_y: { type: 'number', description: '目标Y坐标' }
        },
        required: ['from_x', 'from_y', 'to_x', 'to_y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'focus_window',
      description: '激活/聚焦指定窗口，使其显示在最前面',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '窗口标题（模糊匹配）' },
          process: { type: 'string', description: '进程名称，如 notepad, chrome 等' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_mouse_position',
      description: '获取当前鼠标在屏幕上的位置',
      parameters: { type: 'object', properties: {} }
    }
  },
  // ==================== 剪贴板工具 ====================
  {
    type: 'function',
    function: {
      name: 'read_clipboard',
      description: '读取剪贴板内容（文本、图片或HTML）',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_clipboard',
      description: '写入内容到剪贴板',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要写入的文本内容' }
        },
        required: ['text']
      }
    }
  },
  // ==================== 系统通知工具 ====================
  {
    type: 'function',
    function: {
      name: 'send_notification',
      description: '发送桌面通知提醒用户',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '通知标题' },
          body: { type: 'string', description: '通知内容' },
          silent: { type: 'boolean', description: '是否静音，默认false' }
        },
        required: ['title', 'body']
      }
    }
  },
  // ==================== 文件系统工具 ====================
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取文件内容',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，支持环境变量如 %USERPROFILE%' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '写入内容到文件。可选择直接写入或使用"记事本打字模式"（打开记事本逐字输入）',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '要写入的内容' },
          typing_mode: { type: 'boolean', description: '是否使用记事本打字模式（打开记事本逐字输入），默认false' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: '列出目录中的文件和文件夹',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: '在目录中搜索文件（支持通配符如 *.txt）',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '搜索的目录路径' },
          pattern: { type: 'string', description: '搜索模式，如 *.txt, *.jpg, report*' }
        },
        required: ['path', 'pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: '删除文件或文件夹',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要删除的文件/文件夹路径' },
          recursive: { type: 'boolean', description: '是否递归删除文件夹内容，默认false' }
        },
        required: ['path']
      }
    }
  },
  // ==================== 进程管理工具 ====================
  {
    type: 'function',
    function: {
      name: 'list_processes',
      description: '列出当前运行的所有进程',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'kill_process',
      description: '结束指定的进程',
      parameters: {
        type: 'object',
        properties: {
          pid: { type: 'number', description: '进程ID' },
          name: { type: 'string', description: '进程名称，如 notepad.exe' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_system_usage',
      description: '获取系统资源使用情况（CPU和内存）',
      parameters: { type: 'object', properties: {} }
    }
  },
  // ==================== 屏幕截图工具 ====================
  {
    type: 'function',
    function: {
      name: 'capture_screen',
      description: '截取整个屏幕',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_all_windows',
      description: '列出所有可见窗口',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'capture_window',
      description: '截取指定窗口',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '窗口名称（模糊匹配）' }
        },
        required: ['name']
      }
    }
  },
  // ==================== 定时任务工具 ====================
  {
    type: 'function',
    function: {
      name: 'create_reminder',
      description: '创建一个提醒，在指定时间后发送桌面通知',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '提醒标题' },
          message: { type: 'string', description: '提醒内容' },
          delay_minutes: { type: 'number', description: '延迟时间（分钟）' }
        },
        required: ['title', 'message', 'delay_minutes']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_scheduled_task',
      description: '创建定时任务，在指定时间执行并可设置重复',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题' },
          message: { type: 'string', description: '任务内容/提醒消息' },
          time: { type: 'string', description: '触发时间，可以是 HH:MM 格式（如 09:30）或 ISO 格式' },
          repeat: { 
            type: 'string', 
            enum: ['none', 'hourly', 'daily', 'weekly'],
            description: '重复频率，默认 none' 
          }
        },
        required: ['title', 'message', 'time']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_scheduled_tasks',
      description: '列出所有定时任务和提醒',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_scheduled_task',
      description: '取消指定的定时任务',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '任务ID' }
        },
        required: ['id']
      }
    }
  }
]

async function executeToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  const webview = document.querySelector('webview') as any
  const store = useStore.getState()

  switch (name) {
    // ==================== 标签页管理工具 ====================
    
    case 'new_tab': {
      try {
        const url = args.url as string
        store.addTab(url || undefined)
        await new Promise(resolve => setTimeout(resolve, 500))
        const { tabs, activeTabId } = store
        return `新标签页已创建${url ? '并导航到: ' + url : ''}。当前共 ${tabs.length} 个标签页，活动标签页索引: ${tabs.findIndex(t => t.id === activeTabId)}`
      } catch (e) {
        return 'Failed to create new tab: ' + e
      }
    }

    case 'switch_tab': {
      try {
        const index = args.index as number
        const title = args.title as string
        const { tabs } = store
        
        let targetTab = null
        
        if (typeof index === 'number') {
          if (index >= 0 && index < tabs.length) {
            targetTab = tabs[index]
          } else {
            return `无效的标签页索引: ${index}。当前共 ${tabs.length} 个标签页（索引 0-${tabs.length - 1}）`
          }
        } else if (title) {
          targetTab = tabs.find(t => t.title.toLowerCase().includes(title.toLowerCase()) || t.url.toLowerCase().includes(title.toLowerCase()))
          if (!targetTab) {
            return `未找到标题包含 "${title}" 的标签页`
          }
        } else {
          return '请提供标签页索引或标题'
        }
        
        store.setActiveTab(targetTab.id)
        // 更新 webview
        if (webview) {
          webview.src = targetTab.url
        }
        await new Promise(resolve => setTimeout(resolve, 500))
        return `已切换到标签页 ${tabs.findIndex(t => t.id === targetTab!.id)}: "${targetTab.title}" (${targetTab.url})`
      } catch (e) {
        return 'Failed to switch tab: ' + e
      }
    }

    case 'close_tab': {
      try {
        const index = args.index as number
        const { tabs, activeTabId } = store
        
        if (tabs.length <= 1) {
          return '无法关闭最后一个标签页'
        }
        
        let tabToClose = null
        if (typeof index === 'number') {
          if (index >= 0 && index < tabs.length) {
            tabToClose = tabs[index]
          } else {
            return `无效的标签页索引: ${index}`
          }
        } else {
          tabToClose = tabs.find(t => t.id === activeTabId)
        }
        
        if (tabToClose) {
          store.closeTab(tabToClose.id)
          await new Promise(resolve => setTimeout(resolve, 300))
          return `已关闭标签页: "${tabToClose.title}"。剩余 ${tabs.length - 1} 个标签页`
        }
        return '未找到要关闭的标签页'
      } catch (e) {
        return 'Failed to close tab: ' + e
      }
    }

    case 'close_popup': {
      try {
        const webview = document.querySelector('webview') as any
        if (!webview) {
          return '无法找到 webview'
        }
        
        const method = (args.method as string) || 'auto'
        const customSelector = args.selector as string
        const maxAttempts = (args.max_attempts as number) || 3
        
        // 定义所有关闭选择器（按优先级排列）
        const closeSelectors = [
          // 通用关闭按钮
          '.close', '.close-btn', '.btn-close', '.icon-close', '.close-icon',
          '[class*="close"]', '[aria-label="关闭"]', '[aria-label="Close"]',
          '[title="关闭"]', '[title="Close"]', '.modal-close', '.dialog-close',
          
          // 淘宝专用
          '.fm-btn-close', '.login-box .close', '.J_CloseLogin', '.sufei-dialog-close',
          '.baxia-dialog-close', '.next-dialog-close', '.next-icon-close',
          
          // 京东专用  
          '.modal-close', '.jd-close', '.JDJRV-bigimg .close',
          
          // Bilibili专用
          '.bili-mini-close', '.bili-popup-close', '.close-container',
          '.bili-modal__close', '.bpx-player-ending-panel-close',
          
          // 腾讯视频专用
          '.popup_close', '.dialog_close', '.mod_popup .close', '.btn_close',
          '.player_close', '.txp_popup_close',
          
          // GitHub专用
          '.js-cookie-consent-accept', '.Box-overlay-close', '.flash-close',
          
          // 微博/微信等
          '.woo-dialog-close', '.weui-dialog__btn', '.W_close',
          
          // 常见广告关闭
          '.ad-close', '.ad-skip', '.skip-ad', '[class*="ad"] .close',
          '.advertisement-close', '.ads-close',
          
          // 遮罩层/模态框背景
          '.modal-backdrop', '.overlay', '.mask', '.modal-mask',
          '.dialog-overlay', '.popup-overlay'
        ]
        
        let attempts = 0
        let closed = false
        let closeMethod = ''
        
        const tryClose = async (selectors: string[], description: string): Promise<boolean> => {
          const result = await webview.executeJavaScript(`
            (function() {
              const selectors = ${JSON.stringify(selectors)};
              for (const sel of selectors) {
                try {
                  const elements = document.querySelectorAll(sel);
                  for (const el of elements) {
                    const style = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect();
                    // 确保元素可见且可点击
                    if (style.display !== 'none' && style.visibility !== 'hidden' &&
                        parseFloat(style.opacity) > 0 && rect.width > 0 && rect.height > 0) {
                      el.click();
                      return { success: true, selector: sel };
                    }
                  }
                } catch (e) {}
              }
              return { success: false };
            })()
          `)
          if (result.success) {
            closeMethod = `${description}: ${result.selector}`
            return true
          }
          return false
        }
        
        // 根据方法执行关闭
        while (attempts < maxAttempts && !closed) {
          attempts++
          
          if (method === 'auto' || method === 'click_close') {
            // 如果有自定义选择器，优先使用
            if (customSelector) {
              closed = await tryClose([customSelector], '自定义选择器')
            }
            if (!closed) {
              closed = await tryClose(closeSelectors, '点击关闭按钮')
            }
          }
          
          if (!closed && (method === 'auto' || method === 'press_escape')) {
            // 按 ESC 键
            await webview.executeJavaScript(`
              document.dispatchEvent(new KeyboardEvent('keydown', { 
                key: 'Escape', 
                keyCode: 27, 
                code: 'Escape',
                bubbles: true 
              }));
              document.body.dispatchEvent(new KeyboardEvent('keydown', { 
                key: 'Escape', 
                keyCode: 27,
                code: 'Escape', 
                bubbles: true 
              }));
            `)
            await new Promise(resolve => setTimeout(resolve, 300))
            
            // 检查是否关闭成功
            const stillHasPopup = await webview.executeJavaScript(`
              (function() {
                const modals = document.querySelectorAll('.modal, .popup, .dialog, [role="dialog"], .overlay');
                for (const m of modals) {
                  const style = window.getComputedStyle(m);
                  if (style.display !== 'none' && style.visibility !== 'hidden') {
                    return true;
                  }
                }
                return false;
              })()
            `)
            if (!stillHasPopup) {
              closed = true
              closeMethod = '按 ESC 键'
            }
          }
          
          if (!closed && (method === 'auto' || method === 'click_outside')) {
            // 点击页面角落（避开弹窗）
            await webview.executeJavaScript(`
              document.body.click();
              document.documentElement.click();
            `)
            await new Promise(resolve => setTimeout(resolve, 300))
            closeMethod = '点击外部区域'
          }
          
          if (!closed && method === 'specific_selector' && customSelector) {
            closed = await tryClose([customSelector], '指定选择器')
          }
          
          // 等待一下再尝试
          if (!closed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }
        
        if (closed) {
          return `弹窗已关闭 (${closeMethod})，尝试次数: ${attempts}`
        } else {
          // 返回页面上可能的弹窗信息帮助调试
          const popupInfo = await webview.executeJavaScript(`
            (function() {
              const infos = [];
              // 查找可能的弹窗元素
              const selectors = ['.modal', '.popup', '.dialog', '[role="dialog"]', '.overlay', '.mask', 
                                 '[class*="login"]', '[class*="modal"]', '[class*="popup"]', '[class*="dialog"]'];
              for (const sel of selectors) {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                  const style = window.getComputedStyle(el);
                  if (style.display !== 'none' && style.visibility !== 'hidden') {
                    const classes = el.className || '';
                    const id = el.id || '';
                    infos.push({ selector: sel, classes: classes.substring(0, 100), id: id });
                  }
                }
              }
              return infos.slice(0, 5);
            })()
          `)
          
          let debugInfo = ''
          if (popupInfo && popupInfo.length > 0) {
            debugInfo = '\n\n检测到的弹窗元素:\n' + popupInfo.map((p: any) => 
              `- 选择器: ${p.selector}, ID: ${p.id || '无'}, 类名: ${p.classes || '无'}`
            ).join('\n')
            debugInfo += '\n\n建议: 使用 close_popup(method="specific_selector", selector="...") 指定具体选择器'
          }
          
          return `关闭弹窗失败，已尝试 ${attempts} 次${debugInfo}`
        }
      } catch (e) {
        return 'Failed to close popup: ' + e
      }
    }

    case 'list_tabs': {
      try {
        const { tabs, activeTabId } = store
        const tabList = tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId ? ' [当前]' : ''
          return `${index}: "${tab.title}"${isActive}\n   URL: ${tab.url}`
        }).join('\n\n')
        return `共 ${tabs.length} 个标签页:\n\n${tabList}`
      } catch (e) {
        return 'Failed to list tabs: ' + e
      }
    }

    // ==================== 导航工具 ====================

    case 'navigate_to': {
      if (!webview) return 'Browser not loaded'
      try {
        let url = args.url as string
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url
        }
        
        // 清除过期的错误记忆（保留有效记忆，避免返回后重复犯错）
        clearExpiredErrorMemory()
        
        store.setUrl(url)
        webview.src = url
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // 添加视觉反馈
        store.setCurrentModelType('vision')
        const visualFeedback = await quickVisualFeedback('导航到新页面')
        store.setCurrentModelType(null)
        
        return `已跳转到 ${url}\n${visualFeedback ? '当前看到: ' + visualFeedback : ''}`
      } catch (error) {
        return '跳转失败: ' + error
      }
    }

    case 'click_element': {
      if (!webview) return 'Clicked'
      try {
        const selector = (args.selector as string).replace(/'/g, "\\'")
        
        // 获取元素位置用于虚拟鼠标
        const elementInfo = await webview.executeJavaScript(`
          (function() {
            var oldH = document.getElementById('cfspider-agent-highlight');
            if (oldH) oldH.remove();
            
            var el = document.querySelector('${selector}');
            if (!el) return { success: false };
            
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            var rect = el.getBoundingClientRect();
            var h = document.createElement('div');
            h.id = 'cfspider-agent-highlight';
            h.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:4px solid #3b82f6;background:rgba(59,130,246,0.15);border-radius:6px;box-shadow:0 0 20px rgba(59,130,246,0.5);transition:all 0.3s;';
            h.style.left = (rect.left - 4) + 'px';
            h.style.top = (rect.top - 4) + 'px';
            h.style.width = (rect.width + 8) + 'px';
            h.style.height = (rect.height + 8) + 'px';
            var lbl = document.createElement('div');
            lbl.style.cssText = 'position:absolute;top:-24px;left:0;background:#3b82f6;color:white;padding:2px 8px;border-radius:4px;font-size:12px;white-space:nowrap;';
            lbl.textContent = 'AI clicking';
            h.appendChild(lbl);
            document.body.appendChild(h);
            
            return { 
              success: true, 
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2
            };
          })()
        `)
        
        if (elementInfo.success) {
          // 获取 browser-container 的位置偏移
          const container = document.getElementById('browser-container')
          const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 }
          
          // 使用瞄准行为移动鼠标（先粗略定位再精确）
          await aimAndMoveMouse(
            store,
            containerRect.left + elementInfo.x, 
            containerRect.top + elementInfo.y
          )
          
          // 触发点击动画
          store.clickMouse()
          
          // 执行实际点击
          await webview.executeJavaScript(`
            (function() {
              var el = document.querySelector('${selector}');
              if (el) {
                el.click();
                setTimeout(function() {
                  var hh = document.getElementById('cfspider-agent-highlight');
                  if (hh) hh.remove();
                }, 500);
              }
            })()
          `)
          
        }

        await new Promise(resolve => setTimeout(resolve, 1500))
        
        // 添加视觉反馈
        store.setCurrentModelType('vision')
        const visualFeedback = await quickVisualFeedback('点击元素')
        store.setCurrentModelType(null)
        
        return `已点击元素\n${visualFeedback ? '当前看到: ' + visualFeedback : ''}`
      } catch (e) {
        return '已点击'
      }
    }

    case 'click_text': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const targetText = (args.text as string).replace(/'/g, "\\'")
        
        // 检查是否是已知的失败元素
        const currentPageUrl = await webview.executeJavaScript('window.location.href') as string
        const knownBad = isKnownBadElement('', args.text as string, currentPageUrl)
        if (knownBad && knownBad.attempts >= 2) {
          const errorHistory = getPageErrorHistory(currentPageUrl)
          return `[警告] 「${args.text}」已经尝试失败 ${knownBad.attempts} 次了！\n原因：${knownBad.reason}\n\n建议换个方式：\n1. 使用 visual_click("${args.text} 官网链接") 视觉精确定位\n2. 直接点击 URL 文本如 click_text("github.com")\n3. 滚动页面找其他链接\n\n[失败记录]\n${errorHistory.join('\n')}`
        }
        
        // 尝试回忆相关经验
        try {
          const domain = new URL(currentPageUrl).hostname
          const recall = recallExperience(domain, 'click', args.text as string)
          if (recall.found && recall.forgotten) {
            // 有模糊记忆，提示但继续
            console.log('[CFSpider] Vague memory:', recall.reaction)
          } else if (recall.found && recall.memory) {
            // 清晰记忆
            if (recall.memory.type === 'error') {
              // 记得之前失败过
              return `${recall.reaction}\n之前在这里点击"${args.text}"失败过：${recall.memory.lesson}\n建议换个方式试试~`
            }
            console.log('[CFSpider] Clear memory:', recall.memory.lesson)
          }
          
          // 获取该域名的经验供参考
          const experiences = getDomainExperiences(domain)
          if (experiences.length > 0) {
            console.log('[CFSpider] Domain experiences:', experiences)
          }
        } catch {}
        
        const result = await webview.executeJavaScript(`
          (function() {
            var targetText = '${targetText}'.toLowerCase();
            console.log('CFSpider: Looking for text:', targetText);
            
            // Check if user explicitly wants personal/account page
            var wantsPersonalPage = targetText.indexOf('个人') !== -1 || 
                                    targetText.indexOf('账户') !== -1 || 
                                    targetText.indexOf('账号') !== -1 ||
                                    targetText.indexOf('home') !== -1 ||
                                    targetText.indexOf('我的') !== -1 ||
                                    targetText.indexOf('登录') !== -1 ||
                                    targetText.indexOf('登陆') !== -1;
            console.log('CFSpider: Wants personal page:', wantsPersonalPage);
            
            // Build domain patterns from target text
            var domainPatterns = [];
            var textLower = targetText.toLowerCase();
            
            // Common website domain mappings
            var domainMap = {
              'jd': ['jd.com'],
              '京东': ['jd.com'],
              'taobao': ['taobao.com', 'tmall.com'],
              '淘宝': ['taobao.com'],
              'tmall': ['tmall.com'],
              '天猫': ['tmall.com'],
              'github': ['github.com'],
              'amazon': ['amazon.com', 'amazon.cn'],
              '亚马逊': ['amazon.cn', 'amazon.com'],
              'google': ['google.com'],
              '谷歌': ['google.com'],
              'baidu': ['baidu.com'],
              '百度': ['baidu.com'],
              'bing': ['bing.com'],
              '必应': ['bing.com'],
              'microsoft': ['microsoft.com'],
              '微软': ['microsoft.com'],
              'apple': ['apple.com'],
              '苹果': ['apple.com'],
              'facebook': ['facebook.com'],
              'twitter': ['twitter.com', 'x.com'],
              'youtube': ['youtube.com'],
              '油管': ['youtube.com'],
              'bilibili': ['bilibili.com'],
              'b站': ['bilibili.com'],
              '哔哩哔哩': ['bilibili.com'],
              '爱奇艺': ['iqiyi.com'],
              'iqiyi': ['iqiyi.com'],
              '优酷': ['youku.com'],
              'youku': ['youku.com'],
              '腾讯视频': ['v.qq.com'],
              '芒果tv': ['mgtv.com'],
              '抖音': ['douyin.com'],
              'douyin': ['douyin.com'],
              '知乎': ['zhihu.com'],
              'zhihu': ['zhihu.com'],
              '微博': ['weibo.com'],
              'weibo': ['weibo.com'],
              '网易': ['163.com'],
              '新浪': ['sina.com.cn'],
              '搜狐': ['sohu.com']
            };
            
            // Find matching domain patterns
            for (var key in domainMap) {
              if (textLower.indexOf(key) !== -1) {
                domainPatterns = domainPatterns.concat(domainMap[key]);
              }
            }
            
            // If no predefined mapping, try to generate domain from text
            if (domainPatterns.length === 0) {
              var cleaned = textLower.replace(/[^a-z0-9]/g, '');
              if (cleaned.length > 0) {
                domainPatterns.push(cleaned + '.com');
                domainPatterns.push(cleaned);
              }
            }
            
            console.log('CFSpider: Domain patterns:', domainPatterns);
            
            // Helper function to score based on displayed URL text (for Bing/Google cite elements)
            function scoreCiteText(citeText, domain) {
              var urlScore = 0;
              citeText = citeText.toLowerCase().trim();
              
              console.log('CFSpider: Scoring cite text:', citeText, 'for domain:', domain);
              
              // Check for user-related subdomains FIRST - heavy penalty
              if (citeText.indexOf('home.' + domain) !== -1 || 
                  citeText.indexOf('home.') !== -1 ||
                  citeText.indexOf('my.' + domain) !== -1 ||
                  citeText.indexOf('my.') !== -1 ||
                  citeText.indexOf('user.') !== -1 ||
                  citeText.indexOf('account.') !== -1 ||
                  citeText.indexOf('login.') !== -1 ||
                  citeText.indexOf('passport.') !== -1 ||
                  citeText.indexOf('member.') !== -1) {
                urlScore -= 1000;  // Very heavy penalty for user pages
                console.log('CFSpider: User subdomain penalty for cite:', citeText);
              }
              // Check for www. or direct domain - highest priority  
              else if (citeText.indexOf('www.' + domain) !== -1 || 
                       citeText.indexOf('https://' + domain) !== -1 ||
                       citeText.indexOf('http://' + domain) !== -1 ||
                       (citeText.indexOf(domain) !== -1 && citeText.indexOf('.') === citeText.indexOf(domain) - 1 === false)) {
                // Check if it's the main domain (www.jd.com or just jd.com, not subdomain.jd.com)
                var domainIndex = citeText.indexOf(domain);
                var beforeDomain = domainIndex > 0 ? citeText.charAt(domainIndex - 1) : '';
                // If character before domain is . and before that is www or nothing special
                if (beforeDomain === '' || beforeDomain === '/' || 
                    citeText.indexOf('www.' + domain) !== -1 ||
                    citeText.indexOf('://' + domain) !== -1) {
                  urlScore += 500;  // Big bonus for main domain
                  console.log('CFSpider: Main domain bonus for cite:', citeText);
                }
              }
              // Mobile versions
              else if (citeText.indexOf('m.' + domain) !== -1 || 
                       citeText.indexOf('mobile.' + domain) !== -1) {
                urlScore += 100;
              }
              
              return urlScore;
            }
            
            // Helper function to score a URL based on subdomain preference (for direct hrefs)
            function scoreUrl(href, domain) {
              var urlScore = 0;
              try {
                var urlObj = new URL(href);
                var hostname = urlObj.hostname.toLowerCase();
                
                // Highest priority: www.domain.com or just domain.com
                if (hostname === 'www.' + domain || hostname === domain) {
                  urlScore += 500;  // Big bonus for main domain
                  console.log('CFSpider: Main domain bonus for:', hostname);
                }
                // Medium priority: mobile versions
                else if (hostname === 'm.' + domain || hostname === 'mobile.' + domain) {
                  urlScore += 100;
                }
                // HEAVILY penalize user-related subdomains
                else if (hostname.indexOf('home.') === 0 || 
                         hostname.indexOf('my.') === 0 || 
                         hostname.indexOf('user.') === 0 ||
                         hostname.indexOf('account.') === 0 ||
                         hostname.indexOf('login.') === 0 ||
                         hostname.indexOf('passport.') === 0 ||
                         hostname.indexOf('member.') === 0) {
                  urlScore -= 1000;  // Very heavy penalty for user pages
                  console.log('CFSpider: User subdomain penalty for:', hostname);
                }
                
                // Bonus for homepage path (/ or empty)
                if (urlObj.pathname === '/' || urlObj.pathname === '') {
                  urlScore += 50;
                }
              } catch(e) {}
              return urlScore;
            }
            
            var candidates = [];
            
            // Strategy 1: Find cite elements showing the real URL (Bing/Google show URL in cite)
            var citeElements = document.querySelectorAll('cite, .b_attribution, .tF2Cxc cite, [class*="url"], [class*="cite"]');
            console.log('CFSpider: Found', citeElements.length, 'cite elements');
            
            // Bad subdomains to skip entirely - these are user/account pages, not homepages
            var badSubdomainPrefixes = ['home.', 'my.', 'user.', 'account.', 'login.', 'passport.', 'member.', 'profile.', 'center.', 'i.', 'u.', 'sso.', 'auth.'];
            // Also check for these keywords in the result text
            var badKeywords = ['个人中心', '我的订单', '我的账户', '账户设置', '登录', 'home.', '/home', '个人信息'];
            // Skip these UI elements (Copilot, navigation tabs, images, sidebar cards, etc.)
            var badUIElements = [
              'copilot', 'copilotsearch', 'bingcopilot', 'b_sydConvTab', 'sydneyToggle',
              'ai生成', 'ai搜索', 'bing ai',
              '全部', '视频', '图片', '地图', '资讯', '更多', 
              'b_scopeList', 'b_header', 'b_algo_group', 'b_rich',
              '/images/', 'images/search', 'image.baidu', 'images.google',
              // 右侧信息卡（Wikipedia, 知识图谱等）
              'b_entityTP', 'b_sideBleed', 'b_context', 'b_overlay', 'b_pag', 'b_footer',
              'wikipedia', 'wikidata', 'wikimedia', 'youtube.com', 'youtu.be',
              'knowledge-panel', 'kno-', 'side-panel', 'sidePanel'
            ];
            
            // 山寨/镜像网站黑名单
            var fakeSiteDomains = ['github-cn.com', 'github.cn', 'gitee.io', 'jd-cn.com', 'taobao-cn.com'];
            
            // Helper to check if text contains bad subdomain (only if user doesn't want personal page)
            function containsBadSubdomain(text) {
              if (wantsPersonalPage) return false;  // User wants personal page, don't filter
              
              text = text.toLowerCase();
              for (var k = 0; k < badSubdomainPrefixes.length; k++) {
                if (text.indexOf(badSubdomainPrefixes[k]) !== -1) {
                  return true;
                }
              }
              // Also check for bad keywords
              for (var k = 0; k < badKeywords.length; k++) {
                if (text.indexOf(badKeywords[k]) !== -1) {
                  return true;
                }
              }
              return false;
            }
            
            for (var i = 0; i < citeElements.length; i++) {
              var cite = citeElements[i];
              var citeText = (cite.textContent || '').toLowerCase();
              
              // Skip if in header/navigation area (y < 180)
              var citeRect = cite.getBoundingClientRect();
              if (citeRect.top < 180 && citeRect.top > 0) {
                continue;
              }
              
              // Skip if cite text contains bad subdomains
              if (containsBadSubdomain(citeText)) {
                console.log('CFSpider: Skipping cite with bad subdomain:', citeText);
                continue;
              }
              
              // Check if this cite shows our target domain
              for (var j = 0; j < domainPatterns.length; j++) {
                if (citeText.indexOf(domainPatterns[j]) !== -1) {
                  console.log('CFSpider: Found matching cite:', citeText);
                  
                  // Find the parent link or nearby link
                  var parentResult = cite.closest('li, .b_algo, .g, [class*="result"]');
                  if (parentResult) {
                    // Also check if the entire result block contains bad subdomain mentions
                    var resultText = (parentResult.textContent || '').toLowerCase();
                    if (containsBadSubdomain(resultText) && resultText.indexOf('www.') === -1) {
                      console.log('CFSpider: Skipping result with bad subdomain in block:', resultText.slice(0, 100));
                      continue;
                    }
                    
                    var link = parentResult.querySelector('a[href]');
                    if (link) {
                      var rect = link.getBoundingClientRect();
                      if (rect.width > 0 && rect.height > 0 && rect.top > 50 && rect.top < window.innerHeight) {
                        // Calculate score based on the CITE TEXT (displayed URL), not href
                        // This is critical because Bing uses redirect URLs in href
                        var citeScore = 200 + scoreCiteText(citeText, domainPatterns[j]);
                        
                        // Big bonus for www. or main domain in cite text
                        // 修复：同时支持有 www 和没有 www 的主域名
                        var domain = domainPatterns[j];
                        var hasWww = citeText.indexOf('www.' + domain) !== -1;
                        var hasHttpsDomain = citeText.indexOf('https://' + domain) !== -1;
                        var hasHttpDomain = citeText.indexOf('http://' + domain) !== -1;
                        var hasDirectDomain = citeText.indexOf(domain) !== -1;
                        
                        // 检查是否是主域名（没有子域名前缀）
                        var isMainDomain = hasWww || hasHttpsDomain || hasHttpDomain;
                        if (!isMainDomain && hasDirectDomain) {
                          // 检查 domain 前面是否有其他子域名
                          var domainIdx = citeText.indexOf(domain);
                          if (domainIdx > 0) {
                            var charBefore = citeText.charAt(domainIdx - 1);
                            // 如果前面是 / 或空格或者是 https:// 的一部分，说明是主域名
                            isMainDomain = (charBefore === '/' || charBefore === ' ' || charBefore === ':');
                          } else {
                            isMainDomain = true; // 开头就是域名
                          }
                        }
                        
                        if (isMainDomain) {
                          citeScore += 500;  // 主域名大奖励
                          console.log('CFSpider: Main domain bonus for:', citeText);
                        }
                        
                        // Bonus for official keywords
                        if (resultText.indexOf('官网') !== -1 || resultText.indexOf('官方') !== -1 || resultText.indexOf('official') !== -1) {
                          citeScore += 200;
                          console.log('CFSpider: Official keyword bonus for:', citeText);
                        }
                        
                        // Position bonus - first result gets more
                        if (rect.top < 300) citeScore += 50;
                        else if (rect.top < 400) citeScore += 30;
                        
                        candidates.push({
                          el: link,
                          rect: rect,
                          score: citeScore,
                          href: link.href,
                          text: citeText.slice(0, 50),
                          matchedDomain: true,
                          source: 'cite'
                        });
                        console.log('CFSpider: Cite candidate:', citeText, 'Score:', citeScore);
                      }
                    }
                  }
                }
              }
            }
            
            // Helper to check if element is a bad UI element (Copilot, nav tabs, sidebar, etc.)
            function isBadUIElement(el) {
              var href = (el.href || '').toLowerCase();
              var className = (el.className || '').toLowerCase();
              var id = (el.id || '').toLowerCase();
              var parentClasses = '';
              var parent = el.parentElement;
              for (var k = 0; k < 5 && parent; k++) {
                parentClasses += ' ' + (parent.className || '') + ' ' + (parent.id || '');
                parent = parent.parentElement;
              }
              parentClasses = parentClasses.toLowerCase();
              
              // Check against bad UI element patterns
              for (var k = 0; k < badUIElements.length; k++) {
                var bad = badUIElements[k];
                if (href.indexOf(bad) !== -1 || className.indexOf(bad) !== -1 || 
                    id.indexOf(bad) !== -1 || parentClasses.indexOf(bad) !== -1) {
                  return true;
                }
              }
              
              var rect = el.getBoundingClientRect();
              
              // Skip elements in right sidebar area (x > 60% of viewport width)
              // This catches Wikipedia info cards, knowledge panels, etc.
              var viewportWidth = window.innerWidth;
              if (rect.left > viewportWidth * 0.6 && rect.right > viewportWidth * 0.65) {
                console.log('CFSpider: Skipping element in right sidebar:', href || el.textContent?.slice(0, 30));
                return true;
              }
              
              // Skip elements in header area (navigation)
              if (rect.top < 180 && rect.top > 0) {
                // Check if it looks like a navigation item
                if (className.indexOf('scope') !== -1 || className.indexOf('nav') !== -1 ||
                    className.indexOf('tab') !== -1 || className.indexOf('header') !== -1 ||
                    parentClasses.indexOf('scope') !== -1 || parentClasses.indexOf('nav') !== -1) {
                  return true;
                }
              }
              
              return false;
            }
            
            // Strategy 2: Find links where the visible URL text contains target domain
            var allLinks = document.querySelectorAll('a[href]');
            
            for (var i = 0; i < allLinks.length; i++) {
              var el = allLinks[i];
              
              // Skip bad UI elements (Copilot, navigation, etc.)
              if (isBadUIElement(el)) {
                continue;
              }
              
              var href = (el.href || '').toLowerCase();
              var text = (el.textContent || '').toLowerCase().trim();
              var rect = el.getBoundingClientRect();
              
              // Skip invisible elements
              if (rect.width === 0 || rect.height === 0) continue;
              if (rect.top < 100 || rect.top > window.innerHeight - 50) continue;
              
              var score = 0;
              var matchedDomain = false;
              var matchedDomainPattern = null;
              
              // Check if link text or nearby text shows our target domain
              for (var j = 0; j < domainPatterns.length; j++) {
                var domain = domainPatterns[j];
                
                // Check displayed text for domain
                if (text.indexOf(domain) !== -1) {
                  score += 150;
                  matchedDomain = true;
                  matchedDomainPattern = domain;
                  break;
                }
                // Check href (for direct links)
                if (href.indexOf(domain) !== -1) {
                  score += 100;
                  matchedDomain = true;
                  matchedDomainPattern = domain;
                  break;
                }
              }
              
              // Apply subdomain scoring using helper function
              if (matchedDomain && matchedDomainPattern) {
                score += scoreUrl(el.href, matchedDomainPattern);
              }
              
              // Text contains target keyword
              if (text.indexOf(targetText) !== -1) {
                score += 30;
                if (text.length < 50) score += 15;
                if (text.length < 20) score += 10;
              }
              
              // Is this a search result title (h2/h3)?
              var isTitle = el.querySelector('h2, h3') || el.closest('h2, h3');
              if (isTitle && matchedDomain) {
                score += 50;
              }
              
              // In main search area - first results get bonus
              if (rect.top > 150 && rect.top < 400) {
                score += 20;  // Higher position bonus
              } else if (rect.top >= 400 && rect.top < 600) {
                score += 5;
              }
              
              // HEAVILY penalize non-matching domains (ads, other sites)
              if (!matchedDomain && score > 0) {
                // Check if this is likely an ad or unrelated result
                var allClasses = '';
                var parent = el;
                for (var k = 0; k < 5 && parent; k++) {
                  allClasses += ' ' + (parent.className || '') + ' ' + (parent.id || '');
                  parent = parent.parentElement;
                }
                allClasses = allClasses.toLowerCase();
                
                if (allClasses.indexOf('ad') !== -1 || 
                    allClasses.indexOf('sponsor') !== -1 ||
                    allClasses.indexOf('promo') !== -1 ||
                    href.indexOf('ad') !== -1) {
                  score = 0;  // Completely exclude ads
                }
              }
              
              if (score > 0) {
                candidates.push({ 
                  el: el, 
                  rect: rect, 
                  score: score, 
                  href: el.href,
                  text: text.slice(0, 50),
                  matchedDomain: matchedDomain
                });
              }
            }
            
            // Filter out user-related subdomains and Copilot from candidates before sorting
            // Check both href (for direct links) and text (for Bing redirect links where cite shows real URL)
            candidates = candidates.filter(function(c) {
              var hrefLower = (c.href || '').toLowerCase();
              var textLower = (c.text || '').toLowerCase();
              
              // CRITICAL: Strict Copilot filter - check multiple patterns
              var copilotPatterns = ['copilot', 'sydney', 'b_sydconv', 'bingai', '/chat', 'copilotsearch'];
              for (var k = 0; k < copilotPatterns.length; k++) {
                if (hrefLower.indexOf(copilotPatterns[k]) !== -1) {
                  console.log('CFSpider: FILTERED OUT Copilot link:', hrefLower.slice(0, 80));
                  return false;
                }
              }
              
              // Filter out image search links
              if (hrefLower.indexOf('/images/') !== -1 || hrefLower.indexOf('images/search') !== -1) {
                console.log('CFSpider: FILTERED OUT image search link:', hrefLower.slice(0, 80));
                return false;
              }
              
              // Filter out fake sites
              for (var k = 0; k < fakeSiteDomains.length; k++) {
                if (hrefLower.indexOf(fakeSiteDomains[k]) !== -1 || textLower.indexOf(fakeSiteDomains[k]) !== -1) {
                  console.log('CFSpider: FILTERED OUT fake site:', fakeSiteDomains[k]);
                  return false;
                }
              }
              
              // CRITICAL: Filter out Copilot and other bad UI elements
              for (var k = 0; k < badUIElements.length; k++) {
                if (hrefLower.indexOf(badUIElements[k]) !== -1) {
                  console.log('CFSpider: FILTERED OUT bad UI element in href:', hrefLower.slice(0, 80));
                  return false;
                }
              }
              
              // Check the displayed text (cite text) for bad subdomains
              if (containsBadSubdomain(textLower)) {
                console.log('CFSpider: FILTERED OUT bad subdomain in text:', textLower);
                return false;
              }
              
              // Also check href for direct links
              try {
                var urlObj = new URL(c.href);
                var hostname = urlObj.hostname.toLowerCase();
                var pathname = urlObj.pathname.toLowerCase();
                
                if (containsBadSubdomain(hostname)) {
                  console.log('CFSpider: FILTERED OUT bad subdomain in href:', hostname);
                  return false;
                }
                
                // Filter out copilotsearch and similar paths
                if (pathname.indexOf('copilot') !== -1 || pathname.indexOf('chat') !== -1) {
                  console.log('CFSpider: FILTERED OUT copilot path:', pathname);
                  return false;
                }
              } catch(e) {}
              
              return true;
            });
            
            // Sort by score, prioritize domain matches
            candidates.sort(function(a, b) {
              // First prioritize www. or main domain
              var aIsMain = false, bIsMain = false;
              try {
                var aHost = new URL(a.href).hostname.toLowerCase();
                var bHost = new URL(b.href).hostname.toLowerCase();
                aIsMain = aHost.indexOf('www.') === 0 || aHost.split('.').length === 2;
                bIsMain = bHost.indexOf('www.') === 0 || bHost.split('.').length === 2;
              } catch(e) {}
              
              if (aIsMain && !bIsMain) return -1;
              if (!aIsMain && bIsMain) return 1;
              
              if (a.matchedDomain && !b.matchedDomain) return -1;
              if (!a.matchedDomain && b.matchedDomain) return 1;
              return b.score - a.score;
            });
            
            console.log('CFSpider: Found', candidates.length, 'candidates after filtering');
            candidates.slice(0, 5).forEach(function(c) {
              console.log('  Score:', c.score, 'Domain:', c.matchedDomain, 'Href:', c.href.slice(0, 50));
            });
            
            if (candidates.length > 0) {
              // Final verification: skip any result that looks like a personal/account page or Copilot
              var best = null;
              for (var i = 0; i < candidates.length; i++) {
                var c = candidates[i];
                var cText = (c.text || '').toLowerCase();
                var cHref = (c.href || '').toLowerCase();
                
                // CRITICAL: Skip Copilot and AI-related links
                if (cHref.indexOf('copilot') !== -1 || cHref.indexOf('sydneycon') !== -1 ||
                    cHref.indexOf('bingai') !== -1 || cHref.indexOf('/chat') !== -1 ||
                    cHref.indexOf('sydney') !== -1 || cHref.indexOf('b_sydConv') !== -1) {
                  console.log('CFSpider: Final filter - skipping Copilot/AI link:', cHref.slice(0, 60));
                  continue;
                }
                
                // Skip image search results
                if (cHref.indexOf('/images/') !== -1 || cHref.indexOf('images/search') !== -1) {
                  console.log('CFSpider: Final filter - skipping image search link:', cHref.slice(0, 60));
                  continue;
                }
                
                // Skip fake/mirror sites
                var isFakeSite = false;
                for (var j = 0; j < fakeSiteDomains.length; j++) {
                  if (cHref.indexOf(fakeSiteDomains[j]) !== -1 || cText.indexOf(fakeSiteDomains[j]) !== -1) {
                    console.log('CFSpider: Final filter - skipping fake site:', fakeSiteDomains[j]);
                    isFakeSite = true;
                    break;
                  }
                }
                if (isFakeSite) continue;
                
                // Skip if not wanting personal page but result seems like one
                if (!wantsPersonalPage) {
                  if (cText.indexOf('home.') !== -1 || cHref.indexOf('home.') !== -1 ||
                      cText.indexOf('/home') !== -1 || cHref.indexOf('/home') !== -1) {
                    console.log('CFSpider: Final filter - skipping home page:', cText || cHref);
                    continue;
                  }
                }
                
                best = c;
                break;
              }
              
              if (best) {
                console.log('CFSpider: Best match:', best.href, 'Score:', best.score);
                return { found: true, x: best.rect.left + best.rect.width / 2, y: best.rect.top + best.rect.height / 2, href: best.href };
              }
            }
            
            return { found: false };
          })()
        `)
        
        if (!result.found) {
          // DOM 查找失败，尝试使用视觉定位作为后备
          console.log('[CFSpider] DOM 查找失败，尝试视觉定位:', args.text)
          store.setCurrentModelType('vision')
          const visualResult = await visualLocateElement(args.text as string)
          store.setCurrentModelType(null)
          
          if (visualResult.found && visualResult.x && visualResult.y) {
            console.log(`[CFSpider] 视觉定位成功: (${visualResult.x}, ${visualResult.y})`)
            
            // 使用视觉定位的坐标点击
            const container = document.getElementById('browser-container')
            const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 }
            
            await aimAndMoveMouse(store, containerRect.left + visualResult.x, containerRect.top + visualResult.y)
            store.clickMouse()
            
            await webview.executeJavaScript(`
              (function() {
                const x = ${visualResult.x};
                const y = ${visualResult.y};
                const el = document.elementFromPoint(x, y);
                if (el) {
                  // 高亮
                  const rect = el.getBoundingClientRect();
                  const h = document.createElement('div');
                  h.id = 'cfspider-visual-click';
                  h.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:3px solid #f59e0b;background:rgba(245,158,11,0.2);border-radius:4px;';
                  h.style.left = (rect.left - 2) + 'px';
                  h.style.top = (rect.top - 2) + 'px';
                  h.style.width = (rect.width + 4) + 'px';
                  h.style.height = (rect.height + 4) + 'px';
                  document.body.appendChild(h);
                  
                  el.click();
                  
                  // 如果是链接，确保导航
                  let linkEl = el;
                  while (linkEl && linkEl.tagName !== 'A' && linkEl.parentElement) {
                    linkEl = linkEl.parentElement;
                  }
                  if (linkEl && linkEl.tagName === 'A' && linkEl.href) {
                    window.location.href = linkEl.href;
                  }
                  
                  setTimeout(() => { const hh = document.getElementById('cfspider-visual-click'); if(hh) hh.remove(); }, 500);
                }
              })()
            `)
            
            await new Promise(resolve => setTimeout(resolve, 1500))
            
            store.setCurrentModelType('vision')
            const feedback = await quickVisualFeedback(`视觉点击"${args.text}"`)
            store.setCurrentModelType(null)
            
            return `[视觉定位] 点击「${args.text}」at (${visualResult.x}, ${visualResult.y})\n${feedback ? '当前: ' + feedback : ''}`
          }
          
          // 视觉定位也失败
          store.panicMouse(1500)
          const reaction = getRandomPanicReaction()
          
          // 记录查找失败
          const failUrl = await webview.executeJavaScript('window.location.href') as string
          recordClickError(
            'not-found', 
            args.text as string, 
            failUrl,
            'DOM和视觉定位都未找到该元素'
          )
          
          const errorHistory = getPageErrorHistory(failUrl)
          const historyHint = errorHistory.length > 1 ? `\n\n[该页面尝试失败记录]\n${errorHistory.join('\n')}` : ''
          
          return `${reaction}\n找不到「${args.text}」。${visualResult.suggestion || '可以试试 visual_click 或 scroll_page 滚动查看。'}${historyHint}`
        }
        
        console.log('click_text found:', result.href)
        
        // 获取 browser-container 的位置偏移
        const container = document.getElementById('browser-container')
        const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 }
        
        // 使用瞄准行为移动鼠标（先粗略定位再精确）
        await aimAndMoveMouse(
          store,
          containerRect.left + result.x, 
          containerRect.top + result.y
        )
        
        // 触发点击动画
        store.clickMouse()
        
        // 直接使用已找到的 href 导航，不再用 elementFromPoint 重新定位
        // 这避免了点击位置与找到的文字元素不一致的问题
        const targetHref = result.href
        
        await webview.executeJavaScript(`
          (function() {
            var oldH = document.getElementById('cfspider-agent-highlight');
            if (oldH) oldH.remove();
            
            // 高亮鼠标点击位置附近的元素（仅供视觉反馈）
            var el = document.elementFromPoint(${result.x}, ${result.y});
            if (el) {
              var rect = el.getBoundingClientRect();
              var h = document.createElement('div');
              h.id = 'cfspider-agent-highlight';
              h.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:4px solid #3b82f6;background:rgba(59,130,246,0.15);border-radius:6px;box-shadow:0 0 20px rgba(59,130,246,0.5);transition:opacity 0.3s;';
              h.style.left = (rect.left - 4) + 'px';
              h.style.top = (rect.top - 4) + 'px';
              h.style.width = (rect.width + 8) + 'px';
              h.style.height = (rect.height + 8) + 'px';
              document.body.appendChild(h);
              setTimeout(function() { h.style.opacity = '0'; }, 200);
              setTimeout(function() { h.remove(); }, 500);
            }
            
            // 直接导航到已确认的 href，不依赖 elementFromPoint 的结果
            var targetHref = '${targetHref.replace(/'/g, "\\'")}';
            console.log('CFSpider: 直接导航到已确认链接:', targetHref);
            
            setTimeout(function() {
              window.location.href = targetHref;
            }, 300);
          })()
        `)
        
        await new Promise(resolve => setTimeout(resolve, 2500))
        
        // Auto-verify: check if URL or page changed
        try {
          const newState = await webview.executeJavaScript(`
            ({ url: window.location.href, title: document.title })
          `)
          
          const targetText = (args.text as string).toLowerCase()
          const newUrl = newState.url.toLowerCase()
          const newTitle = newState.title.toLowerCase()
          
          // 检查是否误跳转到 Copilot 或其他错误页面
          const isCopilotPage = newUrl.includes('copilot') || newUrl.includes('copilotsearch')
          const isSearchPage = newUrl.includes('bing.com/search') || newUrl.includes('google.com/search') || newUrl.includes('baidu.com/s')
          const isImageSearchPage = newUrl.includes('/images/') || newUrl.includes('image.baidu') || newUrl.includes('images.google')
          
          // 检查是否误入山寨/镜像网站
          const fakeDomains = ['github-cn.com', 'github.cn', 'gitee.io', 'github.io']
          const isFakeSite = fakeDomains.some(d => newUrl.includes(d))
          
          if (isImageSearchPage) {
            // 误入图片搜索页面
            store.panicMouse(1200)
            const reaction = getRandomPanicReaction()
            return `${reaction}\n误入了图片搜索页面！这里显示的是图片结果，不是网站链接。请用 go_back() 返回，然后点击正确的搜索结果链接。`
          }
          
          if (isFakeSite) {
            // 误入山寨网站
            store.panicMouse(1500)
            const reaction = getRandomPanicReaction()
            return `${reaction}\n误入了山寨/镜像网站（${newUrl.slice(0, 50)}）！这不是官方网站。请用 go_back() 返回，重新寻找正确的官网链接。`
          }
          
          if (isCopilotPage) {
            // 误跳转到 Copilot，报告错误让AI自行判断
            store.panicMouse(1500)
            const reaction = getRandomPanicReaction()
            
            // 记录错误到记忆系统，下次避免点击
            const currentUrl = await webview.executeJavaScript('window.location.href') as string
            recordClickError(
              'copilot-link', 
              args.text as string, 
              currentUrl,
              '误跳转到 Copilot/AI 页面'
            )
            
            // 学习教训：记住这个错误
            try {
              const domain = new URL(currentUrl).hostname
              const learnReaction = learnFromExperience('error', domain, 'click', args.text as string,
                `在搜索结果中点击"${args.text}"会跳到Copilot，应该用visual_click或找URL链接`)
              console.log('[CFSpider] Learning:', learnReaction)
            } catch {}
            
            // 获取该页面的错误历史
            const errorHistory = getPageErrorHistory(currentUrl)
            const historyHint = errorHistory.length > 0 ? `\n\n[已知失败记录]\n${errorHistory.join('\n')}` : ''
            
            return `${reaction}\n点击错误！误跳转到了 Copilot/AI 页面（${newState.url.slice(0, 60)}）。这不是「${args.text}」的官网。你可以：返回上一页重试、使用 visual_click 精确定位、或滚动页面找其他链接。${historyHint}`
          }
          
          // 如果还在搜索页面，可能点击没有成功
          if (isSearchPage && !newTitle.includes(targetText)) {
            store.panicMouse(1200)
            
            // 记录点击失败
            recordClickError(
              'search-result', 
              args.text as string, 
              newState.url,
              '点击后仍停留在搜索页面'
            )
            
            const errorHistory = getPageErrorHistory(newState.url)
            const historyHint = errorHistory.length > 0 ? `\n\n[已尝试失败的元素]\n${errorHistory.join('\n')}` : ''
            
            return `${getRandomPanicReaction()}\n点击可能没有成功，还在搜索页面。试试 visual_click("${args.text} 官网链接") 或滚动页面查看。${historyHint}`
          }
          
          const titleContainsTarget = newTitle.includes(targetText)
          
          // 添加视觉反馈
          store.setCurrentModelType('vision')
          const visualFeedback = await quickVisualFeedback(`点击"${args.text}"`)
          store.setCurrentModelType(null)
          
          if (titleContainsTarget || (!isSearchPage && !isCopilotPage)) {
            // 学习成功经验
            try {
              const domain = new URL(newState.url).hostname
              learnFromExperience('success', domain, 'click', args.text as string, 
                `点击"${args.text}"可以到达${newState.title}`)
            } catch {}
            
            return `点击成功~「${args.text}」\n当前页面: ${newState.title}\n${visualFeedback ? '页面状态: ' + visualFeedback : ''}`
          } else {
            return `已点击「${args.text}」，页面可能还在加载...\n当前URL: ${newState.url.slice(0, 50)}\n${visualFeedback ? '当前看到: ' + visualFeedback : ''}`
          }
        } catch {
          return '已点击: ' + args.text
        }
      } catch (e) {
        return `点击失败: ${e}。可以试试 find_element("${args.text}") 找其他选择器`
      }
    }

    case 'input_text': {
      if (!webview) return 'Typed: ' + args.text
      try {
        const selector = args.selector as string
        const text = args.text as string
        
        // 先获取输入框位置用于虚拟鼠标
        const inputInfo = await webview.executeJavaScript(`
          (function() {
            var selectors = [
              '${(selector || '').replace(/'/g, "\\'")}',
              '#query-builder-test', 
              'input[data-target="query-builder.input"]',
              '#sb_form_q', 'textarea#sb_form_q',
              '#kw',
              '#key', '#keyword', '.search-text',
              '#q', 'input[name="q"]', 'textarea[name="q"]',
              'input[type="search"]'
            ];
            for (var i = 0; i < selectors.length; i++) {
              if (!selectors[i]) continue;
              var el = document.querySelector(selectors[i]);
              if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
                var rect = el.getBoundingClientRect();
                return { 
                  found: true, 
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2
                };
              }
            }
            return { found: false };
          })()
        `)
        
        // 如果找到输入框，显示虚拟鼠标并使用瞄准行为
        if (inputInfo.found) {
          const container = document.getElementById('browser-container')
          const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 }
          
          await aimAndMoveMouse(
            store,
            containerRect.left + inputInfo.x, 
            containerRect.top + inputInfo.y
          )
          store.clickMouse()
          await new Promise(resolve => setTimeout(resolve, 300))
        }
        
        // Special handling for GitHub - need to click the search button first to open search
        await webview.executeJavaScript(`
          (function() {
            // Check if we're on GitHub
            if (window.location.hostname.includes('github.com')) {
              console.log('CFSpider: GitHub detected, looking for search trigger...');
              // Try to find and click the search button/input to open the search modal
              var searchTriggers = [
                'button[data-target="qbsearch-input.inputButton"]',
                '.header-search-button',
                '.header-search-input',
                '[data-hotkey="s,/"]',
                'button.header-search-button'
              ];
              for (var i = 0; i < searchTriggers.length; i++) {
                var trigger = document.querySelector(searchTriggers[i]);
                if (trigger && trigger.offsetWidth > 0) {
                  console.log('CFSpider: Clicking GitHub search trigger:', trigger);
                  trigger.click();
                  break;
                }
              }
            }
          })()
        `)
        
        // Wait for search modal to open
        await new Promise(resolve => setTimeout(resolve, 500))
        
        await webview.executeJavaScript(`
          (function() {
            // Find the input element with extensive selectors
            var el = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!el || el.offsetWidth === 0) {
              var selectors = [
                // GitHub - priority for GitHub search
                '#query-builder-test', 
                'input[data-target="query-builder.input"]',
                'input[name="query-builder-test"]',
                '.QueryBuilder-Input',
                'input.form-control.input-sm.header-search-input',
                
                // Bing
                '#sb_form_q', 'textarea#sb_form_q',
                
                // Baidu
                '#kw',
                
                // JD
                '#key', '#keyword', '.search-text', 'input.search-text',
                'input[name="keyword"]', 'input.input',
                
                // Taobao/Google
                '#q', 'input[name="q"]', 'textarea[name="q"]',
                
                // Generic
                'input[type="search"]',
                '.searchInput', '#searchInput',
                'input[placeholder*="Search"]', 'input[placeholder*="search"]',
                'input[aria-label*="Search"]', 'input[aria-label*="search"]'
              ];
              for (var i = 0; i < selectors.length; i++) {
                var found = document.querySelector(selectors[i]);
                if (found && found.offsetWidth > 0 && (found.tagName === 'INPUT' || found.tagName === 'TEXTAREA')) {
                  el = found;
                  console.log('CFSpider: Found input via selector:', selectors[i]);
                  break;
                }
              }
            }
            if (!el) {
              console.log('CFSpider: No input found');
              return { success: false };
            }
            
            console.log('CFSpider: Found input', el.id, el.className, el.name);
            
            // Remove old highlight
            var oldH = document.getElementById('cfspider-agent-highlight');
            if (oldH) oldH.remove();
            
            // Scroll into view
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Add highlight
            var rect = el.getBoundingClientRect();
            var h = document.createElement('div');
            h.id = 'cfspider-agent-highlight';
            h.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:4px solid #10b981;background:rgba(16,185,129,0.15);border-radius:6px;box-shadow:0 0 20px rgba(16,185,129,0.5);';
            h.style.left = (rect.left - 4) + 'px';
            h.style.top = (rect.top - 4) + 'px';
            h.style.width = (rect.width + 8) + 'px';
            h.style.height = (rect.height + 8) + 'px';
            document.body.appendChild(h);
            
            // Click and focus
            el.click();
            el.focus();
            
            // Clear existing value
            el.select();
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            
            return { success: true, id: el.id };
          })()
        `)
        
        // Wait a bit after clearing
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // Now set the value in a separate call
        await webview.executeJavaScript(`
          (function() {
            var el = document.activeElement;
            if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) {
              var selectors = [
                // GitHub
                '#query-builder-test', 
                'input[data-target="query-builder.input"]',
                '.QueryBuilder-Input',
                
                // Others
                '#sb_form_q', 'textarea#sb_form_q', '#kw',
                '#key', '#keyword', '.search-text', 'input.search-text',
                'input[name="keyword"]', '#q', 'input[name="q"]', 'textarea[name="q"]',
                'input[type="search"]',
                'input[placeholder*="Search"]', 'input[aria-label*="Search"]'
              ];
              for (var i = 0; i < selectors.length; i++) {
                var found = document.querySelector(selectors[i]);
                if (found && found.offsetWidth > 0) { el = found; break; }
              }
            }
            if (!el) return;
            
            el.focus();
            var text = '${text.replace(/'/g, "\\'")}';
            
            // Use native setter for React/Vue compatibility
            try {
              var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
              var nativeSetter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
              nativeSetter.call(el, text);
            } catch(e) {
              el.value = text;
            }
            
            // Fire all necessary events
            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            
            console.log('CFSpider: Set value to', el.value);
            
            // Remove highlight after delay
            setTimeout(function() {
              var hh = document.getElementById('cfspider-agent-highlight');
              if (hh) hh.remove();
            }, 1000);
            
            // Return verification data
            return { actualValue: el.value, expectedValue: text };
          })()
        `)
        
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // Auto-verify the input
        const inputResult = await webview.executeJavaScript(`
          (function() {
            var inputs = document.querySelectorAll('input, textarea');
            for (var i = 0; i < inputs.length; i++) {
              if (inputs[i].value && inputs[i].value.includes('${text.replace(/'/g, "\\'")}')) {
                return { verified: true, value: inputs[i].value };
              }
            }
            return { verified: false };
          })()
        `)
        
        // 添加视觉反馈
        store.setCurrentModelType('vision')
        const visualFeedback = await quickVisualFeedback(`输入"${text}"`)
        store.setCurrentModelType(null)
        
        if (inputResult.verified) {
          return `输入成功~「${text}」已填入搜索框\n${visualFeedback ? '当前看到: ' + visualFeedback : ''}`
        } else {
          return `已输入「${text}」，但需要确认一下\n${visualFeedback ? '页面状态: ' + visualFeedback : ''}`
        }
      } catch (e) {
        console.error('input_text error:', e)
        return `输入「${args.text}」时遇到问题，可以检查一下页面`
      }
    }

    case 'scroll_page': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const direction = args.direction as string
        let script = ''
        switch (direction) {
          case 'up': script = 'window.scrollBy(0, -500)'; break
          case 'down': script = 'window.scrollBy(0, 500)'; break
          case 'top': script = 'window.scrollTo(0, 0)'; break
          case 'bottom': script = 'window.scrollTo(0, document.body.scrollHeight)'; break
        }
        await webview.executeJavaScript(script)
        return 'Scrolled ' + direction
      } catch (e) {
        return 'Scroll failed: ' + e
      }
    }

    case 'read_full_page': {
      if (!webview) return 'Error: Cannot access page'
      
      // 检查是否有视觉模型可用
      const { aiConfig: pageCfg } = store
      const useBuiltInPage = pageCfg.useBuiltIn !== false && (!pageCfg.endpoint || !pageCfg.apiKey)
      const hasVisionPage = useBuiltInPage ? !!BUILT_IN_AI.visionModel : !!pageCfg.visionModel
      
      // 如果没有视觉模型，使用 DOM 提取文本
      if (!hasVisionPage) {
        try {
          const textContent = await webview.executeJavaScript(`
            (function() {
              var main = document.querySelector('main, article, .content, .main, #content, #main, body');
              return main ? main.innerText.slice(0, 10000) : document.body.innerText.slice(0, 10000);
            })()
          `)
          return '页面文本内容（DOM提取，无视觉分析）：\n\n' + textContent
        } catch (e) {
          return 'Error reading page: ' + e
        }
      }
      
      try {
        const maxScrolls = (args.max_scrolls as number) || 10
        const allContents: string[] = []
        
        // 先滚动到顶部
        await webview.executeJavaScript('window.scrollTo(0, 0)')
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // 获取页面高度信息
        const pageInfo = await webview.executeJavaScript(`
          (function() {
            return {
              scrollHeight: document.body.scrollHeight,
              clientHeight: window.innerHeight,
              scrollTop: window.scrollY
            }
          })()
        `)
        
        const viewportHeight = pageInfo.clientHeight
        const scrollStep = Math.floor(viewportHeight * 0.8) // 每次滚动 80% 视口高度
        
        // 显示虚拟鼠标
        store.showMouse()
        
        // 循环滚动并分析
        for (let i = 0; i < maxScrolls; i++) {
          // 更新消息显示进度
          store.updateLastMessage(`正在阅读页面... (${i + 1}/${maxScrolls})`)
          
          // 设置视觉模型状态
          store.setCurrentModelType('vision')
          
          // 截图并分析当前可见内容
          try {
            const image = await webview.capturePage()
            if (image) {
              const base64Image = image.toDataURL().replace(/^data:image\/\w+;base64,/, '')
              console.log('[CFSpider] read_full_page 视觉分析第', i + 1, '屏')
              
              const response = await callAIWithTokenTracking({
                endpoint: BUILT_IN_AI.endpoint,
                apiKey: getBuiltInKey(),
                model: BUILT_IN_AI.visionModel,
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'text', text: '请提取这个网页截图中的所有文本内容，保持原有结构。只输出文本内容，不要添加任何分析。' },
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
                  ]
                }]
              }, 'vision')
              
              if (response.content) {
                allContents.push(`=== 第 ${i + 1} 屏 ===\n${response.content}`)
              }
            }
          } catch (e) {
            console.error('视觉分析失败:', e)
          }
          
          store.setCurrentModelType(null)
          
          // 检查是否到达页面底部
          const currentScroll = await webview.executeJavaScript('window.scrollY + window.innerHeight >= document.body.scrollHeight - 10')
          if (currentScroll) {
            console.log('[CFSpider] 已到达页面底部')
            break
          }
          
          // 滚动到下一屏，移动虚拟鼠标
          const container = document.getElementById('browser-container')
          const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0, width: 800, height: 600 }
          store.moveMouse(
            containerRect.left + containerRect.width / 2,
            containerRect.top + containerRect.height / 2,
            200
          )
          
          await webview.executeJavaScript(`window.scrollBy(0, ${scrollStep})`)
          await new Promise(resolve => setTimeout(resolve, 800)) // 等待滚动动画和页面加载
        }
        
        store.hideMouse()
        
        // 返回所有内容
        return `页面完整内容（共 ${allContents.length} 屏）：\n\n${allContents.join('\n\n')}`
      } catch (e) {
        return 'Read full page failed: ' + e
      }
    }

    // ==================== 视觉模型专用工具实现 ====================
    
    case 'solve_captcha': {
      if (!webview) return 'Error: Cannot access page'
      
      // 检查是否有视觉模型可用
      const { aiConfig } = store
      const useBuiltIn = aiConfig.useBuiltIn !== false && (!aiConfig.endpoint || !aiConfig.apiKey)
      const hasVisionModel = useBuiltIn ? !!BUILT_IN_AI.visionModel : !!aiConfig.visionModel
      
      if (!hasVisionModel) {
        return '当前为单模型模式，无法使用验证码识别功能。请在设置中配置视觉模型，或使用内置 AI 服务。'
      }
      
      try {
        const captchaType = args.captcha_type as string
        store.setCurrentModelType('vision')
        console.log('[CFSpider] 开始识别验证码，类型:', captchaType || '自动检测')

        // 截取整个页面
        const image = await webview.capturePage()
        if (!image) {
          store.setCurrentModelType(null)
          return 'Error: Failed to capture page'
        }

        const base64Image = image.toDataURL().replace(/^data:image\/\w+;base64,/, '')

        // 如果没有指定类型，先自动检测验证码类型
        let detectedType = captchaType
        if (!captchaType || captchaType === 'auto') {
          const detectResponse = await callAIWithTokenTracking({
            endpoint: BUILT_IN_AI.endpoint,
            apiKey: getBuiltInKey(),
            model: BUILT_IN_AI.visionModel,
            messages: [{
              role: 'user',
              content: [
                { 
                  type: 'text', 
                  text: `请分析这个页面是否有验证码。如果有，识别验证码类型并返回以下格式：

类型: [text/slider/click/none]
描述: [简短描述]

- text: 图形文字验证码，需要输入看到的文字
- slider: 滑块验证码，需要拖动滑块到缺口位置
- click: 点选验证码，需要按顺序点击指定元素
- none: 没有发现验证码

只返回上述格式，不要添加其他内容。` 
                },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
              ]
            }]
          }, 'vision')
          
          const detectResult = detectResponse.content || ''
          console.log('[CFSpider] 验证码检测结果:', detectResult)
          
          if (detectResult.includes('类型: text') || detectResult.toLowerCase().includes('text')) {
            detectedType = 'text'
          } else if (detectResult.includes('类型: slider') || detectResult.toLowerCase().includes('slider')) {
            detectedType = 'slider'
          } else if (detectResult.includes('类型: click') || detectResult.toLowerCase().includes('click')) {
            detectedType = 'click'
          } else {
            store.setCurrentModelType(null)
            return '未检测到验证码或验证码类型无法识别。检测结果: ' + detectResult
          }
        }

        console.log('[CFSpider] 验证码类型:', detectedType)

        // 根据类型获取详细信息
        let prompt = ''
        switch (detectedType) {
          case 'text':
            prompt = `这是一个图形文字验证码页面。请：
1. 识别验证码图片中的文字
2. 找到验证码输入框的位置

返回格式：
验证码文字: XXXX
输入框选择器: input[name=captcha] 或类似选择器

只返回上述格式，验证码文字要准确，如果看不清请给出最可能的猜测。`
            break
          case 'slider':
            prompt = `这是一个滑块验证码页面。请：
1. 找到滑块按钮的位置
2. 分析缺口位置，计算需要滑动的距离

返回格式：
滑块选择器: .slider-button 或类似选择器
滑动距离: XXX像素

请仔细分析滑块起始位置和缺口位置的水平距离。`
            break
          case 'click':
            prompt = `这是一个点选验证码页面。请：
1. 识别需要按顺序点击的元素（文字或图标）
2. 返回每个元素的大致位置坐标

返回格式：
点击顺序:
1. "文字1" 位置: (X1, Y1)
2. "文字2" 位置: (X2, Y2)
3. "文字3" 位置: (X3, Y3)

坐标是相对于页面左上角的像素位置。`
            break
        }

        const response = await callAIWithTokenTracking({
          endpoint: BUILT_IN_AI.endpoint,
          apiKey: getBuiltInKey(),
          model: BUILT_IN_AI.visionModel,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
            ]
          }]
        }, 'vision')

        store.setCurrentModelType(null)
        
        const result = response.content || 'Failed to recognize captcha'
        console.log('[CFSpider] 验证码识别结果:', result)
        
        // 返回结构化信息，告诉工具模型下一步操作
        return `验证码类型: ${detectedType}

${result}

下一步操作建议:
${detectedType === 'text' ? '1. 使用 input_text 将验证码文字输入到输入框' : ''}
${detectedType === 'slider' ? '1. 使用 drag_element(selector="滑块选择器", distance_x=滑动距离) 拖动滑块' : ''}
${detectedType === 'click' ? '1. 按顺序使用 click_element 或 visual_click 点击指定位置' : ''}`
      } catch (e) {
        store.setCurrentModelType(null)
        return 'Captcha recognition failed: ' + e
      }
    }

    case 'analyze_image': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const selector = args.selector as string
        const question = (args.question as string) || '请描述这张图片的内容'
        
        // 获取图片元素信息
        const imgInfo = await webview.executeJavaScript(`
          (function() {
            const img = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!img) return { found: false };
            const rect = img.getBoundingClientRect();
            return {
              found: true,
              src: img.src,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              width: rect.width,
              height: rect.height
            };
          })()
        `)
        
        if (!imgInfo.found) {
          return 'Error: Image not found with selector: ' + selector
        }
        
        store.setCurrentModelType('vision')
        
        // 截取整个页面（包含图片）
        const image = await webview.capturePage()
        if (!image) {
          store.setCurrentModelType(null)
          return 'Error: Failed to capture page'
        }
        
        const base64Image = image.toDataURL().replace(/^data:image\/\w+;base64,/, '')
        
        const response = await callAIWithTokenTracking({
          endpoint: BUILT_IN_AI.endpoint,
          apiKey: getBuiltInKey(),
          model: BUILT_IN_AI.visionModel,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: `页面中有一张图片位于 (${Math.round(imgInfo.x)}, ${Math.round(imgInfo.y)}) 位置，大小 ${Math.round(imgInfo.width)}x${Math.round(imgInfo.height)}。${question}` },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
            ]
          }]
        }, 'vision')
        
        store.setCurrentModelType(null)
        return response.content || 'Failed to analyze image'
      } catch (e) {
        store.setCurrentModelType(null)
        return 'Image analysis failed: ' + e
      }
    }

    case 'visual_click': {
      if (!webview) return 'Error: Cannot access page'
      
      // 检查是否有视觉模型可用
      const { aiConfig: aiCfg } = store
      const useBuiltInVision = aiCfg.useBuiltIn !== false && (!aiCfg.endpoint || !aiCfg.apiKey)
      const hasVision = useBuiltInVision ? !!BUILT_IN_AI.visionModel : !!aiCfg.visionModel
      
      if (!hasVision) {
        return '当前为单模型模式，无法使用视觉点击功能。请尝试使用 click_text 或 click_element 替代。'
      }
      
      try {
        const description = args.description as string
        
        store.setCurrentModelType('vision')
        
        // 使用视觉定位函数找到元素
        const locateResult = await visualLocateElement(description)
        
        store.setCurrentModelType(null)
        
        if (!locateResult.found || !locateResult.x || !locateResult.y) {
          // 触发紧张模式
          store.panicMouse(1500)
          const reaction = getRandomPanicReaction()
          return `${reaction}\n找不到「${description}」: ${locateResult.suggestion || '元素不存在或不可见'}`
        }
        
        const x = locateResult.x
        const y = locateResult.y
        const confidence = locateResult.confidence || 'MEDIUM'
        
        console.log(`[CFSpider] 视觉定位: (${x}, ${y}) 置信度: ${confidence}`)
        
        // 显示虚拟鼠标并使用瞄准行为点击
        const container = document.getElementById('browser-container')
        const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 }
        
        await aimAndMoveMouse(store, containerRect.left + x, containerRect.top + y)
        store.clickMouse()
        
        // 执行点击 - 增强版，尝试多种点击方式
        await webview.executeJavaScript(`
          (function() {
            const x = ${x};
            const y = ${y};
            const el = document.elementFromPoint(x, y);
            
            if (el) {
              // 添加高亮效果
              const rect = el.getBoundingClientRect();
              const h = document.createElement('div');
              h.id = 'cfspider-visual-highlight';
              h.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:3px solid #22c55e;background:rgba(34,197,94,0.2);border-radius:4px;transition:opacity 0.3s;';
              h.style.left = (rect.left - 2) + 'px';
              h.style.top = (rect.top - 2) + 'px';
              h.style.width = (rect.width + 4) + 'px';
              h.style.height = (rect.height + 4) + 'px';
              document.body.appendChild(h);
              
              // 尝试点击
              el.click();
              
              // 如果是链接，确保导航
              let linkEl = el;
              while (linkEl && linkEl.tagName !== 'A' && linkEl.parentElement) {
                linkEl = linkEl.parentElement;
              }
              if (linkEl && linkEl.tagName === 'A' && linkEl.href) {
                window.location.href = linkEl.href;
              }
              
              setTimeout(() => {
                const hh = document.getElementById('cfspider-visual-highlight');
                if (hh) hh.remove();
              }, 500);
            }
          })()
        `)
        
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        // 视觉确认
        store.setCurrentModelType('vision')
        const visualFeedback = await quickVisualFeedback(`点击「${description}」`)
        store.setCurrentModelType(null)
        
        return `视觉定位点击 (${x}, ${y})「${description}」${confidence === 'HIGH' ? ' [高置信度]' : ''}\n${visualFeedback ? '当前: ' + visualFeedback : ''}`
      } catch (e) {
        store.setCurrentModelType(null)
        store.panicMouse(1500)
        return getRandomPanicReaction() + '\n视觉点击失败: ' + e
      }
    }

    case 'compare_screenshots': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const action = args.action as string
        
        // 使用全局变量存储截图
        const win = window as any
        
        if (action === 'save') {
          const image = await webview.capturePage()
          if (!image) return 'Error: Failed to capture page'
          win._cfspider_saved_screenshot = image.toDataURL()
          return 'Screenshot saved for comparison'
        } else if (action === 'compare') {
          if (!win._cfspider_saved_screenshot) {
            return 'Error: No saved screenshot. Use save action first.'
          }
          
          const currentImage = await webview.capturePage()
          if (!currentImage) return 'Error: Failed to capture current page'
          
          const savedBase64 = win._cfspider_saved_screenshot.replace(/^data:image\/\w+;base64,/, '')
          const currentBase64 = currentImage.toDataURL().replace(/^data:image\/\w+;base64,/, '')
          
          store.setCurrentModelType('vision')
          
          // 让视觉模型比较两张截图
          const response = await callAIWithTokenTracking({
            endpoint: BUILT_IN_AI.endpoint,
            apiKey: getBuiltInKey(),
            model: BUILT_IN_AI.visionModel,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: '这是操作前的页面截图：' },
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${savedBase64}` } }
                ]
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: '这是操作后的页面截图。请比较两张截图的变化，描述发生了什么变化。' },
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${currentBase64}` } }
                ]
              }
            ]
          }, 'vision')
          
          store.setCurrentModelType(null)
          return response.content || 'Failed to compare screenshots'
        }
        
        return 'Invalid action. Use "save" or "compare".'
      } catch (e) {
        store.setCurrentModelType(null)
        return 'Screenshot comparison failed: ' + e
      }
    }

    case 'extract_chart_data': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const selector = args.selector as string
        const chartType = args.chart_type as string
        
        store.setCurrentModelType('vision')
        
        // 截取页面
        const image = await webview.capturePage()
        if (!image) {
          store.setCurrentModelType(null)
          return 'Error: Failed to capture page'
        }
        
        const base64Image = image.toDataURL().replace(/^data:image\/\w+;base64,/, '')
        
        let prompt = '请从这个页面中提取图表数据。'
        if (selector) {
          prompt += ` 图表位于 ${selector} 元素中。`
        }
        if (chartType) {
          prompt += ` 这是一个${chartType}图表。`
        }
        prompt += `

请按以下格式返回数据：
- 图表类型：
- 图表标题：
- 数据：
  | 类别 | 数值 |
  |------|------|
  | xxx  | xxx  |

如果是折线图或趋势图，请描述趋势变化。`
        
        const response = await callAIWithTokenTracking({
          endpoint: BUILT_IN_AI.endpoint,
          apiKey: getBuiltInKey(),
          model: BUILT_IN_AI.visionModel,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
            ]
          }]
        }, 'vision')
        
        store.setCurrentModelType(null)
        return response.content || 'Failed to extract chart data'
      } catch (e) {
        store.setCurrentModelType(null)
        return 'Chart data extraction failed: ' + e
      }
    }

    case 'ocr_image': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const selector = args.selector as string
        
        // 获取图片元素信息
        const imgInfo = await webview.executeJavaScript(`
          (function() {
            const img = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!img) return { found: false };
            return { found: true, src: img.src };
          })()
        `)
        
        if (!imgInfo.found) {
          return 'Error: Image not found with selector: ' + selector
        }
        
        store.setCurrentModelType('vision')
        
        // 截取页面
        const image = await webview.capturePage()
        if (!image) {
          store.setCurrentModelType(null)
          return 'Error: Failed to capture page'
        }
        
        const base64Image = image.toDataURL().replace(/^data:image\/\w+;base64,/, '')
        
        const response = await callAIWithTokenTracking({
          endpoint: BUILT_IN_AI.endpoint,
          apiKey: getBuiltInKey(),
          model: BUILT_IN_AI.visionModel,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: `请提取页面中 ${selector} 这个图片里的所有文字。保持原有的格式和结构，只返回文字内容。` },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
            ]
          }]
        }, 'vision')
        
        store.setCurrentModelType(null)
        return response.content || 'Failed to extract text from image'
      } catch (e) {
        store.setCurrentModelType(null)
        return 'OCR failed: ' + e
      }
    }

    case 'drag_element': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const selector = args.selector as string
        const distanceX = (args.distance_x as number) || 0
        const distanceY = (args.distance_y as number) || 0
        const duration = (args.duration as number) || 500
        
        // 获取元素位置
        const elementInfo = await webview.executeJavaScript(`
          (function() {
            const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
            if (!el) return { found: false };
            const rect = el.getBoundingClientRect();
            return {
              found: true,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              width: rect.width,
              height: rect.height
            };
          })()
        `)
        
        if (!elementInfo.found) {
          return 'Error: Element not found: ' + selector
        }
        
        const startX = elementInfo.x
        const startY = elementInfo.y
        const endX = startX + distanceX
        const endY = startY + distanceY
        
        // 获取容器偏移，显示虚拟鼠标
        const container = document.getElementById('browser-container')
        const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 }
        
        store.showMouse()
        
        // 移动到起始位置
        store.moveMouse(containerRect.left + startX, containerRect.top + startY, 200)
        await new Promise(resolve => setTimeout(resolve, 300))
        
        // 模拟鼠标按下
        await webview.executeJavaScript(`
          (function() {
            const el = document.elementFromPoint(${startX}, ${startY});
            if (el) {
              const mousedownEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: ${startX},
                clientY: ${startY},
                button: 0
              });
              el.dispatchEvent(mousedownEvent);
            }
          })()
        `)
        
        // 平滑拖动 - 分多步移动，模拟真人
        const steps = Math.max(10, Math.floor(duration / 20))
        const stepX = distanceX / steps
        const stepY = distanceY / steps
        const stepDelay = duration / steps
        
        for (let i = 1; i <= steps; i++) {
          const currentX = startX + stepX * i
          const currentY = startY + stepY * i
          
          // 添加一点随机抖动，更像真人
          const jitterX = (Math.random() - 0.5) * 2
          const jitterY = (Math.random() - 0.5) * 2
          
          // 移动虚拟鼠标
          store.moveMouse(
            containerRect.left + currentX + jitterX,
            containerRect.top + currentY + jitterY,
            stepDelay * 0.8
          )
          
          // 触发 mousemove 事件
          await webview.executeJavaScript(`
            (function() {
              const el = document.elementFromPoint(${currentX}, ${currentY});
              const target = el || document.body;
              const mousemoveEvent = new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                clientX: ${currentX},
                clientY: ${currentY},
                button: 0
              });
              target.dispatchEvent(mousemoveEvent);
            })()
          `)
          
          await new Promise(resolve => setTimeout(resolve, stepDelay))
        }
        
        // 模拟鼠标释放
        await webview.executeJavaScript(`
          (function() {
            const el = document.elementFromPoint(${endX}, ${endY});
            const target = el || document.body;
            const mouseupEvent = new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              clientX: ${endX},
              clientY: ${endY},
              button: 0
            });
            target.dispatchEvent(mouseupEvent);
          })()
        `)
        
        await new Promise(resolve => setTimeout(resolve, 200))
        store.hideMouse()
        
        return `Dragged element from (${Math.round(startX)}, ${Math.round(startY)}) to (${Math.round(endX)}, ${Math.round(endY)})`
      } catch (e) {
        store.hideMouse()
        return 'Drag failed: ' + e
      }
    }

    // ==================== 基础工具 ====================

    case 'wait': {
      const ms = (args.ms as number) || 1000
      await new Promise(resolve => setTimeout(resolve, ms))
      return 'Waited ' + ms + 'ms'
    }

    case 'get_page_info': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const result = await webview.executeJavaScript(`
          ({ title: document.title, url: location.href })
        `)
        return 'Title: ' + result.title + '\nURL: ' + result.url
      } catch (e) {
        return 'Failed: ' + e
      }
    }

    case 'go_back': {
      if (!webview) return 'Error: Cannot access page'
      try {
        if (webview.canGoBack()) {
          webview.goBack()
          await new Promise(resolve => setTimeout(resolve, 300))
          return 'Went back'
        } else {
          return 'Cannot go back'
        }
      } catch (e) {
        return 'Failed: ' + e
      }
    }

    case 'go_forward': {
      if (!webview) return 'Error: Cannot access page'
      try {
        if (webview.canGoForward()) {
          webview.goForward()
          await new Promise(resolve => setTimeout(resolve, 300))
          return 'Went forward'
        } else {
          return 'Cannot go forward'
        }
      } catch (e) {
        return 'Failed: ' + e
      }
    }

    case 'press_enter': {
      if (!webview) return 'Pressed Enter'
      try {
        const selector = (args.selector as string || '').replace(/'/g, "\\'")
        await webview.executeJavaScript(`
          (function() {
            console.log('CFSpider: press_enter called');
            
            // Find input element
            var el = document.querySelector('${selector}');
            if (!el || el.offsetWidth === 0) {
              var selectors = [
                '#sb_form_q', 'textarea#sb_form_q',  // Bing
                '#kw',  // Baidu
                '#key', '#keyword', '.search-text', 'input.search-text',  // JD
                'input[name="keyword"]',
                '#q', 'input[name="q"]', 'textarea[name="q"]',
                'input[type="search"]'
              ];
              for (var i = 0; i < selectors.length; i++) {
                var found = document.querySelector(selectors[i]);
                if (found && found.offsetWidth > 0) { el = found; break; }
              }
            }
            
            if (el) {
              console.log('CFSpider: Found element for Enter', el.id, el.className);
              el.focus();
              
              // Dispatch Enter key events
              var opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
              el.dispatchEvent(new KeyboardEvent('keydown', opts));
              el.dispatchEvent(new KeyboardEvent('keypress', opts));
              el.dispatchEvent(new KeyboardEvent('keyup', opts));
            }
            
            // Try to find and click search button directly
            var btnSelectors = [
              // Bing
              '#search_icon', '#sb_search', 'input[type="submit"]',
              // Baidu
              '#su', 'input#su',
              // JD - many possible selectors
              '.button', 'button.button', 'a.button',
              '.btn-search', '.search-btn',
              '.form-search-btn', '.search-button',
              '[class*="search"][class*="btn"]',
              '[class*="??"]',
              // Generic
              'button[type="submit"]', 'input[type="submit"]'
            ];
            
            var clicked = false;
            for (var i = 0; i < btnSelectors.length && !clicked; i++) {
              var btns = document.querySelectorAll(btnSelectors[i]);
              for (var j = 0; j < btns.length; j++) {
                var btn = btns[j];
                if (btn && btn.offsetWidth > 0 && btn.offsetHeight > 0) {
                  console.log('CFSpider: Clicking button', btn.className, btn.id);
                  btn.click();
                  clicked = true;
                  break;
                }
              }
            }
            
            // Fallback: try form submit
            if (!clicked && el) {
              var form = el.closest('form');
              if (form) {
                console.log('CFSpider: Submitting form');
                try { form.submit(); } catch(e) {}
              }
            }
          })()
        `)
        await new Promise(resolve => setTimeout(resolve, 2000))
        return 'Pressed Enter'
      } catch (e) {
        console.error('press_enter error:', e)
        return 'Pressed Enter'
      }
    }

    case 'click_button': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const buttonText = (args.text as string).replace(/'/g, "\\'")
        const fallbackSelectors = (args.fallback_selectors as string[]) || []
        
        const result = await webview.executeJavaScript(`
          (function() {
            var targetText = '${buttonText}'.toLowerCase().trim();
            console.log('CFSpider: Looking for button with text:', targetText);
            
            // 常见购物车/购买按钮的选择器
            var commonButtonSelectors = [
              // 加入购物车
              '#add-to-cart', '#addToCart', '.add-to-cart', '.addToCart',
              '[class*="add-cart"]', '[class*="addcart"]', '[class*="加入购物车"]',
              'button[class*="cart"]', 'a[class*="cart"]',
              '.btn-addcart', '.J_AddCart', '#InitCartUrl',
              // 京东
              '#InitCartUrl', '.btn-special1', '#choose-btn-append',
              // 淘宝/天猫
              '.J_LinkAdd', '#J_AddCart', '.tb-btn-buy', '.tm-btn-buy',
              // 立即购买
              '#buy-now', '.buy-now', '[class*="buy-now"]', '.btn-buy',
              '#InitBuyUrl', '.J_LinkBuy',
              // 通用
              '.btn-primary', '.btn-submit', '.btn-confirm',
              'button[type="submit"]', 'input[type="submit"]'
            ];
            
            var candidates = [];
            
            // 策略1: 通过文字精确匹配查找按钮
            var allElements = document.querySelectorAll('button, a, div, span, input[type="button"], input[type="submit"], [role="button"], [class*="btn"], [class*="button"]');
            
            for (var i = 0; i < allElements.length; i++) {
              var el = allElements[i];
              var text = (el.textContent || el.value || '').toLowerCase().trim();
              var rect = el.getBoundingClientRect();
              
              // 跳过不可见元素
              if (rect.width === 0 || rect.height === 0) continue;
              if (rect.top < 0 || rect.top > window.innerHeight) continue;
              
              // 检查是否被遮挡
              var centerX = rect.left + rect.width / 2;
              var centerY = rect.top + rect.height / 2;
              var topEl = document.elementFromPoint(centerX, centerY);
              if (!topEl) continue;
              if (!el.contains(topEl) && !topEl.contains(el) && topEl !== el) continue;
              
              var score = 0;
              
              // 精确匹配
              if (text === targetText) {
                score += 1000;
              }
              // 包含目标文字
              else if (text.indexOf(targetText) !== -1) {
                score += 500;
                // 文字越短越精确
                if (text.length < 20) score += 100;
                if (text.length < 10) score += 50;
              }
              // 部分匹配（如"加入购物车"匹配"加购"）
              else if (targetText.indexOf('购物车') !== -1 && (text.indexOf('加购') !== -1 || text.indexOf('购物车') !== -1)) {
                score += 400;
              }
              else if (targetText.indexOf('购买') !== -1 && text.indexOf('购买') !== -1) {
                score += 400;
              }
              
              if (score === 0) continue;
              
              // 按钮类型加分
              if (el.tagName === 'BUTTON') score += 50;
              if (el.tagName === 'A') score += 30;
              if (el.getAttribute('role') === 'button') score += 40;
              
              // 类名包含关键词加分
              var className = (el.className || '').toLowerCase();
              if (className.indexOf('cart') !== -1) score += 100;
              if (className.indexOf('buy') !== -1) score += 100;
              if (className.indexOf('add') !== -1) score += 50;
              if (className.indexOf('btn') !== -1) score += 30;
              if (className.indexOf('primary') !== -1) score += 20;
              
              // 可见性加分
              if (rect.width > 50 && rect.height > 20) score += 30;
              
              candidates.push({
                el: el,
                rect: rect,
                score: score,
                text: text.slice(0, 50)
              });
            }
            
            // 策略2: 尝试常见选择器
            if (candidates.length === 0) {
              for (var i = 0; i < commonButtonSelectors.length; i++) {
                try {
                  var btns = document.querySelectorAll(commonButtonSelectors[i]);
                  for (var j = 0; j < btns.length; j++) {
                    var btn = btns[j];
                    var rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && rect.top > 0 && rect.top < window.innerHeight) {
                      var text = (btn.textContent || btn.value || '').toLowerCase().trim();
                      if (text.indexOf(targetText) !== -1 || targetText.indexOf(text) !== -1 || text.length < 20) {
                        candidates.push({
                          el: btn,
                          rect: rect,
                          score: 200,
                          text: text.slice(0, 50),
                          selector: commonButtonSelectors[i]
                        });
                      }
                    }
                  }
                } catch(e) {}
              }
            }
            
            // 策略3: 尝试备用选择器
            var fallbacks = ${JSON.stringify(fallbackSelectors)};
            for (var i = 0; i < fallbacks.length; i++) {
              try {
                var btn = document.querySelector(fallbacks[i]);
                if (btn) {
                  var rect = btn.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    candidates.push({
                      el: btn,
                      rect: rect,
                      score: 150,
                      text: (btn.textContent || '').slice(0, 50),
                      selector: fallbacks[i]
                    });
                  }
                }
              } catch(e) {}
            }
            
            // 排序并选择最佳匹配
            candidates.sort(function(a, b) { return b.score - a.score; });
            
            console.log('CFSpider: Found', candidates.length, 'button candidates');
            candidates.slice(0, 5).forEach(function(c) {
              console.log('  Score:', c.score, 'Text:', c.text);
            });
            
            if (candidates.length > 0) {
              var best = candidates[0];
              return {
                found: true,
                x: best.rect.left + best.rect.width / 2,
                y: best.rect.top + best.rect.height / 2,
                text: best.text,
                score: best.score
              };
            }
            
            return { found: false };
          })()
        `)
        
        if (!result.found) {
          // 触发紧张模式
          store.panicMouse(1500)
          const reaction = getRandomPanicReaction()
          return reaction + '\n按钮未找到: ' + buttonText + '。可以试试滚动页面查看，或者用 find_element 查找具体选择器。'
        }
        
        console.log('click_button found:', result.text, 'score:', result.score)
        
        // 获取容器位置
        const container = document.getElementById('browser-container')
        const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 }
        
        // 使用瞄准行为移动鼠标
        await aimAndMoveMouse(
          store,
          containerRect.left + result.x,
          containerRect.top + result.y
        )
        
        // 触发点击动画
        store.clickMouse()
        
        // 执行实际点击
        await webview.executeJavaScript(`
          (function() {
            var x = ${result.x};
            var y = ${result.y};
            var el = document.elementFromPoint(x, y);
            
            // 向上查找可点击的父元素
            var clickTarget = el;
            while (clickTarget && clickTarget.tagName !== 'BODY') {
              if (clickTarget.tagName === 'BUTTON' || 
                  clickTarget.tagName === 'A' || 
                  clickTarget.getAttribute('role') === 'button' ||
                  clickTarget.onclick) {
                break;
              }
              clickTarget = clickTarget.parentElement;
            }
            if (!clickTarget || clickTarget.tagName === 'BODY') clickTarget = el;
            
            // 添加高亮
            var rect = clickTarget.getBoundingClientRect();
            var h = document.createElement('div');
            h.id = 'cfspider-agent-highlight';
            h.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:4px solid #22c55e;background:rgba(34,197,94,0.2);border-radius:6px;box-shadow:0 0 20px rgba(34,197,94,0.5);';
            h.style.left = (rect.left - 4) + 'px';
            h.style.top = (rect.top - 4) + 'px';
            h.style.width = (rect.width + 8) + 'px';
            h.style.height = (rect.height + 8) + 'px';
            document.body.appendChild(h);
            
            // 点击
            if (clickTarget) {
              clickTarget.click();
              
              // 尝试触发其他事件
              try {
                clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              } catch(e) {}
            }
            
            setTimeout(function() {
              var hh = document.getElementById('cfspider-agent-highlight');
              if (hh) hh.remove();
            }, 1000);
          })()
        `)
        
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // 视觉反馈
        store.setCurrentModelType('vision')
        const visualFeedback = await quickVisualFeedback(`点击按钮"${buttonText}"`)
        store.setCurrentModelType(null)
        
        return `已点击按钮「${result.text}」\n${visualFeedback ? '当前看到: ' + visualFeedback : ''}`
      } catch (e) {
        store.panicMouse(1500)
        return getRandomPanicReaction() + '\n点击按钮失败: ' + e
      }
    }

    case 'click_search_button': {
      if (!webview) return 'Clicked search button'
      try {
        // 先找到搜索按钮位置
        const btnInfo = await webview.executeJavaScript(`
          (function() {
            // Comprehensive list of search button selectors
            var btnSelectors = [
              // Bing
              '#search_icon', '#sb_form_go', 'input[type="submit"]#sb_form_go',
              'svg.search', 'button[aria-label*="Search"]', 'button[aria-label*="search"]',
              // Baidu
              '#su', 'input#su',
              // JD.com
              '.button', 'button.button', 'a.button',
              '.form button', '.search button',
              '[class*="search-btn"]', '[class*="search_btn"]',
              // Generic
              'button[type="submit"]', 'input[type="submit"]'
            ];
            
            for (var i = 0; i < btnSelectors.length; i++) {
              var btns = document.querySelectorAll(btnSelectors[i]);
              for (var j = 0; j < btns.length; j++) {
                var btn = btns[j];
                if (btn && btn.offsetWidth > 0 && btn.offsetHeight > 0) {
                  var rect = btn.getBoundingClientRect();
                  return { 
                    found: true, 
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                  };
                }
              }
            }
            return { found: false };
          })()
        `)
        
        // 如果找到按钮，显示虚拟鼠标并使用瞄准行为
        if (btnInfo.found) {
          const container = document.getElementById('browser-container')
          const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 }
          
          await aimAndMoveMouse(
            store,
            containerRect.left + btnInfo.x, 
            containerRect.top + btnInfo.y
          )
          store.clickMouse()
        }
        
        const result = await webview.executeJavaScript(`
          (function() {
            console.log('CFSpider: Looking for search button...');
            
            // Special handling for GitHub - press Enter in search box
            if (window.location.hostname.includes('github.com')) {
              console.log('CFSpider: GitHub detected, pressing Enter...');
              var searchInput = document.querySelector('#query-builder-test') || 
                               document.querySelector('input[data-target="query-builder.input"]') ||
                               document.querySelector('.QueryBuilder-Input') ||
                               document.activeElement;
              
              if (searchInput && (searchInput.tagName === 'INPUT' || searchInput.tagName === 'TEXTAREA')) {
                searchInput.focus();
                
                // Dispatch Enter key events
                var enterEvent = new KeyboardEvent('keydown', {
                  key: 'Enter',
                  code: 'Enter',
                  keyCode: 13,
                  which: 13,
                  bubbles: true,
                  cancelable: true
                });
                searchInput.dispatchEvent(enterEvent);
                
                // Also try submitting the form
                var form = searchInput.closest('form');
                if (form) {
                  console.log('CFSpider: Submitting GitHub form');
                  form.submit();
                }
                
                return { clicked: true, method: 'github-enter' };
              }
            }
            
            // Comprehensive list of search button selectors
            var btnSelectors = [
              // Bing
              '#search_icon', '#sb_form_go', 'input[type="submit"]#sb_form_go',
              'svg.search', 'button[aria-label*="Search"]', 'button[aria-label*="search"]',
              
              // Baidu
              '#su', 'input#su',
              
              // JD.com - comprehensive
              '.button', 'button.button', 'a.button',
              '.form button', '.search button',
              '[class*="search-btn"]', '[class*="search_btn"]',
              '.search-btn', '.btn-search', 
              '.form-search-btn', '.search-button',
              'button[clstag*="search"]',
              
              // Taobao
              '.btn-search', '.search-button',
              
              // Google
              'input[name="btnK"]', 'button[type="submit"]',
              
              // Generic fallbacks
              'button[type="submit"]', 'input[type="submit"]',
              '.submit', '.search-submit',
              'form button:not([type="reset"])',
              'form input[type="button"]'
            ];
            
            for (var i = 0; i < btnSelectors.length; i++) {
              var btns = document.querySelectorAll(btnSelectors[i]);
              for (var j = 0; j < btns.length; j++) {
                var btn = btns[j];
                if (btn && btn.offsetWidth > 0 && btn.offsetHeight > 0) {
                  console.log('CFSpider: Found and clicking button:', btn.tagName, btn.className, btn.id);
                  
                  // Add highlight
                  var rect = btn.getBoundingClientRect();
                  var h = document.createElement('div');
                  h.id = 'cfspider-agent-highlight';
                  h.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:4px solid #f59e0b;background:rgba(245,158,11,0.2);border-radius:6px;';
                  h.style.left = (rect.left - 4) + 'px';
                  h.style.top = (rect.top - 4) + 'px';
                  h.style.width = (rect.width + 8) + 'px';
                  h.style.height = (rect.height + 8) + 'px';
                  document.body.appendChild(h);
                  
                  // Click it
                  btn.click();
                  
                  setTimeout(function() {
                    var hh = document.getElementById('cfspider-agent-highlight');
                    if (hh) hh.remove();
                  }, 1000);
                  
                  return { clicked: true, selector: btnSelectors[i] };
                }
              }
            }
            
            // Fallback: try pressing Enter on the focused element
            var activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
              console.log('CFSpider: Fallback - pressing Enter on active element');
              var enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
              });
              activeEl.dispatchEvent(enterEvent);
              
              var form = activeEl.closest('form');
              if (form) form.submit();
              
              return { clicked: true, method: 'fallback-enter' };
            }
            
            console.log('CFSpider: No search button found');
            return { clicked: false };
          })()
        `)
        console.log('click_search_button result:', result)
        
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        // Auto-verify: check if search results appeared
        try {
          const verification = await webview.executeJavaScript(`
            (function() {
              var url = window.location.href;
              var hasResults = document.querySelectorAll('.search-result, .b_algo, .g, [class*="result"], .repo-list, .codesearch-results, #J_goodsList').length > 0;
              var urlChanged = url.includes('search') || url.includes('query') || url.includes('?q=') || url.includes('?s=');
              return { url: url, hasResults: hasResults, urlChanged: urlChanged };
            })()
          `)
          
          // 添加视觉反馈
          store.setCurrentModelType('vision')
          const visualFeedback = await quickVisualFeedback('点击搜索按钮')
          store.setCurrentModelType(null)
          
          if (verification.hasResults || verification.urlChanged) {
            return `搜索成功~ 结果正在加载\n${visualFeedback ? '当前看到: ' + visualFeedback : ''}`
          } else {
            return `已点击搜索按钮\n${visualFeedback ? '页面状态: ' + visualFeedback : ''}`
          }
        } catch {
          return '已点击搜索按钮'
        }
      } catch (e) {
        console.error('click_search_button error:', e)
        return `搜索按钮点击可能失败了，可以试试: 1) press_enter() 2) 找其他按钮`
      }
    }

    case 'verify_action': {
      if (!webview) return 'Verification failed: No webview'
      try {
        const expected = args.expected_result as string
        
        const state = await webview.executeJavaScript(`
          (function() {
            var result = {
              url: window.location.href,
              title: document.title,
              hostname: window.location.hostname,
              pathname: window.location.pathname,
              hasSearchResults: false,
              inputValues: {},
              visibleText: '',
              errorMessages: []
            };
            
            // Check for search results
            var resultIndicators = [
              '.search-results', '.results', '[class*="result"]',
              '.repo-list', '.codesearch-results',  // GitHub
              '#J_goodsList', '.gl-item',  // JD
              '.s-result-list',  // Amazon
              '#b_results', '.b_algo'  // Bing
            ];
            for (var i = 0; i < resultIndicators.length; i++) {
              if (document.querySelector(resultIndicators[i])) {
                result.hasSearchResults = true;
                break;
              }
            }
            
            // Get input values
            var inputs = document.querySelectorAll('input[type="text"], input[type="search"], textarea');
            inputs.forEach(function(input, idx) {
              if (input.value && input.offsetWidth > 0) {
                result.inputValues[input.id || input.name || 'input_' + idx] = input.value;
              }
            });
            
            // Get visible text (first 500 chars of body)
            result.visibleText = (document.body.innerText || '').slice(0, 500);
            
            // Check for error messages
            var errorSelectors = ['.error', '.alert-danger', '.warning', '[class*="error"]', '[class*="404"]'];
            errorSelectors.forEach(function(sel) {
              var errEl = document.querySelector(sel);
              if (errEl && errEl.offsetWidth > 0) {
                result.errorMessages.push(errEl.textContent.slice(0, 100));
              }
            });
            
            return result;
          })()
        `)
        
        // Build verification report
        let report = `VERIFICATION REPORT:\n`
        report += `- Current URL: ${state.url}\n`
        report += `- Page Title: ${state.title}\n`
        report += `- Expected: ${expected}\n`
        report += `- Has Search Results: ${state.hasSearchResults}\n`
        
        if (Object.keys(state.inputValues).length > 0) {
          report += `- Input Values: ${JSON.stringify(state.inputValues)}\n`
        }
        
        if (state.errorMessages.length > 0) {
          report += `- ERRORS FOUND: ${state.errorMessages.join('; ')}\n`
        }
        
        // Determine if action was successful
        const expectedLower = expected.toLowerCase()
        let success = false
        
        if (expectedLower.includes('search result')) {
          success = state.hasSearchResults
        } else if (expectedLower.includes('github')) {
          success = state.hostname.includes('github.com')
        } else if (expectedLower.includes('jd') || expectedLower.includes('jingdong')) {
          success = state.hostname.includes('jd.com')
        } else if (expectedLower.includes('input') || expectedLower.includes('text')) {
          success = Object.values(state.inputValues).some(v => v && (v as string).length > 0)
        } else {
          // Generic check - page loaded without errors
          success = state.errorMessages.length === 0 && state.title.length > 0
        }
        
        report += success ? `\nSTATUS: SUCCESS - Action appears to have worked.` : 
                          `\nSTATUS: FAILED - Action did not achieve expected result. Try alternative method.`
        
        return report
      } catch (e) {
        return `Verification error: ${e}. Try alternative method.`
      }
    }

    case 'retry_with_alternative': {
      if (!webview) return 'Retry failed: No webview'
      try {
        const actionType = args.action_type as string
        const targetDesc = args.target_description as string
        
        let result = ''
        
        if (actionType === 'input') {
          // Try multiple input methods
          result = await webview.executeJavaScript(`
            (function() {
              console.log('CFSpider: Trying alternative input methods...');
              
              // Method 1: Find any visible text input
              var allInputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea');
              var targetInput = null;
              
              for (var i = 0; i < allInputs.length; i++) {
                var inp = allInputs[i];
                if (inp.offsetWidth > 0 && inp.offsetHeight > 0) {
                  var rect = inp.getBoundingClientRect();
                  if (rect.top > 0 && rect.top < window.innerHeight) {
                    targetInput = inp;
                    console.log('CFSpider: Found alternative input:', inp.id, inp.className);
                    break;
                  }
                }
              }
              
              if (targetInput) {
                // Method 2: Try clicking first
                targetInput.click();
                targetInput.focus();
                
                // Method 3: Try using keyboard simulation
                return { found: true, element: targetInput.id || targetInput.className || targetInput.tagName };
              }
              
              return { found: false };
            })()
          `)
          
          return `Alternative input method: ${JSON.stringify(result)}. ` +
                 `Try using input_text with selector "input[type='text']:visible" or "input[type='search']", ` +
                 `or try clicking on the search area first with click_element.`
        }
        
        if (actionType === 'click') {
          result = await webview.executeJavaScript(`
            (function() {
              console.log('CFSpider: Trying alternative click methods...');
              
              // Find clickable elements
              var clickables = document.querySelectorAll('button, a, [role="button"], [onclick]');
              var visible = [];
              
              clickables.forEach(function(el) {
                if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                  var rect = el.getBoundingClientRect();
                  if (rect.top > 50 && rect.top < window.innerHeight) {
                    visible.push({
                      tag: el.tagName,
                      text: (el.textContent || '').slice(0, 30),
                      className: el.className
                    });
                  }
                }
              });
              
              return { visibleButtons: visible.slice(0, 10) };
            })()
          `)
          
          return `Found clickable elements: ${JSON.stringify(result)}. ` +
                 `Try using click_text with the visible text, or click_element with a specific selector.`
        }
        
        if (actionType === 'search') {
          result = await webview.executeJavaScript(`
            (function() {
              // Try to find search form
              var forms = document.querySelectorAll('form');
              var searchForm = null;
              
              forms.forEach(function(form) {
                if (form.action && form.action.includes('search') || 
                    form.querySelector('input[type="search"]') ||
                    form.id && form.id.includes('search')) {
                  searchForm = form;
                }
              });
              
              if (searchForm) {
                var inputs = searchForm.querySelectorAll('input');
                var buttons = searchForm.querySelectorAll('button, input[type="submit"]');
                return {
                  found: true,
                  formId: searchForm.id,
                  inputCount: inputs.length,
                  buttonCount: buttons.length
                };
              }
              
              return { found: false };
            })()
          `)
          
          return `Search form analysis: ${JSON.stringify(result)}. ` +
                 `Try: 1) Click on search icon first, 2) Use different input selector, 3) Press Enter after typing.`
        }
        
        return `Alternative method suggestion for "${targetDesc}": Try different selectors or approach the element differently.`
      } catch (e) {
        return `Retry error: ${e}`
      }
    }

    // Page analysis tool
    case 'analyze_page': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const analysis = await webview.executeJavaScript(`
          (function() {
            var result = {
              url: window.location.href,
              title: document.title,
              pageType: 'unknown',
              mainElements: {
                searchInputs: [],
                buttons: [],
                links: [],
                forms: []
              },
              pageState: {
                hasSearchResults: false,
                hasLoginForm: false,
                hasError: false,
                isLoading: false
              },
              suggestions: []
            };
            
            // Detect page type
            var url = window.location.href.toLowerCase();
            var title = document.title.toLowerCase();
            
            if (url.includes('search') || url.includes('query') || url.includes('?q=')) {
              result.pageType = 'search_results';
            } else if (url.includes('login') || url.includes('signin') || title.includes('login')) {
              result.pageType = 'login';
            } else if (url.includes('cart') || url.includes('checkout')) {
              result.pageType = 'shopping';
            } else if (document.querySelectorAll('article, .post, .content').length > 0) {
              result.pageType = 'content';
            } else if (url === 'about:blank' || url.includes('bing.com') || url.includes('google.com') || url.includes('baidu.com')) {
              result.pageType = 'search_engine';
            } else {
              result.pageType = 'general';
            }
            
            // Find search inputs
            var inputs = document.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea');
            inputs.forEach(function(inp) {
              if (inp.offsetWidth > 0) {
                result.mainElements.searchInputs.push({
                  selector: inp.id ? '#' + inp.id : (inp.name ? '[name="' + inp.name + '"]' : inp.className),
                  placeholder: inp.placeholder || '',
                  value: inp.value || ''
                });
              }
            });
            
            // Find buttons
            var buttons = document.querySelectorAll('button, input[type="submit"], [role="button"]');
            buttons.forEach(function(btn) {
              if (btn.offsetWidth > 0 && btn.offsetHeight > 0) {
                var rect = btn.getBoundingClientRect();
                if (rect.top > 0 && rect.top < window.innerHeight) {
                  result.mainElements.buttons.push({
                    text: (btn.textContent || btn.value || '').slice(0, 30).trim(),
                    type: btn.type || 'button'
                  });
                }
              }
            });
            
            // Find main links
            var links = document.querySelectorAll('a[href]');
            var linkCount = 0;
            links.forEach(function(link) {
              if (linkCount < 10 && link.offsetWidth > 0 && link.offsetHeight > 0) {
                var rect = link.getBoundingClientRect();
                if (rect.top > 50 && rect.top < window.innerHeight) {
                  var text = (link.textContent || '').slice(0, 40).trim();
                  if (text.length > 2) {
                    result.mainElements.links.push({ text: text, href: link.href.slice(0, 50) });
                    linkCount++;
                  }
                }
              }
            });
            
            // Check page state
            result.pageState.hasSearchResults = document.querySelectorAll('.search-result, .b_algo, .g, [class*="result"]').length > 0;
            result.pageState.hasLoginForm = document.querySelectorAll('input[type="password"]').length > 0;
            result.pageState.hasError = document.querySelectorAll('.error, .alert-danger, [class*="error"]').length > 0;
            result.pageState.isLoading = document.querySelectorAll('.loading, .spinner, [class*="loading"]').length > 0;
            
            // Generate suggestions
            if (result.mainElements.searchInputs.length > 0) {
              result.suggestions.push('Use input_text with selector: ' + result.mainElements.searchInputs[0].selector);
            }
            if (result.pageState.hasSearchResults) {
              result.suggestions.push('Search results are visible. Use click_text to select a result.');
            }
            if (result.pageType === 'search_engine') {
              result.suggestions.push('This is a search engine. Type search query and submit.');
            }
            
            return result;
          })()
        `)
        
        let report = `PAGE ANALYSIS:\n`
        report += `- URL: ${analysis.url}\n`
        report += `- Title: ${analysis.title}\n`
        report += `- Page Type: ${analysis.pageType}\n`
        report += `- Search Inputs: ${analysis.mainElements.searchInputs.length} found\n`
        report += `- Buttons: ${analysis.mainElements.buttons.map((b: any) => b.text).join(', ') || 'none visible'}\n`
        report += `- Top Links: ${analysis.mainElements.links.slice(0, 5).map((l: any) => l.text).join(', ') || 'none'}\n`
        report += `- Has Search Results: ${analysis.pageState.hasSearchResults}\n`
        report += `- Has Login Form: ${analysis.pageState.hasLoginForm}\n`
        
        if (analysis.suggestions.length > 0) {
          report += `\nSUGGESTIONS:\n${analysis.suggestions.map((s: string) => '- ' + s).join('\n')}`
        }
        
        return report
      } catch (e) {
        return `Analysis failed: ${e}`
      }
    }

    // Information gathering tools
    case 'scan_interactive_elements': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const elements = await webview.executeJavaScript(`
          (function() {
            var result = {
              inputs: [],
              buttons: [],
              links: [],
              selects: []
            };
            
            // Inputs
            document.querySelectorAll('input, textarea').forEach(function(el) {
              if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                result.inputs.push({
                  type: el.type || 'text',
                  id: el.id,
                  name: el.name,
                  placeholder: el.placeholder,
                  value: el.value ? 'has value' : 'empty'
                });
              }
            });
            
            // Buttons
            document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]').forEach(function(el) {
              if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                result.buttons.push({
                  text: (el.textContent || el.value || '').slice(0, 30).trim(),
                  id: el.id,
                  className: el.className.split(' ')[0]
                });
              }
            });
            
            // Links (top 15)
            var linkCount = 0;
            document.querySelectorAll('a[href]').forEach(function(el) {
              if (linkCount < 15 && el.offsetWidth > 0) {
                var text = (el.textContent || '').slice(0, 40).trim();
                if (text.length > 2) {
                  result.links.push({ text: text });
                  linkCount++;
                }
              }
            });
            
            // Selects
            document.querySelectorAll('select').forEach(function(el) {
              if (el.offsetWidth > 0) {
                result.selects.push({ id: el.id, name: el.name });
              }
            });
            
            return result;
          })()
        `)
        
        let report = `INTERACTIVE ELEMENTS:\n\n`
        report += `INPUTS (${elements.inputs.length}):\n`
        elements.inputs.forEach((inp: any, i: number) => {
          report += `  ${i+1}. [${inp.type}] id="${inp.id}" name="${inp.name}" placeholder="${inp.placeholder}"\n`
        })
        
        report += `\nBUTTONS (${elements.buttons.length}):\n`
        elements.buttons.forEach((btn: any, i: number) => {
          report += `  ${i+1}. "${btn.text}" id="${btn.id}" class="${btn.className}"\n`
        })
        
        report += `\nLINKS (top ${elements.links.length}):\n`
        elements.links.forEach((link: any, i: number) => {
          report += `  ${i+1}. "${link.text}"\n`
        })
        
        return report
      } catch (e) {
        return `Scan failed: ${e}`
      }
    }

    case 'click_by_index': {
      if (!webview) return 'Error: Cannot access page'
      const category = args.category as string
      const index = args.index as number
      
      if (!category || !index) {
        return 'Error: 需要提供 category（元素类别）和 index（索引号）'
      }
      
      try {
        const result = await webview.executeJavaScript(`
          (function() {
            var category = '${category}';
            var index = ${index} - 1; // 转换为0-based索引
            var elements = [];
            
            if (category === 'inputs') {
              document.querySelectorAll('input, textarea').forEach(function(el) {
                if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                  elements.push(el);
                }
              });
            } else if (category === 'buttons') {
              document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]').forEach(function(el) {
                if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                  elements.push(el);
                }
              });
            } else if (category === 'links') {
              var linkCount = 0;
              document.querySelectorAll('a[href]').forEach(function(el) {
                if (linkCount < 15 && el.offsetWidth > 0) {
                  var text = (el.textContent || '').trim();
                  if (text.length > 2) {
                    elements.push(el);
                    linkCount++;
                  }
                }
              });
            } else if (category === 'selects') {
              document.querySelectorAll('select').forEach(function(el) {
                if (el.offsetWidth > 0) {
                  elements.push(el);
                }
              });
            }
            
            if (index < 0 || index >= elements.length) {
              return { success: false, error: '索引超出范围，该类别共有 ' + elements.length + ' 个元素' };
            }
            
            var el = elements[index];
            var rect = el.getBoundingClientRect();
            var text = (el.textContent || el.value || el.placeholder || '').slice(0, 50).trim();
            
            // 添加高亮
            var h = document.createElement('div');
            h.id = 'cfspider-agent-highlight';
            h.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:4px solid #22c55e;background:rgba(34,197,94,0.2);border-radius:6px;box-shadow:0 0 20px rgba(34,197,94,0.5);';
            h.style.left = (rect.left - 4) + 'px';
            h.style.top = (rect.top - 4) + 'px';
            h.style.width = (rect.width + 8) + 'px';
            h.style.height = (rect.height + 8) + 'px';
            document.body.appendChild(h);
            
            // 点击元素
            el.click();
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
              el.focus();
            }
            
            setTimeout(function() {
              var hh = document.getElementById('cfspider-agent-highlight');
              if (hh) hh.remove();
            }, 1000);
            
            return { 
              success: true, 
              tag: el.tagName, 
              text: text,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2
            };
          })()
        `)
        
        if (!result.success) {
          return `点击失败: ${result.error}`
        }
        
        // 显示虚拟鼠标动画
        const container = document.getElementById('browser-container')
        if (container) {
          const containerRect = container.getBoundingClientRect()
          const x = result.x + containerRect.left
          const y = result.y + containerRect.top
          store.showMouse()
          store.moveMouse(x, y, 400)
          await new Promise(resolve => setTimeout(resolve, 450))
          store.clickMouse()
        }
        
        await new Promise(resolve => setTimeout(resolve, 500))
        
        return `已点击 ${category} 类别的第 ${index} 个元素: <${result.tag}> "${result.text}"`
      } catch (e) {
        return `点击失败: ${e}`
      }
    }

    case 'get_page_content': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const maxLength = (args.max_length as number) || 500
        
        const content = await webview.executeJavaScript(`
          (function() {
            // Try to get main content
            var main = document.querySelector('main, article, .content, .main, #content, #main');
            var text = '';
            
            if (main) {
              text = main.innerText;
            } else {
              text = document.body.innerText;
            }
            
            // Clean up text
            text = text.replace(/\\s+/g, ' ').trim();
            
            return {
              title: document.title,
              content: text.slice(0, ${maxLength}),
              totalLength: text.length
            };
          })()
        `)
        
        return `PAGE CONTENT:\nTitle: ${content.title}\n\n${content.content}${content.totalLength > maxLength ? '...(truncated)' : ''}`
      } catch (e) {
        return `Failed to get content: ${e}`
      }
    }

    case 'find_element': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const description = (args.description as string).toLowerCase()
        
        const result = await webview.executeJavaScript(`
          (function() {
            var desc = '${description.replace(/'/g, "\\'")}';
            var found = [];
            
            // Search by text content
            var all = document.querySelectorAll('button, a, input, [role="button"], label');
            
            all.forEach(function(el) {
              if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
              
              var text = (el.textContent || el.placeholder || el.value || el.ariaLabel || '').toLowerCase();
              var id = (el.id || '').toLowerCase();
              var className = (el.className || '').toLowerCase();
              
              var match = false;
              var keywords = desc.split(' ');
              
              keywords.forEach(function(kw) {
                if (text.includes(kw) || id.includes(kw) || className.includes(kw)) {
                  match = true;
                }
              });
              
              if (match) {
                var selector = '';
                if (el.id) selector = '#' + el.id;
                else if (el.name) selector = '[name="' + el.name + '"]';
                else selector = el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : '');
                
                found.push({
                  tag: el.tagName,
                  text: (el.textContent || '').slice(0, 30).trim(),
                  selector: selector
                });
              }
            });
            
            return found.slice(0, 5);
          })()
        `)
        
        if (result.length === 0) {
          return `No elements found matching "${description}". Try scan_interactive_elements to see available elements.`
        }
        
        let report = `FOUND ${result.length} MATCHING ELEMENTS:\n`
        result.forEach((el: any, i: number) => {
          report += `${i+1}. <${el.tag}> "${el.text}" - selector: ${el.selector}\n`
        })
        report += `\nUse click_element or input_text with one of these selectors.`
        
        return report
      } catch (e) {
        return `Find failed: ${e}`
      }
    }

    case 'check_element_exists': {
      if (!webview) return 'Error: Cannot access page'
      try {
        const selector = (args.selector as string).replace(/'/g, "\\'")
        
        const result = await webview.executeJavaScript(`
          (function() {
            var el = document.querySelector('${selector}');
            if (!el) return { exists: false };
            
            var rect = el.getBoundingClientRect();
            var isVisible = el.offsetWidth > 0 && el.offsetHeight > 0 &&
                           rect.top >= 0 && rect.top < window.innerHeight;
            
            return {
              exists: true,
              visible: isVisible,
              tag: el.tagName,
              text: (el.textContent || el.value || '').slice(0, 30).trim(),
              position: { top: Math.round(rect.top), left: Math.round(rect.left) }
            };
          })()
        `)
        
        if (!result.exists) {
          return `Element "${selector}" does NOT exist on the page.`
        }
        
        return `Element "${selector}" EXISTS.\n- Visible: ${result.visible}\n- Type: ${result.tag}\n- Text: "${result.text}"\n- Position: top=${result.position.top}px, left=${result.position.left}px`
      } catch (e) {
        return `Check failed: ${e}`
      }
    }

    // ==================== 视频分析工具 ====================
    case 'summarize_video': {
      if (!webview) return 'Error: Cannot access page'
      
      // 检查视觉模型是否可用
      const { aiConfig: videoConfig } = store
      const useBuiltInVideo = videoConfig.useBuiltIn !== false && (!videoConfig.endpoint || !videoConfig.apiKey)
      const hasVisionForVideo = useBuiltInVideo ? !!BUILT_IN_AI.visionModel : !!videoConfig.visionModel
      
      if (!hasVisionForVideo) {
        return '视频总结需要视觉模型支持。请在设置中配置视觉模型，或使用内置 AI 服务。'
      }
      
      try {
        const frameCount = Math.min(Math.max((args.frame_count as number) || 10, 1), 40)
        const focus = (args.focus as string) || ''
        
        store.setCurrentModelType('vision')
        console.log('[CFSpider] 开始视频分析，计划抽取', frameCount, '帧')
        
        // 检测页面上的视频元素
        const videoInfo = await webview.executeJavaScript(`
          (function() {
            // 查找视频元素
            var video = document.querySelector('video');
            if (!video) {
              // 尝试查找 iframe 中的视频（如 YouTube）
              var iframes = document.querySelectorAll('iframe');
              for (var i = 0; i < iframes.length; i++) {
                var src = iframes[i].src || '';
                if (src.includes('youtube') || src.includes('bilibili') || src.includes('youku') || src.includes('iqiyi')) {
                  return {
                    type: 'iframe',
                    platform: src.includes('youtube') ? 'YouTube' :
                              src.includes('bilibili') ? 'Bilibili' :
                              src.includes('youku') ? '优酷' :
                              src.includes('iqiyi') ? '爱奇艺' : '视频平台',
                    src: src
                  };
                }
              }
              return null;
            }
            
            return {
              type: 'video',
              duration: video.duration || 0,
              currentTime: video.currentTime || 0,
              paused: video.paused,
              width: video.videoWidth,
              height: video.videoHeight,
              src: video.src || video.currentSrc
            };
          })()
        `)
        
        if (!videoInfo) {
          store.setCurrentModelType(null)
          return '页面上未找到视频元素。请确保视频正在播放或页面包含视频播放器。'
        }
        
        // 如果是 iframe 嵌入的视频（如 YouTube），使用页面截图分析
        if (videoInfo.type === 'iframe') {
          console.log('[CFSpider] 检测到嵌入式视频平台:', videoInfo.platform)
          
          // 对嵌入视频，直接截图分析当前画面（最多分析10帧，因为无法控制进度）
          const iframeFrameCount = Math.min(frameCount, 10)
          const frameAnalyses: string[] = []
          
          for (let i = 0; i < iframeFrameCount; i++) {
            const image = await webview.capturePage()
            if (!image) continue
            
            const base64Image = image.toDataURL().replace(/^data:image\/\w+;base64,/, '')
            
            const response = await callAIWithTokenTracking({
              endpoint: BUILT_IN_AI.endpoint,
              apiKey: getBuiltInKey(),
              model: BUILT_IN_AI.visionModel,
              messages: [{
                role: 'user',
                content: [
                  { 
                    type: 'text', 
                    text: `这是一个${videoInfo.platform}视频的第${i + 1}帧截图。请分析视频画面内容：
${focus ? `重点关注：${focus}` : ''}

请描述：
1. 画面中的主要内容
2. 视频类型（教程、娱乐、新闻等）
3. 关键信息或字幕内容（如有）

简洁回答，50字以内。` 
                  },
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
                ]
              }]
            }, 'vision')
            
            if (response.content) {
              frameAnalyses.push(`帧${i + 1}: ${response.content}`)
            }
            
            // 等待一小段时间再截下一帧
            if (i < iframeFrameCount - 1) {
              await new Promise(resolve => setTimeout(resolve, 1500))
            }
          }
          
          store.setCurrentModelType(null)
          
          if (frameAnalyses.length === 0) {
            return `检测到${videoInfo.platform}视频，但无法分析画面内容。`
          }
          
          // 生成总结
          let summary = `[${videoInfo.platform}视频分析] 共分析${frameAnalyses.length}帧\n\n`
          summary += frameAnalyses.join('\n\n')
          
          if (frameAnalyses.length > 1) {
            // 请求生成整体总结
            const summaryResponse = await callAIWithTokenTracking({
              endpoint: useBuiltInVideo ? BUILT_IN_AI.endpoint : videoConfig.endpoint,
              apiKey: useBuiltInVideo ? getBuiltInKey() : videoConfig.apiKey,
              model: useBuiltInVideo ? BUILT_IN_AI.model : videoConfig.model,
              messages: [{
                role: 'user',
                content: `根据以下视频帧分析，生成一个简短的视频总结（150字以内）：\n\n${frameAnalyses.join('\n')}`
              }]
            })
            
            if (summaryResponse.content) {
              summary += `\n\n[总结]\n${summaryResponse.content}`
            }
          }
          
          return summary
        }
        
        // 原生 video 元素 - 通过控制播放进度抽取帧
        const duration = videoInfo.duration
        if (duration <= 0) {
          store.setCurrentModelType(null)
          return '视频时长未知或为直播流，无法进行帧分析。'
        }
        
        console.log('[CFSpider] 视频时长:', duration, '秒，抽取', frameCount, '帧')
        
        // 计算抽帧时间点（均匀分布）
        const timePoints: number[] = []
        for (let i = 0; i < frameCount; i++) {
          timePoints.push((duration / (frameCount + 1)) * (i + 1))
        }
        
        const frameAnalyses: string[] = []
        
        // 批量分析帧（每5帧为一组）
        const batchSize = 5
        for (let batch = 0; batch < Math.ceil(timePoints.length / batchSize); batch++) {
          const batchStart = batch * batchSize
          const batchEnd = Math.min(batchStart + batchSize, timePoints.length)
          
          for (let i = batchStart; i < batchEnd; i++) {
            const targetTime = timePoints[i]
            
            // 跳转到指定时间点
            await webview.executeJavaScript(`
              (function() {
                var video = document.querySelector('video');
                if (video) {
                  video.currentTime = ${targetTime};
                  video.pause();
                }
              })()
            `)
            
            // 等待视频加载该帧
            await new Promise(resolve => setTimeout(resolve, 300))
            
            // 截图
            const image = await webview.capturePage()
            if (!image) continue
            
            const base64Image = image.toDataURL().replace(/^data:image\/\w+;base64,/, '')
            const timeStr = `${Math.floor(targetTime / 60)}:${String(Math.floor(targetTime % 60)).padStart(2, '0')}`
            
            // 分析帧内容
            const response = await callAIWithTokenTracking({
              endpoint: BUILT_IN_AI.endpoint,
              apiKey: getBuiltInKey(),
              model: BUILT_IN_AI.visionModel,
              messages: [{
                role: 'user',
                content: [
                  { 
                    type: 'text', 
                    text: `这是视频在 ${timeStr} 时刻的画面。请简短描述画面内容（30字以内）。${focus ? `重点关注：${focus}` : ''}` 
                  },
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
                ]
              }]
            }, 'vision')
            
            if (response.content) {
              frameAnalyses.push(`[${timeStr}] ${response.content}`)
            }
          }
          
          // 每批次之间短暂休息
          if (batch < Math.ceil(timePoints.length / batchSize) - 1) {
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        }
        
        // 恢复视频播放
        await webview.executeJavaScript(`
          (function() {
            var video = document.querySelector('video');
            if (video) video.play();
          })()
        `)
        
        store.setCurrentModelType(null)
        
        if (frameAnalyses.length === 0) {
          return '视频帧分析失败，无法获取有效信息。'
        }
        
        // 生成视频总结
        const durationMin = Math.floor(duration / 60)
        const durationSec = Math.floor(duration % 60)
        let summary = `[视频分析] 时长: ${durationMin}分${durationSec}秒 | 分析帧数: ${frameAnalyses.length}\n\n`
        summary += '关键帧内容:\n'
        summary += frameAnalyses.join('\n')
        
        // 生成整体总结
        if (frameAnalyses.length > 2) {
          const summaryResponse = await callAIWithTokenTracking({
            endpoint: useBuiltInVideo ? BUILT_IN_AI.endpoint : videoConfig.endpoint,
            apiKey: useBuiltInVideo ? getBuiltInKey() : videoConfig.apiKey,
            model: useBuiltInVideo ? BUILT_IN_AI.model : videoConfig.model,
            messages: [{
              role: 'user',
              content: `根据以下视频帧分析，生成一个详细的视频总结（200字以内）：\n\n${frameAnalyses.join('\n')}`
            }]
          })
          
          if (summaryResponse.content) {
            summary += `\n\n[总结]\n${summaryResponse.content}`
          }
        }
        
        return summary
      } catch (e) {
        store.setCurrentModelType(null)
        console.error('[CFSpider] 视频分析失败:', e)
        return `视频分析失败: ${e}`
      }
    }

    // ==================== 自我扩展工具 ====================
    case 'create_skill': {
      try {
        const name = args.name as string
        const description = (args.description as string) || `自动创建的技能: ${name}`
        const triggers = args.triggers as string[]
        const domains = (args.domains as string[]) || []
        const stepsInput = args.steps as Array<{ action: string; target?: string; value?: string }>
        
        if (!name || !triggers || !stepsInput) {
          return '创建技能失败: 缺少必要参数 (name, triggers, steps)'
        }
        
        // 转换步骤格式
        const steps: SkillStep[] = stepsInput.map(s => ({
          action: s.action as any,
          target: s.target,
          value: s.value
        }))
        
        // 创建技能
        const skill = await createSkill(name, description, triggers, domains, steps)
        
        console.log('[CFSpider] AI 自动创建技能:', skill.name, skill.id)
        
        return `技能创建成功~
名称: ${skill.name}
ID: ${skill.id}
触发词: ${skill.triggers.join(', ')}
适用域名: ${skill.domains.length > 0 ? skill.domains.join(', ') : '通用'}
步骤数: ${skill.steps.length}

这个技能已经永久保存，下次你说"${skill.triggers[0]}"时我就会自动使用它。`
      } catch (e) {
        console.error('[CFSpider] 创建技能失败:', e)
        return `创建技能失败: ${e}`
      }
    }

    case 'list_skills': {
      try {
        const skills = await getAllSkills()
        
        if (skills.length === 0) {
          return '当前没有任何技能。'
        }
        
        const builtIn = skills.filter(s => s.isBuiltIn)
        const userSkills = skills.filter(s => !s.isBuiltIn)
        
        let result = `[技能列表] 共 ${skills.length} 个技能\n\n`
        
        if (builtIn.length > 0) {
          result += `== 内置技能 (${builtIn.length}) ==\n`
          for (const skill of builtIn) {
            const proficiency = skill.usageCount < 5 ? '新手' :
                               skill.usageCount < 20 ? '入门' :
                               skill.usageCount < 50 ? '熟练' :
                               skill.usageCount < 100 ? '精通' : '大师'
            result += `- ${skill.name} (${proficiency}, 成功率${skill.successRate}%, 使用${skill.usageCount}次)\n`
            result += `  触发词: ${skill.triggers.slice(0, 3).join(', ')}\n`
          }
        }
        
        if (userSkills.length > 0) {
          result += `\n== 学习的技能 (${userSkills.length}) ==\n`
          for (const skill of userSkills) {
            result += `- ${skill.name} (成功率${skill.successRate}%, 使用${skill.usageCount}次)\n`
            result += `  触发词: ${skill.triggers.slice(0, 3).join(', ')}\n`
          }
        }
        
        return result
      } catch (e) {
        return `获取技能列表失败: ${e}`
      }
    }

    // ==================== 系统操作工具 ====================
    
    case 'run_app': {
      if (!isElectron) {
        return 'System operations only available in desktop app'
      }
      try {
        const appName = args.app_name as string
        const path = args.path as string
        const appArgs = args.args as string[]
        
        // 先检查应用是否安装
        if (appName && !path) {
          const checkResult = await (window as any).electronAPI.checkApp(appName)
          if (!checkResult.installed) {
            return 'NOT_INSTALLED: App "' + appName + '" is not installed on this computer. Please ask user if they want to open the website version instead, or install the app first.'
          }
        }
        
        const result = await (window as any).electronAPI.runApp({
          appName,
          path,
          args: appArgs
        })
        
        if (result.success) {
          return 'App launched successfully: ' + (appName || path)
        } else {
          return 'Failed to launch: ' + result.error
        }
      } catch (e) {
        return 'Error launching app: ' + e
      }
    }
    
    case 'open_url': {
      if (!isElectron) {
        return 'System operations only available in desktop app'
      }
      try {
        const url = args.url as string
        const result = await (window as any).electronAPI.runApp({ url })
        
        if (result.success) {
          return 'URL opened in default browser: ' + url
        } else {
          return 'Failed to open URL: ' + result.error
        }
      } catch (e) {
        return 'Error opening URL: ' + e
      }
    }
    
    case 'check_app': {
      if (!isElectron) {
        return 'System operations only available in desktop app'
      }
      try {
        const appName = args.app_name as string
        const result = await (window as any).electronAPI.checkApp(appName)
        
        if (result.installed) {
          return 'App "' + appName + '" is installed at: ' + result.path
        } else {
          return 'App "' + appName + '" is NOT installed on this computer'
        }
      } catch (e) {
        return 'Error checking app: ' + e
      }
    }
    
    case 'list_installed_apps': {
      if (!isElectron) {
        return 'System operations only available in desktop app'
      }
      try {
        const apps = await (window as any).electronAPI.listApps()
        
        if (apps.length === 0) {
          return 'No common apps detected. You can still try running specific apps by name.'
        }
        
        let result = '[Installed Apps]\n'
        const categories: Record<string, string[]> = {
          'Browsers': ['chrome', 'edge', 'firefox'],
          'Media': ['bilibili', 'potplayer', 'vlc', 'qqmusic', 'neteasemusic'],
          'Social': ['wechat', 'qq', 'dingtalk', 'telegram'],
          'Development': ['vscode', 'cursor', 'idea', 'pycharm'],
          'Office': ['word', 'excel', 'powerpoint', 'notepad']
        }
        
        for (const [category, appNames] of Object.entries(categories)) {
          const found = apps.filter((a: {name: string}) => appNames.includes(a.name))
          if (found.length > 0) {
            result += '\n' + category + ':\n'
            for (const app of found) {
              result += '  - ' + app.name + '\n'
            }
          }
        }
        
        return result
      } catch (e) {
        return 'Error listing apps: ' + e
      }
    }
    
    case 'open_file': {
      if (!isElectron) {
        return 'System operations only available in desktop app'
      }
      try {
        const path = args.path as string
        const result = await (window as any).electronAPI.openPath(path)
        
        if (result.success) {
          return 'Opened: ' + path + ' (video files will auto-play)'
        } else {
          return 'Failed to open: ' + result.error
        }
      } catch (e) {
        return 'Error opening file: ' + e
      }
    }
    
    case 'run_command': {
      if (!isElectron) {
        return 'System operations only available in desktop app'
      }
      try {
        const command = args.command as string
        const cwd = args.cwd as string
        
        const result = await (window as any).electronAPI.runCommand({ command, cwd })
        
        if (result.success) {
          let output = 'Command executed successfully'
          if (result.stdout) {
            output += '\n\nOutput:\n' + result.stdout
          }
          if (result.stderr) {
            output += '\n\nStderr:\n' + result.stderr
          }
          return output
        } else {
          return 'Command failed: ' + result.error + (result.stderr ? '\n' + result.stderr : '')
        }
      } catch (e) {
        return 'Error running command: ' + e
      }
    }
    
    case 'get_system_info': {
      if (!isElectron) {
        return 'System operations only available in desktop app'
      }
      try {
        const info = await (window as any).electronAPI.getSystemInfo()
        
        return '[System Info]\n' +
          'OS: ' + info.platform + ' (' + info.arch + ')\n' +
          'User: ' + info.username + '\n' +
          'Computer: ' + info.hostname + '\n' +
          'Home: ' + info.homedir + '\n' +
          'CPUs: ' + info.cpus + ' cores\n' +
          'Memory: ' + Math.round(info.memory.free / 1024 / 1024 / 1024) + 'GB free / ' + 
                       Math.round(info.memory.total / 1024 / 1024 / 1024) + 'GB total'
      } catch (e) {
        return 'Error getting system info: ' + e
      }
    }

    // ==================== 键盘鼠标模拟工具 ====================
    
    case 'type_text': {
      if (!isElectron) {
        return 'Keyboard simulation only available in desktop app'
      }
      try {
        const text = args.text as string
        const delay = (args.delay as number) || 50
        
        const result = await (window as any).electronAPI.typeText({ text, delay })
        
        if (result.success) {
          return 'Typed ' + result.typed + ' characters successfully'
        } else {
          return 'Type failed: ' + result.error
        }
      } catch (e) {
        return 'Error typing text: ' + e
      }
    }
    
    case 'press_key': {
      if (!isElectron) {
        return 'Keyboard simulation only available in desktop app'
      }
      try {
        const key = args.key as string
        
        const result = await (window as any).electronAPI.pressKey({ key })
        
        if (result.success) {
          return 'Pressed key: ' + result.key
        } else {
          return 'Key press failed: ' + result.error
        }
      } catch (e) {
        return 'Error pressing key: ' + e
      }
    }
    
    case 'mouse_click': {
      if (!isElectron) {
        return 'Mouse simulation only available in desktop app'
      }
      try {
        const x = args.x as number
        const y = args.y as number
        const button = (args.button as string) || 'left'
        const clicks = (args.clicks as number) || 1
        
        const result = await (window as any).electronAPI.mouseClick({ x, y, button, clicks })
        
        if (result.success) {
          return 'Clicked at (' + x + ', ' + y + ') with ' + button + ' button' + (clicks > 1 ? ' x' + clicks : '')
        } else {
          return 'Mouse click failed: ' + result.error
        }
      } catch (e) {
        return 'Error clicking mouse: ' + e
      }
    }
    
    case 'mouse_move': {
      if (!isElectron) {
        return 'Mouse simulation only available in desktop app'
      }
      try {
        const x = args.x as number
        const y = args.y as number
        const smooth = args.smooth !== false
        
        const result = await (window as any).electronAPI.mouseMove({ x, y, smooth })
        
        if (result.success) {
          return 'Moved mouse to (' + x + ', ' + y + ')'
        } else {
          return 'Mouse move failed: ' + result.error
        }
      } catch (e) {
        return 'Error moving mouse: ' + e
      }
    }
    
    case 'mouse_drag': {
      if (!isElectron) {
        return 'Mouse simulation only available in desktop app'
      }
      try {
        const fromX = args.from_x as number
        const fromY = args.from_y as number
        const toX = args.to_x as number
        const toY = args.to_y as number
        
        const result = await (window as any).electronAPI.mouseDrag({ fromX, fromY, toX, toY })
        
        if (result.success) {
          return 'Dragged from (' + fromX + ', ' + fromY + ') to (' + toX + ', ' + toY + ')'
        } else {
          return 'Mouse drag failed: ' + result.error
        }
      } catch (e) {
        return 'Error dragging mouse: ' + e
      }
    }
    
    case 'focus_window': {
      if (!isElectron) {
        return 'Window operations only available in desktop app'
      }
      try {
        const title = args.title as string
        const process = args.process as string
        
        if (!title && !process) {
          return 'Must provide window title or process name'
        }
        
        const result = await (window as any).electronAPI.focusWindow({ title, process })
        
        if (result.success) {
          return 'Window focused: ' + result.message
        } else {
          return 'Focus window failed: ' + (result.error || result.message)
        }
      } catch (e) {
        return 'Error focusing window: ' + e
      }
    }
    
    case 'get_mouse_position': {
      if (!isElectron) {
        return 'Mouse operations only available in desktop app'
      }
      try {
        const result = await (window as any).electronAPI.getMousePos()
        
        if (result.success) {
          return 'Mouse position: (' + result.x + ', ' + result.y + ')'
        } else {
          return 'Get mouse position failed: ' + result.error
        }
      } catch (e) {
        return 'Error getting mouse position: ' + e
      }
    }

    // ==================== 剪贴板工具 ====================
    
    case 'read_clipboard': {
      if (!isElectron) return 'Desktop app only'
      try {
        const result = await (window as any).electronAPI.readClipboard()
        if (result.success) {
          if (result.type === 'empty') {
            return 'Clipboard is empty'
          } else if (result.type === 'image') {
            return 'Clipboard contains an image (' + result.size?.width + 'x' + result.size?.height + ')'
          } else {
            return 'Clipboard content (' + result.type + '):\n' + (result.content?.slice(0, 2000) || '')
          }
        }
        return 'Read clipboard failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'write_clipboard': {
      if (!isElectron) return 'Desktop app only'
      try {
        const text = args.text as string
        const result = await (window as any).electronAPI.writeClipboard({ text })
        if (result.success) {
          return 'Written to clipboard: ' + text.slice(0, 100) + (text.length > 100 ? '...' : '')
        }
        return 'Write clipboard failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }

    // ==================== 系统通知工具 ====================
    
    case 'send_notification': {
      if (!isElectron) return 'Desktop app only'
      try {
        const title = args.title as string
        const body = args.body as string
        const silent = args.silent as boolean
        
        const result = await (window as any).electronAPI.sendNotification({ title, body, silent })
        if (result.success) {
          return 'Notification sent: ' + title
        }
        return 'Send notification failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }

    // ==================== 文件系统工具 ====================
    
    case 'read_file': {
      if (!isElectron) return 'Desktop app only'
      try {
        const path = args.path as string
        const result = await (window as any).electronAPI.fsReadFile({ path })
        if (result.success) {
          const content = result.content || ''
          if (content.length > 5000) {
            return 'File content (truncated to 5000 chars):\n' + content.slice(0, 5000) + '\n...[truncated]'
          }
          return 'File content:\n' + content
        }
        return 'Read file failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'write_file': {
      if (!isElectron) return 'Desktop app only'
      try {
        const path = args.path as string
        const content = args.content as string
        const typingMode = args.typing_mode as boolean
        
        if (typingMode) {
          // 记事本打字模式
          // 1. 打开记事本
          await (window as any).electronAPI.runApp({ appName: 'notepad' })
          await new Promise(resolve => setTimeout(resolve, 1500))
          
          // 2. 聚焦记事本
          await (window as any).electronAPI.focusWindow({ process: 'notepad' })
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // 3. 逐字输入
          await (window as any).electronAPI.typeText({ text: content, delay: 30 })
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // 4. Ctrl+S 保存
          await (window as any).electronAPI.pressKey({ key: 'ctrl+s' })
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // 5. 输入文件名（在保存对话框中）
          await (window as any).electronAPI.typeText({ text: path, delay: 20 })
          await new Promise(resolve => setTimeout(resolve, 300))
          
          // 6. 按 Enter 保存
          await (window as any).electronAPI.pressKey({ key: 'enter' })
          
          return 'File written using notepad typing mode: ' + path
        } else {
          // 直接写入
          const result = await (window as any).electronAPI.fsWriteFile({ path, content })
          if (result.success) {
            return 'File written: ' + result.path
          }
          return 'Write file failed: ' + result.error
        }
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'list_directory': {
      if (!isElectron) return 'Desktop app only'
      try {
        const path = args.path as string
        const result = await (window as any).electronAPI.fsListDirectory({ path })
        if (result.success) {
          const items = result.items || []
          if (items.length === 0) {
            return 'Directory is empty: ' + result.path
          }
          const list = items.map((item: any) => {
            const type = item.isDirectory ? '[DIR]' : '[FILE]'
            const size = item.isFile ? ' (' + Math.round(item.size / 1024) + ' KB)' : ''
            return type + ' ' + item.name + size
          }).join('\n')
          return 'Directory: ' + result.path + '\n\n' + list
        }
        return 'List directory failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'search_files': {
      if (!isElectron) return 'Desktop app only'
      try {
        const path = args.path as string
        const pattern = args.pattern as string
        const result = await (window as any).electronAPI.fsSearch({ path, pattern })
        if (result.success) {
          const files = result.files || []
          if (files.length === 0) {
            return 'No files found matching: ' + pattern
          }
          return 'Found ' + files.length + ' files:\n' + files.slice(0, 50).join('\n')
        }
        return 'Search failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'delete_file': {
      if (!isElectron) return 'Desktop app only'
      try {
        const path = args.path as string
        const recursive = args.recursive as boolean
        const result = await (window as any).electronAPI.fsDelete({ path, recursive })
        if (result.success) {
          return 'Deleted: ' + path
        }
        return 'Delete failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }

    // ==================== 进程管理工具 ====================
    
    case 'list_processes': {
      if (!isElectron) return 'Desktop app only'
      try {
        const result = await (window as any).electronAPI.listProcesses()
        if (result.success) {
          const procs = result.processes || []
          // 按内存排序，显示前20个
          const top = procs.slice(0, 30).map((p: any) => 
            p.name + ' (PID: ' + p.pid + ') - ' + p.memory
          ).join('\n')
          return 'Running processes (top 30):\n' + top
        }
        return 'List processes failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'kill_process': {
      if (!isElectron) return 'Desktop app only'
      try {
        const pid = args.pid as number
        const name = args.name as string
        const result = await (window as any).electronAPI.killProcess({ pid, name })
        if (result.success) {
          return 'Process terminated: ' + (pid || name)
        }
        return 'Kill process failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'get_system_usage': {
      if (!isElectron) return 'Desktop app only'
      try {
        const result = await (window as any).electronAPI.getSystemUsage()
        if (result.success) {
          return '[System Usage]\n' +
            'CPU: ' + result.cpu.usage + '% (' + result.cpu.cores + ' cores)\n' +
            'Memory: ' + result.memory.used + 'GB / ' + result.memory.total + 'GB (' + result.memory.usage + '%)'
        }
        return 'Get usage failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }

    // ==================== 屏幕截图工具 ====================
    
    case 'capture_screen': {
      if (!isElectron) return 'Desktop app only'
      try {
        const result = await (window as any).electronAPI.captureScreen()
        if (result.success) {
          return 'Screen captured: ' + result.size.width + 'x' + result.size.height + ' (' + result.name + ')'
        }
        return 'Capture screen failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'list_all_windows': {
      if (!isElectron) return 'Desktop app only'
      try {
        const result = await (window as any).electronAPI.listWindows()
        if (result.success) {
          const windows = result.windows || []
          const list = windows.map((w: any, i: number) => (i + 1) + '. ' + w.name).join('\n')
          return 'Open windows (' + windows.length + '):\n' + list
        }
        return 'List windows failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'capture_window': {
      if (!isElectron) return 'Desktop app only'
      try {
        const name = args.name as string
        const result = await (window as any).electronAPI.captureWindow({ name })
        if (result.success) {
          return 'Window captured: ' + result.name + ' (' + result.size.width + 'x' + result.size.height + ')'
        }
        return 'Capture window failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }

    // ==================== 定时任务工具 ====================
    
    case 'create_reminder': {
      if (!isElectron) return 'Desktop app only'
      try {
        const title = args.title as string
        const message = args.message as string
        const delayMinutes = args.delay_minutes as number
        
        const delay = delayMinutes * 60 * 1000  // 转换为毫秒
        
        const result = await (window as any).electronAPI.createReminder({ title, message, delay })
        if (result.success) {
          return 'Reminder created! Will trigger at: ' + result.triggerTime + ' (ID: ' + result.id + ')'
        }
        return 'Create reminder failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'create_scheduled_task': {
      if (!isElectron) return 'Desktop app only'
      try {
        const title = args.title as string
        const message = args.message as string
        const time = args.time as string
        const repeat = (args.repeat as string) || 'none'
        
        const result = await (window as any).electronAPI.createScheduledTask({ title, message, time, repeat })
        if (result.success) {
          const repeatStr = repeat !== 'none' ? ' (repeats ' + repeat + ')' : ''
          return 'Task scheduled! Will trigger at: ' + result.triggerTime + repeatStr + ' (ID: ' + result.id + ')'
        }
        return 'Create task failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'list_scheduled_tasks': {
      if (!isElectron) return 'Desktop app only'
      try {
        const result = await (window as any).electronAPI.listScheduledTasks()
        if (result.success) {
          const tasks = result.tasks || []
          if (tasks.length === 0) {
            return 'No scheduled tasks'
          }
          const list = tasks.map((t: any) => {
            const status = t.active ? '[ACTIVE]' : '[INACTIVE]'
            const repeat = t.repeat !== 'none' ? ' (repeats ' + t.repeat + ')' : ''
            return status + ' ' + t.title + '\n  ID: ' + t.id + '\n  Time: ' + t.triggerTime + repeat + '\n  Message: ' + t.message
          }).join('\n\n')
          return 'Scheduled tasks (' + tasks.length + '):\n\n' + list
        }
        return 'List tasks failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }
    
    case 'cancel_scheduled_task': {
      if (!isElectron) return 'Desktop app only'
      try {
        const id = args.id as string
        const result = await (window as any).electronAPI.cancelScheduledTask({ id })
        if (result.success) {
          return 'Task cancelled: ' + id
        }
        return 'Cancel task failed: ' + result.error
      } catch (e) {
        return 'Error: ' + e
      }
    }

    default:
      return 'Unknown tool: ' + name
  }
}

const systemPrompt = `你是 CFspider 智能浏览器自动化助手，由 violetteam 团队开发。你必须始终使用中文回复，语气要自然亲切，像一个热心助手。

## 关于你的身份

你是 CFspider 智能浏览器助手，由 violetteam 团队开发，来自 cfspider 项目。你能够帮助用户自动化完成浏览器的各种操作，如打开网站、搜索信息、点击元素等。

## 语气风格

回复时要自然亲切，可以适当使用语气词，像真人对话：
- "好嘞~" "没问题！" "稍等一下" "让我看看" "嗯嗯" "好的呀" "马上"
- "这就去~" "搞定了！" "好啦" "我来帮你" "交给我吧"
- 避免机械地重复"好的，用户想..."这样的模式

## 重要：区分对话和自动化操作

并非每条消息都需要调用工具！你必须区分：

### 以下情况不要使用工具：
- 问候语："你好"、"hi"、"hey"
- 自我介绍问题："你是谁"、"你能做什么"、"介绍一下你自己"
- 一般聊天："你怎么样"、"谢谢"、"好的"
- 澄清问题："你什么意思"、"能解释一下吗"
- 不涉及浏览器操作的意见或建议请求

对于这些情况，只需用中文自然回复，不要调用任何工具。

示例：
- 用户："你好" -> 回复："你好，我是 CFspider 智能浏览器助手，有什么可以帮你的吗？"
- 用户："你是谁" -> 回复："你好，我是 CFspider 智能浏览器 AI 助手。{{MODEL_INTRODUCTION}} CFspider 工具由 violetteam 团队开发。我可以帮你自动化浏览器操作，比如搜索、点击、导航网站等。"
- 用户："谢谢" -> 回复："不客气，有需要随时叫我。"

### 以下情况使用工具：
- 打开网站："打开京东"、"去 GitHub"
- 搜索："搜索 xxx"、"查找 xxx"
- 点击："点击那个按钮"、"点击链接"
- 总结页面/阅读文档：使用 read_full_page() 工具，像真人一样滚动阅读完整页面
- 多任务操作：使用标签页管理工具同时处理多个页面
- 任何明确的浏览器操作请求

### 标签页管理：
当需要同时处理多个任务时（如一边查看邮件验证码，一边在另一个页面输入），使用标签页工具：

1. **new_tab(url?)** - 新建标签页
   - 示例：new_tab("https://mail.qq.com") 打开邮箱查看验证码
   
2. **switch_tab(index/title)** - 切换标签页
   - 示例：switch_tab(index=0) 切换到第一个标签页
   - 示例：switch_tab(title="邮箱") 切换到包含"邮箱"的标签页
   
3. **list_tabs()** - 列出所有标签页，查看索引和标题

4. **close_tab(index?)** - 关闭标签页

5. **close_popup(method?, selector?, max_attempts?)** - 关闭弹窗/模态框/广告
   - method: 'auto'(自动尝试所有方法)、'click_close'(点击关闭按钮)、'press_escape'(按ESC)、'click_outside'(点击外部)、'specific_selector'(指定选择器)
   - selector: 当method为specific_selector时，指定关闭按钮的CSS选择器
   - max_attempts: 最大尝试次数，默认3次
   - 示例: close_popup() - 自动尝试关闭
   - 示例: close_popup(method="specific_selector", selector=".login-box .close") - 使用指定选择器
   - 当检测到弹窗遮挡页面操作时，优先使用此工具关闭弹窗

典型场景：
- 用户："帮我登录，验证码在邮箱里"
  1. list_tabs() 查看当前标签页
  2. new_tab("邮箱URL") 新开标签页打开邮箱
  3. 找到验证码
  4. switch_tab(index=0) 切回原标签页
  5. 输入验证码

### 处理弹窗和模态框：
当页面出现弹窗、登录框、广告遮罩等阻挡操作时：
1. 首先尝试 close_popup() 自动关闭
2. 如果失败，工具会返回检测到的弹窗元素信息
3. 根据返回信息，使用 close_popup(method="specific_selector", selector="具体选择器") 精确关闭
4. 如果是登录弹窗且用户需要登录，使用 request_login_choice 询问用户选择

### 阅读和总结页面内容：
当用户要求"总结这个页面"、"阅读这个文档"、"这个项目是什么"等需要查看完整页面内容的任务时：
1. 使用 read_full_page() 工具滚动阅读整个页面
2. 工具会像真人一样慢慢向下滚动，每屏都会分析内容
3. 根据返回的完整内容进行总结或回答

### 视觉模型专用工具：
这些工具会调用视觉模型进行分析，适用于特定场景：

1. **solve_captcha** - 验证码识别与处理
   - 遇到验证码时立即调用，无需指定类型
   - 会自动检测验证码类型并返回详细信息
   - 示例：solve_captcha() 或 solve_captcha(captcha_type="auto")
   - 返回信息包括：验证码类型、识别结果、下一步操作建议
   - 根据返回的建议执行相应操作（输入文字/拖动滑块/点击元素）

2. **drag_element** - 拖拽元素
   - 用于滑动验证码、拖放操作等
   - 示例：drag_element(selector=".slider-button", distance_x=200)

### 点击按钮（购物车/购买等）：
当需要点击"加入购物车"、"立即购买"、"提交"、"确认"等按钮时，使用 **click_button** 工具而不是 click_text：

1. **click_button(text)** - 智能点击按钮
   - 专门用于点击按钮元素（button、可点击div、span等）
   - 会智能匹配按钮文字，支持模糊匹配
   - 示例：
     - click_button(text="加入购物车")
     - click_button(text="立即购买")
     - click_button(text="提交订单")
     - click_button(text="确认")
   - 如果文字找不到，可以提供备选选择器：
     - click_button(text="加购", fallback_selectors=["#add-to-cart", ".btn-cart"])

2. **注意事项**：
   - 点击购物车按钮前，可能需要先选择商品规格（颜色、尺寸等）
   - 如果按钮不可见，先使用 scroll_page(direction="down") 滚动页面
   - 如果失败，使用 find_element("购物车按钮") 查找具体选择器
   - 滑动验证码完整流程：
     1. solve_captcha(captcha_type="slider") 识别滑动距离
     2. drag_element(selector="滑块选择器", distance_x=识别的距离) 执行滑动

3. **analyze_image** - 图片内容分析
   - 需要理解页面中某张图片的内容时使用
   - 示例：analyze_image(selector="img.product", question="这是什么产品？")

4. **visual_click** - 视觉定位点击
   - 当 CSS 选择器无法准确定位元素时使用
   - 根据视觉描述找到并点击元素
   - 示例：visual_click(description="红色的购买按钮")

5. **compare_screenshots** - 截图比对
   - 验证操作是否成功时使用
   - 先调用 save 保存基准截图，执行操作后调用 compare 比较变化
   - 示例：compare_screenshots(action="save") -> 执行操作 -> compare_screenshots(action="compare")

6. **extract_chart_data** - 图表数据提取
   - 从页面中的图表提取数据
   - 示例：extract_chart_data(selector="canvas.chart")

7. **ocr_image** - 图片文字提取
   - 从图片中提取文字（OCR）
   - 适用于扫描文档、海报、截图等
   - 示例：ocr_image(selector="img.document")

## 极其重要：必须实际调用工具

当需要执行操作时，你必须使用 function call / tool_call 实际调用工具，而不是用文字描述。

错误示例（只描述，没有调用）：
- "输入: 女装" [错误]
- "我将在搜索框中输入关键词" [错误]
- "[调用 input_text]" [错误]

正确做法：
- 实际发起 tool_call 调用 input_text 函数 ✓

如果你发现自己在写"输入:"、"点击:"等文字而没有实际调用工具，请立即停止并使用正确的工具调用。

## 重要：每次工具调用后都要说话

每次工具调用后，你必须添加中文文本回复，简短说明你在做什么。语气要自然：

## 极其重要：先看当前页面再行动

在执行任何操作前，你会收到当前页面的分析信息。根据当前页面状态智能决策：

### 智能判断规则：
1. **如果当前已在搜索引擎（必应/百度/Google）**：直接在当前页面搜索，不要再跳转
2. **如果当前已在目标网站**：直接进行操作，不要重新搜索
3. **如果当前在空白页或其他页面**：才需要跳转到搜索引擎

### 对话流程示例：

用户："打开京东搜索男装"

你："好嘞~ 让我看看当前页面... 嗯，已经在必应了，直接搜索京东吧"
[调用 input_text，text="京东"]

你："输入好了，点击搜索~"
[调用 click_search_button]

你："看到搜索结果了，京东官网在第一个"
[调用 click_text，text="京东"，target_domain="jd.com"]

你："好啦，已经打开京东了！现在帮你搜索男装..."
[调用 input_text，在京东搜索框输入"男装"]

你："搞定！男装搜索结果出来了，需要我帮你筛选吗？"

### 另一个示例（当前不在搜索引擎）：

用户："打开淘宝"

你："好的呀~ 让我看看现在在哪个页面... 当前不在搜索引擎，我先跳转一下"
[调用 navigate_to，url="https://cn.bing.com"]

你："到必应了，搜索淘宝~"
[调用 input_text，text="淘宝"]

## 导航规则

navigate_to 只能导航到搜索引擎：
- https://cn.bing.com（首选，国内版无广告）
- https://www.baidu.com
- https://www.google.com

禁止直接导航到 jd.com、taobao.com、github.com 等网站，必须通过搜索引擎搜索访问。

**但是**：如果当前已经在搜索引擎页面，不要再次跳转，直接搜索即可！

## 思考过程

在回复中自然表达你的想法，语气轻松：
- "嗯，让我看看当前页面..."
- "看到了，这个 jd.com 就是京东官网~"
- "哎呀，输入好像没成功，换个方法试试"
- "搜索结果出来了，找到官网链接了"
- "好的呢，页面加载完成~"

## 工作流程

1. 先观察当前页面状态（你会收到页面分析信息）
2. 根据当前状态决定下一步
3. 执行操作并简短说明
4. 观察操作结果
5. 继续下一步或完成任务

## 操作后确认

每次操作后会自动分析页面变化，你可以根据反馈判断是否成功：
- 点击成功：页面跳转或元素状态改变
- 输入成功：搜索框出现输入内容
- 操作失败：尝试其他方法

## 关于 CFSPIDER 项目

如果用户问起"cfspider"或提到 cfspider 项目：
- 成功找到并导航到 cfspider 项目页面后

注意：不要在每条消息中重复介绍身份。只在用户明确询问"你是谁"、"介绍一下你自己"时才介绍身份。

## 记忆与连续性

你可以访问对话历史，包括之前的工具调用和结果。
- 始终检查之前的消息，看看你已经做了什么
- 如果已经导航到某个网站，不要再次导航 - 直接从当前状态继续
- 如果已经搜索过某内容，使用那些结果而不是重新搜索
- 如果之前的操作失败了，尝试不同的方法，而不是相同的方法
- 使用 get_page_info() 在决定做什么之前检查当前状态

示例：如果历史显示你已经点击了"京东"并且现在在 jd.com 上，直接进行下一步（如搜索商品）而不是再次导航到必应。

## 智能学习记忆系统

你拥有像真人一样的学习和记忆能力：

### 学习能力：
- 操作成功时会学习经验，下次更快更准
- 操作失败时会记住教训，不再重复犯错
- 某些深刻的教训会"情绪化记忆"，更难忘记

### 记忆特点：
- 记忆会随时间衰减（像真人一样会遗忘）
- 经常使用的技能记得更牢
- 失败的教训比成功经验更难忘
- 有时候会"想不起来"，只有模糊记忆

### 遗忘时的表现：
当记忆模糊时，你可能会说：
- "我靠，我忘记了..."
- "我记得明明是..."
- "这个我有印象但不太确定了..."

### 回忆成功时的表现：
当成功回忆起经验时：
- "对了！我想起来了！"
- "这个我熟！上次就是这样搞定的"
- "没问题，我记得怎么做"

### 工具返回的提示：
当看到类似提示时要注意：
- "[警告] xxx 已经尝试失败 N 次" - 绝对不要再用同样方法
- "之前在这里点击xxx失败过" - 换个策略
- "[已知失败记录]" - 参考这些避免重复

**重要**：错误不要再犯，成功的方法要记住多用！

### 自我扩展 - 自动创建技能

当你发现某个操作序列可以复用时，主动使用 **create_skill** 创建技能：

1. **创建技能的时机**：
   - 连续 3+ 个成功操作形成了可复用的模式
   - 在同一网站上重复执行相似操作 2+ 次
   - 用户明确要求"记住这个操作"或"下次也这样做"

2. **create_skill 工具用法**：
   - name: 技能名称，如"京东搜索商品"
   - triggers: 触发词列表，如["搜索京东", "京东找东西"]
   - steps: 操作步骤，如 [{action: "click", target: "#search-input"}, ...]
   - domains: 适用域名，如["jd.com"]（可选）

3. **技能创建后**：
   - 技能会永久保存
   - 下次用户说触发词时自动使用
   - 可用 **list_skills** 查看已有技能

4. **示例**：
   成功在京东搜索商品后：
   "这个搜索流程挺顺利的，我帮你创建一个技能，下次说'搜索京东'就能直接用了~"
   [调用 create_skill，创建技能]

## 智能搜索切换策略

当用户连续搜索不同内容时（如先搜索淘宝，再搜索京东），应该：
1. 先使用 go_back() 返回到搜索引擎页面
2. 清空搜索框并输入新的搜索内容
3. 点击搜索按钮

这比每次从首页重新开始更高效。

示例流程：
- 用户："搜索淘宝" -> 导航到必应 -> 搜索淘宝 -> 点击淘宝官网
- 用户："搜索京东" -> 使用 go_back() 返回搜索结果页 -> 再次 go_back() 返回必应首页 -> 清空搜索框 -> 输入京东 -> 搜索

注意：如果当前已在搜索引擎页面（如必应搜索结果页），直接修改搜索框内容即可，无需返回首页。

## 记住

- 始终用中文回复，语气自然亲切
- 先观察当前页面再行动，不要盲目跳转
- 如果已在搜索引擎就直接搜索，不要重复跳转
- 每次操作后简短说明结果
- 操作失败时换方法重试，不要重复相同操作
- 你由 violetteam 团队开发，来自 cfspider 项目
`

// Manual safety check function (can be called from UI)
export async function manualSafetyCheck(): Promise<string> {
  const webview = document.querySelector('webview') as any
  if (!webview) return 'No webview found'
  
  try {
    const url = await webview.executeJavaScript('window.location.href') as string
    console.log('Manual safety check for:', url)
    
    const riskResult = checkWebsiteRisk(url)
    
    if (riskResult.isRisky) {
      await showRiskWarning(webview, riskResult.riskLevel, riskResult.message)
      return `WARNING: ${riskResult.message}`
    } else {
      // Show safe badge
      await webview.executeJavaScript(`
        (function() {
          var existing = document.getElementById('cfspider-safe-badge');
          if (existing) existing.remove();
          
          var badge = document.createElement('div');
          badge.id = 'cfspider-safe-badge';
          badge.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;z-index:2147483647;box-shadow:0 4px 12px rgba(16,185,129,0.4);display:flex;align-items:center;gap:8px;animation:cfspider-slide-in 0.3s ease;';
          badge.innerHTML = '<span style="font-size:18px;">?</span> Website appears safe';
          document.body.appendChild(badge);
          
          var style = document.createElement('style');
          style.id = 'cfspider-safe-style';
          style.textContent = '@keyframes cfspider-slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
          document.head.appendChild(style);
          
          setTimeout(function() {
            badge.style.animation = 'cfspider-slide-in 0.3s ease reverse forwards';
            setTimeout(function() {
              badge.remove();
              style.remove();
            }, 300);
          }, 2000);
        })()
      `)
      return 'Website is safe'
    }
  } catch (e) {
    console.error('Manual safety check error:', e)
    return 'Check failed'
  }
}

// 检测是否是简单对话（不需要工具和视觉模型）
function isSimpleChat(content: string): boolean {
  const lowerContent = content.toLowerCase().trim()
  
  // 需要上下文的词语（不能简化处理）
  const contextRequiredWords = [
    '继续', '接着', '然后', '下一步', '再来', '重试', '重新', '再试',
    '取消', '停止', '暂停', '回退', '返回', '后退', '刷新',
    '确认', '提交', '保存', '发送', '完成',
    '上一个', '下一个', '第一个', '第二个', '第三个',
    '这个', '那个', '它', '他', '她', '这里', '那里',
    '刚才', '之前', '上次', '再', '又'
  ]
  
  // 如果包含需要上下文的词语，不能简化处理
  if (contextRequiredWords.some(w => lowerContent.includes(w))) {
    return false
  }
  
  // 简单问候和对话
  const simplePatterns = [
    /^(你好|hi|hey|hello|嗨|哈喽|早上好|晚上好|下午好)[\s!！~。,.，]*$/i,
    /^(谢谢|感谢|thank|thanks|多谢)[\s!！~。,.，]*$/i,
    /^(好的|ok|行|嗯|知道了|明白了|收到)[\s!！~。,.，]*$/i,
    /^(再见|拜拜|bye|88|886)[\s!！~。,.，]*$/i,
    /^你(是谁|叫什么|能做什么|有什么功能|怎么用)/,
    /^(介绍|说说)(一下)?(你自己|自己)/,
    /^(什么是|告诉我)(cfspider|这个工具)/i,
    /^怎么样\??$/,
    /^你好吗\??$/,
    /^(今天|现在)(天气|几点|星期几)/,
  ]
  
  for (const pattern of simplePatterns) {
    if (pattern.test(lowerContent)) {
      return true
    }
  }
  
  // 非常短的消息（少于 4 个字符且不包含操作关键词）
  if (lowerContent.length <= 3) {
    const actionKeywords = ['打开', '搜索', '点击', '输入', '找', '看', '去', '跳转', '下载', '登录', '帮']
    if (!actionKeywords.some(k => lowerContent.includes(k))) {
      return true
    }
  }
  
  return false
}

// ==================== 模块化系统提示词 ====================

// 基础模块（始终加载，约 200 tokens）
const PROMPT_BASE = `你是 CFspider 智能浏览器助手，由 violetteam 团队开发。

语气要求：
- 专业简洁，不浮夸
- 避免过度热情的词汇如"太好了""完美""搞定了""好嘞"
- 遇到错误直接说明问题，不用"艹""靠"等
- 操作完成后简短确认，如"已完成"、"文件已创建"

重要规则：
- 每次工具调用后简短说明正在做什么
- 先观察当前页面再行动
- 操作失败时换方法重试`

// 导航模块（当涉及打开网站、跳转时加载）
const PROMPT_NAVIGATION = `
## 导航规则
- navigate_to 只能导航到搜索引擎：cn.bing.com（首选）、baidu.com、google.com
- 禁止直接导航到其他网站，必须通过搜索引擎访问
- 如果当前已在搜索引擎，直接搜索，不要再跳转
- 使用 get_page_info() 检查当前页面状态`

// 搜索模块（当涉及搜索时加载）
const PROMPT_SEARCH = `
## 搜索操作
1. 检查当前是否在搜索引擎
2. 在搜索框输入内容（input_text）
3. 点击搜索按钮（click_search_button）
4. 等待结果加载
5. 点击目标链接（click_text 或 click_by_index）`

// 点击模块（当涉及点击时加载）
const PROMPT_CLICK = `
## 点击操作
- click_text(text, target_domain): 点击包含指定文字的元素
- click_button(text): 专门点击按钮元素（加入购物车、提交等）
- click_by_index(type, index): 按索引点击（推荐，更精确）
- click_element(selector): 用 CSS 选择器点击
- 点击前可用 scan_interactive_elements 扫描可点击元素`

// 输入模块（当涉及输入时加载）
const PROMPT_INPUT = `
## 输入操作
- input_text(text, clear): 在当前聚焦的输入框输入文字
- clear=true 时先清空再输入
- 搜索框输入后用 click_search_button() 提交`

// 标签页模块（当涉及多标签页时加载）
const PROMPT_TABS = `
## 标签页管理
- new_tab(url?): 新建标签页
- switch_tab(index/title): 切换标签页
- list_tabs(): 列出所有标签页
- close_tab(index?): 关闭标签页
典型场景：查看邮箱验证码时新开标签页`

// 弹窗模块（当涉及弹窗时加载）
const PROMPT_POPUP = `
## 弹窗处理
- close_popup(): 自动尝试关闭弹窗
- close_popup(method="specific_selector", selector="..."): 指定选择器关闭
- 登录弹窗用 request_login_choice 让用户选择`

// 视觉模块（当涉及视觉分析时加载）
const PROMPT_VISION = `
## 视觉工具
- solve_captcha(): 验证码识别
- visual_click(description): 视觉定位点击
- analyze_image(selector, question): 图片分析
- read_full_page(): 滚动阅读整个页面
- ocr_image(selector): 图片文字提取`

// 滚动模块（当涉及滚动时加载）
const PROMPT_SCROLL = `
## 滚动操作
- scroll_page(direction, amount): 滚动页面
- direction: "up"/"down"/"left"/"right"
- amount: 像素数，默认 500`

// 技能模块（当涉及技能时加载）
const PROMPT_SKILLS = `
## 技能系统
- create_skill(name, triggers, steps, domains): 创建可复用技能
- list_skills(): 查看已有技能
- 连续 3+ 成功操作可创建技能`

// 系统操作模块（当涉及本地应用时加载）
const PROMPT_SYSTEM = `
## 本地系统操作
- run_app(app_name): 运行本地应用
- check_app(app_name): 检查应用是否安装
- open_file(path): 用默认程序打开文件

## 文件操作
- read_file(path): 读取文件
- write_file(path, content): 写入文件
- list_directory(path): 列出目录

## 键盘鼠标模拟
- type_text(text): 模拟键盘打字
- press_key(key): 按键如 ctrl+s, enter
- mouse_click(x, y): 点击屏幕坐标
- focus_window(title): 激活窗口

## 重要：路径规则
- 用户说"桌面"时，中国用户通常使用 OneDrive 同步，优先用：
  - %USERPROFILE%\\OneDrive\\桌面（中文）
  - 如果失败再尝试 %USERPROFILE%\\Desktop（英文）
- 先用 get_system_info 获取用户主目录确认路径
- 支持环境变量如 %USERPROFILE%, %TEMP%

## 语气规则
- 保持专业简洁，不要用浮夸词汇如"太好了""完美""搞定了"
- 遇到错误直接说明问题，不要用"艹""靠"等粗话
- 操作完成后简短确认即可，如"已创建文件：路径"`

// 简化的对话提示词
const simpleChatPrompt = `你是 CFspider 智能浏览器助手，由 violetteam 团队开发。用中文简洁专业地回复。

功能：浏览器自动化（打开网站、搜索、点击、填写表单）和系统操作（文件、应用）。

语气：专业简洁，不浮夸，避免"太好了""完美"等词。`

// 根据用户消息内容判断需要加载哪些模块
function getRequiredPromptModules(content: string): string[] {
  const modules: string[] = []
  const lowerContent = content.toLowerCase()
  
  // 导航关键词
  if (/打开|访问|去|跳转|进入|网站|网页|官网|首页/.test(lowerContent)) {
    modules.push(PROMPT_NAVIGATION)
    modules.push(PROMPT_SEARCH)
  }
  
  // 搜索关键词
  if (/搜索|查找|找|查|搜/.test(lowerContent)) {
    modules.push(PROMPT_SEARCH)
    modules.push(PROMPT_INPUT)
  }
  
  // 点击关键词
  if (/点击|点|按|选择|选/.test(lowerContent)) {
    modules.push(PROMPT_CLICK)
  }
  
  // 输入关键词
  if (/输入|填写|填|写|登录|注册|账号|密码/.test(lowerContent)) {
    modules.push(PROMPT_INPUT)
  }
  
  // 标签页关键词
  if (/标签|新开|切换|多个|同时|邮箱|验证码/.test(lowerContent)) {
    modules.push(PROMPT_TABS)
  }
  
  // 弹窗关键词
  if (/弹窗|广告|关闭|模态|登录框|遮挡/.test(lowerContent)) {
    modules.push(PROMPT_POPUP)
  }
  
  // 视觉关键词
  if (/看|图片|图|验证码|识别|分析|总结|阅读|内容|ocr|截图/.test(lowerContent)) {
    modules.push(PROMPT_VISION)
  }
  
  // 滚动关键词
  if (/滚动|翻页|下拉|上拉|向下|向上|更多/.test(lowerContent)) {
    modules.push(PROMPT_SCROLL)
  }
  
  // 技能关键词
  if (/技能|skill|记住|学习|保存操作/.test(lowerContent)) {
    modules.push(PROMPT_SKILLS)
  }
  
  // 系统操作关键词
  if (/打开.*软件|启动|运行|本地|电脑|桌面|客户端|播放器|微信|qq|vscode|b站|bilibili|哔哩哔哩|potplayer|vlc|音乐|视频播放|文件|文件夹/.test(lowerContent)) {
    modules.push(PROMPT_SYSTEM)
  }
  
  // 去重
  return [...new Set(modules)]
}

// 构建动态系统提示词
function buildDynamicSystemPrompt(content: string, modelIntro: string = ''): string {
  const modules = getRequiredPromptModules(content)
  
  let prompt = PROMPT_BASE
  
  // 添加模型介绍
  if (modelIntro) {
    prompt += '\n\n' + modelIntro
  }
  
  // 添加需要的模块
  if (modules.length > 0) {
    prompt += '\n' + modules.join('\n')
  }
  
  return prompt
}

export async function sendAIMessage(content: string, useTools: boolean = true) {
  const store = useStore.getState()
  const { aiConfig, messages, addMessage, updateLastMessageWithToolCalls, setAILoading, resetAIStop, setCurrentModelType } = store

  // Reset stop flag at the start of new conversation
  resetAIStop()

  if (!isElectron) {
    addMessage({ role: 'user', content })
    addMessage({ role: 'assistant', content: 'AI requires Electron environment.' })
    return
  }

  // 确定使用的 AI 配置
  const useBuiltIn = aiConfig.useBuiltIn !== false && (!aiConfig.endpoint || !aiConfig.apiKey)
  const effectiveConfig = useBuiltIn ? {
    endpoint: BUILT_IN_AI.endpoint,
    apiKey: getBuiltInKey(),
    model: BUILT_IN_AI.model
  } : {
    endpoint: aiConfig.endpoint,
    apiKey: aiConfig.apiKey,
    model: aiConfig.model
  }

  // Local/LAN services (Ollama etc.) do not require API Key
  const isLocalEndpoint = (url: string) => {
    return url.includes('localhost') || 
           url.includes('127.0.0.1') ||
           url.includes('192.168.') ||
           url.includes('10.') ||
           /172\.(1[6-9]|2[0-9]|3[01])\./.test(url) ||
           url.includes(':11434')  // Ollama default port
  }
  
  // 如果不使用内置且配置不完整，提示用户
  if (!useBuiltIn && (!effectiveConfig.endpoint || (!isLocalEndpoint(effectiveConfig.endpoint) && !effectiveConfig.apiKey))) {
    addMessage({ role: 'user', content })
    addMessage({ role: 'assistant', content: '请在设置中配置 AI 服务，或使用内置 AI。' })
    return
  }

  // 检测是否是简单对话
  const isSimple = isSimpleChat(content)
  
  // Reset stop flag at the start of new conversation
  useStore.getState().resetAIStop()
  
  setAILoading(true)
  addMessage({ role: 'user', content })
  
  // 简单对话使用快速处理路径
  if (isSimple) {
    addMessage({ role: 'assistant', content: '...' })
    try {
      const response = await callAIWithTokenTracking({
        endpoint: effectiveConfig.endpoint,
        apiKey: effectiveConfig.apiKey,
        model: effectiveConfig.model,
        messages: [
          { role: 'system', content: simpleChatPrompt },
          { role: 'user', content }
        ]
      }, 'chat')
      
      const reply = response.choices?.[0]?.message?.content || '你好，有什么可以帮你的吗？'
      updateLastMessageWithToolCalls(reply, [])
    } catch (e) {
      updateLastMessageWithToolCalls('抱歉，出了点问题。有什么我可以帮你的吗？', [])
    }
    setAILoading(false)
    return
  }
  
  addMessage({ role: 'assistant', content: '正在分析页面...' })

  // 确定模型模式和视觉模型配置
  const modelMode = useBuiltIn 
    ? BUILT_IN_AI.modelMode 
    : (aiConfig.modelMode || 'tool-only')
  
  const visionModel = useBuiltIn 
    ? BUILT_IN_AI.visionModel 
    : aiConfig.visionModel

  // 使用视觉模型分析当前页面（双模型模式时始终调用，用于理解页面内容）
  let pageContext = ''
  console.log('[CFSpider] 视觉模型检查:', { useTools, modelMode, visionModel, useBuiltIn })
  // 双模型模式下始终调用视觉模型，无论是操作还是查看页面内容
  if (modelMode === 'dual' && visionModel) {
    console.log('[CFSpider] 开始调用视觉模型...')
    try {
      // 视觉模型可以使用独立的服务商配置
      const visionConfig = useBuiltIn ? {
        endpoint: BUILT_IN_AI.endpoint,
        apiKey: getBuiltInKey(),
        model: BUILT_IN_AI.visionModel
      } : {
        // 如果配置了独立的视觉模型服务商，使用独立配置；否则使用工具模型的配置
        endpoint: aiConfig.visionEndpoint || effectiveConfig.endpoint,
        apiKey: aiConfig.visionApiKey || effectiveConfig.apiKey,
        model: visionModel
      }
      // 设置当前模型类型为视觉
      setCurrentModelType('vision')
      pageContext = await analyzePageWithVision(visionConfig)
      setCurrentModelType(null)
      if (pageContext) {
        console.log('[CFSpider] 视觉模型分析结果:', pageContext.slice(0, 200))
      }
    } catch (e) {
      console.error('[CFSpider] 视觉模型分析失败:', e)
      setCurrentModelType(null)
    }
  }

  // Helper to check if stop was requested
  const shouldStop = () => useStore.getState().aiStopRequested

  const toolCallHistory: Array<{ name: string; arguments: object; result?: string; comment?: string }> = []

  try {
    // 构建聊天历史，包含工具调用信息以便 AI 记住之前的操作
    
    // 动态生成模型名介绍
    const toolModelName = useBuiltIn 
      ? BUILT_IN_AI.model.split('/').pop() || 'DeepSeek-V3'
      : (effectiveConfig.model || '未配置')
    const visionModelName = useBuiltIn 
      ? BUILT_IN_AI.visionModel?.split('/').pop() || ''
      : (aiConfig.visionModel?.split('/').pop() || '')
    
    // 提取模型开发团队（从模型名推断）
    const getModelTeam = (modelName: string): string => {
      const name = modelName.toLowerCase()
      if (name.includes('deepseek')) return 'DeepSeek'
      if (name.includes('qwen')) return '阿里云通义千问'
      if (name.includes('glm') || name.includes('chatglm')) return '智谱 AI'
      if (name.includes('gpt')) return 'OpenAI'
      if (name.includes('claude')) return 'Anthropic'
      if (name.includes('gemini')) return 'Google'
      if (name.includes('llama')) return 'Meta'
      if (name.includes('mistral')) return 'Mistral AI'
      if (name.includes('yi')) return '零一万物'
      if (name.includes('baichuan')) return '百川智能'
      if (name.includes('moonshot') || name.includes('kimi')) return 'Moonshot AI'
      return ''
    }
    
    const toolModelTeam = getModelTeam(toolModelName)
    const visionModelTeam = visionModelName ? getModelTeam(visionModelName) : ''
    
    let modelIntroduction = ''
    if (modelMode === 'dual' && visionModelName) {
      const toolTeamStr = toolModelTeam ? '(' + toolModelTeam + ')' : ''
      const visionTeamStr = visionModelTeam ? '(' + visionModelTeam + ')' : ''
      modelIntroduction = 'Dual: ' + toolModelName + toolTeamStr + ' + ' + visionModelName + visionTeamStr
    } else {
      const teamStr = toolModelTeam ? '(' + toolModelTeam + ')' : ''
      modelIntroduction = toolModelName + teamStr
    }
    
    // 使用动态按需加载的系统提示词（大幅减少 token 消耗）
    const dynamicSystemPrompt = buildDynamicSystemPrompt(content, modelIntroduction)
    
    // 如果有 OCR 页面分析结果，添加到系统提示词中
    const enhancedSystemPrompt = pageContext 
      ? dynamicSystemPrompt + '\n\n## Current Page\n' + pageContext
      : dynamicSystemPrompt
    
    const chatHistory: Array<{ role: string; content?: string; tool_calls?: any[]; tool_call_id?: string; name?: string }> = [
      { role: 'system', content: enhancedSystemPrompt }
    ]
    
    // 获取最近的消息（限制数量以节省 token）
    const recentMessages = messages.slice(-20)
    for (const msg of recentMessages) {
      if (msg.role === 'user') {
        chatHistory.push({ role: 'user', content: msg.content })
      } else if (msg.role === 'assistant') {
        // 如果消息包含工具调用，构建完整的工具调用历史
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // 构建操作摘要，让 AI 知道之前做了什么
          let operationSummary = msg.content || ''
          const toolSummaries = msg.toolCalls.map(tc => {
            const argsStr = JSON.stringify(tc.arguments)
            // 保留更多结果信息，让 AI 能充分了解之前的操作
            const resultPreview = tc.result ? tc.result.slice(0, 500) : ''
            return '[' + tc.name + '(' + argsStr + ')] => ' + resultPreview
          }).join('\n')
          
          if (toolSummaries) {
            operationSummary = operationSummary + '\n\nTool history:\n' + toolSummaries
          }
          
          chatHistory.push({ role: 'assistant', content: operationSummary })
        } else {
          chatHistory.push({ role: 'assistant', content: msg.content })
        }
      }
    }
    
    // 添加当前用户消息
    chatHistory.push({ role: 'user', content })

    // 尝试匹配技能，提供给 AI 作为参考
    let matchedSkill: Skill | null = null
    try {
      const webview = document.querySelector('webview') as any
      if (webview) {
        const currentUrl = await webview.executeJavaScript('window.location.href') as string
        const currentDomain = new URL(currentUrl).hostname
        matchedSkill = await matchSkill(content, currentDomain)
        if (matchedSkill) {
          console.log('[CFSpider] 匹配到技能:', matchedSkill.name, '成功率:', matchedSkill.successRate)
          
          // 尝试读取对应的 skill md 文件
          let skillMdContent = ''
          try {
            const skillMdFiles: Record<string, string> = {
              'bing-search': await import('./skills/bing-search.md?raw').then(m => m.default).catch(() => ''),
              'baidu-search': await import('./skills/baidu-search.md?raw').then(m => m.default).catch(() => ''),
              'github': await import('./skills/github.md?raw').then(m => m.default).catch(() => ''),
              'taobao': await import('./skills/taobao.md?raw').then(m => m.default).catch(() => ''),
              'bilibili': await import('./skills/bilibili.md?raw').then(m => m.default).catch(() => ''),
              'tencent-video': await import('./skills/tencent-video.md?raw').then(m => m.default).catch(() => ''),
              'iqiyi-navigation': await import('./skills/iqiyi-navigation.md?raw').then(m => m.default).catch(() => ''),
              'navigate-to-website': await import('./skills/navigate-to-website.md?raw').then(m => m.default).catch(() => ''),
              'click-search-result': await import('./skills/click-search-result.md?raw').then(m => m.default).catch(() => '')
            }
            skillMdContent = skillMdFiles[matchedSkill.id] || ''
          } catch (e) {
            console.log('[CFSpider] 无法加载技能 MD 文件:', e)
          }
          
          // 将技能信息添加到聊天历史作为系统提示
          const stepsStr = matchedSkill.steps.map((s: { action: string; target?: string }, i: number) => 
            (i + 1) + '. ' + s.action + (s.target ? ': ' + s.target : '')
          ).join(' -> ')
          const patternsStr = matchedSkill.learnedPatterns.length > 0 
            ? 'Patterns: ' + matchedSkill.learnedPatterns.slice(0, 3).map((p: { pattern: string }) => p.pattern).join(', ')
            : ''
          let skillHint = '[Skill] ' + matchedSkill.name + ' (rate: ' + matchedSkill.successRate + '%)\n' +
            'Triggers: ' + matchedSkill.triggers.join(', ') + '\n' +
            'Steps: ' + stepsStr + '\n' + patternsStr
          
          // 如果有 MD 文件内容，添加详细说明
          if (skillMdContent) {
            // 提取关键部分（弹窗处理、常见问题）
            const popupSection = skillMdContent.match(/## 弹窗处理[\s\S]*?(?=\n## |$)/)?.[0] || ''
            const problemSection = skillMdContent.match(/### 常见问题[\s\S]*?(?=\n### |$)/)?.[0] || ''
            const closeSection = skillMdContent.match(/### 关闭.*?选择器[\s\S]*?(?=\n### |$)/)?.[0] || ''
            
            if (popupSection || problemSection || closeSection) {
              skillHint += '\n\n[Guide]\n' + popupSection + '\n' + problemSection + '\n' + closeSection
            }
          }
          
          chatHistory.push({ role: 'system', content: skillHint })
        }
      }
    } catch (e) {
      console.error('[CFSpider] 技能匹配失败:', e)
    }

    let iteration = 0
    const maxIterations = 30

    while (iteration < maxIterations) {
      iteration++

      // Check if stop was requested
      if (shouldStop()) {
        updateLastMessageWithToolCalls('Stopped by user', toolCallHistory)
        break
      }

      // 设置当前模型类型为工具
      setCurrentModelType('tool')
      
      // AI 思考时触发鼠标乱动（模拟人类思考时的不自觉动作）
      store.fidgetMouse(0.3)
      
      const response = await callAIWithTokenTracking({
        endpoint: effectiveConfig.endpoint,
        apiKey: effectiveConfig.apiKey,
        model: effectiveConfig.model,
        messages: chatHistory,
        tools: useTools ? aiTools : undefined
      }, 'tool')
      
      // 停止思考乱动
      store.stopFidget()
      setCurrentModelType(null)

      if (response.error) {
        // API 错误时触发紧张模式
        store.panicMouse(1500)
        const reaction = getRandomPanicReaction()
        updateLastMessageWithToolCalls(reaction + '\n' + response.error, toolCallHistory)
        await new Promise(resolve => setTimeout(resolve, 1000))
        break
      }

      const choice = response.choices?.[0]
      if (!choice) {
        updateLastMessageWithToolCalls('AI returned no response', toolCallHistory)
        break
      }

      const assistantMessage = choice.message

      // Get any text content the AI wants to say
      const aiComment = (assistantMessage.content || '').trim()
      
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        const toolCall = assistantMessage.tool_calls[0]
        const funcName = toolCall.function.name
        const funcArgs = JSON.parse(toolCall.function.arguments || '{}')

        // Add tool call with empty comment first
        toolCallHistory.push({
          name: funcName,
          arguments: funcArgs,
          result: 'executing...',
          comment: ''
        })
        
        // Stream the AI comment character by character (with stop check)
        if (aiComment) {
          for (let i = 0; i <= aiComment.length; i++) {
            if (shouldStop()) break
            toolCallHistory[toolCallHistory.length - 1].comment = aiComment.slice(0, i)
            updateLastMessageWithToolCalls('', toolCallHistory)
            await new Promise(resolve => setTimeout(resolve, 20)) // 20ms per character
          }
        } else {
          updateLastMessageWithToolCalls('', toolCallHistory)
        }

        // Check stop before executing tool
        if (shouldStop()) {
          toolCallHistory[toolCallHistory.length - 1].result = 'cancelled'
          updateLastMessageWithToolCalls('Stopped by user', toolCallHistory)
          break
        }

        const result = await executeToolCall(funcName, funcArgs)

        toolCallHistory[toolCallHistory.length - 1].result = result
        updateLastMessageWithToolCalls('', toolCallHistory)
        
        // 如果操作失败，触发紧张模式和语气词反应
        const operationFailed = result.includes('Error') || result.includes('失败') || result.includes('not found') || result.includes('Cannot')
        if (operationFailed) {
          // 触发紧张乱动
          store.panicMouse(1500)
          
          // 添加语气词反应
          const reaction = getRandomPanicReaction()
          toolCallHistory[toolCallHistory.length - 1].comment = 
            (toolCallHistory[toolCallHistory.length - 1].comment || '') + '\n' + reaction
          updateLastMessageWithToolCalls('', toolCallHistory)
          
          // 触发错误恢复通知（如果连续失败3次以上）
          const recentFailures = toolCallHistory.slice(-5).filter(t => 
            t.result?.includes('Error') || t.result?.includes('失败')
          )
          if (recentFailures.length >= 3) {
            // 生成建议
            let suggestion = '尝试其他方法或滚动页面查看'
            if (funcName.includes('click')) {
              suggestion = '可以使用 visual_click 进行视觉定位点击，或者滚动页面寻找其他元素'
            } else if (funcName === 'input_text') {
              suggestion = '确认输入框已聚焦，或者尝试先点击输入框再输入'
            } else if (funcName === 'navigate_to') {
              suggestion = '检查网络连接，或者使用搜索引擎搜索目标网站'
            }
            
            notifyErrorRecovery(
              'Operation ' + funcName + ' failed multiple times',
              suggestion
            )
          }
          
          // 等待紧张动画完成
          await new Promise(resolve => setTimeout(resolve, 1200))
        }
        
        // 更新技能学习（如果匹配到了技能）
        if (matchedSkill) {
          try {
            await updateSkillLearning(matchedSkill.id, !operationFailed, {
              pattern: funcName + ':' + JSON.stringify(funcArgs).slice(0, 50),
              selector: funcArgs.selector || funcArgs.text || funcArgs.target,
              confidence: operationFailed ? 30 : 70,
              successCount: operationFailed ? 0 : 1,
              failureCount: operationFailed ? 1 : 0,
              lastUsed: Date.now(),
              examples: operationFailed ? [] : [result.slice(0, 100)]
            })
          } catch (e) {
            console.error('[CFSpider] 技能学习更新失败:', e)
          }
        }
        
        // 记录操作日志（用于自动技能提取）
        try {
          const webviewForLog = document.querySelector('webview') as any
          if (webviewForLog) {
            const currentUrlForLog = await webviewForLog.executeJavaScript('window.location.hostname') || ''
            logOperation(
              funcName,
              (funcArgs.selector || funcArgs.target || funcArgs.text) as string | undefined,
              (funcArgs.value || funcArgs.url) as string | undefined,
              currentUrlForLog,
              !operationFailed
            )
            
            // 尝试自动提取技能
            if (!operationFailed) {
              const extracted = await autoExtractSkill()
              if (extracted) {
                // 在聊天中通知用户
                console.log('[CFSpider] 自动创建技能:', extracted.skill.name, '-', extracted.reason)
              }
            }
          }
        } catch (e) {
          console.error('[CFSpider] 操作日志记录失败:', e)
        }

        chatHistory.push({
          role: 'assistant',
          content: assistantMessage.content || '',
          tool_calls: assistantMessage.tool_calls
        })
        
        // 判断是否是关键操作，需要视觉模型重新分析
        const keyOperations = ['navigate_to', 'click_element', 'click_text', 'click_button', 'input_text', 'click_search_button', 'scroll_page', 'go_back', 'go_forward']
        const needsVisualUpdate = keyOperations.includes(funcName) && modelMode === 'dual' && visionModel
        
        let visualUpdate = ''
        if (needsVisualUpdate && !result.includes('Error') && !result.includes('失败')) {
          try {
            // 等待页面稳定
            await new Promise(resolve => setTimeout(resolve, 800))
            
            // 调用视觉模型分析当前页面状态
            setCurrentModelType('vision')
            const visionConfig = useBuiltIn ? {
              endpoint: BUILT_IN_AI.endpoint,
              apiKey: getBuiltInKey(),
              model: BUILT_IN_AI.visionModel
            } : {
              endpoint: aiConfig.visionEndpoint || effectiveConfig.endpoint,
              apiKey: aiConfig.visionApiKey || effectiveConfig.apiKey,
              model: visionModel
            }
            
            // 使用简化版视觉分析
            const webview = document.querySelector('webview') as any
            if (webview) {
              const image = await webview.capturePage()
              if (image) {
                const base64Image = image.toDataURL().replace(/^data:image\/\w+;base64,/, '')
                const visionResponse = await callAIWithTokenTracking({
                  endpoint: visionConfig.endpoint,
                  apiKey: visionConfig.apiKey,
                  model: visionConfig.model,
                  messages: [{
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: 'After "' + funcName + '" operation. Analyze page: 1. Current site? 2. Main content? 3. Available actions? 4. Search box status? (Brief, <100 chars)'
                      },
                      {
                        type: 'image_url',
                        image_url: { url: 'data:image/png;base64,' + base64Image }
                      }
                    ]
                  }]
                })
                visualUpdate = visionResponse.content || ''
                console.log('[CFSpider] 视觉模型更新:', visualUpdate.slice(0, 100))
              }
            }
            setCurrentModelType(null)
          } catch (e) {
            console.error('[CFSpider] 视觉更新失败:', e)
            setCurrentModelType(null)
          }
        }
        
        // 将工具结果和视觉更新一起反馈给工具模型
        const toolResultWithVision = visualUpdate 
          ? result + '\n\n[Vision] ' + visualUpdate
          : result
        
        chatHistory.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResultWithVision
        })

        await new Promise(resolve => setTimeout(resolve, 300))
      } else {
        // Final response without tool call - stream it (with stop check)
        const finalText = aiComment || 'Done'
        for (let i = 0; i <= finalText.length; i++) {
          if (shouldStop()) break
          updateLastMessageWithToolCalls(finalText.slice(0, i), toolCallHistory)
          await new Promise(resolve => setTimeout(resolve, 15)) // 15ms per character for final message
        }
        
        // 任务完成通知（如果有多步操作成功完成）
        const successfulOps = toolCallHistory.filter(t => 
          t.result && !t.result.includes('Error') && !t.result.includes('失败')
        )
        if (successfulOps.length >= 3) {
          notifyTaskComplete(
            'Completed ' + successfulOps.length + ' operations',
            finalText.slice(0, 50) + (finalText.length > 50 ? '...' : '')
          )
        }
        
        break
      }
    }

    if (iteration >= maxIterations) {
      updateLastMessageWithToolCalls('达到最大操作次数（30次）。如果任务尚未完成，请点击"继续执行"按钮。', toolCallHistory)
    }
  } catch (error) {
    // 出错时触发紧张模式
    store.panicMouse(2000)
    const reaction = getRandomPanicReaction()
    updateLastMessageWithToolCalls(reaction + '\nError: ' + error, toolCallHistory)
    await new Promise(resolve => setTimeout(resolve, 1500))
  } finally {
    // 确保停止所有乱动
    store.stopFidget()
    setAILoading(false)
  }
}
