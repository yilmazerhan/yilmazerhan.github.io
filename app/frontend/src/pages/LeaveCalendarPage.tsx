import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, isSameDay, parseISO,
  isWithinInterval, startOfDay, isSameMonth,
} from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useLeaves, type LeaveRequest } from '@/api/leaves'
import { useAuthStore } from '@/store/authStore'

// Distinct colors for up to 12 users
const USER_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#a855f7',
]

function getUserColor(userId: string, colorMap: Map<string, string>): string {
  if (!colorMap.has(userId)) {
    const idx = colorMap.size % USER_COLORS.length
    colorMap.set(userId, USER_COLORS[idx])
  }
  return colorMap.get(userId)!
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function leavesOnDay(leaves: LeaveRequest[], day: Date): LeaveRequest[] {
  return leaves.filter((l) => {
    if (l.status === 'cancelled') return false
    return isWithinInterval(startOfDay(day), {
      start: startOfDay(parseISO(l.start_date)),
      end: startOfDay(parseISO(l.end_date)),
    })
  })
}

export default function LeaveCalendarPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [hoveredLeave, setHoveredLeave] = useState<LeaveRequest | null>(null)

  // Only managers/admins should access this page
  const isManager = user?.role === 'superadmin' || user?.role === 'team_manager'

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)

  const dateFrom = format(monthStart, 'yyyy-MM-dd')
  const dateTo = format(monthEnd, 'yyyy-MM-dd')

  const { data: leaves = [], isLoading } = useLeaves({
    date_from: dateFrom,
    date_to: dateTo,
  })

  // Build color map: user_id → color (stable within render)
  const colorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of leaves) {
      getUserColor(l.user_id, map)
    }
    return map
  }, [leaves])

  // Build legend (unique users)
  const legendUsers = useMemo(() => {
    const seen = new Map<string, { full_name: string; color: string }>()
    for (const l of leaves) {
      if (!seen.has(l.user_id)) {
        seen.set(l.user_id, { full_name: l.user.full_name, color: colorMap.get(l.user_id) ?? '#999' })
      }
    }
    return Array.from(seen.values())
  }, [leaves, colorMap])

  // Calendar grid: fill leading empty cells
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const leadingEmpties = getDay(monthStart) // 0=Sun in date-fns

  if (!isManager) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p>{t('common.access_denied')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CalendarDays className="h-6 w-6 text-gray-600 dark:text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('leave.calendar_title')}</h1>
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-lg font-semibold text-gray-800 dark:text-gray-200 min-w-[160px] text-center">
          {format(currentMonth, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <button
          onClick={() => setCurrentMonth(new Date())}
          className="ml-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          {t('gantt.today')}
        </button>
      </div>

      {/* Legend */}
      {legendUsers.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {legendUsers.map((u) => (
            <span key={u.full_name} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: u.color }} />
              {u.full_name}
            </span>
          ))}
        </div>
      )}

      {/* Calendar */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
          {[t('leave.sun'), t('leave.mon'), t('leave.tue'), t('leave.wed'), t('leave.thu'), t('leave.fri'), t('leave.sat')].map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 py-2">
              {d}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-gray-400">{t('common.loading')}</div>
        ) : (
          <div className="grid grid-cols-7">
            {/* Leading empty cells */}
            {Array.from({ length: leadingEmpties }, (_, i) => (
              <div key={`empty-${i}`} className="min-h-[100px] border-r border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/20" />
            ))}

            {days.map((day) => {
              const isToday = isSameDay(day, new Date())
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const dayLeaves = leavesOnDay(leaves, day)

              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[100px] border-r border-b border-gray-100 dark:border-gray-800 p-1.5 ${
                    !isCurrentMonth ? 'bg-gray-50 dark:bg-gray-800/20' : ''
                  }`}
                >
                  {/* Day number */}
                  <div className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                    isToday
                      ? 'bg-primary-500 text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {format(day, 'd')}
                  </div>

                  {/* Leave bars */}
                  <div className="space-y-0.5">
                    {dayLeaves.slice(0, 3).map((leave) => {
                      const color = colorMap.get(leave.user_id) ?? '#999'
                      return (
                        <div
                          key={leave.id}
                          onMouseEnter={() => setHoveredLeave(leave)}
                          onMouseLeave={() => setHoveredLeave(null)}
                          className="relative rounded px-1 py-0.5 text-xs truncate cursor-default"
                          style={{
                            backgroundColor: hexToRgba(color, 0.25),
                            borderLeft: `3px solid ${color}`,
                            color: color,
                          }}
                          title={`${leave.user.full_name}${leave.reason ? ` — ${leave.reason}` : ''}`}
                        >
                          {leave.user.full_name.split(' ')[0]}
                        </div>
                      )
                    })}
                    {dayLeaves.length > 3 && (
                      <div className="text-xs text-gray-400 pl-1">+{dayLeaves.length - 3}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Hover tooltip */}
      {hoveredLeave && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-gray-700 text-white text-sm px-4 py-2 rounded-xl shadow-xl z-50 pointer-events-none">
          <span className="font-medium">{hoveredLeave.user.full_name}</span>
          {' · '}
          {format(parseISO(hoveredLeave.start_date), 'dd MMM')} – {format(parseISO(hoveredLeave.end_date), 'dd MMM yyyy')}
          {hoveredLeave.reason && <span className="text-gray-300"> · {hoveredLeave.reason}</span>}
        </div>
      )}
    </div>
  )
}
