'use client'

import { UserPlus, Link2, TrendingUp } from 'lucide-react'

const steps = [
  {
    number: '01',
    icon: UserPlus,
    title: 'Crie sua Conta',
    description:
      'Cadastre-se em segundos e configure seu perfil profissional. Importe contatos existentes para começar rapidamente.',
  },
  {
    number: '02',
    icon: Link2,
    title: 'Conecte-se',
    description:
      'Encontre pessoas com interesses em comum. Participe de grupos e eventos para expandir sua rede.',
  },
  {
    number: '03',
    icon: TrendingUp,
    title: 'Cresça sua Rede',
    description:
      'Acompanhe suas interações, receba insights e fortaleça relacionamentos que geram oportunidades reais.',
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 bg-dark-bg relative">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Como <span className="text-primary-400">Funciona</span>
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Três passos simples para transformar sua forma de fazer networking.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary-500/30 to-transparent -translate-y-1/2" />

          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            {steps.map((step, index) => {
              const Icon = step.icon
              return (
                <div key={index} className="relative text-center">
                  {/* Step number background */}
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-8xl font-bold text-white/5 select-none pointer-events-none">
                    {step.number}
                  </div>

                  {/* Icon circle */}
                  <div className="relative z-10 w-20 h-20 mx-auto rounded-full bg-primary-500/10 border-2 border-primary-500/30 flex items-center justify-center mb-6">
                    <Icon className="h-8 w-8 text-primary-400" />
                    {/* Dot indicator */}
                    <div className="absolute -bottom-1 w-4 h-4 bg-primary-500 rounded-full border-4 border-dark-bg" />
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold text-white mb-3">
                    {step.title}
                  </h3>
                  <p className="text-gray-400 leading-relaxed">
                    {step.description}
                  </p>

                  {/* Arrow for desktop */}
                  {index < steps.length - 1 && (
                    <div className="hidden lg:block absolute top-10 -right-6 text-primary-500/30">
                      <svg
                        className="w-12 h-12"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <a
            href="/register"
            className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105 shadow-lg shadow-primary-500/25"
          >
            Começar Agora
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </a>
        </div>
      </div>
    </section>
  )
}
