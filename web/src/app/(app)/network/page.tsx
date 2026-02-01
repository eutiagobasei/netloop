'use client'

import { useState } from 'react'
import { useConnections } from '@/hooks/use-connections'
import { NetworkGraph } from '@/components/network/network-graph'
import { NodeDetailsPanel } from '@/components/network/node-details-panel'
import { GraphNode } from '@/lib/api'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NetworkPage() {
  const { graph, isLoading, refetch } = useConnections(2)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node)
  }

  const handleClosePanel = () => {
    setSelectedNode(null)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent mx-auto" />
          <p className="mt-4 text-gray-600">Carregando sua rede...</p>
        </div>
      </div>
    )
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">Nenhuma conexao encontrada</p>
          <p className="mt-2 text-gray-600">
            Comece adicionando contatos e criando conexoes para visualizar sua rede.
          </p>
        </div>
      </div>
    )
  }

  const stats = {
    total: graph.nodes.length - 1,
    firstDegree: graph.nodes.filter((n) => n.degree === 1).length,
    secondDegree: graph.nodes.filter((n) => n.degree === 2).length,
  }

  return (
    <div className="relative h-full">
      {/* Header com estatísticas */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-4">
        <div className="rounded-lg bg-white p-3 shadow-md">
          <h2 className="text-sm font-medium text-gray-500">Minha Rede</h2>
          <p className="text-2xl font-bold text-gray-900">{stats.total} conexoes</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="bg-white"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Legenda */}
      <div className="absolute left-4 bottom-4 z-10 rounded-lg bg-white p-3 shadow-md">
        <p className="text-xs font-medium text-gray-500 mb-2">Legenda</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full bg-green-500" />
            <span className="text-xs text-gray-600">Voce</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-3.5 rounded-full bg-blue-500" />
            <span className="text-xs text-gray-600">1º Nivel ({stats.firstDegree})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-gray-500" />
            <span className="text-xs text-gray-600">2º Nivel ({stats.secondDegree})</span>
          </div>
        </div>
      </div>

      {/* Grafo */}
      <NetworkGraph
        data={graph}
        onNodeClick={handleNodeClick}
        selectedNodeId={selectedNode?.id}
      />

      {/* Painel de detalhes */}
      {selectedNode && (
        <NodeDetailsPanel node={selectedNode} onClose={handleClosePanel} />
      )}
    </div>
  )
}
