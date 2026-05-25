import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface Team {
  id: string
  name: string
  description: string | null
  manager_id: string | null
  manager: { id: string; full_name: string; email: string } | null
  is_active: boolean
  member_count: number
  created_at: string
}

export interface TeamDetail extends Team {
  members: Array<{ id: string; full_name: string; email: string; role: string; is_active: boolean }>
}

export const teamKeys = {
  all: ['teams'] as const,
  list: (params?: object) => [...teamKeys.all, 'list', params] as const,
  detail: (id: string) => [...teamKeys.all, 'detail', id] as const,
}

export function useTeams(params?: { is_active?: boolean }, enabled = true) {
  return useQuery({
    queryKey: teamKeys.list(params),
    queryFn: () => apiClient.get<{ items: Team[]; total: number }>('/teams', { params }).then((r) => r.data),
    enabled,
  })
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: teamKeys.detail(id),
    queryFn: () => apiClient.get<TeamDetail>(`/teams/${id}`).then((r) => r.data),
  })
}

export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; manager_id?: string }) =>
      apiClient.post<Team>('/teams', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  })
}

export function useUpdateTeam(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name?: string; description?: string; manager_id?: string; is_active?: boolean }) =>
      apiClient.patch<Team>(`/teams/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  })
}

export function useDeleteTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/teams/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  })
}

export function useAddTeamMember(teamId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.post(`/teams/${teamId}/members`, { user_id: userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all })
    },
  })
}

export function useRemoveTeamMember(teamId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete(`/teams/${teamId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  })
}
