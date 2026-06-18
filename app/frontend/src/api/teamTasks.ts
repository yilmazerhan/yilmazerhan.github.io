import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface TeamTaskUser {
  id: string
  full_name: string
  email: string
}

export interface TeamTask {
  id: string
  title: string
  description: string | null
  deadline: string
  reminder_days_before: number
  status: 'pending' | 'in_progress' | 'done'
  created_by: string | null
  creator: TeamTaskUser | null
  assignees: TeamTaskUser[]
  created_at: string
  updated_at: string
}

export interface TeamTaskCreate {
  title: string
  description?: string
  deadline: string
  reminder_days_before: number
  assignee_ids: string[]
}

export interface TeamTaskUpdate {
  title?: string
  description?: string | null
  deadline?: string
  reminder_days_before?: number
  status?: 'pending' | 'in_progress' | 'done'
  assignee_ids?: string[]
}

const teamTaskKeys = {
  all: ['team-tasks'] as const,
}

export function useTeamTasks() {
  return useQuery({
    queryKey: teamTaskKeys.all,
    queryFn: () => apiClient.get<TeamTask[]>('/team-tasks').then((r) => r.data),
  })
}

export function useCreateTeamTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TeamTaskCreate) =>
      apiClient.post<TeamTask>('/team-tasks', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamTaskKeys.all }),
  })
}

export function useUpdateTeamTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & TeamTaskUpdate) =>
      apiClient.patch<TeamTask>(`/team-tasks/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamTaskKeys.all }),
  })
}

export function useDeleteTeamTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/team-tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamTaskKeys.all }),
  })
}
