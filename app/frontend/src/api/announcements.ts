import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface Announcement {
  id: string
  title: string
  title_en: string | null
  message: string
  message_en: string | null
  type: 'info' | 'warning' | 'error' | 'success'
  target_type: 'all' | 'specific_teams' | 'specific_users'
  target_ids: string[] | null
  starts_at: string
  ends_at: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AnnouncementCreate {
  title: string
  title_en?: string | null
  message: string
  message_en?: string | null
  type: string
  target_type: string
  target_ids?: string[] | null
  starts_at: string
  ends_at?: string | null
  is_active?: boolean
}

const keys = {
  active: ['announcements', 'active'] as const,
  all: ['announcements', 'all'] as const,
}

export function useActiveAnnouncements() {
  return useQuery({
    queryKey: keys.active,
    queryFn: () =>
      apiClient.get<Announcement[]>('/announcements/active').then((r) => r.data),
    refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
    staleTime: 60 * 1000,
  })
}

export function useAllAnnouncements() {
  return useQuery({
    queryKey: keys.all,
    queryFn: () =>
      apiClient.get<Announcement[]>('/announcements').then((r) => r.data),
  })
}

export function useCreateAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AnnouncementCreate) =>
      apiClient.post<Announcement>('/announcements', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<AnnouncementCreate> & { id: string }) =>
      apiClient.patch<Announcement>(`/announcements/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all })
      qc.invalidateQueries({ queryKey: keys.active })
    },
  })
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/announcements/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all })
      qc.invalidateQueries({ queryKey: keys.active })
    },
  })
}
