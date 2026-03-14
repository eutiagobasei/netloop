'use client'

import { useState, useEffect } from 'react'
import { X, Building2, Briefcase, Tag as TagIcon, Users, FileText, Phone, Mail, MapPin, Edit2, Check, Plus } from 'lucide-react'
import { GraphNode, Tag } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useTags } from '@/hooks/use-tags'
import { useContacts } from '@/hooks/use-contacts'

interface NodeDetailsPanelProps {
  node: GraphNode | null
  onClose: () => void
  onTagsUpdated?: () => void
}

const DEGREE_LABELS = {
  0: 'Voce',
  1: '1 Nivel - Conexao Direta',
  2: '2 Nivel - Conexao Indireta',
}

const DEGREE_COLORS = {
  0: 'bg-green-100 text-green-800',
  1: 'bg-blue-100 text-blue-800',
  2: 'bg-gray-100 text-gray-800',
}

export function NodeDetailsPanel({ node, onClose, onTagsUpdated }: NodeDetailsPanelProps) {
  const { tags: allTags } = useTags()
  const { updateContact, isUpdating } = useContacts()
  const [isEditingTags, setIsEditingTags] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  useEffect(() => {
    if (node?.tags) {
      setSelectedTagIds(node.tags.map(t => t.id))
    } else {
      setSelectedTagIds([])
    }
    setIsEditingTags(false)
  }, [node?.id, node?.tags])

  if (!node) return null

  const degreeLabel = DEGREE_LABELS[node.degree as keyof typeof DEGREE_LABELS] || `${node.degree} Nivel`
  const degreeColor = DEGREE_COLORS[node.degree as keyof typeof DEGREE_COLORS] || 'bg-gray-100 text-gray-800'

  const canEditTags = node.type === 'contact' && node.degree === 1
  const freeTags = allTags?.filter(t => t.type === 'FREE') || []

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  const handleSaveTags = async () => {
    try {
      await updateContact({
        id: node.id,
        data: { tagIds: selectedTagIds },
      })
      setIsEditingTags(false)
      onTagsUpdated?.()
    } catch (error) {
      console.error('Erro ao atualizar tags:', error)
    }
  }

  const handleCancelEdit = () => {
    setSelectedTagIds(node.tags?.map(t => t.id) || [])
    setIsEditingTags(false)
  }

  return (
    <div className="absolute right-0 top-0 h-full w-80 border-l bg-white shadow-lg overflow-y-auto">
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="font-semibold text-gray-900">Detalhes</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
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

        {node.phone && (
          <div className="flex items-start gap-2">
            <Phone className="h-4 w-4 mt-0.5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Telefone</p>
              <p className="text-sm text-gray-600">{node.phone}</p>
            </div>
          </div>
        )}

        {node.email && (
          <div className="flex items-start gap-2">
            <Mail className="h-4 w-4 mt-0.5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Email</p>
              <p className="text-sm text-gray-600">{node.email}</p>
            </div>
          </div>
        )}

        {node.location && (
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 mt-0.5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Localizacao</p>
              <p className="text-sm text-gray-600">{node.location}</p>
            </div>
          </div>
        )}

        {node.context && (
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Contexto</p>
              <p className="text-sm text-gray-600 whitespace-pre-line">{node.context}</p>
            </div>
          </div>
        )}

        {node.description && (
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 mt-0.5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Descricao</p>
              <p className="text-sm text-gray-600 whitespace-pre-line">{node.description}</p>
            </div>
          </div>
        )}

        {/* Tags Section */}
        <div className="flex items-start gap-2">
          <TagIcon className="h-4 w-4 mt-0.5 text-gray-400" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">Tags</p>
              {canEditTags && !isEditingTags && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingTags(true)}
                  className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              )}
            </div>

            {isEditingTags ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {freeTags.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.id)}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-all ${
                          isSelected
                            ? 'ring-2 ring-offset-1'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                        style={{
                          backgroundColor: tag.color ? `${tag.color}20` : '#E5E7EB',
                          color: tag.color || '#374151',
                          '--tw-ring-color': tag.color || '#374151',
                        } as React.CSSProperties & { '--tw-ring-color': string }}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 mr-1" />}
                        {tag.name}
                      </button>
                    )
                  })}
                </div>
                {freeTags.length === 0 && (
                  <p className="text-xs text-gray-500">
                    Nenhuma tag disponivel. Crie tags na pagina de Tags.
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    onClick={handleSaveTags}
                    disabled={isUpdating}
                    className="bg-green-500 hover:bg-green-600 text-white text-xs h-7"
                  >
                    {isUpdating ? 'Salvando...' : 'Salvar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelEdit}
                    className="text-gray-500 text-xs h-7"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {node.tags && node.tags.length > 0 ? (
                  node.tags.map((tag) => (
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
                  ))
                ) : (
                  <span className="text-xs text-gray-400">
                    {canEditTags ? 'Clique no icone para adicionar tags' : 'Sem tags'}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {node.isShared && node.sharedByUsers && node.sharedByUsers.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">Contato em Comum</p>
            </div>
            <p className="text-sm text-amber-700">
              {node.sharedByUsers.map((u) => u.name).join(', ')}{' '}
              {node.sharedByUsers.length === 1 ? 'tambem conhece' : 'tambem conhecem'} este contato
            </p>
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
