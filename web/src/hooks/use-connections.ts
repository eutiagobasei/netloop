'use client'

import { useQuery } from '@tanstack/react-query'
import { connectionsApi, GraphData } from '@/lib/api'

export function useConnections(depth = 2) {
  const graphQuery = useQuery({
    queryKey: ['connections', 'graph', depth],
    queryFn: async () => {
      const { data } = await connectionsApi.getGraph(depth)
      return data
    },
  })

  return {
    graph: graphQuery.data as GraphData | undefined,
    isLoading: graphQuery.isLoading,
    error: graphQuery.error,
    refetch: graphQuery.refetch,
  }
}
