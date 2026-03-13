'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X, Network } from 'lucide-react'

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-bg/80 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Network className="h-8 w-8 text-primary-500" />
            <span className="text-xl font-bold text-white">NetLoop</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-gray-400 hover:text-white transition-colors">
              Recursos
            </a>
            <a href="#how-it-works" className="text-gray-400 hover:text-white transition-colors">
              Como Funciona
            </a>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/login"
              className="text-gray-300 hover:text-white transition-colors px-4 py-2"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="bg-primary-500 hover:bg-primary-600 text-white px-5 py-2 rounded-lg font-medium transition-colors"
            >
              Criar Conta
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-gray-400 hover:text-white"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-white/10">
            <div className="flex flex-col gap-4">
              <a
                href="#features"
                className="text-gray-400 hover:text-white transition-colors py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Recursos
              </a>
              <a
                href="#how-it-works"
                className="text-gray-400 hover:text-white transition-colors py-2"
                onClick={() => setIsMenuOpen(false)}
              >
                Como Funciona
              </a>
              <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
                <Link
                  href="/login"
                  className="text-gray-300 hover:text-white transition-colors py-2 text-center"
                >
                  Entrar
                </Link>
                <Link
                  href="/register"
                  className="bg-primary-500 hover:bg-primary-600 text-white px-5 py-3 rounded-lg font-medium transition-colors text-center"
                >
                  Criar Conta
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
