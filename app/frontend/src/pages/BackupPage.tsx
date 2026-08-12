import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Database, Download, RotateCcw, Trash2, Plus, Clock, AlertCircle, CheckCircle, RefreshCw, Settings, Upload, Timer,
} from 'lucide-react'
import apiClient from '@/api/client'

// ── Types ──────────────────────────────────────────────────────────────────────

interface BackupRecord {
  id: string
  filename: string
  display_name: string
  file_size: number
  backup_type: 'manual' | 'scheduled' | 'uploaded'
  status: 'completed' | 'failed'
  notes: string | null
  created_at: string
  file_exists: boolean
}

interface BackupSchedule {
  backup_enabled: string        // 'true' | 'false'
  backup_frequency: string      // 'daily' | 'weekly'
  backup_hour: string           // '0'-'23'
  backup_minute: string         // '0'-'59'
  backup_day_of_week: string    // '0'-'6'
  backup_retention_count: string
}

interface NextRunInfo {
  is_enabled: boolean
  next_run_at: string | null
  seconds_until_next: number | null
  last_backup_at: string | null
  last_backup_status: 'completed' | 'failed' | null
  last_backup_notes: string | null
  last_celery_heartbeat: string | null
}

interface CheckLogEntry {
  ts: string
  result: 'success' | 'skipped' | 'error'
  reason?: string
  detail?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'completed' | 'failed' }) {
  const { t } = useTranslation()
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
        <CheckCircle className="h-3 w-3" /> {t('backup.status_ok')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
      <AlertCircle className="h-3 w-3" /> {t('backup.status_failed')}
    </span>
  )
}

function TypeBadge({ type }: { type: 'manual' | 'scheduled' | 'uploaded' }) {
  const { t } = useTranslation()
  const cfg = type === 'scheduled'
    ? { cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', icon: <Clock className="h-3 w-3" />, label: t('backup.type_scheduled') }
    : type === 'uploaded'
    ? { cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', icon: <Upload className="h-3 w-3" />, label: t('backup.type_uploaded') }
    : { cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', icon: <Database className="h-3 w-3" />, label: t('backup.type_manual') }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BackupPage() {
  const { t } = useTranslation()

  // Backup list state
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listError, setListError] = useState('')

  // Create backup state
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Restore state
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState('')
  const [restoreSuccess, setRestoreSuccess] = useState('')

  // Download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Schedule state
  const [schedule, setSchedule] = useState<BackupSchedule>({
    backup_enabled: 'false',
    backup_frequency: 'daily',
    backup_hour: '2',
    backup_minute: '0',
    backup_day_of_week: '0',
    backup_retention_count: '10',
  })
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleSuccess, setScheduleSuccess] = useState(false)
  const [scheduleError, setScheduleError] = useState('')

  // Next run / countdown state
  const [nextRunInfo, setNextRunInfo] = useState<NextRunInfo | null>(null)
  const [countdownSec, setCountdownSec] = useState<number | null>(null)

  // Check log state
  const [checkLog, setCheckLog] = useState<CheckLogEntry[]>([])
  const [loadingLog, setLoadingLog] = useState(false)

  // Force-run state
  const [forceRunning, setForceRunning] = useState(false)
  const [forceResult, setForceResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Active tab
  const [activeTab, setActiveTab] = useState<'backups' | 'schedule' | 'upload'>('backups')

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadBackups = useCallback(async () => {
    setLoadingList(true)
    setListError('')
    try {
      const { data } = await apiClient.get<BackupRecord[]>('/backup/records')
      setBackups(data)
    } catch {
      setListError(t('backup.error_list'))
    } finally {
      setLoadingList(false)
    }
  }, [t])

  const loadSchedule = useCallback(async () => {
    setLoadingSchedule(true)
    try {
      const { data } = await apiClient.get<BackupSchedule>('/backup/schedule')
      setSchedule(data)
    } catch {
      // silent
    } finally {
      setLoadingSchedule(false)
    }
  }, [])

  const loadNextRunInfo = useCallback(async () => {
    try {
      const { data } = await apiClient.get<NextRunInfo>('/backup/next-run')
      setNextRunInfo(data)
    } catch {
      // silent — countdown card just stays empty
    }
  }, [])

  const loadCheckLog = useCallback(async () => {
    setLoadingLog(true)
    try {
      const { data } = await apiClient.get<CheckLogEntry[]>('/backup/check-log')
      setCheckLog(data)
    } catch {
      // silent
    } finally {
      setLoadingLog(false)
    }
  }, [])

  useEffect(() => {
    loadBackups()
    loadSchedule()
    loadNextRunInfo()
    loadCheckLog()
  }, [loadBackups, loadSchedule, loadNextRunInfo, loadCheckLog])

  // Reload log when user switches to the schedule tab
  useEffect(() => {
    if (activeTab === 'schedule') {
      loadCheckLog()
      loadNextRunInfo()
    }
  }, [activeTab, loadCheckLog, loadNextRunInfo])

  // Re-fetch next-run info every 60 s so the displayed target time stays fresh
  useEffect(() => {
    const id = setInterval(loadNextRunInfo, 60_000)
    return () => clearInterval(id)
  }, [loadNextRunInfo])

  // Countdown ticker — restarts whenever the target ISO timestamp changes
  const nextRunAt = nextRunInfo?.next_run_at ?? null
  useEffect(() => {
    if (!nextRunAt) {
      setCountdownSec(null)
      return
    }
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(nextRunAt).getTime() - Date.now()) / 1000))
      setCountdownSec(diff)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [nextRunAt])

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleCreate() {
    setCreating(true)
    setCreateError('')
    try {
      await apiClient.post('/backup/create')
      await loadBackups()
    } catch (err: any) {
      if (err.response?.status === 501) {
        setCreateError(t('backup.error_no_pgdump'))
      } else {
        setCreateError(t('backup.error_create'))
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleDownload(backup: BackupRecord) {
    setDownloadingId(backup.id)
    try {
      const response = await apiClient.get(`/backup/${backup.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = backup.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert(t('backup.error_download'))
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleRestore(backupId: string) {
    setRestoringId(backupId)
    setRestoreError('')
    setRestoreSuccess('')
    try {
      const { data } = await apiClient.post<{ message: string }>(`/backup/${backupId}/restore`)
      setRestoreSuccess(data.message)
      await loadBackups()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setRestoreError(detail || t('backup.error_restore'))
    } finally {
      setRestoringId(null)
      setConfirmRestoreId(null)
    }
  }

  async function handleDelete(backupId: string) {
    setDeletingId(backupId)
    try {
      await apiClient.delete(`/backup/${backupId}`)
      setBackups(prev => prev.filter(b => b.id !== backupId))
    } catch {
      alert(t('backup.error_delete'))
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  async function handleForceRun() {
    setForceRunning(true)
    setForceResult(null)
    try {
      const { data } = await apiClient.post<{ result: string; message: string }>('/backup/force-check')
      setForceResult({ ok: data.result === 'success', message: data.message })
      if (data.result === 'success') {
        await loadBackups()
        await loadCheckLog()
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || t('backup.error_create')
      setForceResult({ ok: false, message: detail })
    } finally {
      setForceRunning(false)
    }
  }

  async function handleSaveSchedule() {
    setSavingSchedule(true)
    setScheduleError('')
    setScheduleSuccess(false)
    try {
      const { data } = await apiClient.put<BackupSchedule>('/backup/schedule', schedule)
      setSchedule(data)
      setScheduleSuccess(true)
      setTimeout(() => setScheduleSuccess(false), 3000)
      // Refresh countdown since configured time may have changed
      loadNextRunInfo()
    } catch {
      setScheduleError(t('backup.error_schedule'))
    } finally {
      setSavingSchedule(false)
    }
  }

  async function handleUpload() {
    if (!uploadFile) return
    setUploading(true)
    setUploadError('')
    setUploadSuccess(false)
    const form = new FormData()
    form.append('file', uploadFile)
    try {
      await apiClient.post('/backup/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setUploadSuccess(true)
      setUploadFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadBackups()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (err.response?.status === 413) {
        setUploadError(t('backup.error_upload_too_large'))
      } else if (err.response?.status === 422 && detail) {
        setUploadError(`${t('backup.upload_validation_failed')}: ${detail}`)
      } else {
        setUploadError(t('backup.error_upload'))
      }
    } finally {
      setUploading(false)
    }
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) {
      setUploadFile(f)
      setUploadError('')
      setUploadSuccess(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('backup.title')}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('backups')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'backups'
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Database className="h-4 w-4 inline mr-1.5" />
            {t('backup.tab_backups')}
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'schedule'
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Settings className="h-4 w-4 inline mr-1.5" />
            {t('backup.tab_schedule')}
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Upload className="h-4 w-4 inline mr-1.5" />
            {t('backup.tab_upload')}
          </button>
        </div>
      </div>

      {/* ── Backups Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'backups' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('backup.description')}</p>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={loadBackups}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
              >
                <RefreshCw className="h-4 w-4" />
                {t('common.refresh')}
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                {creating ? t('backup.creating') : t('backup.create_now')}
              </button>
            </div>
          </div>

          {/* Create Error */}
          {createError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {createError}
            </div>
          )}

          {/* Restore feedback */}
          {restoreSuccess && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              {restoreSuccess}
            </div>
          )}
          {restoreError && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {restoreError}
            </div>
          )}

          {/* List */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {loadingList ? (
              <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-600">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                {t('common.loading')}
              </div>
            ) : listError ? (
              <div className="flex items-center justify-center gap-2 py-16 text-red-500 dark:text-red-400 text-sm">
                <AlertCircle className="h-5 w-5" />
                {listError}
              </div>
            ) : backups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
                <Database className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm">{t('backup.no_backups')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('backup.col_name')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden sm:table-cell">{t('backup.col_type')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">{t('backup.col_size')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('backup.col_status')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 hidden lg:table-cell">{t('backup.col_date')}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {backups.map(backup => (
                    <tr key={backup.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[200px]" title={backup.display_name}>
                          {backup.display_name}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-600 truncate max-w-[200px]" title={backup.filename}>
                          {backup.filename}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <TypeBadge type={backup.backup_type} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                        {formatBytes(backup.file_size)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={backup.status} />
                        {!backup.file_exists && (
                          <span className="ml-1 text-xs text-orange-500">⚠ {t('backup.file_missing')}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden lg:table-cell whitespace-nowrap">
                        {formatDate(backup.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Download */}
                          {backup.file_exists && (
                            <button
                              onClick={() => handleDownload(backup)}
                              disabled={downloadingId === backup.id}
                              title={t('backup.download')}
                              className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50 rounded"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          )}

                          {/* Restore */}
                          {backup.file_exists && (
                            confirmRestoreId === backup.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-amber-600 dark:text-amber-400">{t('backup.confirm_restore')}</span>
                                <button
                                  onClick={() => handleRestore(backup.id)}
                                  disabled={restoringId === backup.id}
                                  className="px-2 py-0.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded disabled:opacity-50"
                                >
                                  {restoringId === backup.id ? t('backup.restoring') : t('common.yes')}
                                </button>
                                <button
                                  onClick={() => setConfirmRestoreId(null)}
                                  className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                                >
                                  {t('common.no')}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setRestoreError('')
                                  setRestoreSuccess('')
                                  setConfirmRestoreId(backup.id)
                                }}
                                title={t('backup.restore')}
                                className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 rounded"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            )
                          )}

                          {/* Delete */}
                          {confirmDeleteId === backup.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(backup.id)}
                                disabled={deletingId === backup.id}
                                className="px-2 py-0.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded disabled:opacity-50"
                              >
                                {t('common.delete')}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                              >
                                {t('common.cancel')}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(backup.id)}
                              title={t('common.delete')}
                              className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {/* Info notes */}
          <ul className="text-xs text-gray-400 dark:text-gray-600 space-y-1 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
            <li>{t('backup.note_format')}</li>
            <li>{t('backup.note_includes')}</li>
            <li>{t('backup.note_restore_warning')}</li>
          </ul>
        </div>
      )}

      {/* ── Upload Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'upload' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
              <Upload className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('backup.upload_title')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('backup.upload_description')}</p>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors py-12 px-6 ${
              dragOver
                ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/10'
                : 'border-gray-300 dark:border-gray-700 hover:border-primary-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <Upload className="h-8 w-8 text-gray-400 dark:text-gray-600" />
            <span className="text-sm text-gray-500 dark:text-gray-400 text-center">{t('backup.upload_drop_label')}</span>
            <span className="text-xs text-gray-400 dark:text-gray-600">{t('backup.upload_constraints')}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".sql,text/plain,application/sql,application/octet-stream"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0] ?? null
                setUploadFile(f)
                setUploadError('')
                setUploadSuccess(false)
              }}
            />
          </div>

          {/* Selected file info */}
          {uploadFile && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm">
              <Database className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{uploadFile.name}</div>
                <div className="text-xs text-gray-400 dark:text-gray-600">{formatBytes(uploadFile.size)}</div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
          )}

          {/* Success / Error feedback */}
          {uploadSuccess && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">
              <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p>{t('backup.upload_success')}</p>
                <button
                  onClick={() => setActiveTab('backups')}
                  className="mt-1 underline text-green-600 dark:text-green-400 hover:no-underline text-xs"
                >
                  {t('backup.tab_backups')} →
                </button>
              </div>
            </div>
          )}
          {uploadError && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>{uploadError}</p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!uploadFile || uploading}
            className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
          >
            {uploading ? t('backup.uploading') : t('backup.upload_btn')}
          </button>
        </div>
      )}

      {/* ── Schedule Tab ───────────────────────────────────────────────────── */}
      {activeTab === 'schedule' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
              <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('backup.schedule_title')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('backup.schedule_description')}</p>
            </div>
          </div>

          {/* ── Countdown card ─────────────────────────────────────────────── */}
          <div className={`rounded-xl border p-4 ${
            nextRunInfo?.is_enabled
              ? 'border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/10'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30'
          }`}>
            <div className="flex items-start gap-3">
              <Timer className="h-5 w-5 text-purple-500 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {nextRunInfo?.is_enabled ? (
                  <>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {t('backup.countdown_title')}
                    </p>
                    <p className="text-3xl font-mono font-bold text-purple-600 dark:text-purple-400 mt-1 leading-none">
                      {countdownSec !== null ? formatCountdown(countdownSec) : '--:--:--'}
                    </p>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {nextRunInfo.last_backup_at ? (
                        <>
                          <span>{t('backup.countdown_last_attempt')}: {formatDate(nextRunInfo.last_backup_at)}</span>
                          <span className="mx-1">·</span>
                          <span className={nextRunInfo.last_backup_status === 'completed'
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'}>
                            {nextRunInfo.last_backup_status === 'completed'
                              ? `✓ ${t('backup.status_ok')}`
                              : `✗ ${t('backup.status_failed')}`}
                          </span>
                          {nextRunInfo.last_backup_status === 'failed' && nextRunInfo.last_backup_notes && (
                            <div className="mt-1.5 px-2 py-1.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs break-words">
                              <span className="font-medium">{t('backup.countdown_error_detail')}</span>{' '}
                              {nextRunInfo.last_backup_notes}
                            </div>
                          )}
                        </>
                      ) : (
                        <span>{t('backup.countdown_never')}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    {t('backup.countdown_disabled')}
                  </p>
                )}

                {/* Celery heartbeat indicator */}
                {(() => {
                  const hb = nextRunInfo?.last_celery_heartbeat
                  if (!hb) return (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      {t('backup.celery_never_seen')}
                    </div>
                  )
                  const ageSec = Math.floor((Date.now() - new Date(hb).getTime()) / 1000)
                  const isStale = ageSec > 180  // > 3 minutes = likely stopped
                  return (
                    <div className={`mt-3 flex items-center gap-1.5 text-xs ${isStale ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${isStale ? 'bg-amber-400' : 'bg-green-400'}`} />
                      {t('backup.celery_last_seen')}: {ageSec < 60
                        ? `${ageSec}s`
                        : ageSec < 3600
                          ? `${Math.floor(ageSec / 60)}m`
                          : `${Math.floor(ageSec / 3600)}h`} {t('backup.celery_ago')}
                      {isStale && ` — ${t('backup.celery_stale_warning')}`}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* Force run result feedback */}
          {forceResult && (
            <div className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm ${
              forceResult.ok
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            }`}>
              {forceResult.ok
                ? <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                : <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
              <p>{forceResult.message}</p>
            </div>
          )}

          {loadingSchedule ? (
            <div className="flex items-center gap-2 text-gray-400 dark:text-gray-600 text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('backup.schedule_enabled')}</label>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">{t('backup.schedule_enabled_desc')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSchedule(s => ({ ...s, backup_enabled: s.backup_enabled === 'true' ? 'false' : 'true' }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    schedule.backup_enabled === 'true' ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    schedule.backup_enabled === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Frequency */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('backup.frequency')}
                  </label>
                  <select
                    value={schedule.backup_frequency}
                    onChange={e => setSchedule(s => ({ ...s, backup_frequency: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
                  >
                    <option value="daily">{t('backup.daily')}</option>
                    <option value="weekly">{t('backup.weekly')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('backup.backup_hour')} (UTC+3)
                  </label>
                  <select
                    value={schedule.backup_hour}
                    onChange={e => setSchedule(s => ({ ...s, backup_hour: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={String(i)}>
                        {String(i).padStart(2, '0')}:xx
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('backup.backup_minute')} (UTC+3)
                  </label>
                  <select
                    value={schedule.backup_minute}
                    onChange={e => setSchedule(s => ({ ...s, backup_minute: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={String(i)}>
                        :{String(i).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Day of week (weekly only) */}
              {schedule.backup_frequency === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('backup.day_of_week')}
                  </label>
                  <select
                    value={schedule.backup_day_of_week}
                    onChange={e => setSchedule(s => ({ ...s, backup_day_of_week: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
                  >
                    <option value="0">{t('backup.monday')}</option>
                    <option value="1">{t('backup.tuesday')}</option>
                    <option value="2">{t('backup.wednesday')}</option>
                    <option value="3">{t('backup.thursday')}</option>
                    <option value="4">{t('backup.friday')}</option>
                    <option value="5">{t('backup.saturday')}</option>
                    <option value="6">{t('backup.sunday')}</option>
                  </select>
                </div>
              )}

              {/* Retention count */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('backup.retention_count')}
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={schedule.backup_retention_count}
                  onChange={e => setSchedule(s => ({ ...s, backup_retention_count: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm max-w-xs"
                />
                <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">{t('backup.retention_count_desc')}</p>
              </div>

              {/* Save feedback */}
              {scheduleSuccess && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  {t('backup.schedule_saved')}
                </div>
              )}
              {scheduleError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {scheduleError}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveSchedule}
                  disabled={savingSchedule}
                  className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
                >
                  {savingSchedule ? t('common.saving') : t('common.save')}
                </button>
                <button
                  onClick={handleForceRun}
                  disabled={forceRunning}
                  title={t('backup.force_run_hint')}
                  className="flex items-center gap-1.5 px-4 py-2.5 border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-60 rounded-lg text-sm font-medium"
                >
                  <RefreshCw className={`h-4 w-4 ${forceRunning ? 'animate-spin' : ''}`} />
                  {forceRunning ? t('backup.force_running') : t('backup.force_run')}
                </button>
              </div>
            </div>
          )}

          {/* ── Check log section ─────────────────────────────────────────── */}
          <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('backup.log_title')}
              </h3>
              <button
                onClick={loadCheckLog}
                className="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 flex items-center gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${loadingLog ? 'animate-spin' : ''}`} />
                {t('common.refresh')}
              </button>
            </div>

            {checkLog.length === 0 ? (
              <div className="py-5 text-center text-xs text-gray-400 dark:text-gray-600 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                {t('backup.log_empty')}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {checkLog.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <span className={`flex-shrink-0 font-bold mt-0.5 ${
                      entry.result === 'success' ? 'text-green-500' :
                      entry.result === 'error'   ? 'text-red-500' :
                      'text-gray-400 dark:text-gray-600'
                    }`}>
                      {entry.result === 'success' ? '✓' : entry.result === 'error' ? '✗' : '⏭'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {formatDate(entry.ts)}
                        </span>
                        <span className={`font-medium ${
                          entry.result === 'success' ? 'text-green-600 dark:text-green-400' :
                          entry.result === 'error'   ? 'text-red-600 dark:text-red-400' :
                          'text-gray-500 dark:text-gray-400'
                        }`}>
                          {t(`backup.log_result_${entry.result}`)}
                        </span>
                      </div>
                      {entry.detail && (
                        <p className="mt-0.5 text-gray-500 dark:text-gray-400 break-words leading-relaxed">
                          {entry.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
