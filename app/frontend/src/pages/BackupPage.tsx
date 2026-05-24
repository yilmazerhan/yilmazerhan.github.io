import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Database, Download, RotateCcw, Trash2, Plus, Clock, AlertCircle, CheckCircle, RefreshCw, Settings,
} from 'lucide-react'
import apiClient from '@/api/client'

// ── Types ──────────────────────────────────────────────────────────────────────

interface BackupRecord {
  id: string
  filename: string
  display_name: string
  file_size: number
  backup_type: 'manual' | 'scheduled'
  status: 'completed' | 'failed'
  notes: string | null
  created_at: string
  file_exists: boolean
}

interface BackupSchedule {
  backup_enabled: string        // 'true' | 'false'
  backup_frequency: string      // 'daily' | 'weekly'
  backup_hour: string           // '0'-'23'
  backup_day_of_week: string    // '0'-'6'
  backup_retention_count: string
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

function TypeBadge({ type }: { type: 'manual' | 'scheduled' }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      type === 'scheduled'
        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
    }`}>
      {type === 'scheduled' ? <Clock className="h-3 w-3" /> : <Database className="h-3 w-3" />}
      {type === 'scheduled' ? t('backup.type_scheduled') : t('backup.type_manual')}
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
    backup_day_of_week: '0',
    backup_retention_count: '10',
  })
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleSuccess, setScheduleSuccess] = useState(false)
  const [scheduleError, setScheduleError] = useState('')

  // Active tab
  const [activeTab, setActiveTab] = useState<'backups' | 'schedule'>('backups')

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

  useEffect(() => {
    loadBackups()
    loadSchedule()
  }, [loadBackups, loadSchedule])

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

  async function handleSaveSchedule() {
    setSavingSchedule(true)
    setScheduleError('')
    setScheduleSuccess(false)
    try {
      const { data } = await apiClient.put<BackupSchedule>('/backup/schedule', schedule)
      setSchedule(data)
      setScheduleSuccess(true)
      setTimeout(() => setScheduleSuccess(false), 3000)
    } catch {
      setScheduleError(t('backup.error_schedule'))
    } finally {
      setSavingSchedule(false)
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    {t('backup.backup_hour')} (UTC)
                  </label>
                  <select
                    value={schedule.backup_hour}
                    onChange={e => setSchedule(s => ({ ...s, backup_hour: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={String(i)}>
                        {String(i).padStart(2, '0')}:00
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

              <button
                onClick={handleSaveSchedule}
                disabled={savingSchedule}
                className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
              >
                {savingSchedule ? t('common.saving') : t('common.save')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
