'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { GraphData, GraphNode } from '@/lib/api'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
})

interface NetworkGraphProps {
  data: GraphData
  onNodeClick?: (node: GraphNode) => void
  selectedNodeId?: string | null
}

const NODE_COLORS = {
  0: '#10B981', // Verde - Você
  1: '#3B82F6', // Azul - 1º nível
  2: '#6B7280', // Cinza - 2º nível
}

const NODE_SIZES = {
  0: 24,
  1: 16,
  2: 12,
}

const EDGE_COLORS = {
  STRONG: '#10B981',
  MODERATE: '#3B82F6',
  WEAK: '#9CA3AF',
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
      fgRef.current.d3Force('charge')?.strength(-300)
      fgRef.current.d3Force('link')?.distance(100)

      setTimeout(() => {
        fgRef.current?.zoomToFit(400, 50)
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

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const degree = node.degree as number
      const color = NODE_COLORS[degree as keyof typeof NODE_COLORS] || '#9CA3AF'
      const size = NODE_SIZES[degree as keyof typeof NODE_SIZES] || 10
      const isSelected = node.id === selectedNodeId

      // Círculo do nó
      ctx.beginPath()
      ctx.arc(node.x, node.y, size / 2, 0, 2 * Math.PI, false)
      ctx.fillStyle = color
      ctx.fill()

      // Borda se selecionado
      if (isSelected) {
        ctx.strokeStyle = '#1F2937'
        ctx.lineWidth = 3
        ctx.stroke()
      }

      // Label
      const label = degree === 0 ? 'Você' : node.name
      const fontSize = Math.max(10 / globalScale, 3)
      ctx.font = `${fontSize}px Sans-Serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#374151'
      ctx.fillText(label, node.x, node.y + size / 2 + 2)
    },
    [selectedNodeId]
  )

  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D) => {
      const strength = link.strength as keyof typeof EDGE_COLORS
      const color = EDGE_COLORS[strength] || EDGE_COLORS.MODERATE
      const width = EDGE_WIDTHS[strength] || EDGE_WIDTHS.MODERATE

      ctx.beginPath()
      ctx.moveTo(link.source.x, link.source.y)
      ctx.lineTo(link.target.x, link.target.y)
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.stroke()
    },
    []
  )

  return (
    <div ref={containerRef} className="h-full w-full">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeCanvasObject={nodeCanvasObject}
        linkCanvasObject={linkCanvasObject}
        onNodeClick={handleNodeClick}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const size = NODE_SIZES[node.degree as keyof typeof NODE_SIZES] || 10
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(node.x, node.y, size / 2 + 5, 0, 2 * Math.PI, false)
          ctx.fill()
        }}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        cooldownTicks={100}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 50)}
      />
    </div>
  )
}
