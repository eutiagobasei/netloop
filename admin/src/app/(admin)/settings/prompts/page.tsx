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
}

// Prompts padrão (fallback para restaurar) - sincronizados com o backend
const DEFAULT_PROMPTS: Record<string, string> = {
  prompt_intent_classification: `Classifique a intenção da mensagem do usuário em UMA das categorias abaixo:

CATEGORIAS:
- "query": Usuário quer BUSCAR/CONSULTAR informação sobre uma pessoa ou profissão
  Exemplos: "quem é João?", "o que sabe sobre Maria?", "me fala do Pedro", "conhece algum advogado?", "tem contato de nutricionista?"

- "contact_info": Usuário está FORNECENDO dados de contato para SALVAR
  REQUISITOS: Deve conter nome + pelo menos UMA informação adicional (telefone, empresa, cargo, contexto de onde conheceu, etc.)
  Exemplos: "João Silva da XYZ Ltda, 21 99999-9999", "Conheci Maria no evento, ela é designer", "Pedro Souza, advogado, trabalha na Silva Advogados"
  NÃO É contact_info: apenas um nome solto ("João"), saudação com nome ("Oi João"), confirmação ("sim, salva")

- "update_contact": Usuário quer MODIFICAR dados de um contato JÁ EXISTENTE
  Exemplos: "atualiza o telefone do João", "corrige o email da Maria", "muda a empresa do Pedro", "adiciona tag ao Carlos"

- "register_intent": Usuário expressa INTENÇÃO de cadastrar mas NÃO fornece os dados ainda
  Exemplos: "quero salvar um contato", "cadastrar novo contato", "adicionar pessoa", "vou te passar um contato"

- "other": Saudações, agradecimentos, confirmações, perguntas genéricas ou mensagens sem informação de contato
  Exemplos: "Oi", "Bom dia", "Obrigado", "Ok", "Tudo bem?", "Como funciona?", "Ajuda", apenas um nome sem contexto

CASOS DE BORDA:
- Mensagem muito curta (<10 caracteres): provavelmente "other"
- Nome + "do/da [empresa]": é "contact_info" (tem contexto)
- Nome + "telefone é X": é "contact_info"
- Nome solto sem contexto: é "other"
- "Salva o João": é "register_intent" (intenção sem dados suficientes)

Responda APENAS com: query, contact_info, update_contact, register_intent ou other`,

  prompt_query_subject: `Extraia o NOME da pessoa ou o ASSUNTO/PROFISSÃO que o usuário está buscando.

REGRAS:
1. Se for busca por pessoa, extraia o nome completo mencionado
2. Se for busca por profissão/categoria, extraia o termo de busca
3. Ignore artigos (o, a, os, as) no início
4. Mantenha sobrenomes quando mencionados

EXEMPLOS:
- "quem é o João?" → "João"
- "o que você sabe sobre Maria Silva?" → "Maria Silva"
- "me fala do Pedro Santos" → "Pedro Santos"
- "conhece algum advogado?" → "advogado"
- "tem alguém de marketing?" → "marketing"
- "passa o contato do Dr. Carlos" → "Dr. Carlos"
- "quem trabalha com tecnologia?" → "tecnologia"
- "tem nutricionista na base?" → "nutricionista"

Responda APENAS com o nome/termo, sem pontuação ou explicações.
Se não conseguir identificar, responda "null".`,

  prompt_contact_extraction: `Você é um extrator especializado em dados de contatos profissionais de textos em português brasileiro.

CAMPOS A EXTRAIR:
- name: Nome completo (nome + sobrenome quando disponível)
- company: Empresa onde trabalha
- position: Cargo ou função
- phone: Telefone (OBRIGATÓRIO para salvar - veja regras abaixo)
- email: Email
- location: Cidade/Estado/País
- context: Resumo de como/onde se conheceram
- tags: Lista de pontos de conexão e interesses

REGRAS DE TELEFONE (CRÍTICO):
1. Aceite TODOS estes formatos brasileiros:
   - Com código país: +55 21 99999-9999, 5521999999999
   - Com DDD: (21) 99999-9999, 21 99999-9999, 21999999999
   - Sem DDD: 99999-9999, 999999999 (8-9 dígitos)
   - Com hífen/espaço: 99999-9999, 99999 9999
2. NORMALIZE para apenas números: 5521999999999 ou 21999999999 ou 999999999
3. Se não houver telefone, retorne phone: null

REGRAS DE EXTRAÇÃO:
- Capture o nome EXATAMENTE como mencionado, com sobrenome
- NÃO invente dados - deixe null se não estiver claro
- Context deve ser útil: onde conheceu, evento, situação
- Tags: priorize ONDE conheceu (evento, grupo, local), depois interesses/área

EXEMPLOS DE EXTRAÇÃO:
Texto: "João Silva da Tech Corp, 21 98765-4321, conheci na SIPAT"
→ {"name": "João Silva", "company": "Tech Corp", "phone": "21987654321", "context": "Conheceu na SIPAT", "tags": ["SIPAT"]}

Texto: "Maria, advogada, +55 11 99999-8888, especialista em direito trabalhista"
→ {"name": "Maria", "position": "advogada", "phone": "5511999998888", "tags": ["direito trabalhista"]}

Texto: "Pedro Souza do Nubank"
→ {"name": "Pedro Souza", "company": "Nubank", "phone": null, "context": "Telefone não informado"}

Retorne APENAS um JSON válido com os campos. Não inclua explicações.`,

  prompt_greeting_response: `Você é o assistente do NetLoop, um sistema de networking pessoal via WhatsApp.

CONTEXTO DO USUÁRIO:
{{userName}}

FUNCIONALIDADES DO SISTEMA:
1. SALVAR contatos: enviar nome + telefone + contexto de onde conheceu
2. BUSCAR contatos: perguntar "quem é [nome]?" ou "tem contato de [profissão]?"
3. ATUALIZAR contatos: pedir para modificar dados existentes

GERE UMA RESPOSTA DE SAUDAÇÃO SEGUINDO:
- Máximo 3 linhas
- Tom amigável e profissional
- Se souber o nome do usuário, use-o
- Mencione 1-2 funcionalidades brevemente
- Pode usar até 1 emoji
- NÃO seja robótico ou formal demais

EXEMPLOS DE TOM:
- "Oi! Sou o NetLoop, sua memória de networking 🧠 Me manda um contato pra salvar ou pergunta sobre alguém!"
- "E aí, [nome]! Tô aqui pra te ajudar com seus contatos. Quer salvar alguém novo ou buscar algum contato?"

Responda DIRETAMENTE com a mensagem de saudação (não use JSON).`,

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

  prompt_search_response: `Você é o assistente do NetLoop. O usuário fez uma busca e você precisa formatar a resposta.

DADOS DA BUSCA:
- Termo buscado: {{searchTerm}}
- Resultados encontrados: {{resultCount}}
- Contatos: {{contacts}}

REGRAS:
1. Se encontrou contatos, liste-os de forma clara e organizada
2. Mostre: nome, empresa/cargo (se houver), telefone, contexto de como conheceu
3. Se não encontrou, sugira alternativas ou pergunte se quer salvar um novo
4. Máximo 1 emoji por contato
5. Use formatação WhatsApp (*negrito* para nomes)

EXEMPLOS DE RESPOSTA:

Com resultados:
"Encontrei 2 contatos de 'advogado':

*João Silva* - Silva Advogados
📱 21 99999-9999
📍 Conheceu na OAB RJ

*Maria Santos* - Autônoma
📱 11 98888-7777
📍 Indicação do Pedro"

Sem resultados:
"Não encontrei ninguém com 'nutricionista' na sua rede 🤔
Quer cadastrar alguém dessa área?"

Responda DIRETAMENTE com a mensagem formatada (não use JSON).`,

  prompt_save_confirmation: `Você é o assistente do NetLoop. Um contato foi salvo com sucesso.

DADOS DO CONTATO SALVO:
- Nome: {{name}}
- Empresa: {{company}}
- Cargo: {{position}}
- Telefone: {{phone}}
- Email: {{email}}
- Contexto: {{context}}
- Tags: {{tags}}

REGRAS:
1. Confirme o salvamento de forma entusiasmada mas breve
2. Resuma os dados principais salvos (nome + 1-2 infos mais relevantes)
3. Máximo 3 linhas
4. Use 1 emoji
5. Opcionalmente pergunte se quer adicionar mais detalhes

EXEMPLO:
"✅ Salvei o contato de *João Silva* da Tech Corp!
Telefone: 21 99999-9999, conheceu na SIPAT.
Quer adicionar mais alguma info?"

Responda DIRETAMENTE com a mensagem (não use JSON).`,

  prompt_update_confirmation: `Você é o assistente do NetLoop. Um contato foi atualizado com sucesso.

DADOS DA ATUALIZAÇÃO:
- Nome do contato: {{name}}
- Campo atualizado: {{field}}
- Valor anterior: {{oldValue}}
- Novo valor: {{newValue}}

REGRAS:
1. Confirme a atualização de forma clara e breve
2. Mostre o que foi alterado (antes → depois)
3. Máximo 2 linhas
4. Use 1 emoji

EXEMPLO:
"✅ Atualizei o contato de *João Silva*!
Telefone: 21 88888-8888 → 21 99999-9999"

Responda DIRETAMENTE com a mensagem (não use JSON).`,

  prompt_error_response: `Você é o assistente do NetLoop. Ocorreu um erro e você precisa informar ao usuário.

TIPO DE ERRO: {{errorType}}
DETALHES: {{errorDetails}}

TIPOS DE ERRO COMUNS:
- missing_phone: Não foi possível extrair telefone do texto
- missing_name: Não foi possível identificar o nome do contato
- invalid_format: Formato de dados inválido
- not_found: Contato não encontrado na busca
- duplicate: Contato já existe
- generic: Erro genérico do sistema

REGRAS:
1. Seja amigável mesmo no erro - não culpe o usuário
2. Explique o problema de forma simples
3. Sugira como resolver ou o que fazer diferente
4. Máximo 3 linhas
5. Pode usar 1 emoji

EXEMPLOS:

missing_phone:
"Hmm, não consegui pegar o telefone 📱
Me manda novamente com o número? Ex: João Silva, 21 99999-9999"

missing_name:
"Não identifiquei o nome do contato 🤔
Pode me mandar assim: Nome, telefone, contexto?"

not_found:
"Não encontrei ninguém com esse nome na sua rede.
Quer que eu cadastre como novo contato?"

Responda DIRETAMENTE com a mensagem (não use JSON).`,

  prompt_context_question: `Você é o assistente do NetLoop. Você salvou um contato mas faltam informações importantes.

DADOS JÁ COLETADOS:
- Nome: {{name}}
- Telefone: {{phone}}
- Dados faltantes: {{missingFields}}

REGRAS:
1. Pergunte de forma natural sobre o dado faltante mais importante
2. Prioridade: contexto de onde conheceu > empresa > cargo > email
3. Seja breve e direto
4. Máximo 2 linhas

EXEMPLOS:

Faltando contexto:
"Salvei o *João Silva*! 📱 Onde vocês se conheceram?"

Faltando empresa:
"Anotado! *Maria* trabalha em qual empresa?"

Faltando cargo:
"*Pedro* da XYZ salvo! Qual o cargo dele lá?"

Responda DIRETAMENTE com a pergunta (não use JSON).`,
}

const colorClasses: Record<string, { bg: string; icon: string; border: string }> = {
  blue: { bg: 'bg-blue-100', icon: 'text-blue-600', border: 'border-blue-200' },
  purple: { bg: 'bg-purple-100', icon: 'text-purple-600', border: 'border-purple-200' },
  green: { bg: 'bg-green-100', icon: 'text-green-600', border: 'border-green-200' },
  indigo: { bg: 'bg-indigo-100', icon: 'text-indigo-600', border: 'border-indigo-200' },
  pink: { bg: 'bg-pink-100', icon: 'text-pink-600', border: 'border-pink-200' },
  cyan: { bg: 'bg-cyan-100', icon: 'text-cyan-600', border: 'border-cyan-200' },
  emerald: { bg: 'bg-emerald-100', icon: 'text-emerald-600', border: 'border-emerald-200' },
  amber: { bg: 'bg-amber-100', icon: 'text-amber-600', border: 'border-amber-200' },
  red: { bg: 'bg-red-100', icon: 'text-red-600', border: 'border-red-200' },
  violet: { bg: 'bg-violet-100', icon: 'text-violet-600', border: 'border-violet-200' },
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

  const toggleExpand = (key: string) => {
    setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const togglePreview = (key: string) => {
    setPreviewMode((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Substitui placeholders com valores de exemplo para preview
  const getPreviewValue = (key: string): string => {
    let value = getPromptValue(key)
    const metadata = PROMPT_METADATA[key]

    if (metadata?.placeholders) {
      const exampleValues: Record<string, string> = {
        '{{userName}}': 'O nome do usuário é João Silva. Use o nome na saudação.',
        '{{name}}': 'João Silva',
        '{{phoneConfirmed}}': 'SIM',
        '{{phoneFormatted}}': '(21) 99999-9999',
        '{{email}}': 'joao@email.com',
        '{{searchTerm}}': 'advogado',
        '{{resultCount}}': '2',
        '{{contacts}}':
          '[{"name": "Maria Santos", "position": "advogada", "phone": "21988887777"}]',
        '{{company}}': 'Tech Corp',
        '{{position}}': 'Desenvolvedor',
        '{{phone}}': '21999998888',
        '{{context}}': 'Conheceu na SIPAT 2024',
        '{{tags}}': 'SIPAT, tecnologia',
        '{{field}}': 'telefone',
        '{{oldValue}}': '21888887777',
        '{{newValue}}': '21999998888',
        '{{errorType}}': 'missing_phone',
        '{{errorDetails}}': 'Não foi possível identificar o número de telefone',
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

  // Agrupa prompts por categoria
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
      <div>
        <Header title="Prompts de IA" description="Carregando..." />
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

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

        {/* Prompts por Categoria */}
        {(['core', 'response', 'feedback'] as const).map((category) => {
          const categoryInfo = categoryLabels[category]
          const promptKeys = promptsByCategory[category] || []

          if (promptKeys.length === 0) return null

          return (
            <div key={category} className="mb-8">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{categoryInfo.label}</h2>
                <p className="text-sm text-gray-500">{categoryInfo.description}</p>
              </div>

              <div className="space-y-4">
                {promptKeys.map((key) => {
                  const metadata = PROMPT_METADATA[key]
                  const colors = colorClasses[metadata.color] || colorClasses.blue
                  const Icon = metadata.icon
                  const isSaving = savingKey === key
                  const changed = hasChanges(key)
                  const isExpanded = expandedCards[key] !== false // Expandido por padrão
                  const isPreview = previewMode[key] || false

                  return (
                    <Card
                      key={key}
                      className={`transition-all ${changed ? 'border-2 border-yellow-400' : ''}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div
                            className="flex items-center gap-3 cursor-pointer flex-1"
                            onClick={() => toggleExpand(key)}
                          >
                            <div className={`rounded-full p-2 ${colors.bg}`}>
                              <Icon className={`h-5 w-5 ${colors.icon}`} />
                            </div>
                            <div className="flex-1">
                              <CardTitle className="flex items-center gap-2 text-base">
                                {metadata.title}
                                {changed && (
                                  <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-normal text-yellow-700">
                                    Não salvo
                                  </span>
                                )}
                              </CardTitle>
                              <CardDescription className="text-sm">
                                {metadata.description}
                              </CardDescription>
                            </div>
                            <div className="ml-2">
                              {isExpanded ? (
                                <ChevronUp className="h-5 w-5 text-gray-400" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-gray-400" />
                              )}
                            </div>
                          </div>
                        </div>
                      </CardHeader>

                      {isExpanded && (
                        <CardContent className="space-y-4 pt-2">
                          {/* Toolbar */}
                          <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                              {metadata.placeholders && metadata.placeholders.length > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => togglePreview(key)}
                                  title={isPreview ? 'Editar' : 'Preview com valores de exemplo'}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  {isPreview ? 'Editar' : 'Preview'}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRestore(key)}
                                title="Restaurar padrão"
                              >
                                <RotateCcw className="h-4 w-4 mr-1" />
                                Restaurar
                              </Button>
                            </div>
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

                          {/* Editor ou Preview */}
                          <div className="space-y-2">
                            <Label htmlFor={key}>
                              {isPreview ? 'Preview (com valores de exemplo)' : 'Prompt'}
                            </Label>
                            <Textarea
                              id={key}
                              rows={12}
                              className={`font-mono text-sm ${isPreview ? 'bg-gray-50' : ''}`}
                              value={isPreview ? getPreviewValue(key) : getPromptValue(key)}
                              onChange={(e) => handlePromptChange(key, e.target.value)}
                              readOnly={isPreview}
                            />
                          </div>

                          {/* Placeholders com descrições */}
                          {metadata.placeholders && metadata.placeholders.length > 0 && (
                            <div className={`rounded-lg p-4 ${colors.bg}`}>
                              <p className={`text-sm font-medium ${colors.icon} mb-3`}>
                                Placeholders disponíveis:
                              </p>
                              <div className="space-y-2">
                                {metadata.placeholders.map((placeholder) => (
                                  <div
                                    key={placeholder.name}
                                    className="flex items-start gap-2 text-sm"
                                  >
                                    <code className="rounded bg-white px-2 py-1 text-xs font-mono text-gray-700 whitespace-nowrap">
                                      {placeholder.name}
                                    </code>
                                    <span className="text-gray-600 pt-0.5">
                                      {placeholder.description}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <p className="mt-3 text-xs text-gray-500 italic">
                                Estes valores são substituídos automaticamente durante a execução
                              </p>
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
