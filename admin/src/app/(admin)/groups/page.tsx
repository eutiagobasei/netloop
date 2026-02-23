'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Search, Users, Trash2, UserPlus } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

interface Group {
  id: string
  name: string
  slug: string
  description: string | null
  isActive: boolean
  createdAt: string
  _count?: {
    members: number
    tags: number
  }
}

interface GroupsResponse {
  data: Group[]
}

interface UserData {
  id: string
  name: string
  email: string
}

interface UsersResponse {
  data: UserData[]
}

interface CreateGroupDto {
  name: string
  description?: string
}

interface AddMemberDto {
  userId: string
  role: 'ADMIN' | 'MEMBER'
}

export default function GroupsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [memberRole, setMemberRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER')

  const { data: groupsData, isLoading } = useQuery<GroupsResponse>({
    queryKey: ['groups'],
    queryFn: async () => {
      const response = await api.get('/groups')
      return response.data
    },
  })

  const { data: usersData } = useQuery<UsersResponse>({
    queryKey: ['users-for-groups'],
    queryFn: async () => {
      const response = await api.get('/users', { params: { limit: 100 } })
      return response.data
    },
    enabled: isAddMemberModalOpen,
  })

  const createGroupMutation = useMutation({
    mutationFn: async (dto: CreateGroupDto) => {
      const response = await api.post('/groups', dto)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setIsCreateModalOpen(false)
      setNewGroupName('')
      setNewGroupDescription('')
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao criar grupo')
    },
  })

  const addMemberMutation = useMutation({
    mutationFn: async ({ groupId, dto }: { groupId: string; dto: AddMemberDto }) => {
      const response = await api.post(`/groups/${groupId}/members`, dto)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setIsAddMemberModalOpen(false)
      setSelectedGroupId(null)
      setSelectedUserId('')
      setMemberRole('MEMBER')
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao adicionar membro')
    },
  })

  const groups = groupsData?.data || []
  const filteredGroups = groups.filter(
    (group) =>
      group.name.toLowerCase().includes(search.toLowerCase()) ||
      group.slug.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      alert('Nome do grupo é obrigatório')
      return
    }
    createGroupMutation.mutate({
      name: newGroupName,
      description: newGroupDescription || undefined,
    })
  }

  const handleAddMember = () => {
    if (!selectedGroupId || !selectedUserId) {
      alert('Selecione um usuário')
      return
    }
    addMemberMutation.mutate({
      groupId: selectedGroupId,
      dto: { userId: selectedUserId, role: memberRole },
    })
  }

  const openAddMemberModal = (groupId: string) => {
    setSelectedGroupId(groupId)
    setIsAddMemberModalOpen(true)
  }

  return (
    <div>
      <Header
        title="Grupos / Empresas Patrocinadoras"
        description="Gerencie grupos e suas tags oficiais"
      />

      <div className="p-6">
        {/* Barra de busca e botão criar */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar por nome ou slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Grupo
          </Button>
        </div>

        {/* Tabela de grupos */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Grupo
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Slug
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Membros
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Tags
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Criado em
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredGroups.map((group) => (
                      <tr key={group.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700">
                              <Building2 className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{group.name}</p>
                              {group.description && (
                                <p className="text-sm text-gray-500 truncate max-w-xs">
                                  {group.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {group.slug}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              group.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {group.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {group._count?.members ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {group._count?.tags ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {new Date(group.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAddMemberModal(group.id)}
                            className="gap-2"
                          >
                            <UserPlus className="h-4 w-4" />
                            Adicionar Membro
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredGroups.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <Building2 className="mb-3 h-12 w-12" />
                    <p>Nenhum grupo encontrado</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Criar Grupo */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">Criar Novo Grupo</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Nome do Grupo *
                </label>
                <Input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Ex: Empresa XYZ"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Descrição
                </label>
                <Input
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  placeholder="Descrição opcional"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateModalOpen(false)
                  setNewGroupName('')
                  setNewGroupDescription('')
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateGroup}
                disabled={createGroupMutation.isPending}
              >
                {createGroupMutation.isPending ? 'Criando...' : 'Criar Grupo'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Adicionar Membro */}
      {isAddMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">Adicionar Membro ao Grupo</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Usuário *
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Selecione um usuário</option>
                  {usersData?.data?.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Papel no Grupo *
                </label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as 'ADMIN' | 'MEMBER')}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="MEMBER">Membro</option>
                  <option value="ADMIN">Administrador do Grupo</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddMemberModalOpen(false)
                  setSelectedGroupId(null)
                  setSelectedUserId('')
                  setMemberRole('MEMBER')
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddMember}
                disabled={addMemberMutation.isPending}
              >
                {addMemberMutation.isPending ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
