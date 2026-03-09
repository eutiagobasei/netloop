'use client'

import { Users, Contact, MessageSquare, Network, Key, Zap, Server, Database, CheckCircle } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { useStats } from '@/hooks/use-settings'

const statCards = [
  {
    title: 'Usuários',
    key: 'totalUsers' as const,
    icon: Users,
    gradient: 'from-blue-500 to-cyan-400',
    glowColor: 'glow-blue',
    bgGradient: 'bg-gradient-to-br from-blue-500/20 to-cyan-500/10',
  },
  {
    title: 'Contatos',
    key: 'totalContacts' as const,
    icon: Contact,
    gradient: 'from-green-500 to-emerald-400',
    glowColor: 'glow-green',
    bgGradient: 'bg-gradient-to-br from-green-500/20 to-emerald-500/10',
  },
  {
    title: 'Mensagens',
    key: 'totalMessages' as const,
    icon: MessageSquare,
    gradient: 'from-purple-500 to-pink-400',
    glowColor: 'glow-purple',
    bgGradient: 'bg-gradient-to-br from-purple-500/20 to-pink-500/10',
  },
  {
    title: 'Conexões',
    key: 'totalConnections' as const,
    icon: Network,
    gradient: 'from-orange-500 to-amber-400',
    glowColor: 'glow-orange',
    bgGradient: 'bg-gradient-to-br from-orange-500/20 to-amber-500/10',
  },
]

const quickSettings = [
  {
    title: 'API Keys',
    description: 'Configure OpenAI e Anthropic',
    href: '/settings/api-keys',
    icon: Key,
    gradient: 'from-blue-500 to-indigo-500',
  },
  {
    title: 'Evolution API',
    description: 'Configure integração WhatsApp',
    href: '/settings/evolution',
    icon: Zap,
    gradient: 'from-green-500 to-emerald-500',
  },
]

const systemStatus = [
  {
    label: 'API Backend',
    status: 'Online',
    icon: Server,
    isOnline: true,
  },
  {
    label: 'Banco de Dados',
    status: 'Conectado',
    icon: Database,
    isOnline: true,
  },
]

export default function DashboardPage() {
  const { stats, isLoading } = useStats()

  return (
    <div className="min-h-screen bg-gradient-radial">
      {/* Background decorative elements */}
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <Header
          title="Dashboard"
          description="Visão geral do sistema NetLoop"
        />

        <div className="p-6 space-y-8">
          {/* Stats Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {statCards.map((stat) => (
              <div
                key={stat.key}
                className={`glass-stat-card cursor-pointer ${stat.bgGradient}`}
              >
                {/* Decorative background circles */}
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-xl" />
                <div className="absolute -right-2 -bottom-2 w-16 h-16 bg-white/5 rounded-full blur-lg" />

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-gray-400">
                      {stat.title}
                    </span>
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg ${stat.glowColor}`}>
                      <stat.icon className="h-5 w-5 text-white" />
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="h-10 w-24 animate-pulse rounded-lg bg-white/10" />
                  ) : (
                    <p className="text-3xl font-bold tracking-tight text-white">
                      {stats?.[stat.key]?.toLocaleString('pt-BR') || 0}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle className="h-3 w-3" />
                      Atualizado
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Section */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Quick Settings */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Configurações Rápidas
              </h2>
              <div className="space-y-3">
                {quickSettings.map((setting) => (
                  <a
                    key={setting.href}
                    href={setting.href}
                    className="group flex items-center gap-4 rounded-xl border border-white/5 bg-white/5 p-4 transition-all duration-300 hover:bg-white/10 hover:border-white/10"
                  >
                    <div className={`p-3 rounded-xl bg-gradient-to-br ${setting.gradient} shadow-lg transition-transform group-hover:scale-110`}>
                      <setting.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-white group-hover:text-blue-400 transition-colors">
                        {setting.title}
                      </p>
                      <p className="text-sm text-gray-500">
                        {setting.description}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* System Status */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Status do Sistema
              </h2>
              <div className="space-y-4">
                {systemStatus.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white/10">
                        <item.icon className="h-4 w-4 text-gray-400" />
                      </div>
                      <span className="text-sm text-gray-400">{item.label}</span>
                    </div>
                    <span className={`flex items-center gap-2 text-sm font-medium ${item.isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                      <span className={`h-2 w-2 rounded-full ${item.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      {item.status}
                    </span>
                  </div>
                ))}

                {/* Version */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5">
                  <span className="text-sm text-gray-400">Versão</span>
                  <span className="text-sm font-mono font-medium text-white bg-white/10 px-2 py-1 rounded">
                    v1.0.0
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer info */}
          <div className="text-center text-xs text-gray-600 py-4">
            <p>NetLoop Admin Dashboard • Powered by Next.js</p>
          </div>
        </div>
      </div>
    </div>
  )
}
