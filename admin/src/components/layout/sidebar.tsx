'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Settings,
  Key,
  MessageSquare,
  LogOut,
  Network,
  ChevronDown,
  Shield,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'

type Environment = 'admin' | 'user'

const adminNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'API Keys', href: '/settings/api-keys', icon: Key },
  { name: 'Evolution API', href: '/settings/evolution', icon: MessageSquare },
]

const userNavigation = [
  { name: 'Minha Rede', href: '/network', icon: Network },
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
    if (pathname.startsWith('/network')) {
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
    <div className="flex h-full w-64 flex-col border-r border-gray-200 bg-white">
      {/* Header com logo */}
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <h1 className="text-xl font-bold text-primary-600">NetLoop</h1>
        {environment === 'admin' && (
          <span className="ml-2 rounded bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
            Admin
          </span>
        )}
      </div>

      {/* Seletor de Ambiente */}
      <div className="px-3 py-3 border-b border-gray-200">
        <div className="relative">
          <button
            onClick={() => setIsEnvDropdownOpen(!isEnvDropdownOpen)}
            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <currentEnv.icon className="h-4 w-4" />
              <span>{currentEnv.name}</span>
            </div>
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              isEnvDropdownOpen && "rotate-180"
            )} />
          </button>

          {isEnvDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
              {environments.map((env) => (
                <button
                  key={env.id}
                  onClick={() => handleEnvironmentChange(env.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg",
                    environment === env.id
                      ? "bg-primary-50 text-primary-700"
                      : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <env.icon className="h-4 w-4" />
                  <span>{env.name}</span>
                  {env.badge && (
                    <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
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
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Usuario e Logout */}
      <div className="border-t border-gray-200 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
            {user?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-gray-900">
              {user?.name || 'Admin'}
            </p>
            <p className="truncate text-xs text-gray-500">
              {user?.email || ''}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </div>
  )
}
