'use client'

import { useMutation } from '@tanstack/react-query'
import { loopApi, LoopPlanResponse } from '@/lib/api'

export function useLoop() {
  const mutation = useMutation({
    mutationFn: async (goal: string) => {
      const { data } = await loopApi.createPlan(goal)
      return data
    },
  })

  return {
    generatePlan: mutation.mutate,
    generatePlanAsync: mutation.mutateAsync,
    plan: mutation.data as LoopPlanResponse | undefined,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  }
}
