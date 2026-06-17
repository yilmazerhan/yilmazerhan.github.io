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
  jira_base_url: string
  favicon: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  username: string | null
  action: 'create' | 'update' | 'delete' | 'login' | 'logout'
  table_name: string
  record_id: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
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

export interface SystemHealth {
  database: 'ok' | 'error'
  redis: 'ok' | 'error'
  celery_worker: 'ok' | 'degraded'
  uptime_seconds: number
  db_error: string | null
  redis_error: string | null
}

export interface UserActivitySummary {
  user_id: string
  full_name: string
  email: string
  last_login_at: string | null
  worklog_count_this_month: number
  open_task_count: number
}

const adminKeys = {
  ssl: ['admin', 'ssl'] as const,
  branding: ['admin', 'branding'] as const,
  auditLogs: (p: Record<string, unknown>) => ['admin', 'audit-logs', p] as const,
  dashboardStats: ['admin', 'stats', 'dashboard'] as const,
  systemHealth: ['admin', 'system-health'] as const,
  userActivitySummary: ['admin', 'users', 'activity-summary'] as const,
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

export function useReloadSsl() {
  return useMutation({
    mutationFn: () => apiClient.post<{ message: string }>('/admin/ssl/reload').then((r) => r.data),
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
    mutationFn: (data: { company_name?: string; primary_color?: string; jira_base_url?: string }) =>
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

export function useUploadFavicon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (faviconFile: File) => {
      const fd = new FormData()
      fd.append('favicon', faviconFile)
      return apiClient.post<BrandingData>('/admin/settings/branding/favicon', fd, {
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

export function useSystemHealth(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.systemHealth,
    queryFn: () =>
      apiClient.get<SystemHealth>('/admin/system-health').then((r) => r.data),
    refetchInterval: 30000,
    enabled: opts?.enabled ?? true,
  })
}

// ─── Report Schedules ─────────────────────────────────────────────────────────

export interface ReportSchedule {
  id: string
  name: string
  frequency: 'daily' | 'weekly' | 'monthly'
  day_of_week: number | null
  day_of_month: number | null
  hour: number
  recipient_emails: string[]
  team_id: string | null
  user_id: string | null
  date_range_days: number
  is_active: boolean
  created_by: string | null
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
}

const reportScheduleKeys = {
  all: ['admin', 'report-schedules'] as const,
}

export function useReportSchedules() {
  return useQuery({
    queryKey: reportScheduleKeys.all,
    queryFn: () => apiClient.get<ReportSchedule[]>('/admin/reports/schedules').then((r) => r.data),
  })
}

export function useCreateReportSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name: string
      frequency: string
      day_of_week?: number | null
      day_of_month?: number | null
      hour?: number
      recipient_emails: string[]
      team_id?: string | null
      user_id?: string | null
      date_range_days?: number
      is_active?: boolean
    }) => apiClient.post<ReportSchedule>('/admin/reports/schedules', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportScheduleKeys.all }),
  })
}

export function useUpdateReportSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<{
      name: string
      frequency: string
      day_of_week: number | null
      day_of_month: number | null
      hour: number
      recipient_emails: string[]
      team_id: string | null
      user_id: string | null
      date_range_days: number
      is_active: boolean
    }>) => apiClient.patch<ReportSchedule>(`/admin/reports/schedules/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportScheduleKeys.all }),
  })
}

export function useDeleteReportSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/reports/schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportScheduleKeys.all }),
  })
}

export function useRunReportSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/reports/schedules/${id}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: reportScheduleKeys.all }),
  })
}

export function useUserActivitySummary() {
  return useQuery({
    queryKey: adminKeys.userActivitySummary,
    queryFn: () => apiClient.get<UserActivitySummary[]>('/admin/users/activity-summary').then((r) => r.data),
  })
}
