'use client'

import { useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  UserPlus,
  Search,
  Upload,
  Download,
  X,
  AlertCircle,
  CheckCircle,
  Trash2,
  FileSpreadsheet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import * as XLSX from 'xlsx'

interface Member {
  id: string
  userId: string
  isAdmin: boolean
  joinedAt: string
  user: {
    id: string
    name: string
    email: string
    phone: string | null
  }
}

interface ClubDetails {
  id: string
  name: string
  members: Member[]
  _count: { members: number }
}

interface InviteItem {
  name: string
  phone: string
  company?: string
  companyDescription?: string
  email?: string
  isValid: boolean
  error?: string
}

interface ImportResult {
  created: number
  addedDirectly: number
  duplicates: number
  alreadyMembers: number
  errors: string[]
}

export default function ClubMembersPage() {
  const params = useParams()
  const clubId = params.id as string
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false)
  const [memberPhone, setMemberPhone] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberCompany, setMemberCompany] = useState('')

  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<InviteItem[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: club, isLoading } = useQuery<ClubDetails>({
    queryKey: ['club', clubId],
    queryFn: async () => {
      const response = await api.get(`/clubs/${clubId}`)
      return response.data
    },
  })

  const addMemberMutation = useMutation({
    mutationFn: async (dto: { phone: string; name: string; email?: string; company?: string }) => {
      const response = await api.post(`/clubs/${clubId}/members/by-phone`, dto)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
      setIsAddMemberModalOpen(false)
      setMemberPhone('')
      setMemberName('')
      setMemberEmail('')
      setMemberCompany('')
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao adicionar membro')
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.delete(`/clubs/${clubId}/members/${userId}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao remover membro')
    },
  })

  const importInvitesMutation = useMutation({
    mutationFn: async (invites: InviteItem[]) => {
      const response = await api.post(`/clubs/${clubId}/import-invites`, {
        invites: invites
          .filter((i) => i.isValid)
          .map(({ name, phone, company, companyDescription, email }) => ({
            name,
            phone: phone.replace(/\D/g, ''),
            company,
            companyDescription,
            email,
          })),
      })
      return response.data as ImportResult
    },
    onSuccess: (data) => {
      setImportResult(data)
      setImportPreview([])
      queryClient.invalidateQueries({ queryKey: ['club', clubId] })
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao importar convites')
    },
  })

  const filteredMembers = club?.members?.filter(
    (member) =>
      member.user.name.toLowerCase().includes(search.toLowerCase()) ||
      member.user.email.toLowerCase().includes(search.toLowerCase()) ||
      (member.user.phone && member.user.phone.includes(search))
  ) || []

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
          const email = String(arr[4] || '').trim()

          const isValid = name.length > 0 && validatePhone(phone)
          const error = !name ? 'Nome obrigatório' : !validatePhone(phone) ? 'Telefone inválido' : undefined

          return {
            name,
            phone,
            company: company || undefined,
            companyDescription: companyDescription || undefined,
            email: email || undefined,
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
      ['Nome', 'Empresa', 'Telefone', 'Descrição da Empresa', 'Email'],
      ['João Silva', 'Tech Corp', '11999999999', 'Empresa de tecnologia', 'joao@email.com'],
      ['Maria Santos', 'Design Lab', '21888888888', 'Estúdio de design', 'maria@email.com'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Membros')
    XLSX.writeFile(wb, 'modelo_importacao_membros.xlsx')
  }

  const handleImport = () => {
    const validInvites = importPreview.filter((i) => i.isValid)
    if (validInvites.length === 0) {
      alert('Nenhum registro válido para importar')
      return
    }
    importInvitesMutation.mutate(importPreview)
  }

  const closeImportModal = () => {
    setIsImportModalOpen(false)
    setImportPreview([])
    setImportResult(null)
  }

  const handleAddMember = () => {
    if (!memberPhone.trim() || !memberName.trim()) {
      alert('Nome e telefone são obrigatórios')
      return
    }
    addMemberMutation.mutate({
      phone: memberPhone,
      name: memberName,
      email: memberEmail || undefined,
      company: memberCompany || undefined,
    })
  }

  const handleRemoveMember = (userId: string, userName: string) => {
    if (confirm(`Tem certeza que deseja remover ${userName} do clube?`)) {
      removeMemberMutation.mutate(userId)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-radial">
      {/* Background decorative elements */}
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="border-b border-white/10 bg-dark-bg/80 backdrop-blur-xl">
          <div className="px-6 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 text-xl font-bold text-white shadow-lg">
                <Users className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Membros do Clube</h1>
                <p className="text-sm text-gray-400 mt-1">
                  Gerencie os membros e convites pendentes
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Actions bar */}
          <div className="glass-card p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="relative max-w-md flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por nome, email ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsImportModalOpen(true)}
                className="gap-2 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
              >
                <Upload className="h-4 w-4" />
                Importar
              </Button>
              <Button
                onClick={() => setIsAddMemberModalOpen(true)}
                className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white"
              >
                <UserPlus className="h-4 w-4" />
                Adicionar Membro
              </Button>
            </div>
          </div>

          {/* Members Table */}
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
                        Membro
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Email
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Telefone
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Entrada
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Papel
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-400">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-white/5 transition-colors">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-400 text-sm font-medium text-white">
                              {member.user.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-white">{member.user.name}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                          {member.user.email}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                          {member.user.phone || '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                          {new Date(member.joinedAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                              member.isAdmin
                                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                                : 'bg-white/10 text-gray-300 border border-white/20'
                            }`}
                          >
                            {member.isAdmin ? 'Admin' : 'Membro'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveMember(member.user.id, member.user.name)}
                            disabled={removeMemberMutation.isPending}
                            className="gap-2 bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredMembers.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <div className="p-4 rounded-full bg-white/5 mb-4">
                      <Users className="h-12 w-12" />
                    </div>
                    <p>Nenhum membro encontrado</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Adicionar Membro */}
        {isAddMemberModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md glass-card p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">Adicionar Membro</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Nome *
                  </label>
                  <Input
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="Nome completo"
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Telefone *
                  </label>
                  <Input
                    value={memberPhone}
                    onChange={(e) => setMemberPhone(e.target.value)}
                    placeholder="11999999999"
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Email
                  </label>
                  <Input
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Empresa
                  </label>
                  <Input
                    value={memberCompany}
                    onChange={(e) => setMemberCompany(e.target.value)}
                    placeholder="Nome da empresa"
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAddMemberModalOpen(false)
                    setMemberPhone('')
                    setMemberName('')
                    setMemberEmail('')
                    setMemberCompany('')
                  }}
                  className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleAddMember}
                  disabled={addMemberMutation.isPending}
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white"
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
                    {importResult.addedDirectly > 0 && (
                      <p>{importResult.addedDirectly} membros adicionados diretamente</p>
                    )}
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
                      isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'
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
                          <th className="text-left px-4 py-2 font-medium text-gray-400">Email</th>
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
                            <td className="px-4 py-2 text-gray-300">{item.email || '-'}</td>
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
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white"
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
