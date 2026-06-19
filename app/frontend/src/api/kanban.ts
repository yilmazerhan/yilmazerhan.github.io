import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface KanbanBoard {
  id: string
  name: string
  description: string | null
  color: string
  is_archived: boolean
  is_personal: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  task_count: number
  column_count: number
}

export interface KanbanColumn {
  id: string
  board_id: string
  name: string
  name_key?: string | null
  color: string
  is_terminal: boolean
  sort_order: number
}

export interface TaskUser {
  id: string
  full_name: string
  email: string
}

export interface TaskLabel {
  id: string
  name: string
  color: string
  created_by: string | null
  created_at: string
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
  start_date: string | null
  jira_ticket: string | null
  jira_status: string | null
  jira_status_updated_at: string | null
  sort_order: number
  is_archived: boolean
  created_at: string
  updated_at: string
  labels: TaskLabel[]
}

export interface Attachment {
  id: string
  task_id: string
  original_filename: string
  file_size: number
  mime_type: string
  uploaded_by: string | null
  created_at: string
}

export interface ActivityEntry {
  id: string
  task_id: string
  task_title: string
  action: string
  changes: { field: string; old: string | null; new: string | null }[] | null
  actor: { id: string; full_name: string } | null
  created_at: string
}

export interface ActivityFeedResponse {
  items: ActivityEntry[]
  total: number
  skip: number
  limit: number
}

export interface TaskListResponse {
  items: Task[]
  total: number
  skip: number
  limit: number
}

export const kanbanKeys = {
  all: ['kanban'] as const,
  boards: () => [...kanbanKeys.all, 'boards'] as const,
  board: (id: string) => [...kanbanKeys.all, 'board', id] as const,
  columns: (boardId?: string) => boardId ? [...kanbanKeys.all, 'columns', boardId] as const : [...kanbanKeys.all, 'columns'] as const,
  tasks: (params?: object) => [...kanbanKeys.all, 'tasks', params] as const,
  task: (id: string) => [...kanbanKeys.all, 'task', id] as const,
  labels: () => [...kanbanKeys.all, 'labels'] as const,
}

// ─── Board hooks ──────────────────────────────────────────────────────────────

export function useBoards(params?: { include_archived?: boolean; personal_owner_id?: string }, enabled = true) {
  return useQuery({
    queryKey: [...kanbanKeys.boards(), params],
    queryFn: () => apiClient.get<KanbanBoard[]>('/kanban/boards', { params }).then((r) => r.data),
    enabled,
  })
}

export function useBoard(boardId: string | undefined) {
  return useQuery({
    queryKey: kanbanKeys.board(boardId ?? ''),
    queryFn: () => apiClient.get<KanbanBoard>(`/kanban/boards/${boardId}`).then((r) => r.data),
    enabled: !!boardId,
  })
}

export function useCreateBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string | null; color?: string }) =>
      apiClient.post<KanbanBoard>('/kanban/boards', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.boards() }),
  })
}

export function useUpdateBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string | null; color?: string; is_archived?: boolean }) =>
      apiClient.patch<KanbanBoard>(`/kanban/boards/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kanbanKeys.boards() })
      qc.invalidateQueries({ queryKey: kanbanKeys.all })
    },
  })
}

export function useDeleteBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/kanban/boards/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.boards() }),
  })
}

export function useColumns(boardId?: string) {
  return useQuery({
    queryKey: kanbanKeys.columns(boardId),
    queryFn: () =>
      apiClient.get<KanbanColumn[]>('/kanban/columns', { params: boardId ? { board_id: boardId } : undefined }).then((r) => r.data),
  })
}

export function useTasks(params?: {
  assignee_id?: string
  team_id?: string
  column_id?: string
  board_id?: string
  priority?: string
  include_archived?: boolean
  search?: string
  label_id?: string
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
    mutationFn: (data: { name: string; color: string; is_terminal: boolean; sort_order: number; board_id?: string }) =>
      apiClient.post<KanbanColumn>('/kanban/columns', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.all }),
  })
}

export function useUpdateColumn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string; is_terminal?: boolean; sort_order?: number }) =>
      apiClient.patch<KanbanColumn>(`/kanban/columns/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.all }),
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
      start_date?: string
      jira_ticket?: string
      label_ids?: string[]
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
      start_date?: string | null
      jira_ticket?: string | null
      is_archived?: boolean
      label_ids?: string[] | null
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

export interface TaskHistoryChange {
  field: string
  old: string | null
  new: string | null
}

export interface TaskHistoryEntry {
  id: string
  task_id: string
  action: string
  changes: TaskHistoryChange[] | null
  actor: TaskUser | null
  created_at: string
}

export const historyKeys = {
  list: (taskId: string) => [...kanbanKeys.all, 'history', taskId] as const,
}

export function useTaskHistory(taskId: string | undefined) {
  return useQuery({
    queryKey: historyKeys.list(taskId ?? ''),
    queryFn: () =>
      apiClient.get<TaskHistoryEntry[]>(`/kanban/tasks/${taskId}/history`).then((r) => r.data),
    enabled: !!taskId,
  })
}

// ─── Subtasks ────────────────────────────────────────────────────────────────

export interface Subtask {
  id: string
  task_id: string
  title: string
  is_completed: boolean
  sort_order: number
  created_at: string
}

export const subtaskKeys = {
  list: (taskId: string) => [...kanbanKeys.all, 'subtasks', taskId] as const,
}

export function useTaskSubtasks(taskId: string | null | undefined) {
  return useQuery({
    queryKey: subtaskKeys.list(taskId ?? ''),
    queryFn: () =>
      apiClient.get<Subtask[]>(`/kanban/tasks/${taskId}/subtasks`).then((r) => r.data),
    enabled: !!taskId,
  })
}

export function useCreateSubtask(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { title: string; sort_order?: number }) =>
      apiClient.post<Subtask>(`/kanban/tasks/${taskId}/subtasks`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: subtaskKeys.list(taskId) }),
  })
}

export function useUpdateSubtask(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subtaskId, ...data }: { subtaskId: string; title?: string; is_completed?: boolean; sort_order?: number }) =>
      apiClient.patch<Subtask>(`/kanban/tasks/${taskId}/subtasks/${subtaskId}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: subtaskKeys.list(taskId) }),
  })
}

export function useDeleteSubtask(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (subtaskId: string) =>
      apiClient.delete(`/kanban/tasks/${taskId}/subtasks/${subtaskId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: subtaskKeys.list(taskId) }),
  })
}

// ─── Bulk Operations ─────────────────────────────────────────────────────────

export function useBulkUpdateTasks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      task_ids: string[]
      column_id?: string
      assignee_id?: string | null
      priority?: string
      is_archived?: boolean
    }) => apiClient.patch<{ updated: number }>('/kanban/tasks/bulk', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.all }),
  })
}

// ─── Attachments ─────────────────────────────────────────────────────────────

export const attachmentKeys = {
  list: (taskId: string) => [...kanbanKeys.all, 'attachments', taskId] as const,
}

export function useTaskAttachments(taskId: string | null | undefined) {
  return useQuery({
    queryKey: attachmentKeys.list(taskId ?? ''),
    queryFn: () =>
      apiClient.get<Attachment[]>(`/kanban/tasks/${taskId}/attachments`).then((r) => r.data),
    enabled: !!taskId,
  })
}

export function useUploadAttachment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return apiClient.post<Attachment>(`/kanban/tasks/${taskId}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: attachmentKeys.list(taskId) }),
  })
}

export function useDeleteAttachment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attId: string) =>
      apiClient.delete(`/kanban/tasks/${taskId}/attachments/${attId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: attachmentKeys.list(taskId) }),
  })
}

export function getAttachmentDownloadUrl(taskId: string, attId: string) {
  return `/api/v1/kanban/tasks/${taskId}/attachments/${attId}/download`
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export function useLabels() {
  return useQuery({
    queryKey: kanbanKeys.labels(),
    queryFn: () => apiClient.get<TaskLabel[]>('/kanban/labels').then((r) => r.data),
  })
}

export function useCreateLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; color: string }) =>
      apiClient.post<TaskLabel>('/kanban/labels', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.labels() }),
  })
}

export function useUpdateLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string }) =>
      apiClient.patch<TaskLabel>(`/kanban/labels/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: kanbanKeys.labels() }),
  })
}

export function useDeleteLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/kanban/labels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kanbanKeys.labels() })
      qc.invalidateQueries({ queryKey: kanbanKeys.all }) // refresh tasks that had this label
    },
  })
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

export const activityKeys = {
  feed: (p: object) => [...kanbanKeys.all, 'activity', p] as const,
}

export function useActivityFeed(params: { skip?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: activityKeys.feed(params),
    queryFn: () =>
      apiClient.get<ActivityFeedResponse>('/kanban/activity', { params }).then((r) => r.data),
  })
}
