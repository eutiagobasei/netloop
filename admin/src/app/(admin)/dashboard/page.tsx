'use client'

import { Users, Contact, MessageSquare, Network } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useStats } from '@/hooks/use-settings'

const statCards = [
  {
    title: 'Usuários',
    key: 'totalUsers' as const,
    icon: Users,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    title: 'Contatos',
    key: 'totalContacts' as const,
    icon: Contact,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    title: 'Mensagens',
    key: 'totalMessages' as const,
    icon: MessageSquare,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    title: 'Conexões',
    key: 'totalConnections' as const,
    icon: Network,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
]

export default function DashboardPage() {
  const { stats, isLoading } = useStats()

  return (
    <div>
      <Header
        title="Dashboard"
        description="Visão geral do sistema NetLoop"
      />

      <div className="p-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => (
            <Card key={stat.key}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  {stat.title}
                </CardTitle>
                <div className={`rounded-full p-2 ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
                ) : (
                  <p className="text-2xl font-bold">
                    {stats?.[stat.key]?.toLocaleString('pt-BR') || 0}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <a
                href="/settings/api-keys"
                className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
              >
                <div className="rounded-full bg-blue-100 p-2">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">API Keys</p>
                  <p className="text-sm text-gray-500">
                    Configure OpenAI e Anthropic
                  </p>
                </div>
              </a>
              <a
                href="/settings/evolution"
                className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
              >
                <div className="rounded-full bg-green-100 p-2">
                  <MessageSquare className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Evolution API</p>
                  <p className="text-sm text-gray-500">
                    Configure integração WhatsApp
                  </p>
                </div>
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status do Sistema</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">API Backend</span>
                  <span className="flex items-center gap-2 text-sm font-medium text-green-600">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Online
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Banco de Dados</span>
                  <span className="flex items-center gap-2 text-sm font-medium text-green-600">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Conectado
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Versão</span>
                  <span className="text-sm font-medium">1.0.0</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
