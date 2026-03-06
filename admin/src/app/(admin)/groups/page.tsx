'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Search, Users, Trash2, UserPlus, Upload, Download, FileSpreadsheet, X, AlertCircle, CheckCircle } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import * as XLSX from 'xlsx'

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

type GroupsResponse = Group[]

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

interface InviteItem {
  name: string
  phone: string
  company?: string
  companyDescription?: string
  isValid: boolean
  error?: string
}

interface ImportResult {
  created: number
  duplicates: number
  alreadyMembers: number
  errors: string[]
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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importGroupId, setImportGroupId] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<InviteItem[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: groups = [], isLoading } = useQuery<GroupsResponse>({
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

  const importInvitesMutation = useMutation({
    mutationFn: async ({ groupId, invites }: { groupId: string; invites: InviteItem[] }) => {
      const response = await api.post(`/groups/${groupId}/import-invites`, {
        invites: invites
          .filter((i) => i.isValid)
          .map(({ name, phone, company, companyDescription }) => ({
            name,
            phone: phone.replace(/\D/g, ''),
            company,
            companyDescription,
          })),
      })
      return response.data as ImportResult
    },
    onSuccess: (data) => {
      setImportResult(data)
      setImportPreview([])
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao importar convites')
    },
  })

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

  const openImportModal = (groupId: string) => {
    setImportGroupId(groupId)
    setImportPreview([])
    setImportResult(null)
    setIsImportModalOpen(true)
  }

  const closeImportModal = () => {
    setIsImportModalOpen(false)
    setImportGroupId(null)
    setImportPreview([])
    setImportResult(null)
  }

  const normalizePhone = (phone: string): string => {
    return phone?.toString().replace(/\D/g, '') || ''
  }

  const validatePhone = (phone: string): boolean => {
    const normalized = normalizePhone(phone)
    return normalized.length >= 10 && normalized.length <= 13
  }

  const parseSpreadsheet = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 })

        // Pula o cabeçalho se existir
        const rows = jsonData.slice(1).filter((row) => {
          return Array.isArray(row) && row.length > 0 && row[0]
        })

        const invites: InviteItem[] = rows.map((row) => {
          const arr = row as unknown[]
          const name = String(arr[0] || '').trim()
          const company = String(arr[1] || '').trim()
          const phone = normalizePhone(String(arr[2] || ''))
          const companyDescription = String(arr[3] || '').trim()

          const isValid = name.length > 0 && validatePhone(phone)
          const error = !name ? 'Nome obrigatório' : !validatePhone(phone) ? 'Telefone inválido' : undefined

          return {
            name,
            phone,
            company: company || undefined,
            companyDescription: companyDescription || undefined,
            isValid,
            error,
          }
        })

        setImportPreview(invites)
      } catch {
        alert('Erro ao ler o arquivo. Verifique se é um arquivo Excel ou CSV válido.')
      }
    }
    reader.readAsBinaryString(file)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      parseSpreadsheet(file)
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) {
        parseSpreadsheet(file)
      }
    },
    [parseSpreadsheet]
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const downloadTemplate = () => {
    const wsData = [
      ['Nome', 'Empresa', 'Número', 'Descrição da Empresa'],
      ['João Silva', 'Tech Corp', '11999999999', 'Empresa de tecnologia'],
      ['Maria Santos', 'Design Lab', '21888888888', 'Estúdio de design'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Convites')
    XLSX.writeFile(wb, 'modelo_importacao_membros.xlsx')
  }

  const handleImport = () => {
    if (!importGroupId) return
    const validInvites = importPreview.filter((i) => i.isValid)
    if (validInvites.length === 0) {
      alert('Nenhum registro válido para importar')
      return
    }
    importInvitesMutation.mutate({ groupId: importGroupId, invites: importPreview })
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
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openImportModal(group.id)}
                              className="gap-2"
                            >
                              <Upload className="h-4 w-4" />
                              Importar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAddMemberModal(group.id)}
                              className="gap-2"
                            >
                              <UserPlus className="h-4 w-4" />
                              Adicionar
                            </Button>
                          </div>
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

      {/* Modal Importar Planilha */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-3xl rounded-lg bg-white p-6 shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Importar Membros via Planilha
              </h2>
              <button onClick={closeImportModal} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Resultado da importação */}
            {importResult && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800">Importação concluída!</span>
                </div>
                <div className="text-sm text-green-700 space-y-1">
                  <p>{importResult.created} convites criados</p>
                  {importResult.duplicates > 0 && (
                    <p>{importResult.duplicates} duplicados (já existiam)</p>
                  )}
                  {importResult.alreadyMembers > 0 && (
                    <p>{importResult.alreadyMembers} já são membros</p>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="text-red-600">
                      <p>Erros:</p>
                      <ul className="list-disc list-inside">
                        {importResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <Button className="mt-4" onClick={closeImportModal}>
                  Fechar
                </Button>
              </div>
            )}

            {/* Upload area */}
            {!importResult && importPreview.length === 0 && (
              <div className="space-y-4">
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                  <p className="text-gray-600 mb-1">
                    Arraste um arquivo ou clique para selecionar
                  </p>
                  <p className="text-sm text-gray-400">
                    Formatos aceitos: .xlsx, .csv
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                <div className="flex items-center justify-center">
                  <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                    <Download className="h-4 w-4" />
                    Baixar modelo de planilha
                  </Button>
                </div>

                <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-lg">
                  <p className="font-medium mb-2">Estrutura esperada da planilha:</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1">Nome</th>
                        <th className="text-left py-1">Empresa</th>
                        <th className="text-left py-1">Número</th>
                        <th className="text-left py-1">Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-1">João Silva</td>
                        <td className="py-1">Tech Corp</td>
                        <td className="py-1">11999999999</td>
                        <td className="py-1">Empresa de tecnologia</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Preview da importação */}
            {!importResult && importPreview.length > 0 && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm">
                    <span className="text-green-600 font-medium">
                      {importPreview.filter((i) => i.isValid).length} válidos
                    </span>
                    {importPreview.filter((i) => !i.isValid).length > 0 && (
                      <span className="text-red-600 font-medium ml-3">
                        {importPreview.filter((i) => !i.isValid).length} inválidos
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setImportPreview([])
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  >
                    Limpar
                  </Button>
                </div>

                <div className="flex-1 overflow-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">Status</th>
                        <th className="text-left px-4 py-2 font-medium">Nome</th>
                        <th className="text-left px-4 py-2 font-medium">Empresa</th>
                        <th className="text-left px-4 py-2 font-medium">Telefone</th>
                        <th className="text-left px-4 py-2 font-medium">Descrição</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {importPreview.map((item, index) => (
                        <tr key={index} className={item.isValid ? '' : 'bg-red-50'}>
                          <td className="px-4 py-2">
                            {item.isValid ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <div className="flex items-center gap-1">
                                <AlertCircle className="h-4 w-4 text-red-500" />
                                <span className="text-xs text-red-600">{item.error}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2">{item.name || '-'}</td>
                          <td className="px-4 py-2">{item.company || '-'}</td>
                          <td className={`px-4 py-2 ${!validatePhone(item.phone) ? 'text-red-600' : ''}`}>
                            {item.phone || '-'}
                          </td>
                          <td className="px-4 py-2 max-w-xs truncate">
                            {item.companyDescription || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex justify-end gap-3">
                  <Button variant="outline" onClick={closeImportModal}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={importInvitesMutation.isPending || importPreview.filter((i) => i.isValid).length === 0}
                  >
                    {importInvitesMutation.isPending
                      ? 'Importando...'
                      : `Importar ${importPreview.filter((i) => i.isValid).length} registros`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
