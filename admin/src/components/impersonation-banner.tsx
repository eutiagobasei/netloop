'use client'

import { Eye, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
        <X className="h-4 w-4" />
        Fechar
      </Button>
    </div>
  )
}
