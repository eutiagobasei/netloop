'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Users, Eye, Search, Shield, User } from 'lucide-react'
import Cookies from 'js-cookie'
import { Header } from '@/components/layout/header'
import { Card, CardContent } from '@/components/ui/card'
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

// O portal do usuário está em /network dentro do próprio admin

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
      // Salvar informações da impersonação em localStorage (para a nova aba poder ler)
      const impersonationData = {
        accessToken: data.accessToken,
        userId: data.impersonating.id,
        userName: data.impersonating.name,
        userEmail: data.impersonating.email,
        adminId: data.admin.id,
        adminName: data.admin.name,
      }

      // Salvar no localStorage para a nova aba poder usar
      localStorage.setItem('impersonationData', JSON.stringify(impersonationData))

      // Abrir em nova aba - a nova aba vai ler do localStorage e configurar os cookies
      window.open('/network?impersonate=true', '_blank')
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
    <div>
      <Header
        title="Usuários"
        description="Gerencie e visualize os portais dos usuários"
      />

      <div className="p-6">
        {/* Barra de busca */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Tabela de usuários */}
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
                        Usuário
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Contatos
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
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{user.name}</p>
                              <p className="text-sm text-gray-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              user.role === 'ADMIN'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
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
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              user.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {user.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {user._count?.contacts ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          {user.role === 'USER' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleImpersonate(user)}
                              disabled={impersonateMutation.isPending}
                              className="gap-2"
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
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <Users className="mb-3 h-12 w-12" />
                    <p>Nenhum usuário encontrado</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Paginação */}
        {data?.meta && data.meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Mostrando {filteredUsers.length} de {data.meta.total} usuários
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                disabled={page === data.meta.totalPages}
              >
                Próximo
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
