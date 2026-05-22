import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface SslCertificate {
  id: string
  name: string
  expires_at: string
  is_active: boolean
  uploaded_by: string | null
  created_at: string
}

export interface BrandingData {
  company_name: string
  company_logo: string
  primary_color: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: 'create' | 'update' | 'delete'
  table_name: string
  record_id: string
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface AuditLogListResponse {
  items: AuditLog[]
  total: number
  skip: number
  limit: number
}

export interface DashboardStats {
  total_users: number
  active_users: number
  total_tasks: number
  active_tasks: number
  overdue_tasks: number
  worklogs_this_week: number
  emails_sent_today: number
  emails_failed_today: number
}

const adminKeys = {
  ssl: ['admin', 'ssl'] as const,
  branding: ['admin', 'branding'] as const,
  auditLogs: (p: Record<string, unknown>) => ['admin', 'audit-logs', p] as const,
  dashboardStats: ['admin', 'stats', 'dashboard'] as const,
}

export function useSslCertificates() {
  return useQuery({
    queryKey: adminKeys.ssl,
    queryFn: () => apiClient.get<SslCertificate[]>('/admin/ssl').then((r) => r.data),
  })
}

export function useUploadPem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; certFile: File; keyFile: File }) => {
      const fd = new FormData()
      fd.append('name', data.name)
      fd.append('cert_file', data.certFile)
      fd.append('key_file', data.keyFile)
      return apiClient.post<SslCertificate>('/admin/ssl/upload-pem', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.ssl }),
  })
}

export function useUploadJks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; jksFile: File; password: string }) => {
      const fd = new FormData()
      fd.append('name', data.name)
      fd.append('password', data.password)
      fd.append('jks_file', data.jksFile)
      return apiClient.post<SslCertificate>('/admin/ssl/upload-jks', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.ssl }),
  })
}

export function useActivateCertificate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post<SslCertificate>(`/admin/ssl/activate/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.ssl }),
  })
}

export function useDeleteCertificate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/ssl/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.ssl }),
  })
}

export function useBranding() {
  return useQuery({
    queryKey: adminKeys.branding,
    queryFn: () => apiClient.get<BrandingData>('/admin/settings/branding').then((r) => r.data),
  })
}

export function useUpdateBranding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { company_name?: string; primary_color?: string }) =>
      apiClient.put<BrandingData>('/admin/settings/branding', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.branding })
      qc.invalidateQueries({ queryKey: ['branding'] })
    },
  })
}

export function useUploadLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (logoFile: File) => {
      const fd = new FormData()
      fd.append('logo', logoFile)
      return apiClient.post<BrandingData>('/admin/settings/branding/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.branding })
      qc.invalidateQueries({ queryKey: ['branding'] })
    },
  })
}

export function useAuditLogs(params: {
  user_id?: string
  action?: string
  table_name?: string
  date_from?: string
  date_to?: string
  skip?: number
  limit?: number
}) {
  return useQuery({
    queryKey: adminKeys.auditLogs(params as Record<string, unknown>),
    queryFn: () =>
      apiClient
        .get<AuditLogListResponse>('/admin/audit-logs', { params })
        .then((r) => r.data),
  })
}

export function useDashboardStats(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.dashboardStats,
    queryFn: () =>
      apiClient.get<DashboardStats>('/admin/stats/dashboard').then((r) => r.data),
    staleTime: 60_000,
    enabled: opts?.enabled ?? true,
  })
}
