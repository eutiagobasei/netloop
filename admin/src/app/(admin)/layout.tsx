'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Cookies from 'js-cookie'
import { useAuth } from '@/hooks/use-auth'
import { Sidebar } from '@/components/layout/sidebar'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isLoading, isAuthenticated, isAdmin } = useAuth()
  const [isImpersonating, setIsImpersonating] = useState(false)

  useEffect(() => {
    // Verificar se está em modo impersonação
    const impersonatingCookie = Cookies.get('impersonating')
    setIsImpersonating(!!impersonatingCookie)
  }, [])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Se está em /network e tem cookie de impersonação, não redirecionar
      const impersonatingCookie = Cookies.get('impersonating')
      if (pathname === '/network' && impersonatingCookie) {
        return
      }
      router.replace('/login')
    } else if (!isLoading && isAuthenticated && !isAdmin) {
      // Se está impersonando (não é admin mas está autenticado), permitir /network
      const impersonatingCookie = Cookies.get('impersonating')
      if (pathname === '/network' && impersonatingCookie) {
        return
      }
      router.replace('/login')
    }
  }, [isLoading, isAuthenticated, isAdmin, pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  // Se está impersonando na página /network, permitir acesso
  const impersonatingCookie = Cookies.get('impersonating')
  if (pathname === '/network' && impersonatingCookie && isAuthenticated) {
    // Mostrar layout simplificado para impersonação (sem sidebar)
    return (
      <div className="flex h-screen flex-col">
        <main className="flex-1 overflow-auto bg-gray-50">
          {children}
        </main>
      </div>
    )
  }

  if (!isAuthenticated || !isAdmin) {
    return null
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  )
}
