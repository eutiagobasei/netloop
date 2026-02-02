'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Loader2,
  Upload,
  Music,
  Video,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useSettings } from '@/hooks/use-settings'
import { api } from '@/lib/api'

const welcomeSchema = z.object({
  welcome_text: z.string().min(10, 'Mínimo 10 caracteres').optional().or(z.literal('')),
})

type WelcomeForm = z.infer<typeof welcomeSchema>

interface WelcomeMedia {
  audio: { id: string; filename: string; size: number } | null
  video: { id: string; filename: string; size: number } | null
}

export default function WelcomePage() {
  const { getSetting, upsertAsync, isUpserting } = useSettings('WHATSAPP')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [deletingAudio, setDeletingAudio] = useState(false)
  const [deletingVideo, setDeletingVideo] = useState(false)
  const [welcomeMedia, setWelcomeMedia] = useState<WelcomeMedia>({ audio: null, video: null })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WelcomeForm>({
    resolver: zodResolver(welcomeSchema),
    values: {
      welcome_text: getSetting('welcome_text')?.value || '',
    },
  })

  // Carrega mídias configuradas
  useEffect(() => {
    const loadMedia = async () => {
      try {
        const response = await api.get('/uploads/welcome')
        setWelcomeMedia(response.data)
      } catch (error) {
        console.error('Erro ao carregar mídia:', error)
      }
    }
    loadMedia()
  }, [])

  const showSuccess = (message: string) => {
    setSuccessMessage(message)
    setErrorMessage(null)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const showError = (message: string) => {
    setErrorMessage(message)
    setSuccessMessage(null)
  }

  const onSubmit = async (data: WelcomeForm) => {
    try {
      await upsertAsync({
        key: 'welcome_text',
        value: data.welcome_text || '',
        category: 'WHATSAPP',
        isEncrypted: false,
        description: 'Texto de boas-vindas para novos usuários',
      })
      showSuccess('Texto salvo com sucesso!')
    } catch (error) {
      showError('Erro ao salvar texto')
    }
  }

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAudio(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post('/uploads/welcome-audio', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setWelcomeMedia((prev) => ({
        ...prev,
        audio: { id: response.data.id, filename: response.data.filename, size: response.data.size },
      }))
      showSuccess('Áudio enviado com sucesso!')
    } catch (error: any) {
      showError(error.response?.data?.message || 'Erro ao enviar áudio')
    } finally {
      setUploadingAudio(false)
      e.target.value = ''
    }
  }

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingVideo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post('/uploads/welcome-video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setWelcomeMedia((prev) => ({
        ...prev,
        video: { id: response.data.id, filename: response.data.filename, size: response.data.size },
      }))
      showSuccess('Vídeo enviado com sucesso!')
    } catch (error: any) {
      showError(error.response?.data?.message || 'Erro ao enviar vídeo')
    } finally {
      setUploadingVideo(false)
      e.target.value = ''
    }
  }

  const handleDeleteAudio = async () => {
    setDeletingAudio(true)
    try {
      await api.delete('/uploads/welcome-audio')
      setWelcomeMedia((prev) => ({ ...prev, audio: null }))
      showSuccess('Áudio removido com sucesso!')
    } catch (error) {
      showError('Erro ao remover áudio')
    } finally {
      setDeletingAudio(false)
    }
  }

  const handleDeleteVideo = async () => {
    setDeletingVideo(true)
    try {
      await api.delete('/uploads/welcome-video')
      setWelcomeMedia((prev) => ({ ...prev, video: null }))
      showSuccess('Vídeo removido com sucesso!')
    } catch (error) {
      showError('Erro ao remover vídeo')
    } finally {
      setDeletingVideo(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div>
      <Header
        title="Boas-vindas WhatsApp"
        description="Configure a mensagem de boas-vindas para novos usuários"
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

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Texto de Boas-vindas */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 p-2">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Mensagem de Texto</CardTitle>
                  <CardDescription>
                    Texto enviado quando um número desconhecido entra em contato
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="welcome_text">Texto de boas-vindas</Label>
                  <Textarea
                    id="welcome_text"
                    rows={8}
                    placeholder={`Olá! Bem-vindo ao *NetLoop*! 👋

O primeiro sistema de conexões de networking do Brasil.

Para começar, por favor me diga seu *nome completo*:`}
                    {...register('welcome_text')}
                  />
                  {errors.welcome_text && (
                    <p className="text-sm text-red-500">{errors.welcome_text.message}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Use *texto* para negrito. A mensagem deve pedir o nome do usuário.
                  </p>
                </div>

                <Button type="submit" disabled={isUpserting}>
                  {isUpserting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Texto'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Upload de Mídia */}
          <div className="space-y-6">
            {/* Áudio */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-purple-100 p-2">
                    <Music className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle>Áudio de Boas-vindas</CardTitle>
                    <CardDescription>
                      Áudio opcional enviado junto com a mensagem (MP3, OGG, WAV)
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {welcomeMedia.audio ? (
                  <div className="flex items-center justify-between rounded-lg bg-purple-50 p-3">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4 text-purple-600" />
                      <div>
                        <p className="text-sm font-medium">{welcomeMedia.audio.filename}</p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(welcomeMedia.audio.size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={handleDeleteAudio}
                      disabled={deletingAudio}
                    >
                      {deletingAudio ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Nenhum áudio configurado</p>
                )}

                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp3,audio/ogg,audio/wav"
                    onChange={handleAudioUpload}
                    className="hidden"
                    id="audio-upload"
                  />
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById('audio-upload')?.click()}
                    disabled={uploadingAudio}
                    className="w-full"
                  >
                    {uploadingAudio ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        {welcomeMedia.audio ? 'Substituir Áudio' : 'Enviar Áudio'}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Vídeo */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-100 p-2">
                    <Video className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle>Vídeo de Boas-vindas</CardTitle>
                    <CardDescription>
                      Vídeo opcional enviado junto com a mensagem (MP4, WebM)
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {welcomeMedia.video ? (
                  <div className="flex items-center justify-between rounded-lg bg-green-50 p-3">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-sm font-medium">{welcomeMedia.video.filename}</p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(welcomeMedia.video.size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={handleDeleteVideo}
                      disabled={deletingVideo}
                    >
                      {deletingVideo ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Nenhum vídeo configurado</p>
                )}

                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={handleVideoUpload}
                    className="hidden"
                    id="video-upload"
                  />
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById('video-upload')?.click()}
                    disabled={uploadingVideo}
                    className="w-full"
                  >
                    {uploadingVideo ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        {welcomeMedia.video ? 'Substituir Vídeo' : 'Enviar Vídeo'}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Preview do Fluxo */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-indigo-100 p-2">
                <UserPlus className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <CardTitle>Fluxo de Cadastro</CardTitle>
                <CardDescription>
                  Como funciona o cadastro de novos usuários via WhatsApp
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg bg-green-50 p-4">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-green-200 text-sm font-bold text-green-700">
                  1
                </div>
                <p className="font-medium text-green-800">Mensagem Recebida</p>
                <p className="mt-1 text-sm text-green-600">
                  Número desconhecido envia mensagem
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 p-4">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-blue-200 text-sm font-bold text-blue-700">
                  2
                </div>
                <p className="font-medium text-blue-800">Boas-vindas</p>
                <p className="mt-1 text-sm text-blue-600">
                  Sistema envia texto + mídia configurada
                </p>
              </div>
              <div className="rounded-lg bg-purple-50 p-4">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-purple-200 text-sm font-bold text-purple-700">
                  3
                </div>
                <p className="font-medium text-purple-800">Coleta Nome</p>
                <p className="mt-1 text-sm text-purple-600">
                  Usuário responde com nome → pede email
                </p>
              </div>
              <div className="rounded-lg bg-orange-50 p-4">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-orange-200 text-sm font-bold text-orange-700">
                  4
                </div>
                <p className="font-medium text-orange-800">Cadastro Completo</p>
                <p className="mt-1 text-sm text-orange-600">
                  Conta criada com senha temporária
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
