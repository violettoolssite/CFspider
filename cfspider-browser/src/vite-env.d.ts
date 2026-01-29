/// <reference types="vite/client" />

// 支持导入 .md 文件作为原始文本
declare module '*.md?raw' {
  const content: string
  export default content
}

declare module '*.md' {
  const content: string
  export default content
}
