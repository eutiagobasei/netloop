'use client'

import { X, Building2, Briefcase, Tag, Users } from 'lucide-react'
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
    <div className="absolute right-0 top-0 h-full w-80 border-l bg-white shadow-lg">
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="font-semibold text-gray-900">Detalhes</h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <h4 className="text-lg font-semibold text-gray-900">{node.name}</h4>
          <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${degreeColor}`}>
            <Users className="mr-1 h-3 w-3" />
            {degreeLabel}
          </span>
        </div>

        {node.company && (
          <div className="flex items-start gap-2">
            <Building2 className="h-4 w-4 mt-0.5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Empresa</p>
              <p className="text-sm text-gray-600">{node.company}</p>
            </div>
          </div>
        )}

        {node.position && (
          <div className="flex items-start gap-2">
            <Briefcase className="h-4 w-4 mt-0.5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Cargo</p>
              <p className="text-sm text-gray-600">{node.position}</p>
            </div>
          </div>
        )}

        {node.tags && node.tags.length > 0 && (
          <div className="flex items-start gap-2">
            <Tag className="h-4 w-4 mt-0.5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Tags</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {node.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: tag.color ? `${tag.color}20` : '#E5E7EB',
                      color: tag.color || '#374151',
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {node.type === 'user' && node.degree === 0 && (
          <div className="mt-6 rounded-lg bg-green-50 p-3">
            <p className="text-sm text-green-800">
              Este e voce! O centro da sua rede de conexoes.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
