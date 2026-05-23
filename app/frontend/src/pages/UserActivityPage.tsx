import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { ArrowLeft, Clock, CheckSquare, AlertTriangle, Archive } from 'lucide-react'
import apiClient from '@/api/client'

interface ActivityReport {
  user: {
    id: string; full_name: string; email: string; username: string; role: string; team_id: string | null
  }
  period: { date_from: string; date_to: string }
  work_log_summary: {
    total_hours: number
    entry_count: number
    hours_by_type: { name: string; color: string; hours: number; count: number }[]
  }
  task_summary: {
    active: number; archived: number; overdue: number
    by_column: { name: string; color: string; count: number }[]
  }
  recent_logs: {
    log_date: string; work_type: string; work_type_color: string; duration_hours: number; description: string
  }[]
}

export default function UserActivityPage() {
  const { t } = useTranslation()
  const { userId } = useParams<{ userId: string }>()
  const today = format(new Date(), 'yyyy-MM-dd')
  const monthAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const [dateFrom, setDateFrom] = useState(monthAgo)
  const [dateTo, setDateTo] = useState(today)

  const { data, isLoading } = useQuery({
    queryKey: ['user-activity', userId, dateFrom, dateTo],
    queryFn: () =>
      apiClient
        .get<ActivityReport>(`/admin/reports/user/${userId}`, {
          params: { date_from: dateFrom, date_to: dateTo },
        })
        .then((r) => r.data),
    enabled: !!userId,
  })

  const maxHours = data
    ? Math.max(...data.work_log_summary.hours_by_type.map((t) => t.hours), 1)
    : 1

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to="/users" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {data ? data.user.full_name : t('common.loading')}
          </h1>
          {data && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              @{data.user.username} · {data.user.email}
            </p>
          )}
        </div>
      </div>

      {/* Date filter */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t('reports.date_from')}</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t('reports.date_to')}</label>
          <input type="date" value={dateTo} max={today} onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">{t('common.loading')}</div>
      ) : !data ? null : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Clock, label: t('reports.total_hours'), value: `${data.work_log_summary.total_hours.toFixed(1)}h`, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
              { icon: CheckSquare, label: t('activity.active_tasks'), value: data.task_summary.active, color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
              { icon: AlertTriangle, label: t('activity.overdue_tasks'), value: data.task_summary.overdue, color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
              { icon: Archive, label: t('activity.archived_tasks'), value: data.task_summary.archived, color: 'text-gray-600 bg-gray-50 dark:bg-gray-800' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Hours by work type */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t('activity.hours_by_type')}</h2>
              {data.work_log_summary.hours_by_type.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">{t('reports.no_data')}</p>
              ) : (
                <div className="space-y-2">
                  {data.work_log_summary.hours_by_type
                    .sort((a, b) => b.hours - a.hours)
                    .map((wt) => (
                    <div key={wt.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: wt.color }} />
                      <span className="text-sm text-gray-600 dark:text-gray-400 flex-1 truncate">{wt.name}</span>
                      <div className="w-24 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                        <div className="h-2 rounded-full" style={{ width: `${(wt.hours / maxHours) * 100}%`, backgroundColor: wt.color }} />
                      </div>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-12 text-right">{wt.hours.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tasks by column */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{t('activity.tasks_by_column')}</h2>
              {data.task_summary.by_column.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">{t('activity.no_tasks')}</p>
              ) : (
                <div className="space-y-2">
                  {data.task_summary.by_column.map((col) => (
                    <div key={col.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                      <span className="text-sm text-gray-600 dark:text-gray-400 flex-1">{col.name}</span>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{col.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent work logs */}
          {data.recent_logs.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('activity.recent_logs')}</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{t('worklog.date')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{t('worklog.work_type')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{t('worklog.duration')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{t('worklog.description')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_logs.map((l, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">{l.log_date}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: l.work_type_color }}>
                          {l.work_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{l.duration_hours}h</td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 max-w-xs truncate">{l.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
