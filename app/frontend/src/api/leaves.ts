import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface LeaveUser {
  id: string
  full_name: string
  email: string
}

export interface LeaveRequest {
  id: string
  user_id: string
  user: LeaveUser
  start_date: string
  end_date: string
  reason: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reviewed_by: string | null
  reviewer: LeaveUser | null
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export const leaveKeys = {
  all: ['leaves'] as const,
  list: (params?: object) => [...leaveKeys.all, 'list', params] as const,
  detail: (id: string) => [...leaveKeys.all, 'detail', id] as const,
}

export function useLeaves(params?: {
  user_id?: string
  status?: string
  date_from?: string
  date_to?: string
}) {
  return useQuery({
    queryKey: leaveKeys.list(params),
    queryFn: () =>
      apiClient.get<LeaveRequest[]>('/leaves', { params }).then((r) => r.data),
  })
}

export function useCreateLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { start_date: string; end_date: string; reason?: string }) =>
      apiClient.post<LeaveRequest>('/leaves', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: leaveKeys.all }),
  })
}

export function useUpdateLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; status?: string; review_note?: string }) =>
      apiClient.patch<LeaveRequest>(`/leaves/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: leaveKeys.all }),
  })
}

export function useDeleteLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/leaves/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: leaveKeys.all }),
  })
}
