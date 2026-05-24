import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, startOfMonth } from 'date-fns'
import { Clock, Users, FileText, TrendingUp, CalendarClock, Plus, Trash2, Play, Pencil } from 'lucide-react'
import { useWorkLogs } from '@/api/worklog'
import { useUsers } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import ExportButton from '@/components/ui/ExportButton'
import { exportWorklogs } from '@/api/export'
import {
  useReportSchedules, useCreateReportSchedule, useUpdateReportSchedule,
  useDeleteReportSchedule, useRunReportSchedule, type ReportSchedule,
} from '@/api/admin'
import { resolveName } from '@/utils/i18nName'


const FREQ_OPTIONS = ['daily', 'weekly', 'monthly'] as const
const DOW_OPTIONS = [
  { v: 0, k: 'report_schedule.mon' }, { v: 1, k: 'report_schedule.tue' },
  { v: 2, k: 'report_schedule.wed' }, { v: 3, k: 'report_schedule.thu' },
  { v: 4, k: 'report_schedule.fri' }, { v: 5, k: 'report_schedule.sat' },
  { v: 6, k: 'report_schedule.sun' },
]

interface ScheduleForm {
  id?: string
  name: string
  frequency: 'daily' | 'weekly' | 'monthly'
  day_of_week: number | null
  day_of_month: number | null
  hour: number
  recipient_emails: string
  date_range_days: number
  is_active: boolean
}

function emptyForm(): ScheduleForm {
  return { name: '', frequency: 'weekly', day_of_week: 0, day_of_month: null, hour: 8, recipient_emails: '', date_range_days: 7, is_active: true }
}

function ReportScheduleSection({ t }: { t: (k: string) => string }) {
  const { data: schedules = [] } = useReportSchedules()
  const createSchedule = useCreateReportSchedule()
  const updateSchedule = useUpdateReportSchedule()
  const deleteSchedule = useDeleteReportSchedule()
  const runSchedule = useRunReportSchedule()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ScheduleForm>(emptyForm())

  function openNew() { setForm(emptyForm()); setShowForm(true) }
  function openEdit(s: ReportSchedule) {
    setForm({
      id: s.id, name: s.name, frequency: s.frequency, day_of_week: s.day_of_week,
      day_of_month: s.day_of_month, hour: s.hour,
      recipient_emails: s.recipient_emails.join('\n'),
      date_range_days: s.date_range_days, is_active: s.is_active,
    })
    setShowForm(true)
  }

  async function handleSave() {
    const payload = {
      name: form.name,
      frequency: form.frequency,
      day_of_week: form.frequency === 'weekly' ? form.day_of_week : null,
      day_of_month: form.frequency === 'monthly' ? form.day_of_month : null,
      hour: form.hour,
      recipient_emails: form.recipient_emails.split('\n').map(e => e.trim()).filter(Boolean),
      date_range_days: form.date_range_days,
      is_active: form.is_active,
    }
    try {
      if (form.id) {
        await updateSchedule.mutateAsync({ id: form.id, ...payload })
      } else {
        await createSchedule.mutateAsync(payload)
      }
      setShowForm(false)
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('report_schedule.title')}</h2>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg"
        >
          <Plus className="h-4 w-4" />
          {t('report_schedule.add')}
        </button>
      </div>

      {schedules.length === 0 ? (
        <p className="text-center py-6 text-gray-400 text-sm">{t('report_schedule.no_schedules')}</p>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{s.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t(`report_schedule.frequency_${s.frequency}`)} · {s.recipient_emails.join(', ')} · {s.date_range_days}d
                </p>
                <p className="text-xs text-gray-400">
                  {t('report_schedule.next_run')}: {s.next_run_at ? format(new Date(s.next_run_at), 'dd MMM HH:mm') : t('report_schedule.never')}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                {s.is_active ? 'Active' : 'Inactive'}
              </span>
              <button onClick={() => runSchedule.mutateAsync(s.id).then(() => alert(t('report_schedule.run_success')))} className="p-1.5 rounded text-gray-400 hover:text-green-500" title={t('report_schedule.run_now')}>
                <Play className="h-4 w-4" />
              </button>
              <button onClick={() => openEdit(s)} className="p-1.5 rounded text-gray-400 hover:text-blue-500">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={async () => { if (confirm(t('report_schedule.delete_confirm'))) await deleteSchedule.mutateAsync(s.id) }} className="p-1.5 rounded text-gray-400 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{form.id ? t('report_schedule.edit') : t('report_schedule.add')}</h3>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('report_schedule.name')}</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('report_schedule.frequency')}</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as typeof form.frequency }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
                {FREQ_OPTIONS.map(fq => <option key={fq} value={fq}>{t(`report_schedule.frequency_${fq}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('report_schedule.hour')}</label>
              <input type="number" min={0} max={23} value={form.hour} onChange={e => setForm(f => ({ ...f, hour: +e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
            </div>
          </div>
          {form.frequency === 'weekly' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('report_schedule.day_of_week')}</label>
              <select value={form.day_of_week ?? 0} onChange={e => setForm(f => ({ ...f, day_of_week: +e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
                {DOW_OPTIONS.map(d => <option key={d.v} value={d.v}>{t(d.k)}</option>)}
              </select>
            </div>
          )}
          {form.frequency === 'monthly' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('report_schedule.day_of_month')}</label>
              <input type="number" min={1} max={28} value={form.day_of_month ?? 1} onChange={e => setForm(f => ({ ...f, day_of_month: +e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('report_schedule.recipient_emails')} <span className="text-gray-400">({t('report_schedule.recipient_emails_hint')})</span></label>
            <textarea value={form.recipient_emails} onChange={e => setForm(f => ({ ...f, recipient_emails: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white resize-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('report_schedule.date_range_days')}</label>
            <input type="number" min={1} max={365} value={form.date_range_days} onChange={e => setForm(f => ({ ...f, date_range_days: +e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="is_active" className="text-sm text-gray-700 dark:text-gray-300">{t('report_schedule.is_active')}</label>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">{t('report_schedule.cancel')}</button>
            <button onClick={handleSave} disabled={createSchedule.isPending || updateSchedule.isPending} className="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">{t('report_schedule.save')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReportsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canFilterByUser = user?.role === 'superadmin' || user?.role === 'team_manager'

  const today = format(new Date(), 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')

  const [dateFrom, setDateFrom] = useState(monthStart)
  const [dateTo, setDateTo] = useState(today)
  const [selectedUserId, setSelectedUserId] = useState('')

  const usersParams = user?.role === 'team_manager' && user.team_id
    ? { team_id: user.team_id, is_active: true, limit: 200 }
    : { is_active: true, limit: 200 }
  const { data: usersData } = useUsers(canFilterByUser ? usersParams : undefined)
  const { data, isLoading } = useWorkLogs({
    date_from: dateFrom,
    date_to: dateTo,
    user_id: selectedUserId || undefined,
    limit: 500,
  })

  const logs = data?.items ?? []

  // Build pivot: user → workType → hours
  const pivot = useMemo(() => {
    if (!logs.length) return null

    const users: Record<string, { name: string; byType: Record<string, number>; total: number }> = {}
    const types: Record<string, { name: string; name_key?: string | null; color: string }> = {}

    for (const log of logs) {
      if (!users[log.user_id]) {
        users[log.user_id] = { name: log.user.full_name, byType: {}, total: 0 }
      }
      users[log.user_id].byType[log.work_type_id] = (users[log.user_id].byType[log.work_type_id] ?? 0) + log.duration_hours
      users[log.user_id].total += log.duration_hours
      if (!types[log.work_type_id]) {
        types[log.work_type_id] = { name: log.work_type.name, name_key: log.work_type.name_key, color: log.work_type.color }
      }
    }

    // Sort users by total hours desc
    const sortedUsers = Object.entries(users).sort((a, b) => b[1].total - a[1].total)
    const typeList = Object.entries(types)

    // Grand total per type and overall
    const typeTotals: Record<string, number> = {}
    let grandTotal = 0
    for (const [, uData] of sortedUsers) {
      for (const [typeId, hours] of Object.entries(uData.byType)) {
        typeTotals[typeId] = (typeTotals[typeId] ?? 0) + hours
        grandTotal += hours
      }
    }

    return { sortedUsers, typeList, typeTotals, grandTotal }
  }, [logs])

  const summaryStats = useMemo(() => {
    const totalHours = logs.reduce((s, l) => s + l.duration_hours, 0)
    const uniqueUsers = new Set(logs.map((l) => l.user_id)).size
    return { totalHours, uniqueUsers, entries: logs.length }
  }, [logs])

  // Bar chart data: hours per user
  const maxUserHours = pivot ? Math.max(...pivot.sortedUsers.map(([, u]) => u.total), 1) : 1

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('reports.title')}</h1>
        <ExportButton
          onExport={(fmt) => exportWorklogs({
            date_from: dateFrom,
            date_to: dateTo,
            user_id: selectedUserId || undefined,
            format: fmt,
          })}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('reports.date_from')}</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('reports.date_to')}</label>
          <input
            type="date"
            value={dateTo}
            max={today}
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
              <option value="">{t('reports.filter_all_users')}</option>
              {usersData?.items.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        )}
        {(dateFrom !== monthStart || dateTo !== today || selectedUserId) && (
          <button
            onClick={() => { setDateFrom(monthStart); setDateTo(today); setSelectedUserId('') }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
          >
            {t('common.clear_filters')}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('reports.total_hours')}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{summaryStats.totalHours.toFixed(1)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
            <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('reports.entries')}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{summaryStats.entries}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center">
            <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('reports.unique_users')}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{summaryStats.uniqueUsers}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">{t('common.loading')}</div>
      ) : !pivot ? (
        <div className="text-center py-12 text-gray-400">{t('reports.no_data')}</div>
      ) : (
        <>
          {/* Hours per user bar chart */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('dashboard.hours_by_person')}</h2>
            </div>
            <div className="space-y-2">
              {pivot.sortedUsers.map(([uid, uData]) => (
                <div key={uid} className="flex items-center gap-3">
                  <span className="w-36 text-sm text-gray-600 dark:text-gray-400 truncate flex-shrink-0">{uData.name}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-5 relative">
                    <div
                      className="h-5 rounded-full bg-primary-400"
                      style={{ width: `${(uData.total / maxUserHours) * 100}%` }}
                    />
                  </div>
                  <span className="w-14 text-sm font-medium text-gray-700 dark:text-gray-300 text-right">
                    {uData.total.toFixed(1)}h
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pivot table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('reports.pivot_title')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('reports.user_col')}</th>
                    {pivot.typeList.map(([typeId, type]) => (
                      <th key={typeId} className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        <span className="flex items-center justify-end gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: type.color }} />
                          {resolveName(t, type.name, type.name_key)}
                        </span>
                      </th>
                    ))}
                    <th className="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{t('reports.total_col')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pivot.sortedUsers.map(([uid, uData]) => (
                    <tr key={uid} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">{uData.name}</td>
                      {pivot.typeList.map(([typeId]) => (
                        <td key={typeId} className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                          {uData.byType[typeId] ? `${uData.byType[typeId].toFixed(1)}h` : '—'}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-semibold text-gray-800 dark:text-gray-200">
                        {uData.total.toFixed(1)}h
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-t-2 border-gray-300 dark:border-gray-600">
                    <td className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{t('reports.grand_total')}</td>
                    {pivot.typeList.map(([typeId]) => (
                      <td key={typeId} className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">
                        {pivot.typeTotals[typeId] ? `${pivot.typeTotals[typeId].toFixed(1)}h` : '—'}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">
                      {pivot.grandTotal.toFixed(1)}h
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Scheduled Reports — only for superadmin */}
      {user?.role === 'superadmin' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <ReportScheduleSection t={t} />
        </div>
      )}
    </div>
  )
}
