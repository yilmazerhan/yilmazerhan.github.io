import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface User {
  id: string
  email: string
  username: string
  full_name: string
  role: 'superadmin' | 'team_manager' | 'user'
  team_id: string | null
  team: { id: string; name: string } | null
  preferred_language: string
  preferred_theme: string
  is_active: boolean
  is_deleted: boolean
  last_login_at: string | null
  created_at: string
}

export interface UserListResponse {
  items: User[]
  total: number
  skip: number
  limit: number
}

export interface CreateUserPayload {
  email: string
  username?: string
  full_name: string
  role?: string
  team_id?: string | null
  preferred_language?: string
}

export interface UpdateUserPayload {
  email?: string
  full_name?: string
  role?: string
  team_id?: string | null
  is_active?: boolean
  preferred_language?: string
  preferred_theme?: string
}

export interface PermissionOverride {
  id: string
  user_id: string
  module: string
  action: string
  is_allowed: boolean
}

export interface EffectivePermissions {
  user_id: string
  role: string
  permissions: Record<string, Record<string, boolean>>
}

// ─── Query Keys ──────────────────────────────────────────────────────────────
export const userKeys = {
  all: ['users'] as const,
  list: (params?: object) => [...userKeys.all, 'list', params] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
  permissions: (id: string) => [...userKeys.all, 'permissions', id] as const,
  effectivePermissions: (id: string) => [...userKeys.all, 'effectivePermissions', id] as const,
}

// ─── Hooks ───────────────────────────────────────────────────────────────────
export function useUsers(params?: {
  team_id?: string
  role?: string
  is_active?: boolean
  search?: string
  include_deleted?: boolean
  skip?: number
  limit?: number
}, enabled = true) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () =>
      apiClient.get<UserListResponse>('/users', { params }).then((r) => r.data),
    enabled,
  })
}

export function useUser(id: string, enabled = true) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => apiClient.get<User>(`/users/${id}`).then((r) => r.data),
    enabled,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserPayload) =>
      apiClient.post<User>('/users', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateUserPayload) =>
      apiClient.patch<User>(`/users/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useRestoreUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post<User>(`/users/${id}/restore`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useHardDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}/hard`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useEffectivePermissions(userId: string, enabled = true) {
  return useQuery({
    queryKey: userKeys.effectivePermissions(userId),
    queryFn: () =>
      apiClient.get<EffectivePermissions>(`/permissions/effective/${userId}`).then((r) => r.data),
    enabled,
  })
}

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: (data: { old_password: string; new_password: string }) =>
      apiClient.post<{ message: string }>('/users/me/change-password', data).then((r) => r.data),
  })
}

export function useSetUserPassword() {
  return useMutation({
    mutationFn: ({ userId, new_password }: { userId: string; new_password: string }) =>
      apiClient.post<{ message: string }>(`/users/${userId}/set-password`, { new_password }).then((r) => r.data),
  })
}

export function useSetPermissions(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (overrides: Omit<PermissionOverride, 'id' | 'user_id'>[]) =>
      apiClient.put<PermissionOverride[]>(`/permissions/users/${userId}`, { overrides }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.permissions(userId) })
      qc.invalidateQueries({ queryKey: userKeys.effectivePermissions(userId) })
    },
  })
}
