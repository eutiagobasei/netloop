'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'

export default function ImpersonatePage() {
  const router = useRouter()
  const [status, setStatus] = useState('Configurando visualização...')

  useEffect(() => {
    // Ler dados de impersonação do localStorage
    const impersonationDataStr = localStorage.getItem('impersonationData')

    if (!impersonationDataStr) {
      setStatus('Dados de impersonação não encontrados')
      setTimeout(() => {
        window.close()
      }, 2000)
      return
    }

    try {
      const data = JSON.parse(impersonationDataStr)

      // Configurar cookie com o token de impersonação
      Cookies.set('accessToken', data.accessToken, { expires: 1 / 24 }) // 1 hora

      // Salvar informações da impersonação
      Cookies.set('impersonating', JSON.stringify({
        userId: data.userId,
        userName: data.userName,
        userEmail: data.userEmail,
        adminId: data.adminId,
        adminName: data.adminName,
      }), { expires: 1 / 24 })

      // Limpar localStorage
      localStorage.removeItem('impersonationData')

      setStatus(`Abrindo rede de ${data.userName}...`)

      // Redirecionar para a página de rede do usuário
      // Pequeno delay para garantir que os cookies foram salvos
      setTimeout(() => {
        router.replace('/network')
      }, 100)
    } catch (e) {
      setStatus('Erro ao processar dados')
      console.error('Erro ao processar impersonação:', e)
    }
  }, [router])

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent mx-auto" />
        <p className="mt-4 text-gray-600">{status}</p>
      </div>
    </div>
  )
}
