import apiClient from './client'

export type ExportFormat = 'csv' | 'excel'

interface WorklogExportParams {
  date_from?: string
  date_to?: string
  user_id?: string
  format?: ExportFormat
}

interface TaskExportParams {
  board_id?: string
  column_id?: string
  assignee_id?: string
  priority?: string
  include_archived?: boolean
  format?: ExportFormat
}

interface UserActivityExportParams {
  user_id?: string
  date_from?: string
  date_to?: string
  format?: ExportFormat
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function exportWorklogs(params: WorklogExportParams = {}): Promise<void> {
  const response = await apiClient.get('/export/worklogs', {
    params: { format: 'csv', ...params },
    responseType: 'blob',
  })
  const fmt = params.format ?? 'csv'
  const ext = fmt === 'excel' ? 'xlsx' : 'csv'
  triggerDownload(response.data, `worklogs.${ext}`)
}

export async function exportTasks(params: TaskExportParams = {}): Promise<void> {
  const response = await apiClient.get('/export/tasks', {
    params: { format: 'csv', ...params },
    responseType: 'blob',
  })
  const fmt = params.format ?? 'csv'
  const ext = fmt === 'excel' ? 'xlsx' : 'csv'
  triggerDownload(response.data, `tasks.${ext}`)
}

export async function exportUserActivity(params: UserActivityExportParams = {}): Promise<void> {
  const response = await apiClient.get('/export/user-activity', {
    params: { format: 'csv', ...params },
    responseType: 'blob',
  })
  const fmt = params.format ?? 'csv'
  const ext = fmt === 'excel' ? 'xlsx' : 'csv'
  triggerDownload(response.data, `user_activity.${ext}`)
}
