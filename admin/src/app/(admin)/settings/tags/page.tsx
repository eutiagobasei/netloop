'use client'

import { useState } from 'react'
import {
  Tag as TagIcon,
  Plus,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  Loader2,
  Users,
  Building2,
} from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTags } from '@/hooks/use-tags'
import { useAuth } from '@/hooks/use-auth'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
]

export default function TagsPage() {
  const { isAdmin } = useAuth()
  const { tags, isLoading, createTag, isCreating, updateTag, isUpdating, deleteTag, isDeleting } = useTags()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3b82f6')
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const showSuccess = (message: string) => {
    setSuccessMessage(message)
    setErrorMessage(null)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const showError = (message: string) => {
    setErrorMessage(message)
    setSuccessMessage(null)
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      showError('Nome da tag é obrigatório')
      return
    }

    try {
      await createTag({ name: newTagName.trim(), color: newTagColor })
      setNewTagName('')
      showSuccess('Tag criada com sucesso!')
    } catch (error: any) {
      showError(error.response?.data?.message || 'Erro ao criar tag')
    }
  }

  const handleUpdateTag = async (id: string) => {
    if (!editName.trim()) {
      showError('Nome da tag é obrigatório')
      return
    }

    try {
      await updateTag({ id, data: { name: editName.trim(), color: editColor } })
      setEditingTag(null)
      showSuccess('Tag atualizada com sucesso!')
    } catch (error: any) {
      showError(error.response?.data?.message || 'Erro ao atualizar tag')
    }
  }

  const handleDeleteTag = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir a tag "${name}"?`)) return

    try {
      await deleteTag(id)
      showSuccess('Tag excluída com sucesso!')
    } catch (error: any) {
      showError(error.response?.data?.message || 'Erro ao excluir tag')
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
      <div className="min-h-screen bg-gradient-radial">
        <Header title="Tags" description="Carregando..." />
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-radial">
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <Header
          title="Tags"
          description="Gerencie as tags para categorizar seus contatos"
        />

        <div className="p-6 space-y-6">
          {successMessage && (
            <Alert variant="success" className="glass-card border-emerald-500/30 bg-emerald-500/10">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <AlertTitle className="text-emerald-400">Sucesso</AlertTitle>
              <AlertDescription className="text-emerald-300">{successMessage}</AlertDescription>
            </Alert>
          )}

          {errorMessage && (
            <Alert variant="destructive" className="glass-card border-red-500/30 bg-red-500/10">
              <XCircle className="h-4 w-4 text-red-400" />
              <AlertTitle className="text-red-400">Erro</AlertTitle>
              <AlertDescription className="text-red-300">{errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Criar Nova Tag */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-400" />
              Criar Nova Tag
            </h2>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label className="text-gray-300">Nome</Label>
                <Input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Ex: familia, trabalho, cliente"
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>

              <div>
                <Label className="text-gray-300">Cor</Label>
                <div className="flex gap-2 mt-1">
                  {PRESET_COLORS.slice(0, 8).map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewTagColor(color)}
                      className={`w-8 h-8 rounded-lg transition-all ${
                        newTagColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900' : ''
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
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Criar Tag
                </Button>
              </div>
            </div>
          </div>

          {/* Tags Livres */}
          <div className="glass-card p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TagIcon className="h-5 w-5 text-green-400" />
              Minhas Tags ({freeTags.length})
            </h2>

            {freeTags.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                Nenhuma tag criada ainda. Crie sua primeira tag acima!
              </p>
            ) : (
              <div className="grid gap-3">
                {freeTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    {editingTag === tag.id ? (
                      <div className="flex-1 flex items-center gap-3">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-white/5 border-white/10 text-white max-w-xs"
                        />
                        <div className="flex gap-1">
                          {PRESET_COLORS.slice(0, 8).map((color) => (
                            <button
                              key={color}
                              onClick={() => setEditColor(color)}
                              className={`w-6 h-6 rounded ${
                                editColor === color ? 'ring-2 ring-white' : ''
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleUpdateTag(tag.id)}
                          disabled={isUpdating}
                          className="bg-green-500 hover:bg-green-600"
                        >
                          {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingTag(null)}
                          className="border-white/10"
                        >
                          Cancelar
                        </Button>
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
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditing(tag)}
                            className="text-gray-400 hover:text-white"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteTag(tag.id, tag.name)}
                            disabled={isDeleting}
                            className="text-gray-400 hover:text-red-400"
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

          {/* Tags Institucionais - apenas para admin */}
          {isAdmin && institutionalTags.length > 0 && (
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-amber-400" />
                Tags de Grupos ({institutionalTags.length})
              </h2>

              <div className="grid gap-3">
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
    </div>
  )
}
