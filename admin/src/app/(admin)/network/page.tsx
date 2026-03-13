'use client'

import { useState, useEffect } from 'react'
import Cookies from 'js-cookie'
import { useConnections } from '@/hooks/use-connections'
import { NetworkGraph } from '@/components/network/network-graph'
import { NodeDetailsPanel } from '@/components/network/node-details-panel'
import { ImpersonationBanner } from '@/components/impersonation-banner'
import { GraphNode } from '@/lib/api'
import { RefreshCw, Users, UserPlus, Share2 } from 'lucide-react'

export default function NetworkPage() {
  const [impersonation, setImpersonation] = useState<{
    isImpersonating: boolean
    userName?: string
  }>({ isImpersonating: false })

  // Verificar se está em modo impersonação
  useEffect(() => {
    const impersonatingCookie = Cookies.get('impersonating')
    if (impersonatingCookie) {
      try {
        const data = JSON.parse(impersonatingCookie)
        setImpersonation({
          isImpersonating: true,
          userName: data.userName,
        })
      } catch (e) {
        // Ignorar erro
      }
    }
  }, [])

  const handleExitImpersonation = () => {
    // Limpar cookies de impersonação
    Cookies.remove('accessToken')
    Cookies.remove('impersonating')

    // Fechar a aba
    window.close()
  }

  const { graph, isLoading, refetch } = useConnections(2)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  const handleNodeClick = (node: GraphNode) => {
    alert(`Clicou em: ${node.name} (${node.degree}º nível)`)
    setSelectedNode(node)
  }

  const handleClosePanel = () => {
    setSelectedNode(null)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-dark-bg">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent mx-auto" />
          <p className="mt-4 text-gray-400">Carregando sua rede...</p>
        </div>
      </div>
    )
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-dark-bg">
        <div className="text-center max-w-md">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-primary-400" />
          </div>
          <p className="text-xl font-semibold text-white mb-2">Nenhuma conexão encontrada</p>
          <p className="text-gray-400">
            Comece adicionando contatos e criando conexões para visualizar sua rede.
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
    <div className="relative h-full flex flex-col bg-dark-bg">
      {/* Banner de impersonação */}
      {impersonation.isImpersonating && impersonation.userName && (
        <ImpersonationBanner
          userName={impersonation.userName}
          onExit={handleExitImpersonation}
        />
      )}

      <div className="relative flex-1 overflow-hidden">
        {/* Header com estatísticas */}
        <div className="absolute left-4 top-4 z-10 flex items-center gap-3">
          {/* Card principal */}
          <div className="rounded-xl bg-white/5 backdrop-blur-md border border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
                <Share2 className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h2 className="text-sm font-medium text-gray-400">Minha Rede</h2>
                <p className="text-2xl font-bold text-white">{stats.total} <span className="text-base font-normal text-gray-400">conexões</span></p>
              </div>
            </div>
          </div>

          {/* Botão atualizar */}
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 px-4 py-3 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white transition-all"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>

        {/* Legenda */}
        <div className="absolute left-4 bottom-4 z-10 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Legenda</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 rounded-full bg-green-500 shadow-lg shadow-green-500/30" />
              <span className="text-sm text-gray-300">Você</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 rounded-full bg-blue-500 shadow-lg shadow-blue-500/30" />
              </div>
              <span className="text-sm text-gray-300">1º Nível <span className="text-gray-500">({stats.firstDegree})</span></span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/30" />
              <span className="text-sm text-gray-300">2º Nível <span className="text-gray-500">({stats.secondDegree})</span></span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-3.5 w-3.5 rounded-full border-2 border-amber-400 bg-blue-500 shadow-lg shadow-amber-400/30" />
              <span className="text-sm text-gray-300">Contato em Comum</span>
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
    </div>
  )
}
