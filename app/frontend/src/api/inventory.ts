import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ItemType = 'server' | 'database' | 'email_account' | 'cloud_account' | 'generic'

export interface InventoryItem {
  id: string
  item_type: ItemType
  display_name: string
  description?: string
  notes?: string
  tags: string[]
  is_active: boolean

  // Server / shared
  hostname?: string
  ip_address?: string
  port?: number
  username?: string
  has_password: boolean
  has_ssh_key: boolean
  operating_system?: string

  // Database
  database_name?: string
  database_type?: string

  // Email
  email_address?: string
  smtp_host?: string
  smtp_port?: number
  imap_host?: string
  imap_port?: number

  // Cloud
  provider?: string
  account_id?: string
  has_access_key: boolean
  region?: string

  // Generic
  url?: string

  created_by?: string
  updated_by?: string
  created_at: string
  updated_at: string
}

export interface InventoryItemCreate {
  item_type: ItemType
  display_name: string
  description?: string
  notes?: string
  tags?: string[]
  is_active?: boolean
  hostname?: string
  ip_address?: string
  port?: number
  username?: string
  password?: string
  ssh_key?: string
  operating_system?: string
  database_name?: string
  database_type?: string
  email_address?: string
  smtp_host?: string
  smtp_port?: number
  imap_host?: string
  imap_port?: number
  provider?: string
  account_id?: string
  access_key_id?: string
  secret_access_key?: string
  region?: string
  url?: string
}

export type InventoryItemUpdate = Partial<Omit<InventoryItemCreate, 'item_type'>>

export interface InventorySchedule {
  id: string
  name: string
  frequency: 'daily' | 'weekly' | 'monthly'
  day_of_week?: number
  day_of_month?: number
  hour: number
  recipient_emails: string[]
  is_active: boolean
  created_by?: string
  last_run_at?: string
  next_run_at?: string
  created_at: string
  updated_at: string
}

export interface InventoryScheduleCreate {
  name: string
  frequency: 'daily' | 'weekly' | 'monthly'
  day_of_week?: number
  day_of_month?: number
  hour?: number
  recipient_emails: string[]
  is_active?: boolean
}

// ─── Query keys ──────────────────────────────────────────────────────────────

const inventoryKeys = {
  all: ['inventory'] as const,
  items: (params?: object) => [...inventoryKeys.all, 'items', params] as const,
  item: (id: string) => [...inventoryKeys.all, 'item', id] as const,
  schedules: () => [...inventoryKeys.all, 'schedules'] as const,
}

// ─── Item Hooks ───────────────────────────────────────────────────────────────

export interface InventoryListParams {
  item_type?: string
  search?: string
  tags?: string
  is_active?: boolean
  skip?: number
  limit?: number
}

export function useInventoryItems(params?: InventoryListParams) {
  return useQuery({
    queryKey: inventoryKeys.items(params),
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params?.item_type) searchParams.set('item_type', params.item_type)
      if (params?.search) searchParams.set('search', params.search)
      if (params?.tags) searchParams.set('tags', params.tags)
      if (params?.is_active !== undefined) searchParams.set('is_active', String(params.is_active))
      if (params?.skip !== undefined) searchParams.set('skip', String(params.skip))
      if (params?.limit !== undefined) searchParams.set('limit', String(params.limit))
      const qs = searchParams.toString()
      const res = await apiClient.get<InventoryItem[]>(`/inventory/items${qs ? `?${qs}` : ''}`)
      return res.data
    },
  })
}

export function useCreateInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: InventoryItemCreate) =>
      apiClient.post<InventoryItem>('/inventory/items', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all }),
  })
}

export function useUpdateInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: InventoryItemUpdate }) =>
      apiClient.patch<InventoryItem>(`/inventory/items/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all }),
  })
}

export function useDeleteInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/inventory/items/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all }),
  })
}

export function useRevealField() {
  return useMutation({
    mutationFn: ({ id, field }: { id: string; field: string }) =>
      apiClient
        .post<{ field: string; value: string }>(`/inventory/items/${id}/reveal`, { field })
        .then((r) => r.data),
  })
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportInventory(format: 'excel' | 'csv', item_type?: string) {
  const params = new URLSearchParams({ format })
  if (item_type) params.set('item_type', item_type)

  const res = await apiClient.get(`/inventory/export?${params.toString()}`, {
    responseType: 'blob',
  })

  const ext = format === 'csv' ? 'csv' : 'xlsx'
  const contentType =
    format === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  const url = URL.createObjectURL(new Blob([res.data], { type: contentType }))
  const a = document.createElement('a')
  a.href = url
  a.download = `inventory.${ext}`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Schedule Hooks ───────────────────────────────────────────────────────────

export function useInventorySchedules() {
  return useQuery({
    queryKey: inventoryKeys.schedules(),
    queryFn: async () => {
      const res = await apiClient.get<InventorySchedule[]>('/inventory/schedules')
      return res.data
    },
  })
}

export function useCreateInventorySchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: InventoryScheduleCreate) =>
      apiClient.post<InventorySchedule>('/inventory/schedules', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.schedules() }),
  })
}

export function useUpdateInventorySchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: Partial<InventoryScheduleCreate>
    }) =>
      apiClient
        .patch<InventorySchedule>(`/inventory/schedules/${id}`, data)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.schedules() }),
  })
}

export function useDeleteInventorySchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/inventory/schedules/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.schedules() }),
  })
}

export function useSendInventoryScheduleNow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ sent: number }>(`/inventory/schedules/${id}/send-now`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.schedules() }),
  })
}
