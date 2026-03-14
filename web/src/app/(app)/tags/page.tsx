'use client'

import { useState } from 'react'
import {
  Tag as TagIcon,
  Plus,
  Trash2,
  Edit2,
  Loader2,
  Users,
  Building2,
  Check,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTags } from '@/hooks/use-tags'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
]

export default function TagsPage() {
  const { tags, isLoading, createTag, isCreating, updateTag, isUpdating, deleteTag, isDeleting } = useTags()
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3b82f6')
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 3000)
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      showNotification('error', 'Nome da tag e obrigatorio')
      return
    }

    try {
      await createTag({ name: newTagName.trim(), color: newTagColor })
      setNewTagName('')
      showNotification('success', 'Tag criada com sucesso!')
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao criar tag'
      showNotification('error', message)
    }
  }

  const handleUpdateTag = async (id: string) => {
    if (!editName.trim()) {
      showNotification('error', 'Nome da tag e obrigatorio')
      return
    }

    try {
      await updateTag({ id, data: { name: editName.trim(), color: editColor } })
      setEditingTag(null)
      showNotification('success', 'Tag atualizada com sucesso!')
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao atualizar tag'
      showNotification('error', message)
    }
  }

  const handleDeleteTag = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir a tag "${name}"?`)) return

    try {
      await deleteTag(id)
      showNotification('success', 'Tag excluida com sucesso!')
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao excluir tag'
      showNotification('error', message)
    }
  }

  const startEditing = (tag: { id: string; name: string; color: string | null }) => {
    setEditingTag(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color || '#3b82f6')
  }

  const freeTags = tags?.filter(t => t.type === 'FREE') || []
  const institutionalTags = tags?.filter(t => t.type === 'INSTITUTIONAL') || []

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Tags</h1>
          <p className="text-gray-400 mt-1">Gerencie as tags para categorizar seus contatos</p>
        </div>

        {/* Notification */}
        {notification && (
          <div
            className={`rounded-lg p-4 ${
              notification.type === 'success'
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/20 border border-red-500/30 text-red-300'
            }`}
          >
            {notification.message}
          </div>
        )}

        {/* Create New Tag */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary-400" />
            Criar Nova Tag
          </h2>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="text-sm text-gray-400 mb-1 block">Nome</label>
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Ex: familia, trabalho, cliente"
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">Cor</label>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.slice(0, 8).map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className={`w-7 h-7 rounded-lg transition-all ${
                      newTagColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-end">
              <Button
                onClick={handleCreateTag}
                disabled={isCreating}
                className="bg-primary-500 hover:bg-primary-600 text-white"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Criar
              </Button>
            </div>
          </div>
        </div>

        {/* Free Tags */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TagIcon className="h-5 w-5 text-green-400" />
            Minhas Tags ({freeTags.length})
          </h2>

          {freeTags.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              Nenhuma tag criada ainda. Crie sua primeira tag acima!
            </p>
          ) : (
            <div className="space-y-2">
              {freeTags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                >
                  {editingTag === tag.id ? (
                    <div className="flex-1 flex items-center gap-3 flex-wrap">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-white/5 border-white/10 text-white max-w-[200px]"
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateTag(tag.id)}
                      />
                      <div className="flex gap-1">
                        {PRESET_COLORS.slice(0, 8).map((color) => (
                          <button
                            key={color}
                            onClick={() => setEditColor(color)}
                            className={`w-5 h-5 rounded ${
                              editColor === color ? 'ring-2 ring-white' : ''
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => handleUpdateTag(tag.id)}
                          disabled={isUpdating}
                          className="bg-green-500 hover:bg-green-600 h-8 w-8 p-0"
                        >
                          {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingTag(null)}
                          className="text-gray-400 h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
                          style={{
                            backgroundColor: tag.color ? `${tag.color}30` : 'rgba(255,255,255,0.1)',
                            color: tag.color || '#9ca3af',
                          }}
                        >
                          {tag.name}
                        </span>
                        <span className="text-sm text-gray-500 flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {tag._count?.contacts || 0} contatos
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditing(tag)}
                          className="text-gray-400 hover:text-white h-8 w-8 p-0"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteTag(tag.id, tag.name)}
                          disabled={isDeleting}
                          className="text-gray-400 hover:text-red-400 h-8 w-8 p-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Institutional Tags */}
        {institutionalTags.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-amber-400" />
              Tags de Grupos ({institutionalTags.length})
            </h2>

            <div className="space-y-2">
              {institutionalTags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-amber-500/20"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
                      style={{
                        backgroundColor: tag.color ? `${tag.color}30` : 'rgba(251, 191, 36, 0.2)',
                        color: tag.color || '#fbbf24',
                      }}
                    >
                      {tag.name}
                    </span>
                    {tag.group && (
                      <span className="text-sm text-gray-500">
                        Grupo: {tag.group.name}
                      </span>
                    )}
                    <span className="text-sm text-gray-500 flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {tag._count?.contacts || 0} contatos
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
