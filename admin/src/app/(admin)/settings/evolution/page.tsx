'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MessageSquare, CheckCircle, XCircle, Loader2, Wifi, Shield } from 'lucide-react'
import { Header } from '@/components/layout/header'
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
    <div className="min-h-screen bg-gradient-radial">
      {/* Background decorative elements */}
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <Header
          title="Evolution API"
          description="Configure a integração com WhatsApp via Evolution API"
        />

        <div className="p-6 space-y-6">
          {successMessage && (
            <Alert variant="success" className="glass-card border-emerald-500/30 bg-emerald-500/10">
              <CheckCircle className="h-4 w-4 text-emerald-400" />
              <AlertTitle className="text-emerald-400">Sucesso</AlertTitle>
              <AlertDescription className="text-emerald-300">{successMessage}</AlertDescription>
            </Alert>
          )}

          {errorMessage && (
            <Alert variant="destructive" className="glass-card border-red-500/30 bg-red-500/10">
              <XCircle className="h-4 w-4 text-red-400" />
              <AlertTitle className="text-red-400">Erro</AlertTitle>
              <AlertDescription className="text-red-300">{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="glass-card p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-400 shadow-lg glow-green">
                    <MessageSquare className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Configurações da Evolution API</h2>
                    <p className="text-sm text-gray-400">
                      Configure os parâmetros de conexão com a Evolution API
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  {evolutionSettings.map((setting) => (
                    <div key={setting.key} className="space-y-2">
                      <Label htmlFor={setting.key} className="text-gray-300">{setting.label}</Label>
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
                        className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                      />
                      {errors[setting.key as keyof EvolutionForm]?.message && (
                        <p className="text-sm text-red-400">{errors[setting.key as keyof EvolutionForm]?.message}</p>
                      )}
                    </div>
                  ))}

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="submit"
                      disabled={isBulkUpdating}
                      className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
                    >
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
              </div>
            </div>

            <div className="space-y-6">
              {/* Test Connection Card */}
              <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-white/10">
                    <Wifi className="h-5 w-5 text-gray-400" />
                  </div>
                  <h3 className="text-base font-medium text-white">Testar Conexão</h3>
                </div>

                <p className="text-sm text-gray-400 mb-4">
                  Verifique se as configurações estão corretas testando a conexão com a Evolution API.
                </p>

                {testResult && (
                  <div className={`mb-4 p-3 rounded-lg border ${testResult.success ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                    <div className="flex items-center gap-2">
                      {testResult.success ? (
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                      )}
                      <span className={testResult.success ? 'text-emerald-300' : 'text-red-300'}>
                        {testResult.message}
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleTestConnection}
                  variant="outline"
                  className="w-full bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
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
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 mt-2" />
                    <span>A Evolution API permite integração com WhatsApp</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-2" />
                    <span>Configure o webhook para receber mensagens em tempo real</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500 mt-2" />
                    <span>A API Key é armazenada de forma criptografada</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
