import { useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { format, subDays, isToday, isPast, parseISO } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { Clock, AlertTriangle, CheckCircle2, ListTodo, TrendingUp, Users, Database, Mail, Settings2, Eye, EyeOff, Check } from 'lucide-react'
import { useTasks } from '@/api/kanban'
import { useWorkLogs } from '@/api/worklog'
import { useAuthStore } from '@/store/authStore'
import { useDashboardStats } from '@/api/admin'
import { resolveName } from '@/utils/i18nName'

const WIDGET_KEYS = ['db_stats', 'charts', 'overdue', 'recent_logs'] as const
type WidgetKey = typeof WIDGET_KEYS[number]

function loadHiddenWidgets(): Set<WidgetKey> {
  try {
    const raw = localStorage.getItem('dashboard_hidden_widgets')
    if (raw) return new Set(JSON.parse(raw) as WidgetKey[])
  } catch { /* ignore */ }
  return new Set()
}

function saveHiddenWidgets(set: Set<WidgetKey>) {
  localStorage.setItem('dashboard_hidden_widgets', JSON.stringify([...set]))
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
  const [editMode, setEditMode] = useState(false)
  const [hiddenWidgets, setHiddenWidgets] = useState<Set<WidgetKey>>(loadHiddenWidgets)

  const toggleWidget = useCallback((key: WidgetKey) => {
    setHiddenWidgets((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveHiddenWidgets(next)
      return next
    })
  }, [])
  const user = useAuthStore((s) => s.user)
  const locale = i18n.language === 'tr' ? tr : enUS
  const today = format(new Date(), 'yyyy-MM-dd')
  const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')
  const isSuperAdmin = user?.role === 'superadmin'
  const canSeeTeamData = user?.role === 'superadmin' || user?.role === 'team_manager'

  const { data: tasksData } = useTasks({ limit: 500 })
  const { data: logsData } = useWorkLogs({ date_from: weekAgo, date_to: today })
  const { data: dbStats } = useDashboardStats({ enabled: isSuperAdmin })

  const stats = useMemo(() => {
    const tasks = tasksData?.items ?? []
    const active = tasks.filter((t) => !t.is_archived)
    const overdue = active.filter((t) => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)))
    const dueThisWeek = active.filter((t) => {
      if (!t.due_date) return false
      const d = parseISO(t.due_date)
      const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7)
      return d >= new Date() && d <= nextWeek
    })
    const myTasks = active.filter((t) => t.assignee_id === user?.id)

    const logs = logsData?.items ?? []
    const totalHours = logs.reduce((s, l) => s + l.duration_hours, 0)
    const todayHours = logs.filter((l) => l.log_date === today).reduce((s, l) => s + l.duration_hours, 0)

    return { total: active.length, overdue: overdue.length, dueThisWeek: dueThisWeek.length, myTasks: myTasks.length, totalHours, todayHours }
  }, [tasksData, logsData, user, today])

  const workTypeBreakdown = useMemo(() => {
    const logs = logsData?.items ?? []
    const map: Record<string, { name: string; name_key?: string | null; color: string; hours: number }> = {}
    for (const log of logs) {
      const key = log.work_type_id
      if (!map[key]) map[key] = { name: log.work_type.name, name_key: log.work_type.name_key, color: log.work_type.color, hours: 0 }
      map[key].hours += log.duration_hours
    }
    return Object.values(map).sort((a, b) => b.hours - a.hours)
  }, [logsData])

  const hoursByPerson = useMemo(() => {
    const logs = logsData?.items ?? []
    const map: Record<string, { name: string; hours: number }> = {}
    for (const log of logs) {
      if (!map[log.user_id]) map[log.user_id] = { name: log.user.full_name, hours: 0 }
      map[log.user_id].hours += log.duration_hours
    }
    return Object.values(map).sort((a, b) => b.hours - a.hours)
  }, [logsData])

  const maxPersonHours = hoursByPerson[0]?.hours ?? 1
  const maxTypeHours = workTypeBreakdown[0]?.hours ?? 1

  const recentLogs = logsData?.items.slice(0, 5) ?? []
  const urgentTasks = (tasksData?.items ?? [])
    .filter((t) => !t.is_archived && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)))
    .slice(0, 5)

  const hourAbbr = t('dashboard.hours_abbr')

  const statCards = [
    { label: t('dashboard.total_tasks'), value: stats.total, icon: ListTodo, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: t('dashboard.my_tasks'), value: stats.myTasks, icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: t('dashboard.due_this_week'), value: stats.dueThisWeek, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: t('dashboard.overdue'), value: stats.overdue, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
    { label: t('dashboard.today_hours'), value: `${stats.todayHours.toFixed(1)}${hourAbbr}`, icon: TrendingUp, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { label: t('dashboard.weekly_hours'), value: `${stats.totalHours.toFixed(1)}${hourAbbr}`, icon: TrendingUp, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  ]

  const isHidden = (key: WidgetKey) => hiddenWidgets.has(key)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('nav.dashboard')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {format(new Date(), 'EEEE, d MMMM yyyy', { locale })}
          </p>
        </div>
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
            editMode
              ? 'bg-primary-500 border-primary-500 text-white'
              : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          {editMode ? <Check className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
          {editMode ? t('dashboard.done_editing') : t('dashboard.edit_widgets')}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-2`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {isSuperAdmin && dbStats && (!isHidden('db_stats') || editMode) && (
        <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('db_stats') ? 'opacity-40' : ''}`}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-gray-400" />
            {t('dashboard.db_stats')}
            {editMode && (
              <button onClick={() => toggleWidget('db_stats')} className="ml-auto p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                {isHidden('db_stats') ? <Eye className="h-4 w-4 text-gray-400" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
              </button>
            )}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{dbStats.active_users} <span className="text-sm font-normal text-gray-400">/ {dbStats.total_users}</span></p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.db_users')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                <ListTodo className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{dbStats.active_tasks} <span className="text-sm font-normal text-gray-400">/ {dbStats.total_tasks}</span></p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.db_tasks')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                <Clock className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{dbStats.worklogs_this_week}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.db_worklogs')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {dbStats.emails_sent_today}
                  {dbStats.emails_failed_today > 0 && (
                    <span className="text-sm font-normal text-red-400 ml-1">({dbStats.emails_failed_today} {t('dashboard.db_email_failed')})</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.db_emails')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Work type breakdown + hours per person */}
      {workTypeBreakdown.length > 0 && (!isHidden('charts') || editMode) && (
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${isHidden('charts') ? 'opacity-40' : ''}`}>
          {/* Work type bar chart */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              {t('dashboard.hours_by_type')}
              {editMode && (
                <button onClick={() => toggleWidget('charts')} className="ml-auto p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                  {isHidden('charts') ? <Eye className="h-4 w-4 text-gray-400" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
                </button>
              )}
            </h2>
            <div className="space-y-3">
              {workTypeBreakdown.map((wt) => (
                <div key={wt.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: wt.color }} />
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{resolveName(t, wt.name, wt.name_key)}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white ml-2 flex-shrink-0">
                      {wt.hours.toFixed(1)}{hourAbbr}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(wt.hours / maxTypeHours) * 100}%`, backgroundColor: wt.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hours per person (manager/superadmin) or same-user single row */}
          {canSeeTeamData && hoursByPerson.length > 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                {t('dashboard.hours_by_person')}
              </h2>
              <div className="space-y-3">
                {hoursByPerson.map((p) => (
                  <div key={p.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[150px]">{p.name}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white ml-2 flex-shrink-0">
                        {p.hours.toFixed(1)}{hourAbbr}
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary-400 dark:bg-primary-500 transition-all duration-500"
                        style={{ width: `${(p.hours / maxPersonHours) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" /> {t('dashboard.recent_logs')}
              </h2>
              {recentLogs.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">{t('dashboard.no_logs')}</p>
              ) : (
                <div className="space-y-2">
                  {recentLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: log.work_type.color }} />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{log.description}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{log.user.full_name} · {resolveName(t, log.work_type.name, log.work_type.name_key)}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{log.duration_hours}{hourAbbr}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {format(parseISO(log.log_date + 'T12:00:00'), 'd MMM', { locale })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(!isHidden('overdue') || editMode) && (
        <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('overdue') ? 'opacity-40' : ''}`}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" /> {t('dashboard.overdue_section')}
            {editMode && (
              <button onClick={() => toggleWidget('overdue')} className="ml-auto p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                {isHidden('overdue') ? <Eye className="h-4 w-4 text-gray-400" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
              </button>
            )}
          </h2>
          {urgentTasks.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t('dashboard.no_overdue')}</p>
          ) : (
            <div className="space-y-2">
              {urgentTasks.map((task) => (
                <div key={task.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                    {task.assignee && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{task.assignee.full_name}</p>
                    )}
                  </div>
                  {task.due_date && (
                    <span className="text-xs text-red-600 dark:text-red-400 whitespace-nowrap">
                      {format(parseISO(task.due_date), 'd MMM', { locale })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {(!isHidden('recent_logs') || editMode) && (
        <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('recent_logs') ? 'opacity-40' : ''}`}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" /> {t('dashboard.recent_logs')}
            {editMode && (
              <button onClick={() => toggleWidget('recent_logs')} className="ml-auto p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                {isHidden('recent_logs') ? <Eye className="h-4 w-4 text-gray-400" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
              </button>
            )}
          </h2>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t('dashboard.no_logs')}</p>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: log.work_type.color }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{log.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{log.user.full_name} · {log.work_type.name}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{log.duration_hours}{hourAbbr}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {format(parseISO(log.log_date + 'T12:00:00'), 'd MMM', { locale })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
