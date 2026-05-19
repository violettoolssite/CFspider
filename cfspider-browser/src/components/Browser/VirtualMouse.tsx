import { useEffect, useState, useRef, useCallback } from 'react'
import { useStore } from '../../store'

// 当前位置 ref（用于乱动模式，避免闭包问题）
let currentPosRef = { x: 0, y: 0 }

// 生成贝塞尔曲线控制点
function generateBezierControlPoint(
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x: number; y: number } {
  const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2))
  // 偏移量与距离成正比，但有最大限制
  const randomOffset = Math.min(distance * 0.4, 100) * (Math.random() * 0.6 + 0.4)
  
  // 计算中点
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2
  
  // 计算垂直方向的单位向量
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.sqrt(dx * dx + dy * dy) || 1
  const perpX = -dy / length
  const perpY = dx / length
  
  // 在垂直方向上添加随机偏移（随机选择左侧或右侧）
  const side = Math.random() > 0.5 ? 1 : -1
  
  return {
    x: midX + perpX * randomOffset * side,
    y: midY + perpY * randomOffset * side
  }
}

// 二次贝塞尔曲线插值
function bezierInterpolate(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): { x: number; y: number } {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
  }
}

// 缓动函数：先快后慢
function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

export default function VirtualMouse() {
  const { mouseState } = useStore()
  const [position, setPosition] = useState({ x: -100, y: -100 })
  const [isClicking, setIsClicking] = useState(false)
  const animationRef = useRef<number>()
  const fidgetIntervalRef = useRef<number>()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const controlPointRef = useRef<{ x: number; y: number } | null>(null)
  const lastTargetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // 获取容器偏移
  useEffect(() => {
    containerRef.current = document.getElementById('browser-container') as HTMLDivElement
  }, [])

  // 生成随机乱动位置
  const generateFidgetPosition = useCallback((baseX: number, baseY: number, intensity: number, isPanic: boolean) => {
    // 获取容器尺寸，用于计算屏幕范围
    const container = containerRef.current
    const containerRect = container?.getBoundingClientRect() || { width: 800, height: 600 }
    
    if (isPanic) {
      // panic 模式：在当前位置附近快速乱动
      const range = 40 + Math.random() * 60
      const angle = Math.random() * Math.PI * 2
      return {
        x: baseX + Math.cos(angle) * range * intensity,
        y: baseY + Math.sin(angle) * range * intensity
      }
    } else {
      // fidget 模式（思考时）：在整个屏幕范围内大幅度随机移动
      // 模拟真人思考时鼠标在屏幕上漫无目的地移动
      const margin = 50  // 边距
      const randomX = margin + Math.random() * (containerRect.width - margin * 2)
      const randomY = margin + Math.random() * (containerRect.height - margin * 2)
      return { x: randomX, y: randomY }
    }
  }, [])

  // 平滑移动到目标位置（贝塞尔曲线）
  useEffect(() => {
    if (!mouseState.visible) return
    if (mouseState.mode !== 'normal') return  // 乱动模式下不执行正常移动

    // 获取容器的位置
    const container = containerRef.current
    const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 }
    
    // 目标位置
    const targetX = mouseState.x - containerRect.left
    const targetY = mouseState.y - containerRect.top
    
    // 检查目标是否改变
    if (Math.abs(targetX - lastTargetRef.current.x) < 1 && 
        Math.abs(targetY - lastTargetRef.current.y) < 1) {
      return // 目标没变，不需要移动
    }
    
    const startX = position.x < 0 ? targetX : position.x
    const startY = position.y < 0 ? targetY : position.y
    const startTime = Date.now()
    const duration = mouseState.duration || 300
    
    // 生成贝塞尔曲线控制点
    const start = { x: startX, y: startY }
    const end = { x: targetX, y: targetY }
    const control = generateBezierControlPoint(start, end)
    controlPointRef.current = control
    lastTargetRef.current = end

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // 使用缓动函数
      const eased = easeOutQuart(progress)
      
      // 贝塞尔曲线插值
      const pos = bezierInterpolate(eased, start, control, end)
      
      // 添加微小的随机抖动，模拟人手的不稳定
      const jitter = progress < 0.9 ? (Math.random() - 0.5) * 2 : 0
      
      setPosition({ 
        x: pos.x + jitter, 
        y: pos.y + jitter 
      })
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [mouseState.x, mouseState.y, mouseState.visible, mouseState.duration, mouseState.mode])

  // 同步位置到 ref（用于乱动模式读取最新位置）
  useEffect(() => {
    currentPosRef = { ...position }
  }, [position])

  // Fidget/Panic 乱动模式
  useEffect(() => {
    if (!mouseState.visible) return
    if (mouseState.mode === 'normal') {
      // 停止乱动
      if (fidgetIntervalRef.current) {
        clearTimeout(fidgetIntervalRef.current)
        fidgetIntervalRef.current = undefined
      }
      return
    }

    const isPanic = mouseState.mode === 'panic'
    const intensity = mouseState.fidgetIntensity
    
    // 获取容器的位置
    const container = containerRef.current
    const containerRect = container?.getBoundingClientRect() || { left: 0, top: 0 }
    
    // 基准位置
    const baseX = mouseState.baseX - containerRect.left
    const baseY = mouseState.baseY - containerRect.top

    let isActive = true

    // 连续移动函数：完成一次移动后自动开始下一次
    const continuousMove = () => {
      if (!isActive) return
      
      const newPos = generateFidgetPosition(baseX, baseY, intensity, isPanic)
      
      // 从当前实际位置开始（使用 ref 获取最新位置）
      const startPos = { ...currentPosRef }
      const startTime = Date.now()
      
      // panic 模式快速移动，fidget 模式慢速移动
      const moveDuration = isPanic ? 100 + Math.random() * 80 : 600 + Math.random() * 800
      
      const animateMove = () => {
        if (!isActive) return
        
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / moveDuration, 1)
        
        // 使用更平滑的缓动函数
        const eased = isPanic 
          ? progress  // panic 模式线性移动，更急促
          : easeOutQuart(progress)  // fidget 模式平滑移动
        
        const newX = startPos.x + (newPos.x - startPos.x) * eased
        const newY = startPos.y + (newPos.y - startPos.y) * eased
        
        setPosition({ x: newX, y: newY })
        currentPosRef = { x: newX, y: newY }
        
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animateMove)
        } else {
          // 动画完成，短暂停顿后开始下一次移动
          const pauseDuration = isPanic 
            ? 30 + Math.random() * 50  // panic 模式几乎不停顿
            : 200 + Math.random() * 500  // fidget 模式停顿一下再移动
          
          fidgetIntervalRef.current = window.setTimeout(continuousMove, pauseDuration)
        }
      }
      
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      animationRef.current = requestAnimationFrame(animateMove)
    }

    // 立即开始
    continuousMove()

    return () => {
      isActive = false
      if (fidgetIntervalRef.current) {
        clearTimeout(fidgetIntervalRef.current)
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [mouseState.mode, mouseState.fidgetIntensity, mouseState.visible, mouseState.baseX, mouseState.baseY, generateFidgetPosition])

  // 点击动画
  useEffect(() => {
    if (mouseState.clicking) {
      setIsClicking(true)
      const timer = setTimeout(() => setIsClicking(false), 150)
      return () => clearTimeout(timer)
    }
  }, [mouseState.clicking, mouseState.clickId])

  if (!mouseState.visible) return null

  // 鼠标尖端在 SVG 中的偏移（path 从 5.5, 3.21 开始）
  const tipOffsetX = 5.5
  const tipOffsetY = 3.21

  // 根据模式确定鼠标颜色
  const getMouseColor = () => {
    if (isClicking) return '#00cc66'
    if (mouseState.mode === 'panic') return '#ff6666'  // 紧张时变红
    if (mouseState.mode === 'fidget') return '#ffaa00'  // 思考时变橙
    return '#00ff88'  // 正常绿色
  }

  return (
    <div
      className="pointer-events-none absolute z-[99999] transition-opacity duration-200"
      style={{
        left: position.x - tipOffsetX,
        top: position.y - tipOffsetY,
        opacity: mouseState.visible ? 1 : 0,
      }}
    >
      {/* 鼠标光标 SVG */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        className={`drop-shadow-lg transition-transform duration-100 ${
          isClicking ? 'scale-90' : mouseState.mode === 'panic' ? 'scale-110' : 'scale-100'
        }`}
        style={{
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
          // 紧张模式下轻微旋转抖动
          transform: mouseState.mode === 'panic' 
            ? `rotate(${(Math.random() - 0.5) * 10}deg)` 
            : undefined,
        }}
      >
        {/* 鼠标主体 */}
        <path
          d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.76a.5.5 0 0 0-.85.45Z"
          fill={getMouseColor()}
          stroke="#000"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* 点击涟漪效果 */}
      {isClicking && (
        <div className="absolute left-0 top-0">
          <div className="w-6 h-6 rounded-full bg-primary/50 animate-ping" />
        </div>
      )}

      {/* 思考指示器 */}
      {mouseState.mode === 'fidget' && (
        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs text-yellow-500 whitespace-nowrap animate-pulse">
          思考中...
        </div>
      )}

      {/* 紧张指示器 */}
      {mouseState.mode === 'panic' && (
        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs text-red-500 whitespace-nowrap animate-bounce">
          !?
        </div>
      )}
    </div>
  )
}
