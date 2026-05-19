import { SelectedElement, ExtractedData } from '../store'

// 在 webview 中执行提取
export async function extractData(
  webview: Electron.WebviewTag,
  elements: SelectedElement[]
): Promise<ExtractedData[]> {
  if (!webview || elements.length === 0) {
    return []
  }

  try {
    const result = await webview.executeJavaScript(`
      (function() {
        const selectors = ${JSON.stringify(elements)};
        return selectors.map(s => {
          const elements = document.querySelectorAll(s.selector);
          return {
            selector: s.selector,
            values: Array.from(elements).map(el => {
              if (s.type === 'link') return el.href || el.textContent?.trim();
              if (s.type === 'image') return el.src;
              if (s.type === 'attribute' && s.attribute) return el.getAttribute(s.attribute);
              return el.textContent?.trim();
            }).filter(v => v)
          };
        });
      })()
    `)
    return result
  } catch (error) {
    console.error('Extract error:', error)
    return []
  }
}

// 转换为 CSV 格式
export function toCSV(data: ExtractedData[]): string {
  if (data.length === 0) return ''

  const headers = data.map(d => d.selector)
  const maxLength = Math.max(...data.map(d => d.values.length))
  
  const rows: string[][] = [headers]
  
  for (let i = 0; i < maxLength; i++) {
    rows.push(data.map(d => escapeCSV(d.values[i] || '')))
  }

  return rows.map(row => row.join(',')).join('\n')
}

// 转义 CSV 字段
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// 转换为 JSON 格式（用户友好版）
export function toJSON(data: ExtractedData[]): string {
  // 将数据转换为更友好的格式
  const result: {
    exportTime: string;
    totalItems: number;
    data: Array<{
      index: number;
      title?: string;
      content?: string;
      link?: string;
    }>;
  } = {
    exportTime: new Date().toLocaleString('zh-CN'),
    totalItems: 0,
    data: []
  }
  
  let globalIndex = 1
  data.forEach(d => {
    d.values.forEach(value => {
      // 尝试解析为 JSON（完整模式数据）
      try {
        if (value.startsWith('{')) {
          const parsed = JSON.parse(value)
          if (parsed.title !== undefined || parsed.link !== undefined) {
            // 完整模式：直接使用解析后的对象
            result.data.push({
              index: globalIndex++,
              title: parsed.title || '',
              content: parsed.content || '',
              link: parsed.link || ''
            })
            return
          }
        }
      } catch {
        // 不是 JSON，作为普通文本处理
      }
      // 普通文本模式
      result.data.push({
        index: globalIndex++,
        content: value
      })
    })
  })
  
  result.totalItems = result.data.length
  
  return JSON.stringify(result, null, 2)
}

// 转换为简洁 JSON 格式（仅数据数组）
export function toSimpleJSON(data: ExtractedData[]): string {
  const items: string[] = []
  data.forEach(d => {
    items.push(...d.values)
  })
  return JSON.stringify(items, null, 2)
}

// 转换为表格格式（用于预览）
export function toTable(data: ExtractedData[]): { headers: string[]; rows: string[][] } {
  const headers = data.map(d => d.selector)
  const maxLength = Math.max(...data.map(d => d.values.length), 0)
  
  const rows: string[][] = []
  for (let i = 0; i < maxLength; i++) {
    rows.push(data.map(d => d.values[i] || ''))
  }

  return { headers, rows }
}

// 转换为纯文本格式
export function toTXT(data: ExtractedData[]): string {
  if (data.length === 0) return ''
  
  const sections: string[] = []
  
  data.forEach(d => {
    const selectorName = d.selector.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, ' ').trim()
    sections.push(`=== ${selectorName} ===`)
    d.values.forEach((v, i) => {
      sections.push(`${i + 1}. ${v}`)
    })
    sections.push('')
  })
  
  return sections.join('\n')
}

// 转换为 Excel 格式 (返回工作簿数据)
export function toExcelData(data: ExtractedData[]): { headers: string[]; rows: (string | number)[][] } {
  const headers = ['序号', ...data.map(d => d.selector)]
  const maxLength = Math.max(...data.map(d => d.values.length), 0)
  
  const rows: (string | number)[][] = []
  for (let i = 0; i < maxLength; i++) {
    rows.push([i + 1, ...data.map(d => d.values[i] || '')])
  }

  return { headers, rows }
}

// 生成 Excel 文件 (使用 xlsx 库)
export async function toExcel(data: ExtractedData[]): Promise<Blob | null> {
  try {
    // 动态导入 xlsx
    const XLSX = await import('xlsx')
    
    const { headers, rows } = toExcelData(data)
    
    // 创建工作表
    const wsData = [headers, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    
    // 设置列宽
    const colWidths = headers.map((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...rows.map(r => String(r[i] || '').length)
      )
      return { wch: Math.min(maxLen + 2, 50) }
    })
    ws['!cols'] = colWidths
    
    // 创建工作簿
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '爬取数据')
    
    // 生成 Blob
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  } catch (error) {
    console.error('Excel generation error:', error)
    return null
  }
}

// 扁平化数据（将多个选择器的数据合并为一个数组）
export function flattenData(data: ExtractedData[]): { index: number; selector: string; value: string }[] {
  const result: { index: number; selector: string; value: string }[] = []
  let globalIndex = 1
  
  data.forEach(d => {
    d.values.forEach(v => {
      result.push({
        index: globalIndex++,
        selector: d.selector,
        value: v
      })
    })
  })
  
  return result
}
