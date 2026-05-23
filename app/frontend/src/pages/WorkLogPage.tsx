import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, subDays } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { Plus, Pencil, Trash2, Clock, AlertTriangle } from 'lucide-react'
import { useWorkLogs, useDeleteWorkLog, type WorkLog } from '@/api/worklog'
import { useUsers } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import WorkLogModal from '@/components/worklog/WorkLogModal'

function canEditLog(log: WorkLog, userId: string, role: string): boolean {
  if (role === 'superadmin' || role === 'team_manager') return true
  const ageDays = Math.floor((Date.now() - new Date(log.log_date).getTime()) / 86400000)
  return log.user_id === userId && ageDays <= 3
}

export default function WorkLogPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const locale = i18n.language === 'tr' ? tr : enUS

  const today = format(new Date(), 'yyyy-MM-dd')
  const monthAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd')

  const [dateFrom, setDateFrom] = useState(monthAgo)
  const [dateTo, setDateTo] = useState(today)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editLog, setEditLog] = useState<WorkLog | null>(null)

  const canFilterByUser = user?.role === 'superadmin' || user?.role === 'team_manager'
  const usersParams = user?.role === 'team_manager' && user.team_id
    ? { team_id: user.team_id, limit: 200 }
    : { limit: 200 }
  const { data: usersData } = useUsers(canFilterByUser ? usersParams : undefined)

  const { data, isLoading } = useWorkLogs({
    date_from: dateFrom,
    date_to: dateTo,
    user_id: selectedUserId || undefined,
  })
  const deleteLog = useDeleteWorkLog()

  async function handleDelete(log: WorkLog) {
    if (!confirm(t('common.confirm_delete'))) return
    try {
      await deleteLog.mutateAsync(log.id)
    } catch (err: any) {
      alert(err.response?.data?.detail || t('common.error'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('worklog.title')}</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          {t('worklog.add')}
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('worklog.date_from')}</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('worklog.date_to')}</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        {canFilterByUser && (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('worklog.person')}</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{t('worklog.filter_all_users')}</option>
              {usersData?.items.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        )}
        {data && (
          <div className="flex items-end">
            <span className="text-sm text-gray-500 dark:text-gray-400 pb-2">
              {t('worklog.record_count', {
                count: data.total,
                total: data.items.reduce((s, l) => s + l.duration_hours, 0).toFixed(1),
              })}
            </span>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('worklog.date')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('worklog.person')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('worklog.work_type')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('worklog.duration')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('worklog.description')}</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">{t('common.loading')}</td></tr>
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">{t('worklog.no_records')}</td></tr>
            ) : data?.items.map((log) => {
              const editable = canEditLog(log, user?.id || '', user?.role || '')
              const ageDays = Math.floor((Date.now() - new Date(log.log_date).getTime()) / 86400000)
              const isOld = ageDays > 3 && log.user_id === user?.id && user?.role === 'user'

              return (
                <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {format(new Date(log.log_date + 'T12:00:00'), 'dd MMM yyyy', { locale })}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{log.user.full_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: log.work_type.color }}
                    >
                      {log.work_type.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                      <Clock className="h-3.5 w-3.5 text-gray-400" />
                      {log.duration_hours}{t('worklog.hours_abbr')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate" title={log.description}>
                    {log.description}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {isOld && (
                        <span title={t('worklog.old_record_warning')}>
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                        </span>
                      )}
                      {editable && (
                        <>
                          <button
                            onClick={() => setEditLog(log)}
                            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            title={t('common.edit')}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(log)}
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            title={t('common.delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {createOpen && <WorkLogModal onClose={() => setCreateOpen(false)} />}
      {editLog && <WorkLogModal log={editLog} onClose={() => setEditLog(null)} />}
    </div>
  )
}
