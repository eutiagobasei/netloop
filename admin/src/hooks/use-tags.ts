'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tagsApi, Tag, CreateTagDto, UpdateTagDto } from '@/lib/api'

export function useTags(type?: 'FREE' | 'INSTITUTIONAL') {
  const queryClient = useQueryClient()

  const tagsQuery = useQuery({
    queryKey: ['tags', type],
    queryFn: async () => {
      const { data } = await tagsApi.getAll(type)
      return data
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateTagDto) => tagsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTagDto }) =>
      tagsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tagsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })

  return {
    tags: tagsQuery.data as Tag[] | undefined,
    isLoading: tagsQuery.isLoading,
    error: tagsQuery.error,
    refetch: tagsQuery.refetch,

    createTag: createMutation.mutateAsync,
    isCreating: createMutation.isPending,

    updateTag: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,

    deleteTag: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  }
}
