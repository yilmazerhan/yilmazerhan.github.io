import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, differenceInDays, addDays, startOfDay, parseISO, isValid } from 'date-fns'
import { GanttChartSquare } from 'lucide-react'
import { useTasks, useColumns } from '@/api/kanban'
import { useAuthStore } from '@/store/authStore'

const PRIORITY_COLORS: Record<string, string> = {
  low: '#6ee7b7',
  medium: '#93c5fd',
  high: '#fcd34d',
  critical: '#fca5a5',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
// not needed here, just to suppress unused warning
void formatFileSize

const DAY_WIDTH = 28 // px per day

export default function GanttPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [filter, setFilter] = useState<'all' | 'mine' | 'active'>('active')

  const { data: tasksData } = useTasks({ include_archived: false, limit: 500 })
  const { data: columns = [] } = useColumns()
  const columnMap = useMemo(() => Object.fromEntries(columns.map((c) => [c.id, c])), [columns])

  const tasks = useMemo(() => {
    const all = tasksData?.items ?? []
    return all.filter((t) => {
      if (t.is_archived) return false
      const hasDates = !!(t.due_date || t.start_date || t.created_at)
      if (!hasDates) return false
      if (filter === 'mine') return t.assignee_id === user?.id || t.created_by === user?.id
      if (filter === 'active') return !columnMap[t.column_id]?.is_terminal
      return true
    })
  }, [tasksData, filter, user, columnMap])

  // Determine chart date range
  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (!tasks.length) {
      const today = startOfDay(new Date())
      return { minDate: today, maxDate: addDays(today, 30), totalDays: 30 }
    }
    let min = startOfDay(new Date())
    let max = addDays(min, 30)
    for (const task of tasks) {
      const start = task.start_date ? parseISO(task.start_date) : parseISO(task.created_at.slice(0, 10))
      const end = task.due_date ? parseISO(task.due_date) : null
      if (isValid(start) && start < min) min = startOfDay(start)
      if (end && isValid(end) && end > max) max = startOfDay(end)
    }
    // Add padding
    min = addDays(min, -2)
    max = addDays(max, 3)
    const totalDays = Math.max(differenceInDays(max, min) + 1, 30)
    return { minDate: min, maxDate: max, totalDays }
  }, [tasks])

  const todayOffset = differenceInDays(startOfDay(new Date()), minDate)
  const chartWidth = totalDays * DAY_WIDTH

  // Build month headers
  const monthHeaders = useMemo(() => {
    const headers: { label: string; days: number; startDay: number }[] = []
    let current = minDate
    while (current <= maxDate) {
      const month = format(current, 'MMM yyyy')
      const startDay = differenceInDays(current, minDate)
      // Count days in this month within range
      let days = 0
      let d = current
      while (d <= maxDate && format(d, 'MMM yyyy') === month) {
        days++
        d = addDays(d, 1)
      }
      headers.push({ label: month, days, startDay })
      current = d
    }
    return headers
  }, [minDate, maxDate])

  if (!tasks.length) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <GanttChartSquare className="h-6 w-6 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('gantt.title')}</h1>
        </div>
        <FilterBar filter={filter} setFilter={setFilter} t={t} />
        <p className="text-center py-16 text-gray-400">{t('gantt.no_tasks')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <GanttChartSquare className="h-6 w-6 text-gray-600 dark:text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('gantt.title')}</h1>
      </div>
      <FilterBar filter={filter} setFilter={setFilter} t={t} />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="flex min-w-max">
            {/* Left: task labels */}
            <div className="flex-shrink-0 w-56 border-r border-gray-200 dark:border-gray-700">
              {/* Header spacer */}
              <div className="h-12 border-b border-gray-200 dark:border-gray-700" />
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="h-10 px-3 flex items-center border-b border-gray-100 dark:border-gray-800"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={task.title}>
                    {task.title}
                  </span>
                </div>
              ))}
            </div>

            {/* Right: chart area */}
            <div className="relative overflow-x-auto">
              {/* Month + day headers */}
              <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                {/* Month row */}
                <div className="flex h-6 border-b border-gray-100 dark:border-gray-800">
                  {monthHeaders.map((m) => (
                    <div
                      key={m.startDay}
                      className="flex-shrink-0 text-xs font-semibold text-gray-600 dark:text-gray-400 px-1 flex items-center border-r border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                      style={{ width: m.days * DAY_WIDTH }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
                {/* Day numbers row */}
                <div className="flex h-6">
                  {Array.from({ length: totalDays }, (_, i) => {
                    const d = addDays(minDate, i)
                    const isToday = i === todayOffset
                    return (
                      <div
                        key={i}
                        className={`flex-shrink-0 text-xs flex items-center justify-center border-r border-gray-100 dark:border-gray-800 ${
                          isToday
                            ? 'bg-blue-500 text-white font-bold'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}
                        style={{ width: DAY_WIDTH }}
                      >
                        {format(d, 'd')}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Task rows */}
              <div style={{ width: chartWidth }}>
                {tasks.map((task) => {
                  const startDate = task.start_date ? parseISO(task.start_date) : parseISO(task.created_at.slice(0, 10))
                  const endDate = task.due_date ? parseISO(task.due_date) : null

                  const barStart = Math.max(differenceInDays(startOfDay(startDate), minDate), 0)
                  const barEnd = endDate
                    ? differenceInDays(startOfDay(endDate), minDate)
                    : barStart + 1
                  const barWidth = Math.max((barEnd - barStart + 1) * DAY_WIDTH, DAY_WIDTH)
                  const color = PRIORITY_COLORS[task.priority] ?? '#a5b4fc'

                  return (
                    <div
                      key={task.id}
                      className="relative h-10 border-b border-gray-100 dark:border-gray-800"
                      style={{ width: chartWidth }}
                    >
                      {/* Today vertical line */}
                      {todayOffset >= 0 && todayOffset < totalDays && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-blue-400 opacity-40 z-0"
                          style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                        />
                      )}
                      {/* Bar */}
                      <div
                        className="absolute top-1.5 h-7 rounded-md flex items-center px-2 overflow-hidden z-10"
                        style={{
                          left: barStart * DAY_WIDTH,
                          width: barWidth,
                          backgroundColor: color,
                          opacity: 0.85,
                        }}
                        title={`${task.title} — ${task.assignee?.full_name ?? '—'}`}
                      >
                        <span className="text-xs font-medium text-gray-800 truncate">{task.title}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
          {Object.entries(PRIORITY_COLORS).map(([p, c]) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function FilterBar({
  filter,
  setFilter,
  t,
}: {
  filter: string
  setFilter: (v: 'all' | 'mine' | 'active') => void
  t: (k: string) => string
}) {
  const options: { value: 'all' | 'mine' | 'active'; label: string }[] = [
    { value: 'active', label: t('gantt.filter_active') },
    { value: 'mine', label: t('gantt.filter_mine') },
    { value: 'all', label: t('gantt.filter_all') },
  ]
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => setFilter(o.value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === o.value
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
