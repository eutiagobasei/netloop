'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Key,
  MessageSquare,
  LogOut,
  Network,
  ChevronDown,
  Shield,
  User,
  Users,
  Brain,
  Building2,
  Sparkles,
  Tag,
  Smartphone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'

type Environment = 'admin' | 'user'

const adminNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Usuários', href: '/users', icon: Users },
  { name: 'Clubes', href: '/clubs', icon: Building2 },
  { name: 'API Keys', href: '/settings/api-keys', icon: Key },
  { name: 'WhatsApp', href: '/settings/whatsapp', icon: Smartphone },
  { name: 'Evolution API', href: '/settings/evolution', icon: MessageSquare },
  { name: 'Prompts IA', href: '/settings/prompts', icon: Brain },
]

const userNavigation = [
  { name: 'Minha Rede', href: '/network', icon: Network },
  { name: 'Loop', href: '/loop', icon: Sparkles },
  { name: 'Tags', href: '/settings/tags', icon: Tag },
]

const environments = [
  { id: 'admin' as Environment, name: 'Admin', icon: Shield, badge: 'Admin' },
  { id: 'user' as Environment, name: 'Minha Rede', icon: User, badge: null },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { logout, user } = useAuth()
  const [environment, setEnvironment] = useState<Environment>('admin')
  const [isEnvDropdownOpen, setIsEnvDropdownOpen] = useState(false)

  // Detectar ambiente baseado na rota atual
  useEffect(() => {
    if (pathname.startsWith('/network') || pathname.startsWith('/loop')) {
      setEnvironment('user')
    } else {
      setEnvironment('admin')
    }
  }, [pathname])

  const handleEnvironmentChange = (env: Environment) => {
    setEnvironment(env)
    setIsEnvDropdownOpen(false)

    // Redirecionar para a pagina principal do ambiente
    if (env === 'admin') {
      router.push('/dashboard')
    } else {
      router.push('/network')
    }
  }

  const navigation = environment === 'admin' ? adminNavigation : userNavigation
  const currentEnv = environments.find(e => e.id === environment)!

  return (
    <div className="flex h-full w-64 flex-col border-r border-white/10 bg-dark-bg">
      {/* Header com logo */}
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <div className="flex items-center gap-2">
          <Network className="h-6 w-6 text-primary-500" />
          <h1 className="text-xl font-bold text-white">NetLoop</h1>
        </div>
      </div>

      {/* Seletor de Ambiente */}
      <div className="px-3 py-3 border-b border-white/10">
        <div className="relative">
          <button
            onClick={() => setIsEnvDropdownOpen(!isEnvDropdownOpen)}
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-gray-200 hover:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <currentEnv.icon className="h-4 w-4 text-primary-400" />
              <span>{currentEnv.name}</span>
            </div>
            <ChevronDown className={cn(
              "h-4 w-4 text-gray-400 transition-transform",
              isEnvDropdownOpen && "rotate-180"
            )} />
          </button>

          {isEnvDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-white/10 bg-dark-card shadow-xl z-50 overflow-hidden">
              {environments.map((env) => (
                <button
                  key={env.id}
                  onClick={() => handleEnvironmentChange(env.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors",
                    environment === env.id
                      ? "bg-primary-500/20 text-primary-400"
                      : "text-gray-300 hover:bg-white/5"
                  )}
                >
                  <env.icon className="h-4 w-4" />
                  <span>{env.name}</span>
                  {env.badge && (
                    <span className="ml-auto rounded bg-primary-500/20 px-1.5 py-0.5 text-xs text-primary-400">
                      {env.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Navegacao */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-primary-400")} />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Usuario e Logout */}
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-sm font-semibold text-white shadow-lg shadow-primary-500/25">
            {user?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-white">
              {user?.name || 'Administrador'}
            </p>
            <p className="truncate text-xs text-gray-500">
              {user?.email || ''}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </div>
  )
}
