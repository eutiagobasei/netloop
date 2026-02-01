'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MessageSquare, CheckCircle, XCircle, Loader2, Wifi } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings } from '@/hooks/use-settings'

const evolutionSchema = z.object({
  evolution_api_url: z.string().url('URL inválida').optional().or(z.literal('')),
  evolution_api_key: z.string().optional(),
  evolution_instance_name: z.string().optional(),
  evolution_webhook_url: z.string().url('URL inválida').optional().or(z.literal('')),
})

type EvolutionForm = z.infer<typeof evolutionSchema>

const evolutionSettings = [
  {
    key: 'evolution_api_url',
    label: 'URL da API',
    description: 'URL base da Evolution API (ex: https://api.evolution.com)',
    type: 'url',
    isEncrypted: false,
  },
  {
    key: 'evolution_api_key',
    label: 'API Key',
    description: 'Chave de autenticação da Evolution API',
    type: 'password',
    isEncrypted: true,
  },
  {
    key: 'evolution_instance_name',
    label: 'Nome da Instância',
    description: 'Nome da instância WhatsApp a ser usada',
    type: 'text',
    isEncrypted: false,
  },
  {
    key: 'evolution_webhook_url',
    label: 'Webhook URL',
    description: 'URL para receber eventos da Evolution API',
    type: 'url',
    isEncrypted: false,
  },
]

export default function EvolutionPage() {
  const { settings, getSetting, bulkUpdateAsync, isBulkUpdating, testEvolutionAsync, isTestingEvolution } = useSettings('WHATSAPP')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<EvolutionForm>({
    resolver: zodResolver(evolutionSchema),
    values: {
      evolution_api_url: getSetting('evolution_api_url')?.value || '',
      evolution_api_key: '',
      evolution_instance_name: getSetting('evolution_instance_name')?.value || '',
      evolution_webhook_url: getSetting('evolution_webhook_url')?.value || '',
    },
  })

  const onSubmit = async (data: EvolutionForm) => {
    try {
      const settingsToUpdate = Object.entries(data)
        .filter(([_, value]) => value !== undefined && value !== '')
        .map(([key, value]) => ({ key, value: value as string }))

      if (settingsToUpdate.length === 0) {
        setErrorMessage('Nenhum campo alterado')
        return
      }

      // Primeiro criar/atualizar as settings que não existem
      for (const setting of settingsToUpdate) {
        const config = evolutionSettings.find((s) => s.key === setting.key)
        if (config) {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333'}/api/settings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${document.cookie.split('accessToken=')[1]?.split(';')[0]}`,
            },
            body: JSON.stringify({
              key: setting.key,
              value: setting.value,
              category: 'WHATSAPP',
              isEncrypted: config.isEncrypted,
              description: config.description,
            }),
          })
        }
      }

      setSuccessMessage('Configurações salvas com sucesso!')
      setErrorMessage(null)
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (error) {
      setErrorMessage('Erro ao salvar configurações')
      setSuccessMessage(null)
    }
  }

  const handleTestConnection = async () => {
    try {
      const result = await testEvolutionAsync()
      setTestResult(result.data)
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Erro ao testar conexão',
      })
    }
  }

  return (
    <div>
      <Header
        title="Evolution API"
        description="Configure a integração com WhatsApp via Evolution API"
      />

      <div className="p-6">
        {successMessage && (
          <Alert variant="success" className="mb-6">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Sucesso</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        {errorMessage && (
          <Alert variant="destructive" className="mb-6">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-100 p-2">
                    <MessageSquare className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle>Configurações da Evolution API</CardTitle>
                    <CardDescription>
                      Configure os parâmetros de conexão com a Evolution API
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  {evolutionSettings.map((setting) => (
                    <div key={setting.key} className="space-y-2">
                      <Label htmlFor={setting.key}>{setting.label}</Label>
                      <p className="text-sm text-gray-500">{setting.description}</p>
                      <Input
                        id={setting.key}
                        type={setting.type}
                        placeholder={
                          setting.type === 'password'
                            ? getSetting(setting.key)?.value || 'Insira a chave...'
                            : undefined
                        }
                        {...register(setting.key as keyof EvolutionForm)}
                        error={errors[setting.key as keyof EvolutionForm]?.message}
                      />
                    </div>
                  ))}

                  <div className="flex gap-3 pt-4">
                    <Button type="submit" disabled={isBulkUpdating}>
                      {isBulkUpdating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        'Salvar Configurações'
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wifi className="h-4 w-4" />
                  Testar Conexão
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-500">
                  Verifique se as configurações estão corretas testando a conexão com a Evolution API.
                </p>

                {testResult && (
                  <Alert variant={testResult.success ? 'success' : 'destructive'}>
                    {testResult.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    <AlertDescription>{testResult.message}</AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleTestConnection}
                  variant="outline"
                  className="w-full"
                  disabled={isTestingEvolution}
                >
                  {isTestingEvolution ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testando...
                    </>
                  ) : (
                    'Testar Conexão'
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Informações</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-600">
                <ul className="list-inside list-disc space-y-2">
                  <li>
                    A Evolution API permite integração com WhatsApp
                  </li>
                  <li>
                    Configure o webhook para receber mensagens em tempo real
                  </li>
                  <li>
                    A API Key é armazenada de forma criptografada
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
