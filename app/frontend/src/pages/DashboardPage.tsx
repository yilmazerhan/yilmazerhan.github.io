import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { format, subDays, isToday, isPast, parseISO } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { Clock, AlertTriangle, CheckCircle2, ListTodo, TrendingUp, Users, Database, Mail } from 'lucide-react'
import { useTasks } from '@/api/kanban'
import { useWorkLogs } from '@/api/worklog'
import { useAuthStore } from '@/store/authStore'
import { useDashboardStats } from '@/api/admin'

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const locale = i18n.language === 'tr' ? tr : enUS
  const today = format(new Date(), 'yyyy-MM-dd')
  const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')
  const isSuperAdmin = user?.role === 'superadmin'

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('nav.dashboard')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {format(new Date(), 'EEEE, d MMMM yyyy', { locale })}
        </p>
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

      {isSuperAdmin && dbStats && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-gray-400" />
            {t('dashboard.db_stats')}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" /> {t('dashboard.overdue_section')}
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
      </div>
    </div>
  )
}
