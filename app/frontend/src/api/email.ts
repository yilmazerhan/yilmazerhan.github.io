import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface SmtpConfig {
  id: string
  host: string
  port: number
  username: string
  use_tls: boolean
  from_email: string
  from_name: string
  is_active: boolean
}

export interface EmailTemplate {
  id: string
  name: string
  slug: string
  subject: string
  html_body: string
  available_vars: Record<string, string> | null
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface EmailWorkflow {
  id: string
  name: string
  is_active: boolean
  trigger_type: string
  trigger_config: Record<string, any> | null
  condition_config: Record<string, any> | null
  template_id: string
  recipient_type: string
  recipient_users: string[] | null
  send_teams: boolean
  teams_webhook_id: string | null
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export interface EmailLog {
  id: string
  workflow_id: string | null
  template_id: string | null
  recipient_id: string | null
  to_email: string
  subject: string
  status: 'pending' | 'sent' | 'failed'
  error_message: string | null
  sent_at: string | null
  created_at: string
}

export interface EmailLogListResponse {
  items: EmailLog[]
  total: number
  skip: number
  limit: number
}

export interface TeamsWebhook {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

const emailKeys = {
  all: ['email'] as const,
  smtp: () => [...emailKeys.all, 'smtp'] as const,
  templates: () => [...emailKeys.all, 'templates'] as const,
  workflows: () => [...emailKeys.all, 'workflows'] as const,
  logs: (params?: object) => [...emailKeys.all, 'logs', params] as const,
  teamsWebhooks: () => [...emailKeys.all, 'teams-webhooks'] as const,
}

// ─── SMTP ────────────────────────────────────────────────────────────────────

export function useSmtpConfigs() {
  return useQuery({
    queryKey: emailKeys.smtp(),
    queryFn: () => apiClient.get<SmtpConfig[]>('/email/smtp').then((r) => r.data),
  })
}

export function useCreateSmtpConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<SmtpConfig, 'id' | 'is_active'> & { password: string }) =>
      apiClient.post<SmtpConfig>('/email/smtp', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.smtp() }),
  })
}

export function useUpdateSmtpConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; password?: string; is_active?: boolean; [key: string]: any }) =>
      apiClient.patch<SmtpConfig>(`/email/smtp/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.smtp() }),
  })
}

export function useTestSmtpConfig() {
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ success: boolean; message: string }>(`/email/smtp/${id}/test`).then((r) => r.data),
  })
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function useEmailTemplates() {
  return useQuery({
    queryKey: emailKeys.templates(),
    queryFn: () => apiClient.get<EmailTemplate[]>('/email/templates').then((r) => r.data),
  })
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; slug: string; subject: string; html_body: string; available_vars?: object }) =>
      apiClient.post<EmailTemplate>('/email/templates', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.templates() }),
  })
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; subject?: string; html_body?: string }) =>
      apiClient.patch<EmailTemplate>(`/email/templates/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.templates() }),
  })
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/email/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.templates() }),
  })
}

export function usePreviewEmailTemplate() {
  return useMutation({
    mutationFn: ({ id, variables }: { id: string; variables: object }) =>
      apiClient.post<{ html: string }>(`/email/templates/${id}/preview`, { variables }).then((r) => r.data),
  })
}

// ─── Workflows ────────────────────────────────────────────────────────────────

export function useEmailWorkflows() {
  return useQuery({
    queryKey: emailKeys.workflows(),
    queryFn: () => apiClient.get<EmailWorkflow[]>('/email/workflows').then((r) => r.data),
  })
}

export function useCreateEmailWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => apiClient.post<EmailWorkflow>('/email/workflows', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.workflows() }),
  })
}

export function useUpdateEmailWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      apiClient.patch<EmailWorkflow>(`/email/workflows/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.workflows() }),
  })
}

export function useToggleEmailWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.patch<EmailWorkflow>(`/email/workflows/${id}/toggle`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.workflows() }),
  })
}

export function useDeleteEmailWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/email/workflows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.workflows() }),
  })
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export function useEmailLogs(params?: { status?: string; skip?: number; limit?: number }) {
  return useQuery({
    queryKey: emailKeys.logs(params),
    queryFn: () => apiClient.get<EmailLogListResponse>('/email/logs', { params }).then((r) => r.data),
  })
}

// ─── Teams Webhooks ───────────────────────────────────────────────────────────

export function useTeamsWebhooks() {
  return useQuery({
    queryKey: emailKeys.teamsWebhooks(),
    queryFn: () => apiClient.get<TeamsWebhook[]>('/email/teams-webhooks').then((r) => r.data),
  })
}

export function useCreateTeamsWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; webhook_url: string }) =>
      apiClient.post<TeamsWebhook>('/email/teams-webhooks', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.teamsWebhooks() }),
  })
}

export function useDeleteTeamsWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/email/teams-webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: emailKeys.teamsWebhooks() }),
  })
}

export function useTestTeamsWebhook() {
  return useMutation({
    mutationFn: (id: string) => apiClient.post<{ success: boolean }>(`/email/teams-webhooks/${id}/test`).then((r) => r.data),
  })
}
