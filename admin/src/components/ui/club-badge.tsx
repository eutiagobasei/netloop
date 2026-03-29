'use client'

import { Shield, ShieldCheck } from 'lucide-react'

export interface ClubInfo {
  id: string
  name: string
  color: string | null
  isVerified: boolean
}

interface ClubBadgeProps {
  club: ClubInfo
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
}

const ICON_SIZES = {
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
}

export function ClubBadge({ club, size = 'md' }: ClubBadgeProps) {
  const bgColor = club.color || '#6366f1'
  const IconComponent = club.isVerified ? ShieldCheck : Shield

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${SIZE_CLASSES[size]}`}
      style={{
        backgroundColor: `${bgColor}25`,
        color: bgColor,
        border: `1px solid ${bgColor}40`,
      }}
    >
      <IconComponent className={ICON_SIZES[size]} />
      {club.name}
    </span>
  )
}

interface ClubBadgeListProps {
  clubs: ClubInfo[]
  size?: 'sm' | 'md' | 'lg'
  maxVisible?: number
}

export function ClubBadgeList({ clubs, size = 'md', maxVisible = 3 }: ClubBadgeListProps) {
  if (!clubs || clubs.length === 0) return null

  const visibleClubs = clubs.slice(0, maxVisible)
  const hiddenCount = clubs.length - maxVisible

  return (
    <div className="flex flex-wrap gap-1">
      {visibleClubs.map((club) => (
        <ClubBadge key={club.id} club={club} size={size} />
      ))}
      {hiddenCount > 0 && (
        <span
          className={`inline-flex items-center rounded-full font-medium bg-white/10 text-gray-400 ${SIZE_CLASSES[size]}`}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}
