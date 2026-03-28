'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Cookies from 'js-cookie'
import { Building2, Users, Network, Calendar, CheckCircle, Clock } from 'lucide-react'
import { api } from '@/lib/api'

interface ClubAdminInfo {
  id: string
  email: string
  name: string
  clubId: string
  clubName: string
  clubSlug: string
  role: 'CLUB_ADMIN'
}

interface ClubDetails {
  id: string
  name: string
  slug: string
  description: string | null
  isActive: boolean
  isVerified: boolean
  color: string | null
  createdAt: string
  _count: {
    members: number
  }
  members: Array<{
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
  }>
  tags: Array<{
    id: string
    name: string
    color: string | null
    isVerified: boolean
  }>
}

export default function ClubDashboardPage() {
  const params = useParams()
  const clubId = params.id as string

  const [clubAdmin, setClubAdmin] = useState<ClubAdminInfo | null>(null)

  useEffect(() => {
    const clubAdminInfoStr = Cookies.get('clubAdminInfo')
    if (clubAdminInfoStr) {
      try {
        setClubAdmin(JSON.parse(clubAdminInfoStr))
      } catch {}
    }
  }, [])

  const { data: club, isLoading } = useQuery<ClubDetails>({
    queryKey: ['club', clubId],
    queryFn: async () => {
      const response = await api.get(`/clubs/${clubId}`)
      return response.data
    },
    enabled: !!clubId,
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  const stats = [
    {
      name: 'Total de Membros',
      value: club?._count?.members || 0,
      icon: Users,
      color: 'from-blue-500 to-indigo-500',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
    },
    {
      name: 'Status',
      value: club?.isActive ? 'Ativo' : 'Inativo',
      icon: club?.isActive ? CheckCircle : Clock,
      color: club?.isActive ? 'from-emerald-500 to-teal-500' : 'from-yellow-500 to-orange-500',
      bgColor: club?.isActive ? 'bg-emerald-500/10' : 'bg-yellow-500/10',
      borderColor: club?.isActive ? 'border-emerald-500/30' : 'border-yellow-500/30',
    },
  ]

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
                <Building2 className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white">{club?.name}</h1>
                  {club?.isVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-400 border border-indigo-500/30">
                      <CheckCircle className="h-3 w-3" />
                      Verificado
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  {club?.description || 'Painel de administração do clube'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.name}
                className={`glass-card p-6 border ${stat.borderColor}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">{stat.name}</p>
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Members */}
          <div className="glass-card overflow-hidden">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-400" />
                Membros Recentes
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-white/10 bg-white/5">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      Telefone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                      Entrada
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {club?.members?.slice(0, 5).map((member) => (
                    <tr key={member.id} className="hover:bg-white/5 transition-colors">
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-400 text-xs font-medium text-white">
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
                    </tr>
                  ))}
                  {(!club?.members || club.members.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                        Nenhum membro encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Club Info */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-400" />
                Informações do Clube
              </h3>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-400">Slug</dt>
                  <dd className="text-sm text-white font-mono bg-white/5 px-2 py-0.5 rounded">{club?.slug}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-400">Criado em</dt>
                  <dd className="text-sm text-white">
                    {club?.createdAt ? new Date(club.createdAt).toLocaleDateString('pt-BR') : '-'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-400">Cor da Tag</dt>
                  <dd className="flex items-center gap-2">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: club?.color || '#6366f1' }}
                    />
                    <span className="text-sm text-white font-mono">{club?.color || '#6366f1'}</span>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-400" />
                Tags Institucionais
              </h3>
              <div className="flex flex-wrap gap-2">
                {club?.tags?.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      borderColor: `${tag.color}50`,
                      color: tag.color || '#6366f1',
                    }}
                  >
                    {tag.isVerified && <CheckCircle className="h-3 w-3" />}
                    {tag.name}
                  </span>
                ))}
                {(!club?.tags || club.tags.length === 0) && (
                  <span className="text-sm text-gray-500">Nenhuma tag</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
