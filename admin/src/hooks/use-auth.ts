'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Cookies from 'js-cookie'
import { authApi, LoginCredentials } from '@/lib/api'

export function useAuth() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const token = Cookies.get('accessToken')
      if (!token) return null
      const { data } = await authApi.me()
      return data
    },
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const { data } = await authApi.login(credentials)
      return data
    },
    onSuccess: async (data) => {
      Cookies.set('accessToken', data.accessToken, { expires: 1 / 96 }) // 15 min
      Cookies.set('refreshToken', data.refreshToken, { expires: 7 })
      // Invalidar e refetch do usuário (backend não retorna user no login)
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      router.replace('/dashboard')
    },
  })

  const logout = () => {
    Cookies.remove('accessToken')
    Cookies.remove('refreshToken')
    queryClient.setQueryData(['auth', 'me'], null)
    queryClient.clear()
    router.replace('/login')
  }

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'ADMIN',
    error,
    login: loginMutation.mutate,
    loginError: loginMutation.error,
    isLoginLoading: loginMutation.isPending,
    logout,
  }
}
