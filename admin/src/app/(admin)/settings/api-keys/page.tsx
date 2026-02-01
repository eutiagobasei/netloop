'use client'

import { useState } from 'react'
import { Key, CheckCircle } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ApiKeyInput } from '@/components/settings/api-key-input'
import { useSettings } from '@/hooks/use-settings'

const apiKeys = [
  {
    key: 'openai_api_key',
    label: 'OpenAI API Key',
    description: 'Chave da API do OpenAI para GPT e Whisper',
    category: 'AI',
  },
  {
    key: 'anthropic_api_key',
    label: 'Anthropic API Key',
    description: 'Chave da API da Anthropic para Claude',
    category: 'AI',
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
    <div>
      <Header
        title="API Keys"
        description="Configure as chaves de API para integração com serviços de IA"
      />

      <div className="p-6">
        {successMessage && (
          <Alert variant="success" className="mb-6">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Sucesso</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-100 p-2">
                <Key className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle>Chaves de API de IA</CardTitle>
                <CardDescription>
                  As chaves são armazenadas de forma criptografada no banco de dados
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {apiKeys.map((apiKey) => {
              const setting = getSetting(apiKey.key)
              return (
                <ApiKeyInput
                  key={apiKey.key}
                  label={apiKey.label}
                  settingKey={apiKey.key}
                  currentValue={setting?.value}
                  description={apiKey.description}
                  onSave={handleSave}
                  isSaving={isUpserting}
                />
              )
            })}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Informações</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-600">
            <ul className="list-inside list-disc space-y-2">
              <li>
                <strong>OpenAI:</strong> Usada para transcrição de áudio (Whisper) e processamento de texto (GPT-4)
              </li>
              <li>
                <strong>Anthropic:</strong> Usada como alternativa ao GPT para extração de dados de contatos
              </li>
              <li>
                As chaves são criptografadas com AES-256-GCM antes de serem salvas
              </li>
              <li>
                Valores exibidos são mascarados para segurança
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
