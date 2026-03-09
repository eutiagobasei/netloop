'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Users, Eye, Search, Shield, User } from 'lucide-react'
import Cookies from 'js-cookie'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

interface UserData {
  id: string
  name: string
  email: string
  phone: string | null
  role: 'ADMIN' | 'USER'
  isActive: boolean
  createdAt: string
  _count?: {
    contacts: number
  }
}

interface UsersResponse {
  data: UserData[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

interface ImpersonateResponse {
  accessToken: string
  impersonating: {
    id: string
    name: string
    email: string
  }
  admin: {
    id: string
    name: string
  }
}

export default function UsersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: ['users', page],
    queryFn: async () => {
      const response = await api.get('/users', { params: { page, limit: 20 } })
      return response.data
    },
  })

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.post<ImpersonateResponse>(`/auth/impersonate/${userId}`)
      return response.data
    },
    onSuccess: (data) => {
      const impersonationData = {
        accessToken: data.accessToken,
        userId: data.impersonating.id,
        userName: data.impersonating.name,
        userEmail: data.impersonating.email,
        adminId: data.admin.id,
        adminName: data.admin.name,
      }
      localStorage.setItem('impersonationData', JSON.stringify(impersonationData))
      window.open('/impersonate', '_blank')
    },
    onError: (error: any) => {
      alert(error.response?.data?.message || 'Erro ao impersonar usuário')
    },
  })

  const filteredUsers = data?.data?.filter(
    (user) =>
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
  ) || []

  const handleImpersonate = (user: UserData) => {
    if (confirm(`Você será redirecionado para visualizar o portal como ${user.name}. Deseja continuar?`)) {
      impersonateMutation.mutate(user.id)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-radial">
      {/* Background decorative elements */}
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <Header
          title="Usuários"
          description="Gerencie e visualize os portais dos usuários"
        />

        <div className="p-6 space-y-6">
          {/* Barra de busca */}
          <div className="glass-card p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Tabela de usuários */}
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
                        Usuário
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Role
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Contatos
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
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-white/5 transition-colors">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-sm font-medium text-white shadow-lg glow-blue">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-white">{user.name}</p>
                              <p className="text-sm text-gray-400">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                              user.role === 'ADMIN'
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            }`}
                          >
                            {user.role === 'ADMIN' ? (
                              <Shield className="h-3 w-3" />
                            ) : (
                              <User className="h-3 w-3" />
                            )}
                            {user.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                              user.isActive
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${user.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                            {user.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className="text-sm text-gray-300 bg-white/5 px-2 py-1 rounded">
                            {user._count?.contacts ?? '-'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                          {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          {user.role === 'USER' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleImpersonate(user)}
                              disabled={impersonateMutation.isPending}
                              className="gap-2 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                            >
                              <Eye className="h-4 w-4" />
                              Ver como
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredUsers.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <div className="p-4 rounded-full bg-white/5 mb-4">
                      <Users className="h-12 w-12" />
                    </div>
                    <p>Nenhum usuário encontrado</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Paginação */}
          {data?.meta && data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between glass-card p-4">
              <p className="text-sm text-gray-400">
                Mostrando {filteredUsers.length} de {data.meta.total} usuários
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                  disabled={page === data.meta.totalPages}
                  className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  Próximo
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
