'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { InteractiveGlobe } from '@/components/globe/interactive-globe'

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden bg-dark-bg">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary-500/5 via-transparent to-transparent" />

      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
      }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left content */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 mb-8">
              <Sparkles className="h-4 w-4 text-primary-400" />
              <span className="text-sm text-primary-400 font-medium">
                A nova forma de fazer networking
              </span>
            </div>

            {/* Main headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Sua Rede de{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-primary-600">
                Conexões
              </span>{' '}
              Inteligente
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-gray-400 mb-8 max-w-xl mx-auto lg:mx-0">
              Transforme seus contatos em oportunidades. Gerencie relacionamentos,
              acompanhe interações e construa uma rede de networking poderosa.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105 shadow-lg shadow-primary-500/25"
              >
                Começar Agora
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors border border-white/10"
              >
                Saiba Mais
              </a>
            </div>

            {/* Stats */}
            <div className="flex items-center justify-center lg:justify-start gap-8 mt-12">
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-white">10k+</div>
                <div className="text-sm text-gray-500">Usuários Ativos</div>
              </div>
              <div className="h-10 w-px bg-white/10" />
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-white">50k+</div>
                <div className="text-sm text-gray-500">Conexões Feitas</div>
              </div>
              <div className="h-10 w-px bg-white/10" />
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-white">98%</div>
                <div className="text-sm text-gray-500">Satisfação</div>
              </div>
            </div>
          </div>

          {/* Right content - Globe */}
          <div className="flex justify-center lg:justify-end">
            <div className="relative">
              {/* Glow behind globe */}
              <div className="absolute inset-0 bg-gradient-radial from-primary-500/20 via-transparent to-transparent blur-3xl" />
              <InteractiveGlobe
                size={500}
                className="relative z-10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
        <span className="text-xs text-gray-500 uppercase tracking-wider">Role para baixo</span>
        <div className="w-px h-8 bg-gradient-to-b from-gray-500 to-transparent" />
      </div>
    </section>
  )
}
