'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, UserPlus, ArrowLeft, Trash2, Edit2, X, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

interface ClubAdmin {
  id: string
  email: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface Club {
  id: string
  name: string
  slug: string
}

export default function ClubAdminsPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const clubId = params.id as string

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<ClubAdmin | null>(null)

  // Create form state
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Edit form state
  const [editAdminName, setEditAdminName] = useState('')
  const [editAdminPassword, setEditAdminPassword] = useState('')
  const [editAdminIsActive, setEditAdminIsActive] = useState(true)

  // Fetch club details
  const { data: club } = useQuery<Club>({
    queryKey: ['club', clubId],
    queryFn: async () => {
      const response = await api.get(`/clubs/${clubId}`)
      return response.data
    },
  })

  // Fetch club admins
  const { data: admins = [], isLoading } = useQuery<ClubAdmin[]>({
    queryKey: ['club-admins', clubId],
    queryFn: async () => {
      const response = await api.get(`/clubs/${clubId}/admins`)
      return response.data
    },
  })

  // Create admin mutation
  const createAdminMutation = useMutation({
    mutationFn: async (dto: { name: string; email: string; password: string }) => {
      const response = await api.post(`/clubs/${clubId}/admins`, dto)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-admins', clubId] })
      setIsCreateModalOpen(false)
      setNewAdminName('')
      setNewAdminEmail('')
      setNewAdminPassword('')
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao criar admin')
    },
  })

  // Update admin mutation
  const updateAdminMutation = useMutation({
    mutationFn: async ({ adminId, dto }: { adminId: string; dto: { name?: string; password?: string; isActive?: boolean } }) => {
      const response = await api.patch(`/clubs/${clubId}/admins/${adminId}`, dto)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-admins', clubId] })
      setIsEditModalOpen(false)
      setEditingAdmin(null)
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao atualizar admin')
    },
  })

  // Delete admin mutation
  const deleteAdminMutation = useMutation({
    mutationFn: async (adminId: string) => {
      const response = await api.delete(`/clubs/${clubId}/admins/${adminId}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-admins', clubId] })
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao remover admin')
    },
  })

  const handleCreateAdmin = () => {
    if (!newAdminName.trim() || !newAdminEmail.trim() || !newAdminPassword.trim()) {
      alert('Todos os campos são obrigatórios')
      return
    }
    if (newAdminPassword.length < 6) {
      alert('Senha deve ter no mínimo 6 caracteres')
      return
    }
    createAdminMutation.mutate({
      name: newAdminName,
      email: newAdminEmail,
      password: newAdminPassword,
    })
  }

  const handleEditAdmin = (admin: ClubAdmin) => {
    setEditingAdmin(admin)
    setEditAdminName(admin.name)
    setEditAdminPassword('')
    setEditAdminIsActive(admin.isActive)
    setIsEditModalOpen(true)
  }

  const handleUpdateAdmin = () => {
    if (!editingAdmin) return
    if (!editAdminName.trim()) {
      alert('Nome é obrigatório')
      return
    }
    const dto: { name?: string; password?: string; isActive?: boolean } = {
      name: editAdminName,
      isActive: editAdminIsActive,
    }
    if (editAdminPassword.trim()) {
      if (editAdminPassword.length < 6) {
        alert('Senha deve ter no mínimo 6 caracteres')
        return
      }
      dto.password = editAdminPassword
    }
    updateAdminMutation.mutate({ adminId: editingAdmin.id, dto })
  }

  const handleDeleteAdmin = (admin: ClubAdmin) => {
    if (confirm(`Tem certeza que deseja remover o admin "${admin.name}"?`)) {
      deleteAdminMutation.mutate(admin.id)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-radial">
      {/* Background decorative elements */}
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <Header
          title={`Administradores - ${club?.name || 'Carregando...'}`}
          description="Gerencie os administradores do clube"
        />

        <div className="p-6 space-y-6">
          {/* Back button */}
          <Link
            href="/clubs"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Voltar para clubes</span>
          </Link>

          {/* Actions bar */}
          <div className="glass-card p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-indigo-400" />
              <span className="text-white font-medium">
                {admins.length} {admins.length === 1 ? 'administrador' : 'administradores'}
              </span>
            </div>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white"
            >
              <UserPlus className="h-4 w-4" />
              Novo Admin
            </Button>
          </div>

          {/* Admins Table */}
          <div className="glass-card overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-white/10 bg-white/5">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Admin
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Email
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Criado em
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-400">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {admins.map((admin) => (
                      <tr key={admin.id} className="hover:bg-white/5 transition-colors">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-400 text-sm font-medium text-white">
                              {admin.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-white">{admin.name}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                          {admin.email}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                              admin.isActive
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${admin.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                            {admin.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                          {new Date(admin.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditAdmin(admin)}
                              className="gap-2 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteAdmin(admin)}
                              disabled={deleteAdminMutation.isPending}
                              className="gap-2 bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {admins.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <div className="p-4 rounded-full bg-white/5 mb-4">
                      <Shield className="h-12 w-12" />
                    </div>
                    <p>Nenhum admin cadastrado</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Crie um admin para permitir acesso ao painel do clube
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Criar Admin */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Criar Admin do Clube</h2>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Nome *
                  </label>
                  <Input
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                    placeholder="Nome do administrador"
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Email *
                  </label>
                  <Input
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="email@clube.com"
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Senha *
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCreateModalOpen(false)
                    setNewAdminName('')
                    setNewAdminEmail('')
                    setNewAdminPassword('')
                  }}
                  className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateAdmin}
                  disabled={createAdminMutation.isPending}
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white"
                >
                  {createAdminMutation.isPending ? 'Criando...' : 'Criar Admin'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Editar Admin */}
        {isEditModalOpen && editingAdmin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Editar Admin</h2>
                <button
                  onClick={() => {
                    setIsEditModalOpen(false)
                    setEditingAdmin(null)
                  }}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Nome *
                  </label>
                  <Input
                    value={editAdminName}
                    onChange={(e) => setEditAdminName(e.target.value)}
                    placeholder="Nome do administrador"
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={editingAdmin.email}
                    disabled
                    className="bg-white/5 border-white/10 text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Email não pode ser alterado
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Nova Senha (deixe em branco para manter)
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={editAdminPassword}
                      onChange={(e) => setEditAdminPassword(e.target.value)}
                      placeholder="Nova senha (opcional)"
                      className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">
                    Status
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={editAdminIsActive}
                        onChange={() => setEditAdminIsActive(true)}
                        className="w-4 h-4 text-indigo-500"
                      />
                      <span className="text-sm text-gray-300">Ativo</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!editAdminIsActive}
                        onChange={() => setEditAdminIsActive(false)}
                        className="w-4 h-4 text-indigo-500"
                      />
                      <span className="text-sm text-gray-300">Inativo</span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditModalOpen(false)
                    setEditingAdmin(null)
                  }}
                  className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleUpdateAdmin}
                  disabled={updateAdminMutation.isPending}
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white"
                >
                  {updateAdminMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
