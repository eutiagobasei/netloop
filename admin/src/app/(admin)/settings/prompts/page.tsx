'use client'

import { useState } from 'react'
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

// Metadados dos prompts com descrições e ícones
const PROMPT_METADATA: Record<
  string,
  {
    title: string
    description: string
    icon: React.ElementType
    color: string
    placeholders?: Array<{ name: string; description: string }>
    category: 'core' | 'response' | 'feedback'
  }
> = {
  // === CORE: Prompts de classificação e extração ===
  prompt_intent_classification: {
    title: 'Classificação de Intenção',
    description:
      'Classifica a intenção da mensagem: query (busca), contact_info (cadastro), update_contact, register_intent ou other',
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
    description:
      'Extrai dados estruturados (nome, telefone, empresa, etc.) a partir do texto do usuário',
    icon: UserPlus,
    color: 'green',
    category: 'core',
  },

  // === RESPONSE: Prompts de geração de resposta ===
  prompt_greeting_response: {
    title: 'Resposta de Saudação',
    description: 'Gera respostas amigáveis para saudações e mensagens genéricas',
    icon: Sparkles,
    color: 'pink',
    category: 'response',
    placeholders: [
      {
        name: '{{userName}}',
        description: 'Nome do usuário (se conhecido) ou instrução de que não sabemos',
      },
    ],
  },
  prompt_registration_response: {
    title: 'Resposta de Registro',
    description: 'Gera respostas conversacionais durante o fluxo de cadastro de novos usuários',
    icon: MessageSquare,
    color: 'indigo',
    category: 'response',
    placeholders: [
      { name: '{{name}}', description: 'Nome do usuário sendo cadastrado' },
      { name: '{{phoneConfirmed}}', description: 'Se o telefone foi confirmado (SIM/NÃO)' },
      { name: '{{phoneFormatted}}', description: 'Telefone formatado detectado' },
      { name: '{{email}}', description: 'Email do usuário' },
    ],
  },
  prompt_search_response: {
    title: 'Resposta de Busca',
    description: 'Formata a resposta quando o usuário busca por contatos',
    icon: Search,
    color: 'cyan',
    category: 'response',
    placeholders: [
      { name: '{{searchTerm}}', description: 'Termo buscado pelo usuário' },
      { name: '{{resultCount}}', description: 'Quantidade de resultados encontrados' },
      { name: '{{contacts}}', description: 'Lista de contatos em JSON' },
    ],
  },

  // === FEEDBACK: Prompts de confirmação e erro ===
  prompt_save_confirmation: {
    title: 'Confirmação de Salvamento',
    description: 'Confirma que um contato foi salvo com sucesso',
    icon: CheckCircle,
    color: 'emerald',
    category: 'feedback',
    placeholders: [
      { name: '{{name}}', description: 'Nome do contato salvo' },
      { name: '{{company}}', description: 'Empresa do contato' },
      { name: '{{position}}', description: 'Cargo do contato' },
      { name: '{{phone}}', description: 'Telefone do contato' },
      { name: '{{email}}', description: 'Email do contato' },
      { name: '{{context}}', description: 'Contexto de onde conheceu' },
      { name: '{{tags}}', description: 'Tags do contato' },
    ],
  },
  prompt_update_confirmation: {
    title: 'Confirmação de Atualização',
    description: 'Confirma que um contato foi atualizado',
    icon: RefreshCw,
    color: 'amber',
    category: 'feedback',
    placeholders: [
      { name: '{{name}}', description: 'Nome do contato' },
      { name: '{{field}}', description: 'Campo atualizado' },
      { name: '{{oldValue}}', description: 'Valor anterior' },
      { name: '{{newValue}}', description: 'Novo valor' },
    ],
  },
  prompt_error_response: {
    title: 'Resposta de Erro',
    description: 'Gera mensagens amigáveis quando ocorre um erro',
    icon: AlertCircle,
    color: 'red',
    category: 'feedback',
    placeholders: [
      {
        name: '{{errorType}}',
        description: 'Tipo: missing_phone, missing_name, not_found, duplicate, generic',
      },
      { name: '{{errorDetails}}', description: 'Detalhes adicionais do erro' },
    ],
  },
  prompt_context_question: {
    title: 'Pergunta de Contexto',
    description: 'Pergunta sobre dados faltantes após salvar um contato',
    icon: HelpCircle,
    color: 'violet',
    category: 'feedback',
    placeholders: [
      { name: '{{name}}', description: 'Nome do contato' },
      { name: '{{phone}}', description: 'Telefone do contato' },
      { name: '{{missingFields}}', description: 'Lista de campos faltantes' },
    ],
  },
  prompt_loop_strategy: {
    title: 'Loop - Estrategista de Networking',
    description: 'Gera planos estratégicos de ação baseados na rede de contatos do usuário',
    icon: Target,
    color: 'pink',
    category: 'response',
    placeholders: [
      { name: '{{userProfile}}', description: 'JSON com perfil do usuário (nome, email)' },
      { name: '{{contacts}}', description: 'JSON array dos contatos de 1º grau' },
      { name: '{{secondDegreeContacts}}', description: 'JSON array dos contatos de 2º grau' },
      { name: '{{goal}}', description: 'Objetivo digitado pelo usuário' },
      { name: '{{analyzedCount}}', description: 'Número de contatos analisados' },
      { name: '{{totalCount}}', description: 'Número total de contatos' },
    ],
  },
}

// Prompts padrão (fallback para restaurar)
const DEFAULT_PROMPTS: Record<string, string> = {
  prompt_intent_classification: `Classifique a intenção da mensagem do usuário em UMA das categorias abaixo:

CATEGORIAS:
- "query": Usuário quer BUSCAR/CONSULTAR informação sobre uma pessoa ou profissão
- "contact_info": Usuário está FORNECENDO dados de contato para SALVAR
- "update_contact": Usuário quer MODIFICAR dados de um contato JÁ EXISTENTE
- "register_intent": Usuário expressa INTENÇÃO de cadastrar mas NÃO fornece os dados ainda
- "other": Saudações, agradecimentos, confirmações, perguntas genéricas

Responda APENAS com: query, contact_info, update_contact, register_intent ou other`,

  prompt_query_subject: `Extraia o NOME da pessoa ou o ASSUNTO/PROFISSÃO que o usuário está buscando.
Responda APENAS com o nome/termo, sem pontuação ou explicações.
Se não conseguir identificar, responda "null".`,

  prompt_contact_extraction: `Você é um extrator especializado em dados de contatos profissionais.
Extraia: name, company, position, phone, email, location, context, tags
Retorne APENAS um JSON válido com os campos.`,

  prompt_greeting_response: `Você é o assistente do NetLoop. Gere uma saudação amigável.
Contexto: {{userName}}
Máximo 3 linhas, pode usar 1 emoji.`,

  prompt_registration_response: `Você é o assistente do NetLoop. Um novo usuário está se cadastrando.
Dados: Nome={{name}}, Telefone={{phoneFormatted}}, Email={{email}}
Responda em JSON: {"response": "...", "extracted": {...}, "isComplete": false}`,

  prompt_search_response: `Busca: {{searchTerm}}
Resultados: {{resultCount}}
Contatos: {{contacts}}
Formate a resposta de forma clara.`,

  prompt_save_confirmation: `Contato salvo: {{name}} - {{company}}
Confirme de forma breve e amigável.`,

  prompt_update_confirmation: `Atualizado {{field}} de {{name}}: {{oldValue}} → {{newValue}}
Confirme brevemente.`,

  prompt_error_response: `Erro: {{errorType}}
Detalhes: {{errorDetails}}
Responda de forma amigável.`,

  prompt_context_question: `Salvei {{name}} ({{phone}}). Faltam: {{missingFields}}
Pergunte sobre o dado mais importante.`,

  prompt_loop_strategy: `Você é o Loop, estrategista de networking de elite.
Analise a rede do usuário e crie um plano de ação estratégico.

Perfil: {{userProfile}}
Contatos 1º grau: {{contacts}}
Contatos 2º grau: {{secondDegreeContacts}}
Objetivo: {{goal}}

Responda em JSON com: goal, decomposedNeeds[], actionPlan[], gaps[]`,
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
  core: {
    label: 'Classificação e Extração',
    description: 'Prompts que analisam e extraem dados das mensagens',
  },
  response: {
    label: 'Geração de Resposta',
    description: 'Prompts que geram respostas para o usuário',
  },
  feedback: {
    label: 'Confirmação e Feedback',
    description: 'Prompts de confirmação, erro e perguntas de contexto',
  },
}

export default function PromptsPage() {
  const { settings, isLoading, getSetting, upsertAsync, isUpserting } = useSettings('PROMPTS')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  const [previewMode, setPreviewMode] = useState<Record<string, boolean>>({})

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
    if (editedPrompts[key] !== undefined) {
      return editedPrompts[key]
    }
    const setting = getSetting(key)
    return setting?.value || DEFAULT_PROMPTS[key] || ''
  }

  const hasChanges = (key: string): boolean => {
    if (editedPrompts[key] === undefined) return false
    const currentValue = getSetting(key)?.value || DEFAULT_PROMPTS[key] || ''
    return editedPrompts[key] !== currentValue
  }

  const validatePrompt = (key: string, value: string): string | null => {
    if (!value.trim()) return 'O prompt não pode estar vazio'
    if (value.length > 10000) return 'Prompt muito longo (máximo 10.000 caracteres)'
    if (value.length < 50) return 'Prompt muito curto (mínimo 50 caracteres)'
    return null
  }

  const handleSave = async (key: string) => {
    const value = getPromptValue(key)
    const validationError = validatePrompt(key, value)
    if (validationError) {
      showError(validationError)
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
      showSuccess('Prompt salvo com sucesso!')
    } catch (error) {
      showError('Erro ao salvar prompt')
    } finally {
      setSavingKey(null)
    }
  }

  const handleRestore = (key: string) => {
    const defaultValue = DEFAULT_PROMPTS[key]
    if (defaultValue) {
      setEditedPrompts((prev) => ({ ...prev, [key]: defaultValue }))
    }
  }

  const toggleExpand = (key: string) => {
    setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const togglePreview = (key: string) => {
    setPreviewMode((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const getPreviewValue = (key: string): string => {
    let value = getPromptValue(key)
    const metadata = PROMPT_METADATA[key]

    if (metadata?.placeholders) {
      const exampleValues: Record<string, string> = {
        '{{userName}}': 'João Silva',
        '{{name}}': 'João Silva',
        '{{phoneConfirmed}}': 'SIM',
        '{{phoneFormatted}}': '(21) 99999-9999',
        '{{email}}': 'joao@email.com',
        '{{searchTerm}}': 'advogado',
        '{{resultCount}}': '2',
        '{{contacts}}': '[{"name": "Maria Santos", "position": "advogada"}]',
        '{{company}}': 'Tech Corp',
        '{{position}}': 'Desenvolvedor',
        '{{phone}}': '21999998888',
        '{{context}}': 'Conheceu na SIPAT 2024',
        '{{tags}}': 'SIPAT, tecnologia',
        '{{field}}': 'telefone',
        '{{oldValue}}': '21888887777',
        '{{newValue}}': '21999998888',
        '{{errorType}}': 'missing_phone',
        '{{errorDetails}}': 'Não foi possível identificar o número',
        '{{missingFields}}': 'contexto, empresa',
      }

      for (const placeholder of metadata.placeholders) {
        const name = placeholder.name
        if (exampleValues[name]) {
          value = value.replace(new RegExp(name.replace(/[{}]/g, '\\$&'), 'g'), exampleValues[name])
        }
      }
    }

    return value
  }

  const promptsByCategory = Object.entries(PROMPT_METADATA).reduce(
    (acc, [key, meta]) => {
      if (!acc[meta.category]) {
        acc[meta.category] = []
      }
      acc[meta.category].push(key)
      return acc
    },
    {} as Record<string, string[]>
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-radial">
        <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
        <Header title="Prompts de IA" description="Carregando..." />
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-radial">
      {/* Background decorative elements */}
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-50" />
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <Header
          title="Prompts de IA"
          description="Configure os prompts usados pela IA para extração e processamento de mensagens"
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

          {/* Info Card */}
          <div className="glass-card p-4 border-amber-500/30 bg-amber-500/10">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Brain className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="font-medium text-amber-300">Sobre os Prompts</p>
                <p className="mt-1 text-sm text-amber-400/80">
                  Os prompts abaixo são usados pela IA para processar as mensagens recebidas via
                  WhatsApp. Você pode personalizá-los para ajustar o comportamento do sistema.
                </p>
              </div>
            </div>
          </div>

          {/* Prompts por Categoria */}
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
                    const colors = colorClasses[metadata.color] || colorClasses.blue
                    const Icon = metadata.icon
                    const isSaving = savingKey === key
                    const changed = hasChanges(key)
                    const isExpanded = expandedCards[key] !== false
                    const isPreview = previewMode[key] || false

                    return (
                      <div
                        key={key}
                        className={`glass-card overflow-hidden transition-all ${changed ? 'ring-2 ring-amber-500/50' : ''}`}
                      >
                        {/* Header */}
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
                          <div className="ml-2">
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-gray-500" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-gray-500" />
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-4">
                            {/* Toolbar */}
                            <div className="flex items-center justify-between">
                              <div className="flex gap-2">
                                {metadata.placeholders && metadata.placeholders.length > 0 && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      togglePreview(key)
                                    }}
                                    className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    {isPreview ? 'Editar' : 'Preview'}
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRestore(key)
                                  }}
                                  className="bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
                                >
                                  <RotateCcw className="h-4 w-4 mr-1" />
                                  Restaurar
                                </Button>
                              </div>
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSave(key)
                                }}
                                disabled={isSaving || isUpserting}
                                className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white"
                              >
                                {isSaving ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Save className="mr-2 h-4 w-4" />
                                )}
                                Salvar
                              </Button>
                            </div>

                            {/* Editor ou Preview */}
                            <div className="space-y-2">
                              <Label className="text-gray-300">
                                {isPreview ? 'Preview (com valores de exemplo)' : 'Prompt'}
                              </Label>
                              <Textarea
                                rows={10}
                                className={`font-mono text-sm bg-white/5 border-white/10 text-gray-200 placeholder:text-gray-500 ${isPreview ? 'bg-white/10' : ''}`}
                                value={isPreview ? getPreviewValue(key) : getPromptValue(key)}
                                onChange={(e) => handlePromptChange(key, e.target.value)}
                                readOnly={isPreview}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>

                            {/* Placeholders */}
                            {metadata.placeholders && metadata.placeholders.length > 0 && (
                              <div className={`rounded-xl p-4 ${colors.bg} border ${colors.border}`}>
                                <p className={`text-sm font-medium ${colors.icon} mb-3`}>
                                  Placeholders disponíveis:
                                </p>
                                <div className="space-y-2">
                                  {metadata.placeholders.map((placeholder) => (
                                    <div
                                      key={placeholder.name}
                                      className="flex items-start gap-2 text-sm"
                                    >
                                      <code className="rounded bg-white/10 px-2 py-1 text-xs font-mono text-gray-300 whitespace-nowrap">
                                        {placeholder.name}
                                      </code>
                                      <span className="text-gray-400 pt-0.5">
                                        {placeholder.description}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
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
