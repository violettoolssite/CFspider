import { useStore, Rule, SelectedElement } from '../store'

// 保存当前选择为规则
export function saveCurrentAsRule(name: string): Rule | null {
  const store = useStore.getState()
  const { selectedElements, url, addRule } = store

  if (selectedElements.length === 0) {
    return null
  }

  // 从 URL 生成模式
  const urlPattern = generateUrlPattern(url)

  const rule: Rule = {
    id: Date.now().toString(),
    name,
    urlPattern,
    elements: [...selectedElements],
    createdAt: Date.now()
  }

  addRule(rule)
  return rule
}

// 从 URL 生成模式（保留域名，简化路径）
function generateUrlPattern(url: string): string {
  try {
    const parsed = new URL(url)
    // 简单模式：保留域名
    return `${parsed.origin}/*`
  } catch {
    return url
  }
}

// 检查 URL 是否匹配规则
export function matchRule(url: string, rules: Rule[]): Rule | null {
  for (const rule of rules) {
    if (matchUrlPattern(url, rule.urlPattern)) {
      return rule
    }
  }
  return null
}

// URL 模式匹配
function matchUrlPattern(url: string, pattern: string): boolean {
  // 简单的通配符匹配
  const regex = new RegExp(
    '^' + pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*') + '$'
  )
  return regex.test(url)
}

// 应用规则
export function applyRule(rule: Rule) {
  const store = useStore.getState()
  
  // 清空当前选择
  store.clearSelectedElements()
  
  // 添加规则中的元素
  rule.elements.forEach((el: SelectedElement) => {
    store.addSelectedElement({
      ...el,
      id: Date.now().toString() + Math.random()
    })
  })
}

// 导出规则为 JSON
export function exportRules(): string {
  const store = useStore.getState()
  return JSON.stringify(store.rules, null, 2)
}

// 导入规则
export function importRules(json: string): boolean {
  try {
    const rules = JSON.parse(json) as Rule[]
    const store = useStore.getState()
    
    rules.forEach(rule => {
      store.addRule({
        ...rule,
        id: Date.now().toString() + Math.random() // 生成新 ID
      })
    })
    
    return true
  } catch {
    return false
  }
}
