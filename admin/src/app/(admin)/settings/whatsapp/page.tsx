'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MessageSquare, CheckCircle, XCircle, Loader2, Shield, Smartphone } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings } from '@/hooks/use-settings'

const whatsappSchema = z.object({
  whatsapp_provider: z.string().optional(),
  meta_phone_number_id: z.string().optional(),
  meta_access_token: z.string().optional(),
  meta_api_version: z.string().optional(),
  meta_verify_token: z.string().optional(),
  meta_business_account_id: z.string().optional(),
})

type WhatsAppForm = z.infer<typeof whatsappSchema>

const whatsappSettings = [
  {
    key: 'whatsapp_provider',
    label: 'Provider Ativo',
    description: 'Selecione o provider: "meta" (oficial) ou "evolution" (fallback)',
    type: 'text',
    isEncrypted: false,
    placeholder: 'meta ou evolution',
  },
  {
    key: 'meta_phone_number_id',
    label: 'Phone Number ID',
    description: 'ID do número de telefone no Meta Business (encontre em WhatsApp > API Setup)',
    type: 'text',
    isEncrypted: true,
    placeholder: '123456789012345',
  },
  {
    key: 'meta_access_token',
    label: 'Access Token',
    description: 'Token de acesso permanente do Meta (Bearer token)',
    type: 'password',
    isEncrypted: true,
    placeholder: 'EAAxxxxxxx...',
  },
  {
    key: 'meta_api_version',
    label: 'Versão da API',
    description: 'Versão da Graph API do Meta (ex: v23.0)',
    type: 'text',
    isEncrypted: false,
    placeholder: 'v23.0',
  },
  {
    key: 'meta_verify_token',
    label: 'Verify Token',
    description: 'Token para verificação do webhook (você cria, use o mesmo no Meta)',
    type: 'text',
    isEncrypted: true,
    placeholder: 'meu_token_secreto',
  },
  {
    key: 'meta_business_account_id',
    label: 'Business Account ID',
    description: 'ID da conta Business no Meta (opcional)',
    type: 'text',
    isEncrypted: false,
    placeholder: '123456789012345',
  },
]

export default function WhatsAppSettingsPage() {
  const { settings, getSetting, isBulkUpdating } = useSettings('WHATSAPP')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WhatsAppForm>({
    resolver: zodResolver(whatsappSchema),
    values: {
      whatsapp_provider: getSetting('whatsapp_provider')?.value || 'evolution',
      meta_phone_number_id: '',
      meta_access_token: '',
      meta_api_version: getSetting('meta_api_version')?.value || 'v23.0',
      meta_verify_token: '',
      meta_business_account_id: getSetting('meta_business_account_id')?.value || '',
    },
  })

  const onSubmit = async (data: WhatsAppForm) => {
    try {
      setIsSaving(true)
      const settingsToUpdate = Object.entries(data)
        .filter(([_, value]) => value !== undefined && value !== '')
        .map(([key, value]) => ({ key, value: value as string }))

      if (settingsToUpdate.length === 0) {
        setErrorMessage('Nenhum campo alterado')
        return
      }

      for (const setting of settingsToUpdate) {
        const config = whatsappSettings.find((s) => s.key === setting.key)
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
    } finally {
      setIsSaving(false)
    }
  }

  const currentProvider = getSetting('whatsapp_provider')?.value || 'evolution'

  return (
    <div className="min-h-screen bg-gradient-radial">
      {/* Background decorative elements */}
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <Header
          title="WhatsApp Provider"
          description="Configure o provider de WhatsApp (Meta Cloud API ou Evolution)"
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

          {/* Provider Status */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${currentProvider === 'meta' ? 'bg-blue-500/20' : 'bg-green-500/20'}`}>
                  <Smartphone className={`h-5 w-5 ${currentProvider === 'meta' ? 'text-blue-400' : 'text-green-400'}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Provider Ativo</p>
                  <p className={`font-semibold ${currentProvider === 'meta' ? 'text-blue-400' : 'text-green-400'}`}>
                    {currentProvider === 'meta' ? 'Meta Cloud API (Oficial)' : 'Evolution API (Fallback)'}
                  </p>
                </div>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${currentProvider === 'meta' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                {currentProvider.toUpperCase()}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="glass-card p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-400 shadow-lg">
                    <MessageSquare className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Configurações Meta Cloud API</h2>
                    <p className="text-sm text-gray-400">
                      Configure os parâmetros da API oficial do WhatsApp Business
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  {whatsappSettings.map((setting) => (
                    <div key={setting.key} className="space-y-2">
                      <Label htmlFor={setting.key} className="text-gray-300">{setting.label}</Label>
                      <p className="text-sm text-gray-500">{setting.description}</p>
                      <Input
                        id={setting.key}
                        type={setting.type}
                        placeholder={
                          setting.type === 'password'
                            ? (getSetting(setting.key)?.value ? '••••••••' : setting.placeholder)
                            : setting.placeholder
                        }
                        {...register(setting.key as keyof WhatsAppForm)}
                        className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                      />
                      {errors[setting.key as keyof WhatsAppForm]?.message && (
                        <p className="text-sm text-red-400">{errors[setting.key as keyof WhatsAppForm]?.message}</p>
                      )}
                    </div>
                  ))}

                  <div className="flex gap-3 pt-4">
                    <Button
                      type="submit"
                      disabled={isSaving}
                      className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white"
                    >
                      {isSaving ? (
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
              {/* Webhook Info */}
              <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-white/10">
                    <Shield className="h-5 w-5 text-gray-400" />
                  </div>
                  <h3 className="text-base font-medium text-white">Webhook URL</h3>
                </div>

                <p className="text-sm text-gray-400 mb-3">
                  Configure esta URL no Meta Business:
                </p>

                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <code className="text-xs text-blue-400 break-all">
                    https://netloop.atalhodigital.pro/api/whatsapp/webhook/meta
                  </code>
                </div>

                <p className="text-xs text-gray-500 mt-3">
                  Use o mesmo Verify Token configurado acima ao registrar o webhook no Meta.
                </p>
              </div>

              {/* Info Card */}
              <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-white/10">
                    <MessageSquare className="h-5 w-5 text-gray-400" />
                  </div>
                  <h3 className="text-base font-medium text-white">Informações</h3>
                </div>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-2" />
                    <span><strong>Meta</strong>: API oficial do WhatsApp Business</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 mt-2" />
                    <span><strong>Evolution</strong>: Fallback para emergências</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500 mt-2" />
                    <span>Tokens são armazenados criptografados</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-2" />
                    <span>Mude o provider para &quot;meta&quot; para ativar</span>
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
