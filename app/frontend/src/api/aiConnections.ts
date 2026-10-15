import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

/** An AI app (MCP client) the user has authorized via the OAuth login page. */
export interface AiConnection {
  id: string
  client_name: string
  created_at: string
  last_used_at: string | null
}

const KEYS = {
  all: ['ai-connections'] as const,
}

export function useAiConnections() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: () => apiClient.get<AiConnection[]>('/oauth/connections').then(r => r.data),
  })
}

export function useRevokeAiConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/oauth/connections/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}
