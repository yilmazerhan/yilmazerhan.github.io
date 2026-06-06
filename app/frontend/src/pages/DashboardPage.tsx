import { useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format, subDays, isToday, isPast, parseISO, addDays } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import {
  Clock, AlertTriangle, CheckCircle2, ListTodo, TrendingUp, Users, Database, Mail,
  Settings2, Eye, EyeOff, Check, CheckCircle, XCircle, AlertCircle, Activity,
  Shield, BarChart2, HardDrive, ArrowRight, UserCheck, UserX,
} from 'lucide-react'
import { useTasks } from '@/api/kanban'
import { useWorkLogs } from '@/api/worklog'
import { useUsers } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import { useDashboardStats, useSystemHealth } from '@/api/admin'
import { resolveName } from '@/utils/i18nName'

const WIDGET_KEYS = [
  'db_stats', 'charts', 'daily_worklog', 'overdue', 'recent_logs', 'health_check',
  'trend', 'task_insights', 'upcoming', 'attendance', 'quick_actions',
] as const
type WidgetKey = typeof WIDGET_KEYS[number]

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
}

// ── Pure chart / visual components ────────────────────────────────────────────

/** SVG area sparkline for 7-day worklog trend */
function TrendChart({ data }: { data: Array<{ label: string; hours: number; isToday: boolean }> }) {
  const maxH = Math.max(...data.map(d => d.hours), 0.1)
  const W = 300, H = 72
  const padX = 6, padY = 6, chartW = W - padX * 2, chartH = H - padY * 2

  const toX = (i: number) => padX + (i / Math.max(data.length - 1, 1)) * chartW
  const toY = (h: number) => padY + chartH - (h / maxH) * chartH

  const linePoints = data.map((d, i) => `${toX(i)},${toY(d.hours)}`).join(' ')
  const areaPoints = [
    `${toX(0)},${padY + chartH}`,
    ...data.map((d, i) => `${toX(i)},${toY(d.hours)}`),
    `${toX(data.length - 1)},${padY + chartH}`,
  ].join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 72 }}>
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#trendGrad)" />
      <polyline
        points={linePoints}
        fill="none"
        stroke="#6366f1"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <circle
          key={i}
          cx={toX(i)}
          cy={toY(d.hours)}
          r={d.isToday ? 4 : 2.5}
          fill={d.isToday ? '#6366f1' : '#a5b4fc'}
          stroke="white"
          strokeWidth="1.5"
        >
          <title>{`${d.label}: ${d.hours.toFixed(1)}h`}</title>
        </circle>
      ))}
    </svg>
  )
}

/** Horizontal segmented bar showing priority distribution */
function PrioritySegmentBar({ counts }: { counts: Record<string, number> }) {
  const total = (counts.critical + counts.high + counts.medium + counts.low) || 1
  const segments = (['critical', 'high', 'medium', 'low'] as const).filter(p => counts[p] > 0)
  return (
    <div className="flex h-3 rounded-full overflow-hidden gap-px">
      {segments.map(p => (
        <div
          key={p}
          style={{ width: `${(counts[p] / total) * 100}%`, backgroundColor: PRIORITY_COLORS[p] }}
          className="transition-all duration-500"
          title={`${p}: ${counts[p]}`}
        />
      ))}
    </div>
  )
}

// ── Utility ───────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return d > 0 ? `${d}g ${h}s ${m}d` : h > 0 ? `${h}s ${m}d` : `${m}d`
}

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

// ── Widget toggle button ───────────────────────────────────────────────────────

function ToggleBtn({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="ml-auto p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
      {hidden ? <Eye className="h-4 w-4 text-gray-400" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
  const [editMode, setEditMode] = useState(false)
  const [hiddenWidgets, setHiddenWidgets] = useState<Set<WidgetKey>>(loadHiddenWidgets)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const toggleWidget = useCallback((key: WidgetKey) => {
    setHiddenWidgets(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveHiddenWidgets(next)
      return next
    })
  }, [])

  const user = useAuthStore(s => s.user)
  const locale = i18n.language === 'tr' ? tr : enUS
  const today = format(new Date(), 'yyyy-MM-dd')
  const weekAgo = format(subDays(new Date(), 6), 'yyyy-MM-dd')
  const isSuperAdmin = user?.role === 'superadmin'
  const canSeeTeamData = user?.role === 'superadmin' || user?.role === 'team_manager'

  const { data: tasksData }     = useTasks({ limit: 500 })
  const { data: logsData }      = useWorkLogs({ date_from: weekAgo, date_to: today })
  const { data: dailyLogsData } = useWorkLogs({ date_from: selectedDate, date_to: selectedDate, limit: 500 })
  const { data: allUsersData }  = useUsers({ is_active: true, limit: 200 }, canSeeTeamData)
  const { data: dbStats }       = useDashboardStats({ enabled: isSuperAdmin })

  const hourAbbr = t('dashboard.hours_abbr')

  // ── Derived stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const tasks = tasksData?.items ?? []
    const active = tasks.filter(t => !t.is_archived)
    const overdue = active.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)))
    const nextWeek = addDays(new Date(), 7)
    const dueThisWeek = active.filter(t => {
      if (!t.due_date) return false
      const d = parseISO(t.due_date)
      return d >= new Date() && d <= nextWeek
    })
    const myTasks = active.filter(t => t.assignee_id === user?.id)
    const logs = logsData?.items ?? []
    const totalHours = logs.reduce((s, l) => s + l.duration_hours, 0)
    const todayHours = logs.filter(l => l.log_date === today).reduce((s, l) => s + l.duration_hours, 0)
    return { total: active.length, overdue: overdue.length, dueThisWeek: dueThisWeek.length, myTasks: myTasks.length, totalHours, todayHours }
  }, [tasksData, logsData, user, today])

  // 7-day daily worklog trend
  const dailyTrend = useMemo(() => {
    const logs = logsData?.items ?? []
    return Array.from({ length: 7 }, (_, i) => {
      const d = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd')
      const hours = logs.filter(l => l.log_date === d).reduce((s, l) => s + l.duration_hours, 0)
      const label = format(parseISO(d + 'T12:00:00'), 'EEE', { locale })
      return { date: d, label, hours, isToday: d === today }
    })
  }, [logsData, today, locale])

  // Priority distribution
  const priorityCounts = useMemo(() => {
    const active = (tasksData?.items ?? []).filter(t => !t.is_archived)
    return {
      critical: active.filter(t => t.priority === 'critical').length,
      high:     active.filter(t => t.priority === 'high').length,
      medium:   active.filter(t => t.priority === 'medium').length,
      low:      active.filter(t => t.priority === 'low').length,
    }
  }, [tasksData])

  // Top columns by task count
  const columnCounts = useMemo(() => {
    const active = (tasksData?.items ?? []).filter(t => !t.is_archived)
    const map: Record<string, { name: string; count: number; color: string; isTerminal: boolean }> = {}
    for (const t of active) {
      if (!map[t.column_id]) map[t.column_id] = { name: t.column.name, count: 0, color: t.column.color, isTerminal: t.column.is_terminal }
      map[t.column_id].count++
    }
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [tasksData])

  const maxColumnCount = columnCounts[0]?.count ?? 1

  // Upcoming deadlines (next 7 days, not overdue)
  const upcomingTasks = useMemo(() => {
    const in7 = format(addDays(new Date(), 7), 'yyyy-MM-dd')
    return (tasksData?.items ?? [])
      .filter(t => !t.is_archived && t.due_date && t.due_date >= today && t.due_date <= in7)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
      .slice(0, 6)
  }, [tasksData, today])

  // Overdue tasks
  const urgentTasks = useMemo(() =>
    (tasksData?.items ?? [])
      .filter(t => !t.is_archived && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)))
      .slice(0, 6)
  , [tasksData])

  // Work type breakdown (7-day)
  const workTypeBreakdown = useMemo(() => {
    const map: Record<string, { name: string; name_key?: string | null; color: string; hours: number }> = {}
    for (const log of logsData?.items ?? []) {
      const key = log.work_type_id
      if (!map[key]) map[key] = { name: log.work_type.name, name_key: log.work_type.name_key, color: log.work_type.color, hours: 0 }
      map[key].hours += log.duration_hours
    }
    return Object.values(map).sort((a, b) => b.hours - a.hours)
  }, [logsData])

  const maxTypeHours = workTypeBreakdown[0]?.hours ?? 1

  // Hours per person (7-day)
  const hoursByPerson = useMemo(() => {
    const map: Record<string, { name: string; hours: number }> = {}
    for (const log of logsData?.items ?? []) {
      if (!map[log.user_id]) map[log.user_id] = { name: log.user.full_name, hours: 0 }
      map[log.user_id].hours += log.duration_hours
    }
    return Object.values(map).sort((a, b) => b.hours - a.hours)
  }, [logsData])

  const maxPersonHours = hoursByPerson[0]?.hours ?? 1

  // Team attendance today
  const attendanceData = useMemo(() => {
    if (!canSeeTeamData) return []
    const todayLogs = (logsData?.items ?? []).filter(l => l.log_date === today)
    const loggedIds = new Set(todayLogs.map(l => l.user_id))
    return (allUsersData?.items ?? [])
      .map(u => ({
        id: u.id,
        name: u.full_name,
        logged: loggedIds.has(u.id),
        hours: todayLogs.filter(l => l.user_id === u.id).reduce((s, l) => s + l.duration_hours, 0),
      }))
      .sort((a, b) => (b.logged ? 1 : 0) - (a.logged ? 1 : 0) || b.hours - a.hours)
  }, [logsData, allUsersData, today, canSeeTeamData])

  // Daily worklog chart (date picker)
  const dailyPersonData = useMemo(() => {
    if (!canSeeTeamData) return []
    const logs = dailyLogsData?.items ?? []
    const map = new Map<string, { userId: string; name: string; hours: number; workTypes: Array<{ name: string; name_key: string | null; color: string; hours: number }> }>()
    for (const u of allUsersData?.items ?? []) {
      map.set(u.id, { userId: u.id, name: u.full_name, hours: 0, workTypes: [] })
    }
    for (const log of logs) {
      if (!map.has(log.user_id)) {
        map.set(log.user_id, { userId: log.user_id, name: log.user.full_name, hours: 0, workTypes: [] })
      }
      const entry = map.get(log.user_id)!
      entry.hours += log.duration_hours
      const idx = entry.workTypes.findIndex(wt => wt.name === log.work_type.name)
      if (idx >= 0) entry.workTypes[idx].hours += log.duration_hours
      else entry.workTypes.push({ name: log.work_type.name, name_key: log.work_type.name_key ?? null, color: log.work_type.color, hours: log.duration_hours })
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.hours === 0 && b.hours > 0) return 1
      if (b.hours === 0 && a.hours > 0) return -1
      return b.hours - a.hours
    })
  }, [dailyLogsData, allUsersData, canSeeTeamData])

  const maxDailyHours = dailyPersonData.find(p => p.hours > 0)?.hours ?? 1
  const recentLogs = logsData?.items.slice(0, 5) ?? []
  const isHidden = (key: WidgetKey) => hiddenWidgets.has(key)

  const statCards = [
    { label: t('dashboard.total_tasks'), value: stats.total, icon: ListTodo, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { label: t('dashboard.my_tasks'), value: stats.myTasks, icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
    { label: t('dashboard.due_this_week'), value: stats.dueThisWeek, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: t('dashboard.overdue'), value: stats.overdue, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
    { label: t('dashboard.today_hours'), value: `${stats.todayHours.toFixed(1)}${hourAbbr}`, icon: TrendingUp, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { label: t('dashboard.weekly_hours'), value: `${stats.totalHours.toFixed(1)}${hourAbbr}`, icon: TrendingUp, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  ]

  const quickActions = isSuperAdmin ? [
    { label: t('dashboard.action_backup'), icon: HardDrive, to: '/admin/backup', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40' },
    { label: t('dashboard.action_users'), icon: Users, to: '/users', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40' },
    { label: t('dashboard.action_audit'), icon: Shield, to: '/admin/audit-logs', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800' },
    { label: t('dashboard.action_email_logs'), icon: Mail, to: '/settings/email/logs', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40' },
    { label: t('dashboard.action_reports'), icon: BarChart2, to: '/reports', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40' },
    { label: t('dashboard.action_email_workflows'), icon: Settings2, to: '/settings/email/workflows', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40' },
  ] : []

  const totalPriority = priorityCounts.critical + priorityCounts.high + priorityCounts.medium + priorityCounts.low

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.dashboard')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {format(new Date(), 'EEEE, d MMMM yyyy', { locale })}
          </p>
        </div>
        <button
          onClick={() => setEditMode(v => !v)}
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

      {/* Stat cards */}
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

      {/* ── Trend + Task Insights ─────────────────────────────────────────── */}
      {(!isHidden('trend') || editMode) && (
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${isHidden('trend') && isHidden('task_insights') ? 'opacity-40' : ''}`}>

          {/* 7-day worklog trend */}
          <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('trend') ? 'opacity-40' : ''}`}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              {t('dashboard.trend_title')}
              {editMode && <ToggleBtn hidden={isHidden('trend')} onToggle={() => toggleWidget('trend')} />}
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-600 mb-3">{t('dashboard.trend_subtitle')}</p>
            {dailyTrend.every(d => d.hours === 0) ? (
              <p className="text-sm text-gray-400 py-6 text-center">{t('dashboard.no_logs')}</p>
            ) : (
              <>
                <TrendChart data={dailyTrend} />
                <div className="flex justify-between mt-1 px-1">
                  {dailyTrend.map(d => (
                    <div key={d.date} className="flex flex-col items-center gap-0.5">
                      <span className={`text-[10px] ${d.isToday ? 'text-indigo-500 font-semibold' : 'text-gray-400 dark:text-gray-600'}`}>
                        {d.label}
                      </span>
                      {d.hours > 0 && (
                        <span className="text-[9px] text-gray-400 dark:text-gray-600">{d.hours.toFixed(1)}{hourAbbr}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">{t('dashboard.weekly_total')}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{stats.totalHours.toFixed(1)}{hourAbbr}</span>
                </div>
              </>
            )}
          </div>

          {/* Task insights: priority + column distribution */}
          <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('task_insights') ? 'opacity-40' : ''}`}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-blue-500" />
              {t('dashboard.task_insights_title')}
              {editMode && <ToggleBtn hidden={isHidden('task_insights')} onToggle={() => toggleWidget('task_insights')} />}
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-600 mb-4">{t('dashboard.task_insights_subtitle')}</p>

            {totalPriority === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">{t('dashboard.no_tasks')}</p>
            ) : (
              <>
                {/* Priority distribution */}
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('dashboard.by_priority')}</p>
                  <PrioritySegmentBar counts={priorityCounts} />
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {(['critical','high','medium','low'] as const).map(p => priorityCounts[p] > 0 && (
                      <span key={p} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[p] }} />
                        {t(`dashboard.priority_${p}`)}
                        <span className="font-semibold text-gray-900 dark:text-white">{priorityCounts[p]}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Column/status distribution */}
                {columnCounts.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{t('dashboard.by_column')}</p>
                    <div className="space-y-2">
                      {columnCounts.map(col => (
                        <div key={col.name}>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                              <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[140px]">{col.name}</span>
                              {col.isTerminal && (
                                <CheckCircle2 className="h-2.5 w-2.5 text-green-500 flex-shrink-0" />
                              )}
                            </div>
                            <span className="text-xs font-medium text-gray-900 dark:text-white">{col.count}</span>
                          </div>
                          <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${(col.count / maxColumnCount) * 100}%`, backgroundColor: col.color }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── DB Stats (superadmin) ─────────────────────────────────────────── */}
      {isSuperAdmin && dbStats && (!isHidden('db_stats') || editMode) && (
        <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('db_stats') ? 'opacity-40' : ''}`}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-gray-400" />
            {t('dashboard.db_stats')}
            {editMode && <ToggleBtn hidden={isHidden('db_stats')} onToggle={() => toggleWidget('db_stats')} />}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Users, bg: 'bg-blue-50 dark:bg-blue-900/20', color: 'text-blue-600 dark:text-blue-400', label: t('dashboard.db_users'), value: `${dbStats.active_users}`, sub: `/ ${dbStats.total_users}` },
              { icon: ListTodo, bg: 'bg-indigo-50 dark:bg-indigo-900/20', color: 'text-indigo-600 dark:text-indigo-400', label: t('dashboard.db_tasks'), value: `${dbStats.active_tasks}`, sub: `/ ${dbStats.total_tasks}` },
              { icon: Clock, bg: 'bg-green-50 dark:bg-green-900/20', color: 'text-green-600 dark:text-green-400', label: t('dashboard.db_worklogs'), value: `${dbStats.worklogs_this_week}`, sub: null },
              { icon: Mail, bg: 'bg-amber-50 dark:bg-amber-900/20', color: 'text-amber-600 dark:text-amber-400', label: t('dashboard.db_emails'), value: `${dbStats.emails_sent_today}`, sub: dbStats.emails_failed_today > 0 ? `${dbStats.emails_failed_today} ${t('dashboard.db_email_failed')}` : null },
            ].map(({ icon: Icon, bg, color, label, value, sub }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {value}
                    {sub && <span className={`text-sm font-normal ml-1 ${sub.includes('başarısız') || sub.includes('failed') ? 'text-red-400' : 'text-gray-400'}`}>{sub}</span>}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Work type + Hours per person ──────────────────────────────────── */}
      {workTypeBreakdown.length > 0 && (!isHidden('charts') || editMode) && (
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${isHidden('charts') ? 'opacity-40' : ''}`}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-500" />
              {t('dashboard.hours_by_type')}
              {editMode && <ToggleBtn hidden={isHidden('charts')} onToggle={() => toggleWidget('charts')} />}
            </h2>
            <div className="space-y-3">
              {workTypeBreakdown.map(wt => (
                <div key={wt.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: wt.color }} />
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{resolveName(t, wt.name, wt.name_key)}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white ml-2 flex-shrink-0">{wt.hours.toFixed(1)}{hourAbbr}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(wt.hours / maxTypeHours) * 100}%`, backgroundColor: wt.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {canSeeTeamData && hoursByPerson.length > 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                {t('dashboard.hours_by_person')}
              </h2>
              <div className="space-y-3">
                {hoursByPerson.map(p => (
                  <div key={p.name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{p.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[150px]">{p.name}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white ml-2 flex-shrink-0">{p.hours.toFixed(1)}{hourAbbr}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-primary-400 dark:bg-primary-500 transition-all duration-500" style={{ width: `${(p.hours / maxPersonHours) * 100}%` }} />
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
                  {recentLogs.map(log => (
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
                        <p className="text-xs text-gray-500 dark:text-gray-400">{format(parseISO(log.log_date + 'T12:00:00'), 'd MMM', { locale })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Team Attendance + Quick Actions ──────────────────────────────── */}
      {(canSeeTeamData || isSuperAdmin) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Team attendance today */}
          {canSeeTeamData && (!isHidden('attendance') || editMode) && (
            <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('attendance') ? 'opacity-40' : ''}`}>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                {t('dashboard.attendance_title')}
                {editMode && <ToggleBtn hidden={isHidden('attendance')} onToggle={() => toggleWidget('attendance')} />}
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-600 mb-3">{format(new Date(), 'd MMMM', { locale })}</p>
              {attendanceData.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">{t('common.loading')}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {attendanceData.map(u => (
                    <div key={u.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        u.logged ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        {u.logged
                          ? <UserCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                          : <UserX className="h-3.5 w-3.5 text-gray-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{u.name}</p>
                        <p className={`text-[10px] ${u.logged ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-600'}`}>
                          {u.logged ? `${u.hours.toFixed(1)}${hourAbbr} ${t('dashboard.logged_today')}` : t('dashboard.not_logged_today')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {attendanceData.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    {attendanceData.filter(u => u.logged).length} {t('dashboard.logged_today')}
                  </span>
                  <span className="text-gray-400">
                    {attendanceData.filter(u => !u.logged).length} {t('dashboard.not_logged_today')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Quick Actions (superadmin) */}
          {isSuperAdmin && (!isHidden('quick_actions') || editMode) && (
            <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('quick_actions') ? 'opacity-40' : ''}`}>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-gray-400" />
                {t('dashboard.quick_actions_title')}
                {editMode && <ToggleBtn hidden={isHidden('quick_actions')} onToggle={() => toggleWidget('quick_actions')} />}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map(({ label, icon: Icon, to, color, bg }) => (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border border-transparent transition-all duration-150 ${bg} group`}
                  >
                    <div className={`p-1.5 rounded-lg bg-white/80 dark:bg-gray-900/50`}>
                      <Icon className={`h-4 w-4 ${color}`} />
                    </div>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white leading-tight flex-1">{label}</span>
                    <ArrowRight className="h-3 w-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Daily Worklog ─────────────────────────────────────────────────── */}
      {canSeeTeamData && (!isHidden('daily_worklog') || editMode) && (
        <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('daily_worklog') ? 'opacity-40' : ''}`}>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Users className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('dashboard.daily_worklog_title')}</h2>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                max={today}
                className="text-sm border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {editMode && <ToggleBtn hidden={isHidden('daily_worklog')} onToggle={() => toggleWidget('daily_worklog')} />}
            </div>
          </div>
          {dailyPersonData.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t('dashboard.daily_worklog_no_data')}</p>
          ) : (
            <div className="space-y-3">
              {dailyPersonData.map(person => (
                <div key={person.userId}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{person.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <span className={`text-sm truncate max-w-[150px] ${person.hours === 0 ? 'text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>{person.name}</span>
                    </div>
                    <span className={`text-sm font-medium ml-2 flex-shrink-0 ${person.hours === 0 ? 'text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-white'}`}>
                      {person.hours > 0 ? `${person.hours.toFixed(1)}${hourAbbr}` : t('dashboard.daily_worklog_no_record')}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    {person.hours > 0 && (
                      <div className="h-full flex overflow-hidden transition-all duration-500" style={{ width: `${(person.hours / maxDailyHours) * 100}%` }}>
                        {person.workTypes.map(wt => (
                          <div key={wt.name} style={{ width: `${(wt.hours / person.hours) * 100}%`, backgroundColor: wt.color }} title={`${resolveName(t, wt.name, wt.name_key)}: ${wt.hours.toFixed(1)}${hourAbbr}`} />
                        ))}
                      </div>
                    )}
                  </div>
                  {person.hours > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {person.workTypes.map(wt => (
                        <span key={wt.name} className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: wt.color }} />
                          {resolveName(t, wt.name, wt.name_key)} {wt.hours.toFixed(1)}{hourAbbr}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Upcoming + Overdue ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(!isHidden('upcoming') || editMode) && (
          <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('upcoming') ? 'opacity-40' : ''}`}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              {t('dashboard.upcoming_title')}
              {editMode && <ToggleBtn hidden={isHidden('upcoming')} onToggle={() => toggleWidget('upcoming')} />}
            </h2>
            {upcomingTasks.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">{t('dashboard.no_upcoming')}</p>
            ) : (
              <div className="space-y-2">
                {upcomingTasks.map(task => {
                  const daysLeft = task.due_date
                    ? Math.ceil((parseISO(task.due_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
                    : 0
                  const isUrgent = daysLeft <= 1
                  return (
                    <div key={task.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                        {task.assignee && <p className="text-xs text-gray-500 dark:text-gray-400">{task.assignee.full_name}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          isUrgent
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                        }`}>
                          {daysLeft === 0 ? t('dashboard.due_today') : `${daysLeft}d`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {(!isHidden('overdue') || editMode) && (
          <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('overdue') ? 'opacity-40' : ''}`}>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              {t('dashboard.overdue_section')}
              {editMode && <ToggleBtn hidden={isHidden('overdue')} onToggle={() => toggleWidget('overdue')} />}
            </h2>
            {urgentTasks.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">{t('dashboard.no_overdue')}</p>
            ) : (
              <div className="space-y-2">
                {urgentTasks.map(task => (
                  <div key={task.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                      {task.assignee && <p className="text-xs text-gray-500 dark:text-gray-400">{task.assignee.full_name}</p>}
                    </div>
                    {task.due_date && (
                      <span className="text-xs text-red-600 dark:text-red-400 whitespace-nowrap font-medium">
                        {format(parseISO(task.due_date), 'd MMM', { locale })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Recent logs ───────────────────────────────────────────────────── */}
      {(!isHidden('recent_logs') || editMode) && (
        <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden('recent_logs') ? 'opacity-40' : ''}`}>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            {t('dashboard.recent_logs')}
            {editMode && <ToggleBtn hidden={isHidden('recent_logs')} onToggle={() => toggleWidget('recent_logs')} />}
          </h2>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t('dashboard.no_logs')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {recentLogs.map(log => (
                <div key={log.id} className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: log.work_type.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{log.description}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{log.user.full_name} · {resolveName(t, log.work_type.name, log.work_type.name_key)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{log.duration_hours}{hourAbbr}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{format(parseISO(log.log_date + 'T12:00:00'), 'd MMM', { locale })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── System Health (superadmin) ────────────────────────────────────── */}
      {isSuperAdmin && (!isHidden('health_check') || editMode) && (
        <HealthCheckWidget
          editMode={editMode}
          isHidden={isHidden('health_check')}
          onToggle={() => toggleWidget('health_check')}
          t={t}
        />
      )}
    </div>
  )
}

// ── Health check sub-component ────────────────────────────────────────────────

function HealthCheckWidget({
  editMode, isHidden, onToggle, t,
}: {
  editMode: boolean; isHidden: boolean; onToggle: () => void; t: (key: string) => string
}) {
  const { data: health } = useSystemHealth({ enabled: true })

  const statusIcon = (status: string | undefined) => {
    if (status === 'ok') return <CheckCircle className="h-4 w-4 text-green-500" />
    if (status === 'degraded') return <AlertCircle className="h-4 w-4 text-amber-500" />
    return <XCircle className="h-4 w-4 text-red-500" />
  }

  const statusColor = (status: string | undefined) => {
    if (status === 'ok') return 'text-green-600 dark:text-green-400'
    if (status === 'degraded') return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 ${isHidden ? 'opacity-40' : ''}`}>
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-gray-400" />
        {t('dashboard.health_title')}
        {editMode && (
          <button onClick={onToggle} className="ml-auto p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            {isHidden ? <Eye className="h-4 w-4 text-gray-400" /> : <EyeOff className="h-4 w-4 text-gray-400" />}
          </button>
        )}
      </h2>
      {!health ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: health.database, label: t('dashboard.health_db'), status: health.database },
            { icon: health.redis, label: t('dashboard.health_redis'), status: health.redis },
            { icon: health.celery_worker, label: t('dashboard.health_worker'), status: health.celery_worker },
          ].map(({ label, status }) => (
            <div key={label} className="flex items-center gap-2">
              {statusIcon(status)}
              <div>
                <p className={`text-sm font-medium ${statusColor(status)}`}>{status}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-indigo-500" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{formatUptime(health.uptime_seconds)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.health_uptime')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
