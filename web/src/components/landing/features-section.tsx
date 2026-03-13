'use client'

import { Users, Zap, BarChart3, Shield } from 'lucide-react'

const features = [
  {
    icon: Users,
    title: 'Gestão de Contatos',
    description:
      'Organize sua rede de contatos de forma inteligente. Adicione notas, tags e categorize por relevância.',
  },
  {
    icon: Zap,
    title: 'Conexões Inteligentes',
    description:
      'Receba sugestões de conexões baseadas em interesses mútuos e oportunidades de negócio.',
  },
  {
    icon: BarChart3,
    title: 'Analytics de Rede',
    description:
      'Visualize métricas da sua rede: crescimento, engajamento e impacto das suas conexões.',
  },
  {
    icon: Shield,
    title: 'Privacidade Total',
    description:
      'Seus dados são seus. Controle total sobre visibilidade e compartilhamento de informações.',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-dark-bg relative">
      {/* Background elements */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary-500/5 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Tudo que você precisa para{' '}
            <span className="text-primary-400">fazer networking</span>
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Ferramentas poderosas para construir e manter relacionamentos profissionais de forma eficiente.
          </p>
        </div>

        {/* Features grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div
                key={index}
                className="group p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:border-primary-500/50 transition-all duration-300 hover:-translate-y-1"
              >
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center mb-4 group-hover:bg-primary-500/20 transition-colors">
                  <Icon className="h-6 w-6 text-primary-400" />
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            )
          })}
        </div>

        {/* Bottom highlight */}
        <div className="mt-16 p-8 rounded-2xl bg-gradient-to-r from-primary-500/10 via-primary-500/5 to-primary-500/10 border border-primary-500/20">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Pronto para expandir sua rede?
              </h3>
              <p className="text-gray-400">
                Comece gratuitamente e descubra o poder do networking inteligente.
              </p>
            </div>
            <a
              href="/register"
              className="whitespace-nowrap bg-primary-500 hover:bg-primary-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Criar Conta Grátis
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
