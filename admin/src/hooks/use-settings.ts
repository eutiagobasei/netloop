'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, Setting } from '@/lib/api'

export function useSettings(category?: string) {
  const queryClient = useQueryClient()

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['settings', category],
    queryFn: async () => {
      const { data } = await settingsApi.getAll(category)
      return data
    },
  })

  const upsertMutation = useMutation({
    mutationFn: settingsApi.upsert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const bulkUpdateMutation = useMutation({
    mutationFn: settingsApi.bulkUpdate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: settingsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const testEvolutionMutation = useMutation({
    mutationFn: settingsApi.testEvolution,
  })

  const getSetting = (key: string): Setting | undefined => {
    return settings?.find((s) => s.key === key)
  }

  return {
    settings,
    isLoading,
    error,
    getSetting,
    upsert: upsertMutation.mutate,
    upsertAsync: upsertMutation.mutateAsync,
    isUpserting: upsertMutation.isPending,
    bulkUpdate: bulkUpdateMutation.mutate,
    bulkUpdateAsync: bulkUpdateMutation.mutateAsync,
    isBulkUpdating: bulkUpdateMutation.isPending,
    deleteSetting: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    testEvolution: testEvolutionMutation.mutate,
    testEvolutionAsync: testEvolutionMutation.mutateAsync,
    isTestingEvolution: testEvolutionMutation.isPending,
    evolutionTestResult: testEvolutionMutation.data?.data,
  }
}

export function useStats() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const { data } = await settingsApi.getStats()
      return data
    },
  })

  return { stats, isLoading, error }
}
