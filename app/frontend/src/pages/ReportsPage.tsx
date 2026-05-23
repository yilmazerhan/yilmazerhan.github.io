import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, startOfMonth, subDays } from 'date-fns'
import { Clock, Users, FileText, TrendingUp } from 'lucide-react'
import { useWorkLogs, useWorkTypes } from '@/api/worklog'
import { useUsers } from '@/api/users'
import { useAuthStore } from '@/store/authStore'

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
  const { data: workTypesData } = useWorkTypes(false) // include inactive

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
    const types: Record<string, { name: string; color: string }> = {}

    for (const log of logs) {
      if (!users[log.user_id]) {
        users[log.user_id] = { name: log.user.full_name, byType: {}, total: 0 }
      }
      users[log.user_id].byType[log.work_type_id] = (users[log.user_id].byType[log.work_type_id] ?? 0) + log.duration_hours
      users[log.user_id].total += log.duration_hours
      if (!types[log.work_type_id]) {
        types[log.work_type_id] = { name: log.work_type.name, color: log.work_type.color }
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
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('reports.title')}</h1>

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
                          {type.name}
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
    </div>
  )
}
