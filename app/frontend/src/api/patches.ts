import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Customer {
  id: string
  name: string
}

export interface PatchUser {
  id: string
  full_name: string
}

export interface CustomerPatch {
  id: string
  customers: string[]
  jira_ticket: string | null
  app_version: string
  apply_date: string
  environment: string | null
  status: string
  description: string | null
  created_by: string | null
  created_by_user: PatchUser | null
  created_at: string
  updated_at: string
}

export interface PatchListResponse {
  items: CustomerPatch[]
  total: number
  skip: number
  limit: number
}

export interface PatchCreate {
  customers: string[]
  jira_ticket?: string
  app_version: string
  apply_date: string
  environment?: string
  status?: string
  description?: string
}

export interface PatchUpdate {
  customers?: string[]
  jira_ticket?: string | null
  app_version?: string
  apply_date?: string
  environment?: string | null
  status?: string
  description?: string | null
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const patchKeys = {
  all: ['patches'] as const,
  list: (params?: object) => [...patchKeys.all, 'list', params] as const,
  detail: (id: string) => [...patchKeys.all, 'detail', id] as const,
  customers: () => [...patchKeys.all, 'customers'] as const,
}

// ─── Customer Hooks ───────────────────────────────────────────────────────────

export function useCustomers() {
  return useQuery({
    queryKey: patchKeys.customers(),
    queryFn: () =>
      apiClient.get<Customer[]>('/patches/customers').then((r) => r.data),
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      apiClient.post<Customer>('/patches/customers', { name }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: patchKeys.customers() }),
  })
}

// ─── Patch Hooks ──────────────────────────────────────────────────────────────

export function usePatches(params?: {
  search?: string
  status?: string
  environment?: string
  date_from?: string
  date_to?: string
  skip?: number
  limit?: number
}) {
  return useQuery({
    queryKey: patchKeys.list(params),
    queryFn: () =>
      apiClient.get<PatchListResponse>('/patches', { params }).then((r) => r.data),
  })
}

export function useCreatePatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PatchCreate) =>
      apiClient.post<CustomerPatch>('/patches', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: patchKeys.all })
    },
  })
}

export function useUpdatePatch(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PatchUpdate) =>
      apiClient.patch<CustomerPatch>(`/patches/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: patchKeys.all })
    },
  })
}

export function useDeletePatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/patches/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: patchKeys.all })
    },
  })
}
