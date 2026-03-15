'use client'

import { useState, useEffect } from 'react'
import {
  Brain,
  CheckCircle,
  XCircle,
  Loader2,
  RotateCcw,
  Save,
  Search,
  MessageSquare,
  UserPlus,
  FileText,
  Sparkles,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Eye,
  Target,
} from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useSettings } from '@/hooks/use-settings'
import { api } from '@/lib/api'

// Metadados dos prompts
const PROMPT_METADATA: Record<
  string,
  {
    title: string
    description: string
    icon: React.ElementType
    color: string
    category: 'core' | 'response' | 'feedback'
  }
> = {
  prompt_intent_classification: {
    title: 'Classificação de Intenção',
    description: 'Classifica a intenção da mensagem: query, contact_info, update_contact, memory, register_intent ou other',
    icon: Search,
    color: 'blue',
    category: 'core',
  },
  prompt_query_subject: {
    title: 'Extração de Assunto',
    description: 'Extrai o nome ou termo de busca quando o usuário quer consultar contatos',
    icon: FileText,
    color: 'purple',
    category: 'core',
  },
  prompt_contact_extraction: {
    title: 'Extração de Contato',
    description: 'Extrai dados estruturados (nome, telefone, empresa, etc.) a partir do texto',
    icon: UserPlus,
    color: 'green',
    category: 'core',
  },
  prompt_greeting_response: {
    title: 'Resposta de Saudação',
    description: 'Gera respostas amigáveis para saudações e mensagens genéricas',
    icon: Sparkles,
    color: 'pink',
    category: 'response',
  },
  prompt_registration_response: {
    title: 'Onboarding SDR',
    description: 'Fluxo conversacional para cadastro de novos usuários com explicação do NetLoop',
    icon: MessageSquare,
    color: 'indigo',
    category: 'response',
  },
  prompt_memory_management: {
    title: 'Gerenciamento de Memória',
    description: 'Permite editar dados próprios ou de contatos via conversa natural',
    icon: Brain,
    color: 'violet',
    category: 'response',
  },
  prompt_search_response: {
    title: 'Resposta de Busca',
    description: 'Formata a resposta quando o usuário busca por contatos',
    icon: Search,
    color: 'cyan',
    category: 'response',
  },
  prompt_save_confirmation: {
    title: 'Confirmação de Salvamento',
    description: 'Confirma que um contato foi salvo com sucesso',
    icon: CheckCircle,
    color: 'emerald',
    category: 'feedback',
  },
  prompt_update_confirmation: {
    title: 'Confirmação de Atualização',
    description: 'Confirma que um contato foi atualizado',
    icon: RefreshCw,
    color: 'amber',
    category: 'feedback',
  },
  prompt_error_response: {
    title: 'Resposta de Erro',
    description: 'Gera mensagens amigáveis quando ocorre um erro',
    icon: AlertCircle,
    color: 'red',
    category: 'feedback',
  },
  prompt_context_question: {
    title: 'Pergunta de Contexto',
    description: 'Pergunta sobre dados faltantes após salvar um contato',
    icon: HelpCircle,
    color: 'violet',
    category: 'feedback',
  },
  prompt_loop_strategy: {
    title: 'Loop - Estrategista',
    description: 'Gera planos estratégicos baseados na rede de contatos',
    icon: Target,
    color: 'pink',
    category: 'response',
  },
}

const colorClasses: Record<string, { bg: string; icon: string; border: string; gradient: string }> = {
  blue: { bg: 'bg-blue-500/20', icon: 'text-blue-400', border: 'border-blue-500/30', gradient: 'from-blue-500 to-cyan-400' },
  purple: { bg: 'bg-purple-500/20', icon: 'text-purple-400', border: 'border-purple-500/30', gradient: 'from-purple-500 to-pink-400' },
  green: { bg: 'bg-green-500/20', icon: 'text-green-400', border: 'border-green-500/30', gradient: 'from-green-500 to-emerald-400' },
  indigo: { bg: 'bg-indigo-500/20', icon: 'text-indigo-400', border: 'border-indigo-500/30', gradient: 'from-indigo-500 to-purple-400' },
  pink: { bg: 'bg-pink-500/20', icon: 'text-pink-400', border: 'border-pink-500/30', gradient: 'from-pink-500 to-rose-400' },
  cyan: { bg: 'bg-cyan-500/20', icon: 'text-cyan-400', border: 'border-cyan-500/30', gradient: 'from-cyan-500 to-blue-400' },
  emerald: { bg: 'bg-emerald-500/20', icon: 'text-emerald-400', border: 'border-emerald-500/30', gradient: 'from-emerald-500 to-teal-400' },
  amber: { bg: 'bg-amber-500/20', icon: 'text-amber-400', border: 'border-amber-500/30', gradient: 'from-amber-500 to-orange-400' },
  red: { bg: 'bg-red-500/20', icon: 'text-red-400', border: 'border-red-500/30', gradient: 'from-red-500 to-rose-400' },
  violet: { bg: 'bg-violet-500/20', icon: 'text-violet-400', border: 'border-violet-500/30', gradient: 'from-violet-500 to-purple-400' },
}

const categoryLabels: Record<string, { label: string; description: string }> = {
  core: { label: 'Classificação e Extração', description: 'Prompts que analisam e extraem dados das mensagens' },
  response: { label: 'Geração de Resposta', description: 'Prompts que geram respostas para o usuário' },
  feedback: { label: 'Confirmação e Feedback', description: 'Prompts de confirmação, erro e perguntas' },
}

export default function PromptsPage() {
  const { settings, isLoading, getSetting, upsertAsync, isUpserting } = useSettings('PROMPTS')
  const [defaultPrompts, setDefaultPrompts] = useState<Record<string, string>>({})
  const [loadingDefaults, setLoadingDefaults] = useState(true)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})

  // Busca prompts padrão do backend
  useEffect(() => {
    const fetchDefaults = async () => {
      try {
        const response = await api.get('/settings/prompts/defaults')
        const prompts: Record<string, string> = {}
        for (const [key, value] of Object.entries(response.data)) {
          prompts[`prompt_${key}`] = value as string
        }
        setDefaultPrompts(prompts)
      } catch (error) {
        console.error('Erro ao buscar prompts padrão:', error)
      } finally {
        setLoadingDefaults(false)
      }
    }
    fetchDefaults()
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

  const handlePromptChange = (key: string, value: string) => {
    setEditedPrompts((prev) => ({ ...prev, [key]: value }))
  }

  const getPromptValue = (key: string): string => {
    if (editedPrompts[key] !== undefined) return editedPrompts[key]
    const setting = getSetting(key)
    return setting?.value || defaultPrompts[key] || ''
  }

  const hasChanges = (key: string): boolean => {
    if (editedPrompts[key] === undefined) return false
    const currentValue = getSetting(key)?.value || defaultPrompts[key] || ''
    return editedPrompts[key] !== currentValue
  }

  const handleSave = async (key: string) => {
    const value = getPromptValue(key)
    if (!value.trim() || value.length < 50) {
      showError('Prompt muito curto (mínimo 50 caracteres)')
      return
    }

    setSavingKey(key)
    try {
      await upsertAsync({
        key,
        value,
        category: 'PROMPTS',
        isEncrypted: false,
        description: PROMPT_METADATA[key]?.description || '',
      })
      setEditedPrompts((prev) => {
        const newState = { ...prev }
        delete newState[key]
        return newState
      })
      showSuccess('Prompt salvo!')
    } catch {
      showError('Erro ao salvar')
    } finally {
      setSavingKey(null)
    }
  }

  const handleRestore = (key: string) => {
    if (defaultPrompts[key]) {
      setEditedPrompts((prev) => ({ ...prev, [key]: defaultPrompts[key] }))
    }
  }

  const toggleExpand = (key: string) => {
    setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const promptsByCategory = Object.entries(PROMPT_METADATA).reduce(
    (acc, [key, meta]) => {
      if (!acc[meta.category]) acc[meta.category] = []
      acc[meta.category].push(key)
      return acc
    },
    {} as Record<string, string[]>
  )

  if (isLoading || loadingDefaults) {
    return (
      <div className="min-h-screen bg-gradient-radial">
        <Header title="Prompts de IA" description="Carregando..." />
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-radial">
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="relative z-10">
        <Header
          title="Prompts de IA"
          description="Configure os prompts usados pela IA para processar mensagens"
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

          <div className="glass-card p-4 border-amber-500/30 bg-amber-500/10">
            <div className="flex items-start gap-3">
              <Brain className="h-5 w-5 text-amber-400 mt-0.5" />
              <div>
                <p className="font-medium text-amber-300">Sobre os Prompts</p>
                <p className="text-sm text-amber-400/80">
                  Os prompts são carregados do backend. Clique em &quot;Restaurar&quot; para voltar ao padrão do sistema.
                </p>
              </div>
            </div>
          </div>

          {(['core', 'response', 'feedback'] as const).map((category) => {
            const categoryInfo = categoryLabels[category]
            const promptKeys = promptsByCategory[category] || []
            if (promptKeys.length === 0) return null

            return (
              <div key={category} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">{categoryInfo.label}</h2>
                  <p className="text-sm text-gray-400">{categoryInfo.description}</p>
                </div>

                <div className="space-y-4">
                  {promptKeys.map((key) => {
                    const metadata = PROMPT_METADATA[key]
                    if (!metadata) return null
                    const colors = colorClasses[metadata.color] || colorClasses.blue
                    const Icon = metadata.icon
                    const isSaving = savingKey === key
                    const changed = hasChanges(key)
                    const isExpanded = expandedCards[key] !== false

                    return (
                      <div
                        key={key}
                        className={`glass-card overflow-hidden transition-all ${changed ? 'ring-2 ring-amber-500/50' : ''}`}
                      >
                        <div
                          className="p-4 cursor-pointer flex items-start justify-between"
                          onClick={() => toggleExpand(key)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl bg-gradient-to-br ${colors.gradient} shadow-lg`}>
                              <Icon className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium text-white">{metadata.title}</h3>
                                {changed && (
                                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30">
                                    Não salvo
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-400">{metadata.description}</p>
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                            <div className="flex items-center justify-between">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleRestore(key) }}
                                className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                              >
                                <RotateCcw className="h-4 w-4 mr-1" />
                                Restaurar
                              </Button>
                              <Button
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleSave(key) }}
                                disabled={isSaving || isUpserting}
                                className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white"
                              >
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Salvar
                              </Button>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-gray-300">Prompt</Label>
                              <Textarea
                                rows={12}
                                className="font-mono text-sm bg-white/5 border-white/10 text-gray-200"
                                value={getPromptValue(key)}
                                onChange={(e) => handlePromptChange(key, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
