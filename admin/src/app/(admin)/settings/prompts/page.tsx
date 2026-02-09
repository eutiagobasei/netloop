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
  Link2,
  Sparkles,
} from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    placeholders?: string[]
  }
> = {
  prompt_intent_classification: {
    title: 'Classificação de Intenção',
    description:
      'Classifica a intenção da mensagem do usuário (busca, cadastro, atualização ou outro)',
    icon: Search,
    color: 'blue',
  },
  prompt_query_subject: {
    title: 'Extração de Assunto',
    description: 'Extrai o nome ou termo de busca quando o usuário quer consultar contatos',
    icon: FileText,
    color: 'purple',
  },
  prompt_contact_extraction: {
    title: 'Extração de Contato',
    description: 'Extrai dados estruturados de contato a partir do texto enviado pelo usuário',
    icon: UserPlus,
    color: 'green',
  },
  prompt_contact_with_connections: {
    title: 'Contato + Conexões',
    description:
      'Extrai dados do contato principal e também de outras pessoas mencionadas no texto',
    icon: Link2,
    color: 'orange',
  },
  prompt_registration_response: {
    title: 'Resposta de Registro',
    description: 'Gera respostas conversacionais durante o fluxo de cadastro de novos usuários',
    icon: MessageSquare,
    color: 'indigo',
    placeholders: ['{{name}}', '{{phoneConfirmed}}', '{{phoneFormatted}}', '{{email}}'],
  },
  prompt_greeting_response: {
    title: 'Resposta de Saudação',
    description: 'Gera respostas amigáveis para saudações e mensagens genéricas',
    icon: Sparkles,
    color: 'pink',
    placeholders: ['{{userName}}'],
  },
}

// Prompts padrão (fallback para restaurar)
const DEFAULT_PROMPTS: Record<string, string> = {
  prompt_intent_classification: `Classifique a intenção da mensagem:
- "query": usuário quer BUSCAR informação sobre alguém (ex: "quem é João?", "o que sabe sobre Maria?", "me fala do Pedro", "conhece algum advogado?")
- "contact_info": usuário está INFORMANDO dados de um contato para cadastrar. DEVE conter informações substanciais como: nome + empresa, nome + cargo, nome + contexto de como conheceu, etc. NÃO classifique como contact_info se for apenas um nome solto ou saudação.
- "update_contact": usuário quer ATUALIZAR dados de um contato existente (ex: "atualizar dados de João", "editar informações do Pedro", "corrigir o email da Maria")
- "other": saudação (oi, olá, bom dia), agradecimento, confirmação (ok, sim), ou mensagem sem informação de contato útil

IMPORTANTE: Mensagens como "Olá", "Opa", "Oi tudo bem?", "Bom dia", apenas um nome sem contexto, ou saudações em geral são SEMPRE "other".

Responda APENAS com: query, contact_info, update_contact ou other`,

  prompt_query_subject: `Extraia o NOME da pessoa ou o ASSUNTO que o usuário está buscando.
Exemplos:
- "quem é o João?" → "João"
- "o que você sabe sobre Maria Silva?" → "Maria Silva"
- "me fala do Pedro" → "Pedro"
- "conhece algum advogado?" → "advogado"
- "tem alguém de marketing?" → "marketing"

Responda APENAS com o nome ou termo de busca, sem pontuação ou explicações. Se não conseguir identificar, responda "null".`,

  prompt_contact_extraction: `Você é um assistente especializado em extrair informações de contatos profissionais de textos em português.

Analise o texto fornecido e extraia as seguintes informações (se disponíveis):
- name: Nome completo da pessoa (IMPORTANTE: incluir nome E sobrenome exatamente como mencionado. Ex: "João Silva", "Maria Santos", não apenas "João")
- company: Nome da empresa onde trabalha
- position: Cargo ou função
- phone: Número de telefone (formato brasileiro) - CAMPO OBRIGATÓRIO para salvar contato
- email: Endereço de email
- location: Cidade, estado ou país
- context: Um resumo de como/onde se conheceram ou o contexto do encontro
- tags: Lista de PONTOS DE CONEXÃO - inclua:
  * Lugares, eventos, grupos ou comunidades onde se conheceram (ex: "Em Adoração", "SIPAT 2024", "Igreja São Paulo")
  * Interesses e áreas de atuação profissional (ex: "investidor", "tecnologia", "podcast")

IMPORTANTE:
- O campo PHONE é OBRIGATÓRIO para salvar um contato - se não estiver no texto, retorne phone como null mas avise no contexto
- Normalize o telefone para apenas números se possível (ex: 5521987654321)
- Se uma informação não estiver clara no texto, não invente. Deixe o campo vazio ou null.
- O campo "context" deve ser um resumo útil do encontro/conversa.
- Tags devem priorizar ONDE/COMO se conheceram (pontos de conexão), seguido de interesses.
- Capture o nome EXATAMENTE como mencionado, incluindo sobrenome.

Retorne APENAS um JSON válido com os campos acima. Não inclua explicações.`,

  prompt_contact_with_connections: `Extraia informações de contato do texto. Retorne apenas JSON puro.

Esquema:
{
  "contact": {
    "name": "string (nome completo COM sobrenome, exatamente como mencionado)",
    "phone": "string|null (telefone formato brasileiro - OBRIGATÓRIO para salvar)",
    "email": "string|null",
    "company": "string|null (empresa)",
    "position": "string|null (cargo)",
    "location": "string|null (cidade/estado)",
    "tags": ["string"] (PONTOS DE CONEXÃO: lugares, eventos, grupos onde se conheceram + interesses. Ex: ["Em Adoração", "podcast", "investidor"]),
    "context": "string (resumo do encontro/conversa)"
  },
  "connections": [
    {
      "name": "string (nome completo da pessoa mencionada)",
      "about": "string (descrição/contexto sobre ela)",
      "tags": ["string"],
      "phone": "string|null"
    }
  ]
}

Regras:
- O "contact" é a pessoa PRINCIPAL sobre quem o texto fala
- NOME: Capture exatamente como mencionado, incluindo sobrenome (ex: "Ianne Higino", não "Ianne")
- PHONE: OBRIGATÓRIO para salvar um contato. Normalize para apenas números (ex: 5521987654321)
- TAGS: Priorize PONTOS DE CONEXÃO (onde/como se conheceram) + interesses profissionais
- "connections" são OUTRAS pessoas mencionadas que o contact conhece ou indicou
- Se não houver conexões mencionadas, retorne connections: []
- NÃO invente dados que não estejam explícitos no texto
- Campos ausentes devem ser null ou array vazio`,

  prompt_registration_response: `Você é o assistente do NetLoop, uma plataforma de networking que ajuda pessoas a organizar seus contatos profissionais.
Um novo usuário está se cadastrando via WhatsApp.

DADOS JÁ COLETADOS:
- Nome: {{name}}
- Telefone confirmado: {{phoneConfirmed}}
- Telefone detectado: {{phoneFormatted}}
- Email: {{email}}

REGRAS IMPORTANTES:
1. Seja conversacional e amigável, NUNCA robótico ou formal demais
2. Use linguagem natural e descontraída (pode usar "você", "a gente", etc)
3. Respostas curtas e diretas (máximo 2-3 frases)
4. Se for a primeira mensagem (saudação), apresente-se brevemente e pergunte o nome
5. APÓS ter o nome, peça confirmação do telefone mostrando o número formatado
6. Se usuário confirmar o telefone (sim, correto, isso, exato, etc), marque phoneConfirmed: true
7. Se usuário negar (não, errado, etc), peça para digitar o número correto
8. Só peça email DEPOIS de ter nome E telefone confirmado
9. Quando tiver TODOS (nome + telefone confirmado + email válido), confirme o cadastro com entusiasmo
10. Email deve ter formato válido (algo@algo.algo)
11. NÃO invente dados - só extraia o que o usuário realmente disse

FLUXO DE ESTADOS:
1. [Primeira mensagem] → Se apresentar e pedir nome
2. [TEM NOME] → Mostrar telefone detectado e pedir confirmação
3. [TELEFONE CONFIRMADO] → Pedir email
4. [COMPLETED] → Nome + Telefone + Email coletados

EXEMPLOS DE TOM:
- "Oi! Prazer, sou o assistente do NetLoop 👋 Como posso te chamar?"
- "Show, {{name}}! Detectei que seu número é {{phoneFormatted}}. Tá certo?"
- "Perfeito! Me passa seu email pra finalizar o cadastro?"
- "Pronto! Cadastro concluído! Agora é só me mandar áudios ou textos sobre pessoas que conheceu 🚀"

RESPONDA APENAS EM JSON VÁLIDO:
{
  "response": "Sua mensagem de resposta",
  "extracted": {
    "name": "nome extraído ou null se não encontrou",
    "email": "email extraído ou null se não encontrou",
    "phoneConfirmed": true/false
  },
  "isComplete": false
}

IMPORTANTE: isComplete só deve ser true quando TODOS (nome + telefone confirmado + email válido) estiverem coletados.`,

  prompt_greeting_response: `Você é um assistente virtual amigável do NetLoop, um sistema de gerenciamento de contatos via WhatsApp.

Gere uma resposta curta e simpática para uma saudação do usuário.

FUNCIONALIDADES DO SISTEMA:
- Salvar contatos: usuário envia nome, telefone, email, etc.
- Buscar contatos: usuário pergunta "quem é João?" ou "me passa o contato do Carlos"
- Atualizar contatos existentes

REGRAS:
- Seja breve (máximo 3 linhas)
- Use tom amigável e profissional
- Mencione brevemente o que o sistema pode fazer
- {{userName}}
- Pode usar 1 emoji no máximo`,
}

const colorClasses: Record<string, { bg: string; icon: string; border: string }> = {
  blue: { bg: 'bg-blue-100', icon: 'text-blue-600', border: 'border-blue-200' },
  purple: { bg: 'bg-purple-100', icon: 'text-purple-600', border: 'border-purple-200' },
  green: { bg: 'bg-green-100', icon: 'text-green-600', border: 'border-green-200' },
  orange: { bg: 'bg-orange-100', icon: 'text-orange-600', border: 'border-orange-200' },
  indigo: { bg: 'bg-indigo-100', icon: 'text-indigo-600', border: 'border-indigo-200' },
  pink: { bg: 'bg-pink-100', icon: 'text-pink-600', border: 'border-pink-200' },
}

export default function PromptsPage() {
  const { settings, isLoading, getSetting, upsertAsync, isUpserting } = useSettings('PROMPTS')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

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
    // Se o usuário editou, usar o valor editado
    if (editedPrompts[key] !== undefined) {
      return editedPrompts[key]
    }
    // Senão, usar o valor do banco ou o padrão
    const setting = getSetting(key)
    return setting?.value || DEFAULT_PROMPTS[key] || ''
  }

  const hasChanges = (key: string): boolean => {
    if (editedPrompts[key] === undefined) return false
    const currentValue = getSetting(key)?.value || DEFAULT_PROMPTS[key] || ''
    return editedPrompts[key] !== currentValue
  }

  const handleSave = async (key: string) => {
    const value = getPromptValue(key)
    if (!value.trim()) {
      showError('O prompt não pode estar vazio')
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
      // Limpa o estado de edição para este prompt
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

  if (isLoading) {
    return (
      <div>
        <Header title="Prompts de IA" description="Carregando..." />
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  const promptKeys = Object.keys(PROMPT_METADATA)

  return (
    <div>
      <Header
        title="Prompts de IA"
        description="Configure os prompts usados pela IA para extração e processamento de mensagens"
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

        {/* Info Card */}
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="flex items-start gap-3 pt-6">
            <Brain className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Sobre os Prompts</p>
              <p className="mt-1 text-sm text-amber-700">
                Os prompts abaixo são usados pela IA para processar as mensagens recebidas via
                WhatsApp. Você pode personalizá-los para ajustar o comportamento do sistema.
                Alterações incorretas podem afetar a qualidade das respostas.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Prompts Grid */}
        <div className="space-y-6">
          {promptKeys.map((key) => {
            const metadata = PROMPT_METADATA[key]
            const colors = colorClasses[metadata.color] || colorClasses.blue
            const Icon = metadata.icon
            const isSaving = savingKey === key
            const changed = hasChanges(key)

            return (
              <Card key={key} className={changed ? 'border-2 border-yellow-400' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-2 ${colors.bg}`}>
                        <Icon className={`h-5 w-5 ${colors.icon}`} />
                      </div>
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {metadata.title}
                          {changed && (
                            <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-normal text-yellow-700">
                              Não salvo
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription>{metadata.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestore(key)}
                        title="Restaurar padrão"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSave(key)}
                        disabled={isSaving || isUpserting}
                      >
                        {isSaving ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Salvar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={key}>Prompt</Label>
                    <Textarea
                      id={key}
                      rows={12}
                      className="font-mono text-sm"
                      value={getPromptValue(key)}
                      onChange={(e) => handlePromptChange(key, e.target.value)}
                    />
                  </div>

                  {metadata.placeholders && metadata.placeholders.length > 0 && (
                    <div className={`rounded-lg p-3 ${colors.bg}`}>
                      <p className={`text-sm font-medium ${colors.icon}`}>
                        Placeholders disponíveis:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {metadata.placeholders.map((placeholder) => (
                          <code
                            key={placeholder}
                            className="rounded bg-white px-2 py-1 text-xs font-mono text-gray-700"
                          >
                            {placeholder}
                          </code>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-gray-600">
                        Estes valores são substituídos automaticamente durante a execução
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
