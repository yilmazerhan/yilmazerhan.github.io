import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface WorkType {
  id: string
  name: string
  color: string
  is_active: boolean
  sort_order: number
}

export interface WorkLog {
  id: string
  user_id: string
  user: { id: string; full_name: string; email: string }
  work_type_id: string
  work_type: WorkType
  log_date: string
  duration_hours: number
  description: string
  created_at: string
  updated_at: string
}

export interface WorkLogListResponse {
  items: WorkLog[]
  total: number
  skip: number
  limit: number
}

export const worklogKeys = {
  all: ['worklogs'] as const,
  list: (params?: object) => [...worklogKeys.all, 'list', params] as const,
  stats: (params?: object) => [...worklogKeys.all, 'stats', params] as const,
  workTypes: ['workTypes'] as const,
}

export function useWorkTypes(activeOnly = true) {
  return useQuery({
    queryKey: worklogKeys.workTypes,
    queryFn: () =>
      apiClient.get<WorkType[]>('/worklogs/work-types', { params: { active_only: activeOnly } }).then((r) => r.data),
  })
}

export function useWorkLogs(params?: {
  user_id?: string
  date_from?: string
  date_to?: string
  skip?: number
  limit?: number
}) {
  return useQuery({
    queryKey: worklogKeys.list(params),
    queryFn: () =>
      apiClient.get<WorkLogListResponse>('/worklogs', { params }).then((r) => r.data),
  })
}

export function useWorkLogStats(params?: { user_id?: string; date_from?: string; date_to?: string }) {
  return useQuery({
    queryKey: worklogKeys.stats(params),
    queryFn: () =>
      apiClient.get('/worklogs/stats/summary', { params }).then((r) => r.data),
  })
}

export function useCreateWorkLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      work_type_id: string
      log_date: string
      duration_hours: number
      description: string
      target_user_id?: string
    }) => apiClient.post<WorkLog>('/worklogs', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: worklogKeys.all })
    },
  })
}

export function useUpdateWorkLog(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      work_type_id?: string
      log_date?: string
      duration_hours?: number
      description?: string
    }) => apiClient.patch<WorkLog>(`/worklogs/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: worklogKeys.all }),
  })
}

export function useDeleteWorkLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/worklogs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: worklogKeys.all }),
  })
}
