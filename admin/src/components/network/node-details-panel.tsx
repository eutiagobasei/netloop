'use client'

import { X, Building2, Briefcase, Tag, Users, FileText, Phone, Mail, MapPin } from 'lucide-react'
import { GraphNode } from '@/lib/api'

interface NodeDetailsPanelProps {
  node: GraphNode | null
  onClose: () => void
}

const DEGREE_LABELS = {
  0: 'Voce',
  1: '1o Nivel - Conexao Direta',
  2: '2o Nivel - Conexao Indireta',
}

const DEGREE_COLORS = {
  0: 'bg-green-100 text-green-800',
  1: 'bg-blue-100 text-blue-800',
  2: 'bg-gray-100 text-gray-800',
}

export function NodeDetailsPanel({ node, onClose }: NodeDetailsPanelProps) {
  if (!node) return null

  const degreeLabel = DEGREE_LABELS[node.degree as keyof typeof DEGREE_LABELS] || `${node.degree}o Nivel`
  const degreeColor = DEGREE_COLORS[node.degree as keyof typeof DEGREE_COLORS] || 'bg-gray-100 text-gray-800'

  return (
    <div className="absolute right-0 top-0 h-full w-80 border-l border-white/10 bg-dark-card shadow-xl z-50">
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <h3 className="font-semibold text-white">Detalhes</h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 hover:bg-white/10 text-gray-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100%-60px)]">
        <div>
          <h4 className="text-lg font-semibold text-white">{node.name}</h4>
          <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            node.degree === 0 ? 'bg-green-500/20 text-green-400' :
            node.degree === 1 ? 'bg-blue-500/20 text-blue-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            <Users className="mr-1 h-3 w-3" />
            {degreeLabel}
          </span>
        </div>

        {node.company && (
          <div className="flex items-start gap-2">
            <Building2 className="h-4 w-4 mt-0.5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-400">Empresa</p>
              <p className="text-sm text-gray-200">{node.company}</p>
            </div>
          </div>
        )}

        {node.position && (
          <div className="flex items-start gap-2">
            <Briefcase className="h-4 w-4 mt-0.5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-400">Cargo</p>
              <p className="text-sm text-gray-200">{node.position}</p>
            </div>
          </div>
        )}

        {node.phone && (
          <div className="flex items-start gap-2">
            <Phone className="h-4 w-4 mt-0.5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-400">Telefone</p>
              <p className="text-sm text-gray-200">{node.phone}</p>
            </div>
          </div>
        )}

        {node.email && (
          <div className="flex items-start gap-2">
            <Mail className="h-4 w-4 mt-0.5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-400">Email</p>
              <p className="text-sm text-gray-200">{node.email}</p>
            </div>
          </div>
        )}

        {node.location && (
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 mt-0.5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-400">Localização</p>
              <p className="text-sm text-gray-200">{node.location}</p>
            </div>
          </div>
        )}

        {node.context && (
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-400">Contexto</p>
              <p className="text-sm text-gray-200 whitespace-pre-line">{node.context}</p>
            </div>
          </div>
        )}

        {node.description && (
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-400">Descricao</p>
              <p className="text-sm text-gray-200">{node.description}</p>
            </div>
          </div>
        )}

        {node.tags && node.tags.length > 0 && (
          <div className="flex items-start gap-2">
            <Tag className="h-4 w-4 mt-0.5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-400">Tags</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {node.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: tag.color ? `${tag.color}30` : 'rgba(255,255,255,0.1)',
                      color: tag.color || '#9ca3af',
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {node.isShared && node.sharedByUsers && node.sharedByUsers.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-amber-400" />
              <p className="text-sm font-semibold text-amber-300">Contato em Comum</p>
            </div>
            <p className="text-sm text-amber-200">
              {node.sharedByUsers.map((u) => u.name).join(', ')}{' '}
              {node.sharedByUsers.length === 1 ? 'também conhece' : 'também conhecem'} este contato
            </p>
          </div>
        )}

        {node.type === 'user' && node.degree === 0 && (
          <div className="mt-6 rounded-lg bg-green-500/10 border border-green-500/20 p-3">
            <p className="text-sm text-green-300">
              Este e voce! O centro da sua rede de conexoes.
            </p>
          </div>
        )}

        {node.type === 'mentioned' && (
          <div className="mt-6 rounded-lg bg-white/5 border border-white/10 p-3">
            <p className="text-sm text-gray-300">
              Esta pessoa foi mencionada por um dos seus contatos diretos.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
