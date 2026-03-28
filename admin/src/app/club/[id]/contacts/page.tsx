'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Network, Search, Users, Share2, Tag } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'

interface ClubContact {
  id: string
  name: string
  phone: string | null
  email: string | null
  context: string | null
  tags: Array<{
    id: string
    name: string
    color: string | null
    type: string
    isVerified: boolean
  }>
  sharedBy: string[]
  isShared: boolean
}

interface ClubContactsResponse {
  totalMembers: number
  totalContacts: number
  uniqueContacts: number
  contacts: ClubContact[]
}

export default function ClubContactsPage() {
  const params = useParams()
  const clubId = params.id as string

  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery<ClubContactsResponse>({
    queryKey: ['club-contacts', clubId],
    queryFn: async () => {
      const response = await api.get(`/clubs/${clubId}/contacts`)
      return response.data
    },
  })

  const filteredContacts = data?.contacts?.filter(
    (contact) =>
      contact.name.toLowerCase().includes(search.toLowerCase()) ||
      (contact.email && contact.email.toLowerCase().includes(search.toLowerCase())) ||
      (contact.phone && contact.phone.includes(search)) ||
      contact.tags.some((tag) => tag.name.toLowerCase().includes(search.toLowerCase()))
  ) || []

  const stats = [
    {
      name: 'Total de Membros',
      value: data?.totalMembers || 0,
      icon: Users,
      color: 'from-blue-500 to-indigo-500',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
    },
    {
      name: 'Total de Contatos',
      value: data?.totalContacts || 0,
      icon: Network,
      color: 'from-indigo-500 to-purple-500',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/30',
    },
    {
      name: 'Contatos Únicos',
      value: data?.uniqueContacts || 0,
      icon: Share2,
      color: 'from-purple-500 to-pink-500',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
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
                <Network className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Contatos do Clube</h1>
                <p className="text-sm text-gray-400 mt-1">
                  Visualize os contatos agregados de todos os membros
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-3">
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

          {/* Search Bar */}
          <div className="glass-card p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por nome, email, telefone ou tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Contacts Table */}
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
                        Contato
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Telefone
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Email
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Tags
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                        Compartilhado por
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredContacts.map((contact) => (
                      <tr key={contact.id} className="hover:bg-white/5 transition-colors">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-400 text-sm font-medium text-white">
                              {contact.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-white">{contact.name}</p>
                              {contact.isShared && (
                                <span className="inline-flex items-center gap-1 text-xs text-indigo-400">
                                  <Share2 className="h-3 w-3" />
                                  Contato compartilhado
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                          {contact.phone || '-'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                          {contact.email || '-'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {contact.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag.id}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{
                                  backgroundColor: `${tag.color}20`,
                                  color: tag.color || '#6366f1',
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                            {contact.tags.length > 3 && (
                              <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-gray-400">
                                +{contact.tags.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {contact.sharedBy.slice(0, 2).map((name, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-gray-300"
                              >
                                {name}
                              </span>
                            ))}
                            {contact.sharedBy.length > 2 && (
                              <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-gray-400">
                                +{contact.sharedBy.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredContacts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <div className="p-4 rounded-full bg-white/5 mb-4">
                      <Network className="h-12 w-12" />
                    </div>
                    <p>Nenhum contato encontrado</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
