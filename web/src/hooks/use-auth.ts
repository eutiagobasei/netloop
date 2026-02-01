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
    staleTime: 1000 * 60 * 5,
  })

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const { data } = await authApi.login(credentials)
      return data
    },
    onSuccess: async (data) => {
      Cookies.set('accessToken', data.accessToken, { expires: 1 / 96 })
      Cookies.set('refreshToken', data.refreshToken, { expires: 7 })
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      router.replace('/network')
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
    error,
    login: loginMutation.mutate,
    loginError: loginMutation.error,
    isLoginLoading: loginMutation.isPending,
    logout,
  }
}
