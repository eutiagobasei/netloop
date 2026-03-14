'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi, UpdateContactDto } from '@/lib/api'

export function useContacts() {
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateContactDto }) =>
      contactsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['graph'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })

  return {
    updateContact: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  }
}
