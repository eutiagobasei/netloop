'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname, useParams } from 'next/navigation'
import Cookies from 'js-cookie'
import Link from 'next/link'
import {
  Building2,
  Users,
  Network,
  LogOut,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClubAdminInfo {
  id: string
  email: string
  name: string
  clubId: string
  clubName: string
  clubSlug: string
  role: 'CLUB_ADMIN'
}

const clubNavigation = [
  { name: 'Visão Geral', href: '', icon: Building2 },
  { name: 'Membros', href: '/members', icon: Users },
  { name: 'Contatos', href: '/contacts', icon: Network },
]

export default function ClubLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const clubId = params.id as string

  const [clubAdmin, setClubAdmin] = useState<ClubAdminInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check for club admin authentication
    const token = Cookies.get('accessToken')
    const clubAdminInfoStr = Cookies.get('clubAdminInfo')

    if (!token || !clubAdminInfoStr) {
      router.replace('/club-login')
      return
    }

    try {
      const adminInfo = JSON.parse(clubAdminInfoStr) as ClubAdminInfo

      // Verify the club admin is accessing their own club
      if (adminInfo.clubId !== clubId) {
        router.replace('/club-login')
        return
      }

      setClubAdmin(adminInfo)
    } catch {
      router.replace('/club-login')
      return
    }

    setIsLoading(false)
  }, [clubId, router])

  const handleLogout = () => {
    Cookies.remove('accessToken')
    Cookies.remove('clubAdminInfo')
    router.replace('/club-login')
  }

  if (isLoading) {
    return (
      <div className="dark flex h-screen items-center justify-center bg-dark-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  if (!clubAdmin) {
    return null
  }

  return (
    <div className="dark flex h-screen bg-dark-bg">
      {/* Sidebar */}
      <div className="flex h-full w-64 flex-col border-r border-white/10 bg-dark-bg">
        {/* Header with club name */}
        <div className="flex h-16 items-center border-b border-white/10 px-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-500" />
            <h1 className="text-xl font-bold text-white truncate">{clubAdmin.clubName}</h1>
          </div>
        </div>

        {/* Club Badge */}
        <div className="px-3 py-3 border-b border-white/10">
          <div className="flex w-full items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-sm font-medium text-indigo-300">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-400" />
              <span>Painel do Clube</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {clubNavigation.map((item) => {
            const href = `/club/${clubId}${item.href}`
            const isActive = pathname === href || (item.href !== '' && pathname.startsWith(href))
            return (
              <Link
                key={item.name}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive && "text-indigo-400")} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* User and Logout */}
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-700 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25">
              {clubAdmin.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">
                {clubAdmin.name}
              </p>
              <p className="truncate text-xs text-gray-500">
                {clubAdmin.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            <LogOut className="h-5 w-5" />
            Sair
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
