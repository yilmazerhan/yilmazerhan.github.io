import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface JiraConfig {
  id: string
  name: string
  base_url: string
  email: string
  project_key: string
  is_active: boolean
  created_at: string
}

export interface JiraConnectionTestResult {
  success: boolean
  project_name?: string
  error?: string
}

const jiraKeys = {
  all: ['jira'] as const,
  configs: () => [...jiraKeys.all, 'configs'] as const,
}

export function useJiraConfigs() {
  return useQuery({
    queryKey: jiraKeys.configs(),
    queryFn: () => apiClient.get<JiraConfig[]>('/jira/configs').then((r) => r.data),
  })
}

export function useCreateJiraConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name: string
      base_url: string
      email: string
      api_token: string
      project_key: string
    }) => apiClient.post<JiraConfig>('/jira/configs', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: jiraKeys.configs() }),
  })
}

export function useUpdateJiraConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; base_url?: string; email?: string; api_token?: string; project_key?: string; is_active?: boolean }) =>
      apiClient.patch<JiraConfig>(`/jira/configs/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: jiraKeys.configs() }),
  })
}

export function useDeleteJiraConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/jira/configs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: jiraKeys.configs() }),
  })
}

export function useTestJiraConnection() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<JiraConnectionTestResult>(`/jira/configs/${id}/test`).then((r) => r.data),
  })
}

export function useRefreshTaskJira() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => apiClient.post(`/jira/tasks/${taskId}/refresh-jira`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban'] }),
  })
}
