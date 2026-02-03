'use client'

import { Eye, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Cookies from 'js-cookie'

interface ImpersonationBannerProps {
  userName: string
  onExit: () => void
}

export function ImpersonationBanner({ userName, onExit }: ImpersonationBannerProps) {
  return (
    <div className="flex items-center justify-between bg-amber-500 px-4 py-2 text-black">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        <span className="text-sm font-medium">
          Visualizando como: <strong>{userName}</strong>
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onExit}
        className="gap-2 border-black/20 bg-white/20 text-black hover:bg-white/30"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao Admin
      </Button>
    </div>
  )
}

export function getImpersonationData(): {
  isImpersonating: boolean
  userName?: string
  userEmail?: string
  adminName?: string
} {
  try {
    const impersonatingCookie = Cookies.get('impersonating')
    if (!impersonatingCookie) {
      return { isImpersonating: false }
    }

    const data = JSON.parse(impersonatingCookie)
    return {
      isImpersonating: true,
      userName: data.userName,
      userEmail: data.userEmail,
      adminName: data.adminName,
    }
  } catch {
    return { isImpersonating: false }
  }
}

export function exitImpersonation() {
  const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3000'

  // Restaurar token do admin
  const adminToken = Cookies.get('adminAccessToken')
  const adminRefreshToken = Cookies.get('adminRefreshToken')

  if (adminToken) {
    Cookies.set('accessToken', adminToken, { expires: 1 / 96 }) // 15 min
  }
  if (adminRefreshToken) {
    Cookies.set('refreshToken', adminRefreshToken, { expires: 7 })
  }

  // Limpar cookies de impersonação
  Cookies.remove('impersonating')
  Cookies.remove('adminAccessToken')
  Cookies.remove('adminRefreshToken')

  // Redirecionar para o admin
  window.location.href = `${ADMIN_URL}/users`
}
