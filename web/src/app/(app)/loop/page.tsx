'use client'

import { useState } from 'react'
import { useLoop } from '@/hooks/use-loop'
import { LoopPlanResult } from '@/components/loop/loop-plan-result'
import { Button } from '@/components/ui/button'
import {
  Sparkles,
  Send,
  Loader2,
  Network,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react'
import Link from 'next/link'

export default function LoopPage() {
  const [goal, setGoal] = useState('')
  const { generatePlan, plan, isLoading, error, reset } = useLoop()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (goal.trim().length >= 10) {
      generatePlan(goal.trim())
    }
  }

  const handleReset = () => {
    reset()
    setGoal('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/10 bg-dark-bg/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/network"
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Loop</h1>
                  <p className="text-sm text-gray-400">
                    Seu estrategista de networking
                  </p>
                </div>
              </div>
            </div>

            {plan && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Novo plano
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
          {/* Input Form - sempre visivel quando nao tem plano */}
          {!plan && (
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <Network className="h-5 w-5 text-purple-400" />
                <h2 className="font-semibold text-white">
                  Qual e seu objetivo?
                </h2>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Conte qual e o seu objetivo e o Loop vai analisar sua rede de
                contatos para criar um plano de acao estrategico.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Ex: Quero captar investimento seed de 500k para minha startup de tecnologia"
                  className="w-full h-32 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                  disabled={isLoading}
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    {goal.length}/1000 caracteres (min. 10)
                  </span>
                  <Button
                    type="submit"
                    disabled={isLoading || goal.trim().length < 10}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analisando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Gerar Plano
                      </>
                    )}
                  </Button>
                </div>
              </form>

              {/* Exemplos */}
              <div className="mt-6 pt-4 border-t border-white/10">
                <p className="text-sm text-gray-400 mb-3">Exemplos de objetivos:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Quero captar investimento para minha startup',
                    'Preciso contratar um CTO experiente',
                    'Quero abrir um restaurante',
                    'Estou buscando um novo emprego em tecnologia',
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setGoal(example)}
                      className="text-sm px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="glass-card p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/20 mb-4">
                <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Loop esta analisando sua rede...
              </h3>
              <p className="text-gray-400 max-w-md mx-auto">
                Estamos identificando os melhores contatos e criando uma
                estrategia personalizada para voce alcancar seu objetivo.
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="glass-card p-6 border-red-500/30 bg-red-500/10">
              <p className="text-red-400 text-center">
                Erro ao gerar o plano. Por favor, tente novamente.
              </p>
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  Tentar novamente
                </Button>
              </div>
            </div>
          )}

          {/* Result */}
          {plan && !isLoading && <LoopPlanResult plan={plan} />}
        </div>
      </div>
    </div>
  )
}
