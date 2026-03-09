'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { GraphData, GraphNode } from '@/lib/api'

const ForceGraph2D = dynamic(
  async () => {
    const mod = await import('react-force-graph-2d')
    return mod.default || mod
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    ),
  }
)

interface NetworkGraphProps {
  data: GraphData
  onNodeClick?: (node: GraphNode) => void
  selectedNodeId?: string | null
}

// Cores vibrantes para dark mode
const NODE_COLORS = {
  0: '#22c55e', // Verde brilhante - Você
  1: '#3b82f6', // Azul - 1o nivel
  2: '#6366f1', // Indigo - 2o nivel
}

const NODE_GLOW_COLORS = {
  0: 'rgba(34, 197, 94, 0.4)',
  1: 'rgba(59, 130, 246, 0.3)',
  2: 'rgba(99, 102, 241, 0.2)',
}

const NODE_SIZES = {
  0: 28,
  1: 18,
  2: 12,
}

const EDGE_COLORS = {
  STRONG: '#22c55e',
  MODERATE: '#3b82f6',
  WEAK: '#4b5563',
}

const EDGE_WIDTHS = {
  STRONG: 3,
  MODERATE: 2,
  WEAK: 1,
}

export function NetworkGraph({ data, onNodeClick, selectedNodeId }: NetworkGraphProps) {
  const fgRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    if (fgRef.current && data.nodes.length > 0) {
      fgRef.current.d3Force('charge')?.strength(-400)
      fgRef.current.d3Force('link')?.distance(120)

      setTimeout(() => {
        fgRef.current?.zoomToFit(400, 80)
      }, 500)
    }
  }, [data])

  const graphData = {
    nodes: data.nodes.map((node) => ({
      ...node,
      val: NODE_SIZES[node.degree as keyof typeof NODE_SIZES] || 10,
    })),
    links: data.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      strength: edge.strength,
    })),
  }

  const handleNodeClick = useCallback(
    (node: any) => {
      if (onNodeClick) {
        onNodeClick(node as GraphNode)
      }
    },
    [onNodeClick]
  )

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node ? node.id : null)
  }, [])

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      // Skip if node position not yet calculated
      if (node.x === undefined || node.y === undefined || !isFinite(node.x) || !isFinite(node.y)) {
        return
      }

      const degree = node.degree as number
      const nodeType = node.type as string
      const color = NODE_COLORS[degree as keyof typeof NODE_COLORS] || '#6366f1'
      const glowColor = NODE_GLOW_COLORS[degree as keyof typeof NODE_GLOW_COLORS] || 'rgba(99, 102, 241, 0.2)'
      const size = NODE_SIZES[degree as keyof typeof NODE_SIZES] || 10
      const isSelected = node.id === selectedNodeId
      const isHovered = node.id === hoveredNode

      // Glow effect para todos os nós
      const gradient = ctx.createRadialGradient(
        node.x, node.y, size / 4,
        node.x, node.y, size * 1.5
      )
      gradient.addColorStop(0, glowColor)
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(node.x, node.y, size * 1.5, 0, 2 * Math.PI)
      ctx.fill()

      // Círculo principal com gradiente
      const nodeGradient = ctx.createRadialGradient(
        node.x - size / 4, node.y - size / 4, 0,
        node.x, node.y, size / 2
      )
      nodeGradient.addColorStop(0, lightenColor(color, 30))
      nodeGradient.addColorStop(1, color)

      ctx.beginPath()
      ctx.arc(node.x, node.y, size / 2, 0, 2 * Math.PI, false)
      ctx.fillStyle = nodeGradient
      ctx.fill()

      // Borda sutil
      ctx.strokeStyle = lightenColor(color, 20)
      ctx.lineWidth = 1
      ctx.stroke()

      // Anel para contatos em comum (dourado brilhante)
      if (node.isShared) {
        // Glow do anel
        ctx.beginPath()
        ctx.arc(node.x, node.y, size / 2 + 5, 0, 2 * Math.PI, false)
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)'
        ctx.lineWidth = 6
        ctx.stroke()

        // Anel principal
        ctx.beginPath()
        ctx.arc(node.x, node.y, size / 2 + 4, 0, 2 * Math.PI, false)
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 2.5
        ctx.stroke()

        // Badge com count
        if (node.sharedByCount && node.sharedByCount > 0) {
          const badgeX = node.x + size / 2 + 2
          const badgeY = node.y - size / 2 - 2
          const badgeRadius = 8

          // Sombra do badge
          ctx.beginPath()
          ctx.arc(badgeX, badgeY, badgeRadius + 1, 0, 2 * Math.PI, false)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
          ctx.fill()

          // Badge
          ctx.beginPath()
          ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI, false)
          ctx.fillStyle = '#f59e0b'
          ctx.fill()

          ctx.font = `bold 9px Inter, system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = '#FFFFFF'
          ctx.fillText(String(node.sharedByCount), badgeX, badgeY)
        }
      }

      // Highlight quando hover ou selecionado
      if (isSelected || isHovered) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, size / 2 + (node.isShared ? 8 : 4), 0, 2 * Math.PI, false)
        ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'
        ctx.lineWidth = isSelected ? 3 : 2
        ctx.stroke()
      }

      // Label
      if (degree === 0 || (degree === 1 && nodeType !== 'mentioned') || isHovered) {
        const label = degree === 0 ? 'Você' : node.name
        const fontSize = Math.max(11 / globalScale, 4)

        ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'

        // Sombra do texto
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
        ctx.fillText(label, node.x + 0.5, node.y + size / 2 + (node.isShared ? 8 : 4) + 0.5)

        // Texto principal
        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, node.x, node.y + size / 2 + (node.isShared ? 8 : 4))
      }
    },
    [selectedNodeId, hoveredNode]
  )

  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D) => {
      // Skip if positions not yet calculated
      if (!link.source || !link.target ||
          !isFinite(link.source.x) || !isFinite(link.source.y) ||
          !isFinite(link.target.x) || !isFinite(link.target.y)) {
        return
      }

      const strength = link.strength as keyof typeof EDGE_COLORS
      const color = EDGE_COLORS[strength] || EDGE_COLORS.MODERATE
      const width = EDGE_WIDTHS[strength] || EDGE_WIDTHS.MODERATE

      // Linha com gradiente de opacidade
      const gradient = ctx.createLinearGradient(
        link.source.x, link.source.y,
        link.target.x, link.target.y
      )
      gradient.addColorStop(0, color + '80')
      gradient.addColorStop(0.5, color + 'cc')
      gradient.addColorStop(1, color + '80')

      ctx.beginPath()
      ctx.moveTo(link.source.x, link.source.y)
      ctx.lineTo(link.target.x, link.target.y)
      ctx.strokeStyle = gradient
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.stroke()
    },
    []
  )

  return (
    <div ref={containerRef} className="h-full w-full bg-dark-bg">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#0a0a0a"
        nodeCanvasObject={nodeCanvasObject}
        linkCanvasObject={linkCanvasObject}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const size = NODE_SIZES[node.degree as keyof typeof NODE_SIZES] || 10
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(node.x, node.y, size / 2 + 8, 0, 2 * Math.PI, false)
          ctx.fill()
        }}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        cooldownTicks={100}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 80)}
      />
    </div>
  )
}

// Helper para clarear cor
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = Math.min(255, (num >> 16) + amt)
  const G = Math.min(255, ((num >> 8) & 0x00FF) + amt)
  const B = Math.min(255, (num & 0x0000FF) + amt)
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`
}
