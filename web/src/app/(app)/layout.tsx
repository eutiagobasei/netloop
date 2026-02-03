'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { LogOut, Network } from 'lucide-react'
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
    <div className="flex h-screen flex-col">
      {impersonation.isImpersonating && impersonation.userName && (
        <ImpersonationBanner
          userName={impersonation.userName}
          onExit={exitImpersonation}
        />
      )}
      <header className="flex h-16 items-center justify-between border-b bg-white px-6">
        <div className="flex items-center gap-2">
          <Network className="h-6 w-6 text-primary-600" />
          <span className="text-xl font-bold text-gray-900">NetLoop</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {user?.name || user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden bg-gray-50">
        {children}
      </main>
    </div>
  )
}
