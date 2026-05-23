import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface KanbanColumn {
  id: string
  name: string
  color: string
  is_terminal: boolean
  sort_order: number
}

export interface TaskUser {
  id: string
  full_name: string
  email: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  column_id: string
  column: KanbanColumn
  created_by: string
  creator: TaskUser
  assignee_id: string | null
  assignee: TaskUser | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  due_date: string | null
  jira_ticket: string | null
  jira_status: string | null
  jira_status_updated_at: string | null
  sort_order: number
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface TaskListResponse {
  items: Task[]
  total: number
  skip: number
  limit: number
}

export const kanbanKeys = {
  all: ['kanban'] as const,
  columns: () => [...kanbanKeys.all, 'columns'] as const,
  tasks: (params?: object) => [...kanbanKeys.all, 'tasks', params] as const,
  task: (id: string) => [...kanbanKeys.all, 'task', id] as const,
}

export function useColumns() {
  return useQuery({
    queryKey: kanbanKeys.columns(),
    queryFn: () => apiClient.get<KanbanColumn[]>('/kanban/columns').then((r) => r.data),
  })
}

export function useTasks(params?: {
  assignee_id?: string
  team_id?: string
  column_id?: string
  priority?: string
  include_archived?: boolean
  limit?: number
}) {
  return useQuery({
    queryKey: kanbanKeys.tasks(params),
    queryFn: () =>
      apiClient.get<TaskListResponse>('/kanban/tasks', { params: { limit: 500, ...params } }).then((r) => r.data),
  })
}

export function useCreateColumn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; color: string; is_terminal: boolean; sort_order: number }) =>
      apiClient.post<KanbanColumn>('/kanban/columns', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.columns() }),
  })
}

export function useUpdateColumn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string; is_terminal?: boolean; sort_order?: number }) =>
      apiClient.patch<KanbanColumn>(`/kanban/columns/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.columns() }),
  })
}

export function useDeleteColumn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/kanban/columns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.all }),
  })
}

export function useReorderColumns() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: { id: string; sort_order: number }[]) =>
      apiClient.put<KanbanColumn[]>('/kanban/columns/reorder', items).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.columns() }),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      title: string
      column_id: string
      description?: string
      assignee_id?: string
      priority?: string
      due_date?: string
      jira_ticket?: string
    }) => apiClient.post<Task>('/kanban/tasks', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.all }),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: string
      title?: string
      description?: string
      assignee_id?: string | null
      priority?: string
      due_date?: string | null
      jira_ticket?: string | null
      is_archived?: boolean
    }) => apiClient.patch<Task>(`/kanban/tasks/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.all }),
  })
}

export function useMoveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, column_id, sort_order }: { id: string; column_id: string; sort_order: number }) =>
      apiClient.patch<Task>(`/kanban/tasks/${id}/move`, { column_id, sort_order }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.all }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/kanban/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.all }),
  })
}

export interface TaskComment {
  id: string
  task_id: string
  user_id: string | null
  author: TaskUser | null
  content: string
  created_at: string
  updated_at: string
}

export const commentKeys = {
  list: (taskId: string) => [...kanbanKeys.all, 'comments', taskId] as const,
}

export function useTaskComments(taskId: string | undefined) {
  return useQuery({
    queryKey: commentKeys.list(taskId ?? ''),
    queryFn: () =>
      apiClient.get<TaskComment[]>(`/kanban/tasks/${taskId}/comments`).then((r) => r.data),
    enabled: !!taskId,
  })
}

export function useCreateComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) =>
      apiClient.post<TaskComment>(`/kanban/tasks/${taskId}/comments`, { content }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentKeys.list(taskId) }),
  })
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) =>
      apiClient.delete(`/kanban/tasks/${taskId}/comments/${commentId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentKeys.list(taskId) }),
  })
}
