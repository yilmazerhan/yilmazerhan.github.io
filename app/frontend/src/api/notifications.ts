import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

export interface NotificationListResponse {
  items: AppNotification[]
  unread_count: number
}

const KEYS = {
  all: ['notifications'] as const,
}

export function useNotifications() {
  return useQuery({
    queryKey: KEYS.all,
    queryFn: () => apiClient.get<NotificationListResponse>('/notifications').then(r => r.data),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  })
}
