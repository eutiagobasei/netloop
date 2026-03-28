'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Search, Users, Trash2, UserPlus, Upload, Download, FileSpreadsheet, X, AlertCircle, CheckCircle } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import * as XLSX from 'xlsx'

interface Club {
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

type ClubsResponse = Club[]

interface UserData {
  id: string
  name: string
  email: string
}

interface UsersResponse {
  data: UserData[]
}

interface CreateClubDto {
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

export default function ClubsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false)
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)
  const [newClubName, setNewClubName] = useState('')
  const [newClubDescription, setNewClubDescription] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [memberRole, setMemberRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER')
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importClubId, setImportClubId] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<InviteItem[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: clubs = [], isLoading } = useQuery<ClubsResponse>({
    queryKey: ['clubs'],
    queryFn: async () => {
      const response = await api.get('/clubs')
      return response.data
    },
  })

  const { data: usersData } = useQuery<UsersResponse>({
    queryKey: ['users-for-clubs'],
    queryFn: async () => {
      const response = await api.get('/users', { params: { limit: 100 } })
      return response.data
    },
    enabled: isAddMemberModalOpen,
  })

  const createClubMutation = useMutation({
    mutationFn: async (dto: CreateClubDto) => {
      const response = await api.post('/clubs', dto)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      setIsCreateModalOpen(false)
      setNewClubName('')
      setNewClubDescription('')
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao criar grupo')
    },
  })

  const addMemberMutation = useMutation({
    mutationFn: async ({ clubId, dto }: { clubId: string; dto: AddMemberDto }) => {
      const response = await api.post(`/clubs/${clubId}/members`, dto)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs'] })
      setIsAddMemberModalOpen(false)
      setSelectedClubId(null)
      setSelectedUserId('')
      setMemberRole('MEMBER')
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao adicionar membro')
    },
  })

  const importInvitesMutation = useMutation({
    mutationFn: async ({ clubId, invites }: { clubId: string; invites: InviteItem[] }) => {
      const response = await api.post(`/clubs/${clubId}/import-invites`, {
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

  const filteredClubs = clubs.filter(
    (club) =>
      club.name.toLowerCase().includes(search.toLowerCase()) ||
      club.slug.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreateClub = () => {
    if (!newClubName.trim()) {
      alert('Nome do grupo é obrigatório')
      return
    }
    createClubMutation.mutate({
      name: newClubName,
      description: newClubDescription || undefined,
    })
  }

  const handleAddMember = () => {
    if (!selectedClubId || !selectedUserId) {
      alert('Selecione um usuário')
      return
    }
    addMemberMutation.mutate({
      clubId: selectedClubId,
      dto: { userId: selectedUserId, role: memberRole },
    })
  }

  const openAddMemberModal = (clubId: string) => {
    setSelectedClubId(clubId)
    setIsAddMemberModalOpen(true)
  }

  const openImportModal = (clubId: string) => {
    setImportClubId(clubId)
    setImportPreview([])
    setImportResult(null)
    setIsImportModalOpen(true)
  }

  const closeImportModal = () => {
    setIsImportModalOpen(false)
    setImportClubId(null)
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
    if (!importClubId) return
    const validInvites = importPreview.filter((i) => i.isValid)
    if (validInvites.length === 0) {
      alert('Nenhum registro válido para importar')
      return
    }
    importInvitesMutation.mutate({ clubId: importClubId, invites: importPreview })
  }

  return (
    <div className="min-h-screen bg-gradient-radial">
      {/* Background decorative elements */}
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <Header
          title="Clubes / Empresas Patrocinadoras"
          description="Gerencie clubes e suas tags oficiais"
        />

        <div className="p-6 space-y-6">
          {/* Barra de busca e botão criar */}
          <div className="glass-card p-4 flex items-center justify-between gap-4">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por nome ou slug..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
              />
            </div>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white"
            >
              <Plus className="h-4 w-4" />
              Novo Clube
            </Button>
          </div>

          {/* Tabela de clubes */}
          <div className="glass-card overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-white/10 bg-white/5">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Clube
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Slug
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Membros
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Tags
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
                    {filteredClubs.map((club) => (
                      <tr key={club.id} className="hover:bg-white/5 transition-colors">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-400 text-sm font-medium text-white shadow-lg glow-purple">
                              <Building2 className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium text-white">{club.name}</p>
                              {club.description && (
                                <p className="text-sm text-gray-400 truncate max-w-xs">
                                  {club.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-gray-400 bg-white/5 px-2 py-1 rounded font-mono">
                            {club.slug}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                              club.isActive
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${club.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                            {club.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-gray-300 bg-white/5 px-2 py-1 rounded">
                            {club._count?.members ?? 0}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-gray-300 bg-white/5 px-2 py-1 rounded">
                            {club._count?.tags ?? 0}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                          {new Date(club.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openImportModal(club.id)}
                              className="gap-2 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                            >
                              <Upload className="h-4 w-4" />
                              Importar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAddMemberModal(club.id)}
                              className="gap-2 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
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

                {filteredClubs.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <div className="p-4 rounded-full bg-white/5 mb-4">
                      <Building2 className="h-12 w-12" />
                    </div>
                    <p>Nenhum grupo encontrado</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Criar Clube */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md glass-card p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">Criar Novo Clube</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Nome do Clube *
                  </label>
                  <Input
                    value={newClubName}
                    onChange={(e) => setNewClubName(e.target.value)}
                    placeholder="Ex: Empresa XYZ"
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Descrição
                  </label>
                  <Input
                    value={newClubDescription}
                    onChange={(e) => setNewClubDescription(e.target.value)}
                    placeholder="Descrição opcional"
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsCreateModalOpen(false)
                    setNewClubName('')
                    setNewClubDescription('')
                  }}
                  className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateClub}
                  disabled={createClubMutation.isPending}
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white"
                >
                  {createClubMutation.isPending ? 'Criando...' : 'Criar Clube'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Adicionar Membro */}
        {isAddMemberModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md glass-card p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">Adicionar Membro ao Clube</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Usuário *
                  </label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  >
                    <option value="" className="bg-gray-900">Selecione um usuário</option>
                    {usersData?.data?.map((user) => (
                      <option key={user.id} value={user.id} className="bg-gray-900">
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Papel no Clube *
                  </label>
                  <select
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value as 'ADMIN' | 'MEMBER')}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/20"
                  >
                    <option value="MEMBER" className="bg-gray-900">Membro</option>
                    <option value="ADMIN" className="bg-gray-900">Administrador do Clube</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddMemberModalOpen(false)
                    setSelectedClubId(null)
                    setSelectedUserId('')
                    setMemberRole('MEMBER')
                  }}
                  className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleAddMember}
                  disabled={addMemberMutation.isPending}
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white"
                >
                  {addMemberMutation.isPending ? 'Adicionando...' : 'Adicionar'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Importar Planilha */}
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-3xl glass-card p-6 max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Importar Membros via Planilha
                </h2>
                <button onClick={closeImportModal} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              {/* Resultado da importação */}
              {importResult && (
                <div className="mb-4 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                    <span className="font-medium text-emerald-300">Importação concluída!</span>
                  </div>
                  <div className="text-sm text-emerald-400 space-y-1">
                    <p>{importResult.created} convites criados</p>
                    {importResult.duplicates > 0 && (
                      <p>{importResult.duplicates} duplicados (já existiam)</p>
                    )}
                    {importResult.alreadyMembers > 0 && (
                      <p>{importResult.alreadyMembers} já são membros</p>
                    )}
                    {importResult.errors.length > 0 && (
                      <div className="text-red-400">
                        <p>Erros:</p>
                        <ul className="list-disc list-inside">
                          {importResult.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <Button className="mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white" onClick={closeImportModal}>
                    Fechar
                  </Button>
                </div>
              )}

              {/* Upload area */}
              {!importResult && importPreview.length === 0 && (
                <div className="space-y-4">
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                      isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-12 w-12 mx-auto text-gray-500 mb-3" />
                    <p className="text-gray-300 mb-1">
                      Arraste um arquivo ou clique para selecionar
                    </p>
                    <p className="text-sm text-gray-500">
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
                    <Button
                      variant="outline"
                      onClick={downloadTemplate}
                      className="gap-2 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                    >
                      <Download className="h-4 w-4" />
                      Baixar modelo de planilha
                    </Button>
                  </div>

                  <div className="text-sm text-gray-400 bg-white/5 p-4 rounded-xl border border-white/10">
                    <p className="font-medium mb-2 text-gray-300">Estrutura esperada da planilha:</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-1 text-gray-400">Nome</th>
                          <th className="text-left py-1 text-gray-400">Empresa</th>
                          <th className="text-left py-1 text-gray-400">Número</th>
                          <th className="text-left py-1 text-gray-400">Descrição</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="py-1 text-gray-300">João Silva</td>
                          <td className="py-1 text-gray-300">Tech Corp</td>
                          <td className="py-1 text-gray-300">11999999999</td>
                          <td className="py-1 text-gray-300">Empresa de tecnologia</td>
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
                      <span className="text-emerald-400 font-medium">
                        {importPreview.filter((i) => i.isValid).length} válidos
                      </span>
                      {importPreview.filter((i) => !i.isValid).length > 0 && (
                        <span className="text-red-400 font-medium ml-3">
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
                      className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                    >
                      Limpar
                    </Button>
                  </div>

                  <div className="flex-1 overflow-auto border border-white/10 rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-white/5 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium text-gray-400">Status</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-400">Nome</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-400">Empresa</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-400">Telefone</th>
                          <th className="text-left px-4 py-2 font-medium text-gray-400">Descrição</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {importPreview.map((item, index) => (
                          <tr key={index} className={item.isValid ? '' : 'bg-red-500/10'}>
                            <td className="px-4 py-2">
                              {item.isValid ? (
                                <CheckCircle className="h-4 w-4 text-emerald-400" />
                              ) : (
                                <div className="flex items-center gap-1">
                                  <AlertCircle className="h-4 w-4 text-red-400" />
                                  <span className="text-xs text-red-400">{item.error}</span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-gray-300">{item.name || '-'}</td>
                            <td className="px-4 py-2 text-gray-300">{item.company || '-'}</td>
                            <td className={`px-4 py-2 ${!validatePhone(item.phone) ? 'text-red-400' : 'text-gray-300'}`}>
                              {item.phone || '-'}
                            </td>
                            <td className="px-4 py-2 max-w-xs truncate text-gray-300">
                              {item.companyDescription || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={closeImportModal}
                      className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleImport}
                      disabled={importInvitesMutation.isPending || importPreview.filter((i) => i.isValid).length === 0}
                      className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white"
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
    </div>
  )
}
