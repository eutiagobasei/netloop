'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { LogOut, Network, Sparkles, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ImpersonationBanner,
  getImpersonationData,
  exitImpersonation,
} from '@/components/impersonation-banner'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isLoading, isAuthenticated, logout } = useAuth()
  const [impersonation, setImpersonation] = useState<{
    isImpersonating: boolean
    userName?: string
  }>({ isImpersonating: false })

  useEffect(() => {
    setImpersonation(getImpersonationData())
  }, [])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isLoading, isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="dark flex h-screen flex-col bg-dark-bg">
      {impersonation.isImpersonating && impersonation.userName && (
        <ImpersonationBanner
          userName={impersonation.userName}
          onExit={exitImpersonation}
        />
      )}
      <header className="relative z-50 flex h-16 items-center justify-between border-b border-white/10 bg-dark-bg/80 backdrop-blur-md px-6">
        <div className="flex items-center gap-6">
          <Link href="/network" className="flex items-center gap-2">
            <Network className="h-6 w-6 text-primary-500" />
            <span className="text-xl font-bold text-white">NetLoop</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/network"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/network'
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="flex items-center gap-2">
                <Network className="h-4 w-4" />
                Rede
              </span>
            </Link>
            <Link
              href="/loop"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === '/loop'
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Loop
              </span>
            </Link>
            {user?.role === 'ADMIN' && (
              <Link
                href="/tags"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/tags'
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags
                </span>
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {user?.name || user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={logout} className="text-gray-400 hover:text-white hover:bg-white/10">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden bg-dark-bg">
        {children}
      </main>
    </div>
  )
}
