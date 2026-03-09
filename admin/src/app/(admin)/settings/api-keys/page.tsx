'use client'

import { useState } from 'react'
import { Key, CheckCircle, Shield, Sparkles } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ApiKeyInput } from '@/components/settings/api-key-input'
import { useSettings } from '@/hooks/use-settings'

const apiKeys = [
  {
    key: 'openai_api_key',
    label: 'OpenAI API Key',
    description: 'Chave da API do OpenAI para GPT e Whisper',
    category: 'AI',
    icon: Sparkles,
    gradient: 'from-emerald-500 to-teal-400',
  },
  {
    key: 'anthropic_api_key',
    label: 'Anthropic API Key',
    description: 'Chave da API da Anthropic para Claude',
    category: 'AI',
    icon: Sparkles,
    gradient: 'from-orange-500 to-amber-400',
  },
]

export default function ApiKeysPage() {
  const { settings, getSetting, upsertAsync, isUpserting } = useSettings('AI')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleSave = async (key: string, value: string) => {
    try {
      const keyConfig = apiKeys.find((k) => k.key === key)
      await upsertAsync({
        key,
        value,
        category: keyConfig?.category || 'AI',
        isEncrypted: true,
        description: keyConfig?.description,
      })
      setSuccessMessage(`${keyConfig?.label} salva com sucesso!`)
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (error) {
      console.error('Erro ao salvar:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-radial">
      {/* Background decorative elements */}
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <Header
          title="API Keys"
          description="Configure as chaves de API para integração com serviços de IA"
        />

        <div className="p-6 space-y-6">
          {successMessage && (
            <Alert variant="success" className="glass-card border-emerald-500/30 bg-emerald-500/10">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <AlertTitle className="text-emerald-400">Sucesso</AlertTitle>
              <AlertDescription className="text-emerald-300">{successMessage}</AlertDescription>
            </Alert>
          )}

          {/* Main Card */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg glow-blue">
                <Key className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Chaves de API de IA</h2>
                <p className="text-sm text-gray-400">
                  As chaves são armazenadas de forma criptografada no banco de dados
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {apiKeys.map((apiKey) => {
                const setting = getSetting(apiKey.key)
                return (
                  <div key={apiKey.key} className="p-4 rounded-xl border border-white/5 bg-white/5">
                    <ApiKeyInput
                      label={apiKey.label}
                      settingKey={apiKey.key}
                      currentValue={setting?.value}
                      description={apiKey.description}
                      onSave={handleSave}
                      isSaving={isUpserting}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Info Card */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-white/10">
                <Shield className="h-5 w-5 text-gray-400" />
              </div>
              <h3 className="text-base font-medium text-white">Informações</h3>
            </div>
            <ul className="space-y-3 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-2" />
                <span><strong className="text-gray-300">OpenAI:</strong> Usada para transcrição de áudio (Whisper) e processamento de texto (GPT-4)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500 mt-2" />
                <span><strong className="text-gray-300">Anthropic:</strong> Usada como alternativa ao GPT para extração de dados de contatos</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-2" />
                <span>As chaves são criptografadas com AES-256-GCM antes de serem salvas</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500 mt-2" />
                <span>Valores exibidos são mascarados para segurança</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
