'use client'

import { LoopPlanResponse, LoopActionItem, LoopGap } from '@/lib/api'
import {
  Target,
  Lightbulb,
  Users,
  AlertTriangle,
  ArrowRight,
  Unlock,
  MessageSquare,
  Clock,
} from 'lucide-react'

interface LoopPlanResultProps {
  plan: LoopPlanResponse
}

export function LoopPlanResult({ plan }: LoopPlanResultProps) {
  return (
    <div className="space-y-6">
      {/* Header com meta info */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span>
            Gerado em {new Date(plan.generatedAt).toLocaleString('pt-BR')}
          </span>
        </div>
        <div>
          Analisados {plan.contactsAnalyzed} de {plan.totalContacts} contatos
        </div>
      </div>

      {/* Objetivo */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary-500/20">
            <Target className="h-5 w-5 text-primary-400" />
          </div>
          <h3 className="font-semibold text-white">Seu Objetivo</h3>
        </div>
        <p className="text-gray-300 ml-12">{plan.goal}</p>
      </div>

      {/* Necessidades Identificadas */}
      {plan.decomposedNeeds.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <Lightbulb className="h-5 w-5 text-amber-400" />
            </div>
            <h3 className="font-semibold text-white">
              Necessidades Identificadas
            </h3>
          </div>
          <ul className="space-y-2 ml-12">
            {plan.decomposedNeeds.map((need, index) => (
              <li key={index} className="flex items-start gap-2 text-gray-300">
                <span className="text-amber-400 mt-1">•</span>
                <span>{need}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Plano de Acao */}
      {plan.actionPlan.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            <h3 className="font-semibold text-white">Plano de Acao</h3>
            <span className="text-sm text-gray-400">
              ({plan.actionPlan.length}{' '}
              {plan.actionPlan.length === 1 ? 'contato' : 'contatos'})
            </span>
          </div>

          <div className="space-y-4">
            {plan.actionPlan.map((action, index) => (
              <ActionCard key={action.contactId || index} action={action} />
            ))}
          </div>
        </div>
      )}

      {/* Lacunas na Rede */}
      {plan.gaps.length > 0 && (
        <div className="glass-card p-4 border-amber-500/30">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
            <h3 className="font-semibold text-white">Lacunas na Sua Rede</h3>
          </div>
          <div className="space-y-3 ml-12">
            {plan.gaps.map((gap, index) => (
              <GapCard key={index} gap={gap} />
            ))}
          </div>
        </div>
      )}

      {/* Mensagem de rede vazia */}
      {plan.actionPlan.length === 0 && plan.gaps.length > 0 && (
        <div className="glass-card p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">
            Sua rede ainda e pequena
          </h3>
          <p className="text-gray-400 max-w-md mx-auto">
            Nao encontramos contatos suficientes para criar um plano de acao.
            Continue adicionando pessoas a sua rede para que o Loop possa te
            ajudar melhor.
          </p>
        </div>
      )}
    </div>
  )
}

function ActionCard({ action }: { action: LoopActionItem }) {
  return (
    <div className="glass-card p-4 hover:border-blue-500/30 transition-colors">
      <div className="flex items-start gap-4">
        {/* Numero da ordem */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-semibold">
          {action.order}
        </div>

        <div className="flex-1 space-y-3">
          {/* Nome e nivel */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{action.contactName}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                action.level === 1
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {action.level}º grau
            </span>
          </div>

          {/* Abordagem */}
          <div className="flex items-start gap-2 text-gray-300">
            <ArrowRight className="h-4 w-4 mt-1 flex-shrink-0 text-gray-500" />
            <p className="text-sm">{action.approach}</p>
          </div>

          {/* O que pedir */}
          <div className="flex items-start gap-2 text-gray-300">
            <MessageSquare className="h-4 w-4 mt-1 flex-shrink-0 text-gray-500" />
            <p className="text-sm">
              <span className="text-gray-400">O que pedir:</span>{' '}
              {action.whatToAsk}
            </p>
          </div>

          {/* Unlocks */}
          {action.unlocks.length > 0 && (
            <div className="flex items-start gap-2">
              <Unlock className="h-4 w-4 mt-1 flex-shrink-0 text-green-400" />
              <div>
                <span className="text-sm text-gray-400">Pode desbloquear:</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {action.unlocks.map((unlock, index) => (
                    <span
                      key={index}
                      className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400"
                    >
                      {unlock}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GapCard({ gap }: { gap: LoopGap }) {
  return (
    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
      <p className="font-medium text-amber-300">{gap.need}</p>
      <p className="text-sm text-amber-400/80 mt-1">{gap.description}</p>
    </div>
  )
}
