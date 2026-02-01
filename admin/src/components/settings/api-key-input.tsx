'use client'

import { useState } from 'react'
import { Eye, EyeOff, Save, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface ApiKeyInputProps {
  label: string
  settingKey: string
  currentValue?: string
  description?: string
  onSave: (key: string, value: string) => Promise<void>
  isSaving?: boolean
}

export function ApiKeyInput({
  label,
  settingKey,
  currentValue,
  description,
  onSave,
  isSaving,
}: ApiKeyInputProps) {
  const [value, setValue] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (value.trim()) {
      await onSave(settingKey, value)
      setValue('')
      setHasChanges(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={settingKey}>{label}</Label>
      {description && (
        <p className="text-sm text-gray-500">{description}</p>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={settingKey}
            type={showPassword ? 'text' : 'password'}
            value={value}
            onChange={handleChange}
            placeholder={currentValue || 'Insira a chave...'}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          size="icon"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
        </Button>
      </div>
      {currentValue && (
        <p className="text-xs text-gray-400">
          Valor atual: {currentValue}
        </p>
      )}
    </div>
  )
}
