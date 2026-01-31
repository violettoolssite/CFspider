/**
 * CFSpider 技能系统
 * 让 AI 针对特定网站和任务有预定义的操作流程
 */

// ========== 数据结构定义 ==========

// 技能步骤动作类型
export type SkillAction = 'click' | 'input' | 'scroll' | 'wait' | 'verify' | 'navigate' | 'scan'

// 技能步骤
export interface SkillStep {
  action: SkillAction
  target?: string          // CSS 选择器或元素描述
  value?: string           // 输入值或参数（支持 {query} 等占位符）
  fallbacks?: string[]     // 备选方案（选择器或操作描述）
  successIndicator?: string // 成功标志（URL 变化、元素出现等）
  timeout?: number         // 超时时间（毫秒）
  optional?: boolean       // 是否可选（失败不中断）
}

// 学习到的模式
export interface LearnedPattern {
  pattern: string          // 模式描述
  selector?: string        // 关联的选择器
  confidence: number       // 置信度 0-100
  successCount: number     // 成功次数
  failureCount: number     // 失败次数
  lastUsed: number         // 上次使用时间
  examples: string[]       // 成功实例（最多5个）
}

// 技能定义
export interface Skill {
  id: string               // 唯一标识
  name: string             // 技能名称，如"必应搜索"
  description: string      // 技能描述
  triggers: string[]       // 触发词，如["搜索", "查找", "百度一下"]
  domains: string[]        // 适用域名，如["bing.com", "baidu.com"]，空数组表示通用
  steps: SkillStep[]       // 操作步骤
  successRate: number      // 成功率 0-100
  usageCount: number       // 使用次数
  lastUsed: number         // 上次使用时间
  learnedPatterns: LearnedPattern[] // 学习到的模式
  isBuiltIn: boolean       // 是否为内置技能
  version: number          // 版本号（用于更新）
}

// 技能执行结果
export interface SkillExecutionResult {
  success: boolean
  skillId: string
  stepsCompleted: number
  totalSteps: number
  finalUrl?: string
  finalTitle?: string
  error?: string
  executionLog: SkillExecutionLog[]
}

// 执行日志
export interface SkillExecutionLog {
  step: number
  action: SkillAction
  target?: string
  result: 'success' | 'failure' | 'skipped'
  duration: number
  error?: string
  fallbackUsed?: string
}

// ========== 技能缓存 ==========

// 内存中的技能缓存
let skillsCache: Skill[] = []
let skillsLoaded = false

// 检查是否在 Electron 环境
const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined

// ========== 核心函数 ==========

/**
 * 加载技能（从持久化存储）
 */
export async function loadSkills(): Promise<Skill[]> {
  if (skillsLoaded) return skillsCache
  
  try {
    if (isElectron && (window as any).electronAPI.loadSkills) {
        const savedSkills = await (window as any).electronAPI.loadSkills() as Skill[]
      if (Array.isArray(savedSkills)) {
        // 合并内置技能和保存的技能
        let BUILT_IN_SKILLS: Skill[] = []
        try {
          // @ts-ignore - 动态导入，运行时正常
          const builtinSkillsModule = await import('./builtinSkills')
          BUILT_IN_SKILLS = builtinSkillsModule.BUILT_IN_SKILLS
        } catch (e) {
          console.error('[Skills] Failed to load built-in skills:', e)
          BUILT_IN_SKILLS = []
        }
        
        // 内置技能始终使用最新版本
        const builtInMap = new Map(BUILT_IN_SKILLS.map(s => [s.id, s]))
        
        // 合并：保留用户技能的学习数据，但使用内置技能的步骤定义
        skillsCache = BUILT_IN_SKILLS.map((builtIn: Skill) => {
          const saved_skill = savedSkills.find((s: Skill) => s.id === builtIn.id)
          if (saved_skill) {
            return {
              ...builtIn,
              successRate: saved_skill.successRate,
              usageCount: saved_skill.usageCount,
              lastUsed: saved_skill.lastUsed,
              learnedPatterns: saved_skill.learnedPatterns || []
            }
          }
          return builtIn
        })
        
        // 添加用户自定义技能（包括从学习中提升的技能）
        const userSkills = savedSkills.filter((s: Skill) => !builtInMap.has(s.id))
        skillsCache.push(...userSkills)
        
        console.log('[Skills] Loaded skills:', skillsCache.length, '(内置:', BUILT_IN_SKILLS.length, '学习:', userSkills.length, ')')
      }
    }
  } catch (e) {
    console.error('[Skills] Failed to load:', e)
  }
  
  // 如果没有加载到技能，使用内置技能
  if (skillsCache.length === 0) {
    try {
      // @ts-ignore - 动态导入，运行时正常
      const builtinSkillsModule = await import('./builtinSkills')
      skillsCache = [...builtinSkillsModule.BUILT_IN_SKILLS]
    } catch (e) {
      console.error('[Skills] Failed to load built-in skills:', e)
      skillsCache = []
    }
  }
  
  skillsLoaded = true
  return skillsCache
}

/**
 * 保存技能（到持久化存储）- 永久保存，无容量限制
 */
export async function saveSkills(): Promise<void> {
  if (!isElectron || !(window as any).electronAPI.saveSkills) return
  
  try {
    // 保存所有有学习数据的技能（包括内置技能的学习数据和用户技能）
    // 永久保存，不删除（像真人一辈子都会）
    const toSave = skillsCache.filter(s => 
      s.usageCount > 0 || s.learnedPatterns.length > 0 || !s.isBuiltIn
    )
    await (window as any).electronAPI.saveSkills(toSave)
    console.log('[Skills] Permanently saved:', toSave.length, '技能（永久保存，无容量限制）')
  } catch (e) {
    console.error('[Skills] Failed to save:', e)
  }
}

/**
 * 根据用户指令和当前域名匹配技能
 */
export async function matchSkill(instruction: string, currentDomain: string): Promise<Skill | null> {
  await loadSkills()
  
  const instructionLower = instruction.toLowerCase()
  
  // 评分匹配
  let bestMatch: Skill | null = null
  let bestScore = 0
  
  for (const skill of skillsCache) {
    let score = 0
    
    // 检查域名匹配
    const domainMatch = skill.domains.length === 0 || 
                        skill.domains.some(d => currentDomain.includes(d))
    if (!domainMatch) continue
    
    // 检查触发词匹配
    for (const trigger of skill.triggers) {
      if (instructionLower.includes(trigger.toLowerCase())) {
        score += 10
        // 完全匹配加分
        if (instructionLower.startsWith(trigger.toLowerCase())) {
          score += 5
        }
      }
    }
    
    // 域名精确匹配加分
    if (skill.domains.some(d => currentDomain === d || currentDomain === 'www.' + d)) {
      score += 5
    }
    
    // 使用频率加分（最多 +10）
    score += Math.min(10, Math.floor(skill.usageCount / 10))
    
    // 成功率加分（最多 +10）
    score += Math.floor(skill.successRate / 10)
    
    if (score > bestScore) {
      bestScore = score
      bestMatch = skill
    }
  }
  
  // 至少需要 10 分才算匹配
  return bestScore >= 10 ? bestMatch : null
}

/**
 * 获取所有技能
 */
export async function getAllSkills(): Promise<Skill[]> {
  await loadSkills()
  return skillsCache
}

/**
 * 根据 ID 获取技能
 */
export async function getSkillById(id: string): Promise<Skill | null> {
  await loadSkills()
  return skillsCache.find(s => s.id === id) || null
}

/**
 * 更新技能学习数据
 */
export async function updateSkillLearning(
  skillId: string, 
  success: boolean, 
  pattern?: LearnedPattern
): Promise<void> {
  await loadSkills()
  
  const skill = skillsCache.find(s => s.id === skillId)
  if (!skill) return
  
  // 更新使用统计
  skill.usageCount++
  skill.lastUsed = Date.now()
  
  // 更新成功率（移动平均）
  const weight = Math.min(skill.usageCount, 20) // 最多考虑最近 20 次
  skill.successRate = Math.round(
    (skill.successRate * (weight - 1) + (success ? 100 : 0)) / weight
  )
  
  // 添加学习模式
  if (pattern) {
    const existing = skill.learnedPatterns.find(p => p.pattern === pattern.pattern)
    if (existing) {
      existing.confidence = Math.min(100, existing.confidence + (success ? 10 : -5))
      if (success) existing.successCount++
      else existing.failureCount++
      existing.lastUsed = Date.now()
      if (success && pattern.examples.length > 0) {
        existing.examples.push(...pattern.examples)
        existing.examples = existing.examples.slice(-5) // 只保留最近 5 个
      }
    } else {
      skill.learnedPatterns.push(pattern)
    }
    
    // 只保留置信度 > 10 的模式，最多 20 个
    skill.learnedPatterns = skill.learnedPatterns
      .filter(p => p.confidence > 10)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20)
  }
  
  // 技能优化：从学习模式中提取最佳选择器
  if (skill.learnedPatterns.length > 0 && skill.usageCount >= 5) {
    optimizeSkillSteps(skill)
  }
  
  // 随机保存（模拟渐进学习）
  if (Math.random() < 0.3) {
    await saveSkills()
  }
}

/**
 * 优化技能步骤（从学习模式中提取最佳实践）
 */
function optimizeSkillSteps(skill: Skill): void {
  // 找出置信度最高的模式
  const bestPatterns = skill.learnedPatterns
    .filter(p => p.confidence > 60 && p.successCount > 2)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
  
  if (bestPatterns.length === 0) return
  
  // 将高置信度的选择器添加为备选方案
  for (const step of skill.steps) {
    if (step.action === 'click' || step.action === 'input') {
      for (const pattern of bestPatterns) {
        if (pattern.selector && !step.fallbacks?.includes(pattern.selector)) {
          step.fallbacks = step.fallbacks || []
          // 将学习到的选择器插入到前面（优先使用）
          step.fallbacks.unshift(pattern.selector)
          // 最多保留 5 个备选
          step.fallbacks = step.fallbacks.slice(0, 5)
          console.log('[Skills] Added learned selector to step:', pattern.selector)
        }
      }
    }
  }
}

/**
 * 创建用户自定义技能
 */
export async function createSkill(
  name: string,
  description: string,
  triggers: string[],
  domains: string[],
  steps: SkillStep[]
): Promise<Skill> {
  await loadSkills()
  
  const skill: Skill = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    description,
    triggers,
    domains,
    steps,
    successRate: 50, // 初始 50%
    usageCount: 0,
    lastUsed: 0,
    learnedPatterns: [],
    isBuiltIn: false,
    version: 1
  }
  
  skillsCache.push(skill)
  await saveSkills()
  
  return skill
}

/**
 * 删除技能
 */
export async function deleteSkill(skillId: string): Promise<boolean> {
  await loadSkills()
  
  const index = skillsCache.findIndex(s => s.id === skillId)
  if (index === -1) return false
  
  // 不允许删除内置技能
  if (skillsCache[index].isBuiltIn) return false
  
  skillsCache.splice(index, 1)
  await saveSkills()
  
  return true
}

// ========== 操作日志（用于自动技能提取） ==========

interface OperationLog {
  action: string
  selector?: string
  value?: string
  domain: string
  success: boolean
  timestamp: number
}

// 最近的操作日志
let operationLogs: OperationLog[] = []
const MAX_OPERATION_LOGS = 50

/**
 * 获取操作统计
 */
export function getOperationStats(): { total: number, successRate: number, domains: string[] } {
  const total = operationLogs.length
  const successful = operationLogs.filter(l => l.success).length
  const domains = [...new Set(operationLogs.map(l => l.domain).filter(d => d))]
  
  return {
    total,
    successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
    domains
  }
}

/**
 * 记录操作日志
 */
export function logOperation(
  action: string,
  selector?: string,
  value?: string,
  domain?: string,
  success: boolean = true
): void {
  const log: OperationLog = {
    action,
    selector,
    value,
    domain: domain || '',
    success,
    timestamp: Date.now()
  }
  
  operationLogs.push(log)
  
  // 只保留最近的操作
  if (operationLogs.length > MAX_OPERATION_LOGS) {
    operationLogs = operationLogs.slice(-MAX_OPERATION_LOGS)
  }
}

/**
 * 自动提取技能（从操作日志中学习）
 */
export async function autoExtractSkill(): Promise<{ skill: Skill, reason: string } | null> {
  // 至少需要 5 个成功的操作
  const recentSuccessfulOps = operationLogs.filter(l => l.success).slice(-10)
  if (recentSuccessfulOps.length < 5) return null
  
  // 检查是否有重复的操作模式
  const domains = [...new Set(recentSuccessfulOps.map(l => l.domain).filter(d => d))]
  if (domains.length !== 1) return null // 需要在同一个域名上
  
  const domain = domains[0]
  
  // 检查是否已经有这个域名的技能
  await loadSkills()
  const existingSkill = skillsCache.find(s => s.domains.includes(domain))
  if (existingSkill) return null
  
  // 提取操作步骤
  const steps: SkillStep[] = recentSuccessfulOps.map(op => {
    const step: SkillStep = {
      action: op.action.includes('click') ? 'click' : 
              op.action.includes('input') || op.action.includes('type') ? 'input' : 
              op.action.includes('scroll') ? 'scroll' : 
              op.action.includes('navigate') ? 'navigate' : 'click',
      target: op.selector,
      value: op.value
    }
    return step
  }).filter(s => s.target || s.value)
  
  if (steps.length < 3) return null
  
  // 创建新技能
  const skill = await createSkill(
    domain + ' 操作',
    '自动从操作中学习的技能',
    [domain.replace(/\.(com|cn|org|net)$/, '')],
    [domain],
    steps.slice(0, 10) // 最多 10 步
  )
  
  // 清空相关日志
  operationLogs = operationLogs.filter(l => l.domain !== domain)
  
  return { skill, reason: '从连续操作中自动学习' }
}
