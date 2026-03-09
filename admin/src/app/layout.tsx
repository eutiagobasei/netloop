import type { Metadata } from 'next'
import './globals.css'
import { QueryProvider } from '@/providers/query-provider'

export const metadata: Metadata = {
  title: 'NetLoop Admin',
  description: 'Painel administrativo do NetLoop',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className="font-sans">
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  )
}
