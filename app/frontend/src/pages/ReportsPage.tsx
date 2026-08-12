import { useMemo, useRef, useState, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { format, startOfMonth, startOfWeek, addWeeks, addDays } from 'date-fns'
import { tr as trLocale, enUS } from 'date-fns/locale'
import { Clock, Users, FileText, TrendingUp, CalendarClock, Plus, Trash2, Play, Pencil, Trophy, Activity, CalendarCheck, ChevronLeft, ChevronRight, LineChart } from 'lucide-react'
import { useWorkLogs, type WorkLog } from '@/api/worklog'
import { useUsers } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import ExportButton from '@/components/ui/ExportButton'
import DatePicker from '@/components/ui/DatePicker'
import { exportWorklogs } from '@/api/export'
import {
  useReportSchedules, useCreateReportSchedule, useUpdateReportSchedule,
  useDeleteReportSchedule, useRunReportSchedule, useUserActivitySummary, type ReportSchedule,
  type UserActivitySummary,
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

// ── SVG Donut Chart ────────────────────────────────────────────────────────────

function DonutChart({ data, hourAbbr }: { data: Array<{ name: string; color: string; hours: number }>; hourAbbr: string }) {
  const total = data.reduce((s, d) => s + d.hours, 0) || 1
  const R = 52, r = 32, cx = 60, cy = 60

  if (data.length === 0) return null

  if (data.length === 1) {
    return (
      <div className="flex flex-col items-center gap-3">
        <svg viewBox="0 0 120 120" className="w-full max-w-[120px]">
          <circle cx={cx} cy={cy} r={R} fill={data[0].color} />
          <circle cx={cx} cy={cy} r={r} className="fill-white dark:fill-gray-900" />
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize="12" fontWeight="bold" className="fill-gray-700 dark:fill-gray-200">{total.toFixed(0)}</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" className="fill-gray-400 dark:fill-gray-500">{hourAbbr}</text>
        </svg>
        <div className="flex items-center gap-1.5 text-xs w-full">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: data[0].color }} />
          <span className="flex-1 truncate text-gray-600 dark:text-gray-400">{data[0].name}</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">100%</span>
        </div>
      </div>
    )
  }

  let cumAngle = -Math.PI / 2
  const slices = data.map(d => {
    const angle = (d.hours / total) * 2 * Math.PI
    const startAngle = cumAngle
    cumAngle += angle
    return { ...d, startAngle, endAngle: cumAngle }
  })

  function arc(startAngle: number, endAngle: number) {
    const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle)
    const x2 = cx + R * Math.cos(endAngle),   y2 = cy + R * Math.sin(endAngle)
    const ix1 = cx + r * Math.cos(endAngle),   iy1 = cy + r * Math.sin(endAngle)
    const ix2 = cx + r * Math.cos(startAngle), iy2 = cy + r * Math.sin(startAngle)
    const large = endAngle - startAngle > Math.PI ? 1 : 0
    return `M${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} L${ix1},${iy1} A${r},${r},0,${large},0,${ix2},${iy2} Z`
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 120 120" className="w-full max-w-[120px]">
        {slices.map((s, i) => (
          <path key={i} d={arc(s.startAngle, s.endAngle)} fill={s.color} className="hover:opacity-80 transition-opacity cursor-default">
            <title>{s.name}: {s.hours.toFixed(1)}{hourAbbr} ({((s.hours / total) * 100).toFixed(1)}%)</title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r={r} className="fill-white dark:fill-gray-900" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="12" fontWeight="bold" className="fill-gray-700 dark:fill-gray-200">{total.toFixed(0)}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" className="fill-gray-400 dark:fill-gray-500">{hourAbbr}</text>
      </svg>
      <div className="space-y-1.5 w-full">
        {data.slice(0, 7).map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="flex-1 truncate text-gray-600 dark:text-gray-400">{d.name}</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{((d.hours / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mini Sparkline ─────────────────────────────────────────────────────────────

function MiniSparkline({ dailyData }: { dailyData: Array<[string, number]> }) {
  if (dailyData.length < 2) return null
  const maxV = Math.max(...dailyData.map(([, v]) => v), 0.1)
  const W = 64, H = 20, pad = 2
  const toX = (i: number) => pad + (i / (dailyData.length - 1)) * (W - pad * 2)
  const toY = (v: number) => pad + (1 - v / maxV) * (H - pad * 2)
  const points = dailyData.map(([, v], i) => `${toX(i)},${toY(v)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 64, height: 20, display: 'block' }}>
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-indigo-400 dark:stroke-indigo-500"
      />
    </svg>
  )
}

// ── Employee performance trend (bar chart, responsive width) ──────────────────

function useElementWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

function BarTrendChart({ data, hourAbbr }: { data: Array<{ label: string; hours: number }>; hourAbbr: string }) {
  const [ref, W] = useElementWidth<HTMLDivElement>()
  const H = 140
  const padX = 6, padTop = 10, padBottom = 20
  const chartW = Math.max(W - padX * 2, 1)
  const chartH = H - padTop - padBottom
  const maxH = Math.max(...data.map(d => d.hours), 1)
  const axisMax = Math.max(Math.ceil(maxH), 1)
  const barSlot = data.length ? chartW / data.length : 0
  const toY = (h: number) => padTop + chartH - (h / axisMax) * chartH
  const labelEvery = data.length > 12 ? Math.ceil(data.length / 8) : 1

  if (data.length === 0) return null

  return (
    <div ref={ref} className="w-full">
      {W > 0 && (
        <svg width={W} height={H} className="block">
          <line x1={padX} x2={padX + chartW} y1={toY(0)} y2={toY(0)} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="1" />
          {data.map((d, i) => {
            const barH = (d.hours / axisMax) * chartH
            const x = padX + i * barSlot
            const barW = Math.max(barSlot * 0.6, 2)
            return (
              <g key={i}>
                <rect
                  x={x + (barSlot - barW) / 2}
                  y={toY(d.hours)}
                  width={barW}
                  height={Math.max(barH, 0)}
                  rx="2"
                  className={d.hours > 0 ? 'fill-primary-500' : 'fill-gray-100 dark:fill-gray-800'}
                >
                  <title>{d.label}: {d.hours.toFixed(1)}{hourAbbr}</title>
                </rect>
                {i % labelEvery === 0 && (
                  <text x={x + barSlot / 2} y={H - 6} textAnchor="middle" fontSize="9" className="fill-gray-400 dark:fill-gray-500">
                    {d.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

// ── Today's Worklog Status ─────────────────────────────────────────────────────

function userInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 76, stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  const color = pct >= 100 ? '#22c55e' : pct >= 50 ? '#3b82f6' : '#f59e0b'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-gray-100 dark:stroke-gray-800" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={color}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="17" fontWeight="bold" className="fill-gray-800 dark:fill-gray-100">{pct}%</text>
    </svg>
  )
}

function TodayWorklogStatus({
  users,
  activitySummary,
}: {
  users: Array<{ id: string; full_name: string }>
  activitySummary: UserActivitySummary[] | undefined
}) {
  const { t } = useTranslation()

  const { logged, missing, pct } = useMemo(() => {
    // Compare against UTC date — last_login_at is stored as UTC in the DB
    const todayUTC = new Date().toISOString().slice(0, 10)
    const loggedIds = new Set(
      (activitySummary ?? [])
        .filter(u => u.last_login_at?.slice(0, 10) === todayUTC)
        .map(u => u.user_id)
    )
    const logged = users.filter(u => loggedIds.has(u.id))
    const missing = users.filter(u => !loggedIds.has(u.id))
    const pct = users.length ? Math.round((logged.length / users.length) * 100) : 0
    return { logged, missing, pct }
  }, [users, activitySummary])

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
        <CalendarCheck className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('reports.today_status_title')}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('reports.today_status_subtitle')}</p>
        </div>
      </div>
      <div className="p-6 flex flex-col md:flex-row gap-6">
        <div className="flex items-center gap-4 md:w-52 flex-shrink-0">
          <ProgressRing pct={pct} />
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{logged.length}<span className="text-base font-medium text-gray-400">/{users.length}</span></p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('reports.today_completion')}</p>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('reports.today_missing')} ({missing.length})</h3>
            </div>
            {missing.length === 0 ? (
              <p className="text-sm text-green-600 dark:text-green-400">{t('reports.today_all_logged')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {missing.map(u => (
                  <span key={u.id} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs">
                    <span className="w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-800/60 text-amber-900 dark:text-amber-200 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{userInitials(u.full_name)}</span>
                    {u.full_name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('reports.today_logged')} ({logged.length})</h3>
            </div>
            {logged.length === 0 ? (
              <p className="text-sm text-gray-400">{t('reports.today_none_logged')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {logged.map(u => (
                  <span key={u.id} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-xs">
                    <span className="w-5 h-5 rounded-full bg-green-200 dark:bg-green-800/60 text-green-900 dark:text-green-200 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{userInitials(u.full_name)}</span>
                    {u.full_name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Weekly Activity Matrix ────────────────────────────────────────────────────

function WeeklyActivityMatrix({
  users,
  logs,
  weekDates,
}: {
  users: Array<{ id: string; full_name: string }>
  logs: WorkLog[]
  weekDates: string[]
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'tr' ? trLocale : enUS
  const hourAbbr = t('worklog.hours_abbr')

  const matrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    for (const log of logs) {
      if (!m[log.user_id]) m[log.user_id] = {}
      m[log.user_id][log.log_date] = (m[log.user_id][log.log_date] ?? 0) + log.duration_hours
    }
    return m
  }, [logs])

  // Per-cell work-log details (for the hover breakdown), highest hours first.
  const cellLogs = useMemo(() => {
    const m: Record<string, Record<string, WorkLog[]>> = {}
    for (const log of logs) {
      if (!m[log.user_id]) m[log.user_id] = {}
      if (!m[log.user_id][log.log_date]) m[log.user_id][log.log_date] = []
      m[log.user_id][log.log_date].push(log)
    }
    for (const byDay of Object.values(m)) {
      for (const arr of Object.values(byDay)) arr.sort((a, b) => b.duration_hours - a.duration_hours)
    }
    return m
  }, [logs])

  // Hover breakdown tooltip state (rendered in a portal so it is never clipped
  // by the table's horizontal-scroll container).
  const [tip, setTip] = useState<
    { logs: WorkLog[]; title: string; cx: number; y: number; above: boolean } | null
  >(null)

  const MAX_DESC = 46   // per-line character cap — only a summary is shown
  const MAX_LINES = 7
  const truncate = (s: string) => (s.length > MAX_DESC ? s.slice(0, MAX_DESC - 1) + '…' : s)

  function showTip(el: HTMLElement, dayLogs: WorkLog[], title: string) {
    const r = el.getBoundingClientRect()
    const above = r.bottom > window.innerHeight * 0.6
    const cx = Math.min(Math.max(r.left + r.width / 2, 152), window.innerWidth - 152)
    setTip({ logs: dayLogs, title, cx, y: above ? r.top - 8 : r.bottom + 8, above })
  }

  const maxHours = useMemo(() => {
    let max = 0.1
    for (const byDay of Object.values(matrix)) {
      for (const h of Object.values(byDay)) { if (h > max) max = h }
    }
    return max
  }, [matrix])

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 min-w-[150px]">
              {t('reports.user_col')}
            </th>
            {weekDates.map(d => {
              const dt = new Date(d + 'T12:00:00')
              const isToday = d === todayStr
              return (
                <th key={d} className={`px-2 py-3 font-medium text-center min-w-[68px] ${isToday ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  <div className="text-xs">{format(dt, 'EEE', { locale })}</div>
                  <div className={`text-xs font-normal ${isToday ? 'text-primary-500' : 'text-gray-400'}`}>{format(dt, 'dd MMM', { locale })}</div>
                </th>
              )
            })}
            <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-right">{t('reports.total_col')}</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => {
            const byDay = matrix[user.id] ?? {}
            const total = weekDates.reduce((s, d) => s + (byDay[d] ?? 0), 0)
            return (
              <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/20">
                <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{user.full_name}</td>
                {weekDates.map(d => {
                  const hours = byDay[d] ?? 0
                  const intensity = hours > 0 ? Math.min(hours / maxHours, 1) : 0
                  const isToday = d === todayStr
                  const dayLogs = hours > 0 ? (cellLogs[user.id]?.[d] ?? []) : []
                  const dayLabel = format(new Date(d + 'T12:00:00'), 'dd MMM', { locale })
                  const tipTitle = `${user.full_name} · ${dayLabel} · ${hours}${hourAbbr}`
                  const hoverProps = hours > 0
                    ? {
                        onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => showTip(e.currentTarget, dayLogs, tipTitle),
                        onMouseLeave: () => setTip(null),
                        onFocus: (e: React.FocusEvent<HTMLDivElement>) => showTip(e.currentTarget, dayLogs, tipTitle),
                        onBlur: () => setTip(null),
                        tabIndex: 0,
                      }
                    : { title: `${user.full_name} · ${dayLabel}: ${t('reports.no_record')}` }
                  return (
                    <td key={d} className="px-1.5 py-2 text-center">
                      <div
                        {...hoverProps}
                        className={`mx-auto flex items-center justify-center rounded-lg text-xs font-semibold h-9 w-14 transition-colors select-none outline-none
                          ${hours > 0 ? 'cursor-help focus-visible:ring-2 focus-visible:ring-primary-500' : ''}
                          ${isToday ? 'ring-2 ring-primary-400 ring-offset-1' : ''}`}
                        style={
                          hours > 0
                            ? {
                                backgroundColor: `rgba(34,197,94,${0.15 + intensity * 0.72})`,
                                color: intensity > 0.55 ? '#14532d' : '#166534',
                              }
                            : {
                                border: '1.5px dashed #d1d5db',
                                color: '#9ca3af',
                              }
                        }
                      >
                        {hours > 0 ? `${hours}${hourAbbr}` : '—'}
                      </div>
                    </td>
                  )
                })}
                <td className="px-4 py-2.5 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {total > 0 ? `${total.toFixed(1)}${hourAbbr}` : <span className="text-gray-300 dark:text-gray-600">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {tip && createPortal(
        <div
          role="tooltip"
          className="fixed z-50 w-72 max-w-[18rem] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-3 pointer-events-none"
          style={{
            left: tip.cx,
            top: tip.y,
            transform: `translateX(-50%) ${tip.above ? 'translateY(-100%)' : ''}`,
          }}
        >
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 pb-1.5 mb-1.5 border-b border-gray-100 dark:border-gray-800">
            {tip.title}
          </div>
          <ul className="space-y-1">
            {tip.logs.slice(0, MAX_LINES).map(log => (
              <li key={log.id} className="flex items-baseline gap-1.5 text-xs leading-snug">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap tabular-nums">
                  {log.duration_hours}{hourAbbr}
                </span>
                <span className="text-gray-600 dark:text-gray-300 truncate">
                  {log.description?.trim() ? truncate(log.description.trim()) : t('reports.breakdown_no_desc')}
                </span>
              </li>
            ))}
          </ul>
          {tip.logs.length > MAX_LINES && (
            <div className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              {t('reports.breakdown_more', { count: tip.logs.length - MAX_LINES })}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── Schedule Section ──────────────────────────────────────────────────────────

function ReportScheduleSection({ t }: { t: (k: string) => string }) {
  const { data: schedules = [] } = useReportSchedules()
  const createSchedule = useCreateReportSchedule()
  const updateSchedule = useUpdateReportSchedule()
  const deleteSchedule = useDeleteReportSchedule()
  const runSchedule = useRunReportSchedule()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ScheduleForm>(emptyForm())
  const [saveError, setSaveError] = useState<string | null>(null)

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
    setSaveError(null)
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
    } catch (err: any) {
      setSaveError(err.response?.data?.detail || t('common.error'))
    }
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
              <button onClick={async () => { try { await runSchedule.mutateAsync(s.id); alert(t('report_schedule.run_success')) } catch (err: any) { alert(err.response?.data?.detail || t('common.error')) } }} className="p-1.5 rounded text-gray-400 hover:text-green-500" title={t('report_schedule.run_now')}>
                <Play className="h-4 w-4" />
              </button>
              <button onClick={() => openEdit(s)} className="p-1.5 rounded text-gray-400 hover:text-blue-500">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={async () => { if (confirm(t('report_schedule.delete_confirm'))) { try { await deleteSchedule.mutateAsync(s.id) } catch (err: any) { alert(err.response?.data?.detail || t('common.error')) } } }} className="p-1.5 rounded text-gray-400 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{form.id ? t('report_schedule.edit') : t('report_schedule.add')}</h3>
          {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
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

// ── Main Page ─────────────────────────────────────────────────────────────────

type Pivot = {
  sortedUsers: [string, { name: string; byType: Record<string, number>; total: number }][]
  typeList: [string, { name: string; name_key?: string | null; color: string }][]
  typeTotals: Record<string, number>
  grandTotal: number
}

// Aggregate logs into user → workType hour breakdown (used by both the
// month-range pivot table and the weekly per-person / work-type widgets).
function buildPivot(logs: WorkLog[]): Pivot | null {
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

  const sortedUsers = Object.entries(users).sort((a, b) => b[1].total - a[1].total)
  const typeList = Object.entries(types)

  const typeTotals: Record<string, number> = {}
  let grandTotal = 0
  for (const [, uData] of sortedUsers) {
    for (const [typeId, hours] of Object.entries(uData.byType)) {
      typeTotals[typeId] = (typeTotals[typeId] ?? 0) + hours
      grandTotal += hours
    }
  }

  return { sortedUsers, typeList, typeTotals, grandTotal }
}

// Prev / This-week / Next buttons, shared by the matrix and the weekly widgets.
function WeekNav({
  weekOffset,
  setWeekOffset,
  t,
}: {
  weekOffset: number
  setWeekOffset: React.Dispatch<React.SetStateAction<number>>
  t: (k: string) => string
}) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button
        onClick={() => setWeekOffset(o => o - 1)}
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
        title={t('reports.week_prev')}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {weekOffset < 0 && (
        <button
          onClick={() => setWeekOffset(0)}
          className="px-2.5 py-1 text-xs rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium"
        >
          {t('reports.week_current')}
        </button>
      )}
      <button
        onClick={() => setWeekOffset(o => o + 1)}
        disabled={weekOffset >= 0}
        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
        title={t('reports.week_next')}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function ReportsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'tr' ? trLocale : enUS
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
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    user_id: selectedUserId || undefined,
    limit: 5000,
  })
  // Team-wide logs for the same date range, ignoring the person filter — the
  // work-type distribution chart must always reflect the whole team, not just
  // whichever employee is selected for the performance trend. When no person
  // filter is active this resolves to the same query as `data` above (React
  // Query dedupes identical keys), so no extra request is made in that case.
  const { data: teamRangeData } = useWorkLogs({ date_from: dateFrom || undefined, date_to: dateTo || undefined, limit: 5000 })

  const logs = data?.items ?? []
  const hourAbbr = t('worklog.hours_abbr')
  const { data: activitySummary } = useUserActivitySummary()

  // Weekly matrix: calendar weeks Mon–Sun, navigable via weekOffset
  const [weekOffset, setWeekOffset] = useState(0)
  const weekMonday = useMemo(
    () => addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset),
    [weekOffset]
  )
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(weekMonday, i), 'yyyy-MM-dd')),
    [weekMonday]
  )
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  const { data: weekData } = useWorkLogs({ date_from: weekStart, date_to: weekEnd, limit: 5000 })
  const weekLogs = weekData?.items ?? []
  const weekUsers = useMemo(
    () => (usersData?.items ?? []).filter(u => u.is_active),
    [usersData]
  )

  // Month-range pivot (drives the pivot table + summary): user → workType → hours
  const pivot = useMemo(() => buildPivot(logs), [logs])

  // Weekly pivot (drives the per-person bars + work-type donut), scoped to the
  // selected Mon–Sun week via weekLogs (shares weekOffset with the matrix).
  const weekPivot = useMemo(() => buildPivot(weekLogs), [weekLogs])

  const isTruncated = (data?.total ?? 0) > logs.length

  const summaryStats = useMemo(() => {
    const totalHours = logs.reduce((s, l) => s + l.duration_hours, 0)
    const uniqueUsers = new Set(logs.map((l) => l.user_id)).size
    return { totalHours, uniqueUsers, entries: data?.total ?? logs.length }
  }, [logs, data?.total])

  // Per-user daily sparkline data
  const userSparklines = useMemo(() => {
    const byUser: Record<string, Record<string, number>> = {}
    for (const log of logs) {
      if (!byUser[log.user_id]) byUser[log.user_id] = {}
      byUser[log.user_id][log.log_date] = (byUser[log.user_id][log.log_date] ?? 0) + log.duration_hours
    }
    return Object.fromEntries(
      Object.entries(byUser).map(([uid, days]) => [
        uid,
        Object.entries(days).sort(([a], [b]) => a < b ? -1 : 1),
      ])
    )
  }, [logs])

  // Weekly donut data: type → total hours for the selected week, sorted desc
  const weekDonutData = useMemo(() => {
    if (!weekPivot) return []
    return weekPivot.typeList
      .map(([typeId, type]) => ({
        name: resolveName(t, type.name, type.name_key),
        color: type.color,
        hours: weekPivot.typeTotals[typeId] ?? 0,
      }))
      .sort((a, b) => b.hours - a.hours)
  }, [weekPivot, t])

  // Per-person bar derived values (weekly)
  const weekMaxUserHours = weekPivot ? Math.max(...weekPivot.sortedUsers.map(([, u]) => u.total), 1) : 1
  const weekMultipleUsers = (weekPivot?.sortedUsers.length ?? 0) > 1
  const weekMaxTotal = weekPivot?.sortedUsers[0]?.[1].total ?? 0

  // Pivot-table derived values (month range)
  const multipleUsers = (pivot?.sortedUsers.length ?? 0) > 1
  const maxTotal = pivot?.sortedUsers[0]?.[1].total ?? 0
  const minTotal = pivot?.sortedUsers[pivot.sortedUsers.length - 1]?.[1].total ?? 0

  // Team-wide work-type distribution for the selected date range (month/custom
  // range) — built from teamRangeData so the person filter never narrows it.
  const teamPivot = useMemo(() => buildPivot(teamRangeData?.items ?? []), [teamRangeData])
  const rangeDonutData = useMemo(() => {
    if (!teamPivot) return []
    return teamPivot.typeList
      .map(([typeId, type]) => ({
        name: resolveName(t, type.name, type.name_key),
        color: type.color,
        hours: teamPivot.typeTotals[typeId] ?? 0,
      }))
      .sort((a, b) => b.hours - a.hours)
  }, [teamPivot, t])

  // Employee performance trend: a manager/superadmin picks a person via the
  // user filter above; a regular user always sees their own trend (the
  // backend already scopes `logs` to just their own entries).
  const targetUserName = canFilterByUser
    ? usersData?.items.find((u) => u.id === selectedUserId)?.full_name
    : user?.full_name
  const showEmployeePerf = canFilterByUser ? !!selectedUserId : !!user

  // Daily trend: every day in the selected range, 0 hours where there's no log
  const dailyTrendData = useMemo(() => {
    if (!showEmployeePerf) return []
    const byDate: Record<string, number> = {}
    for (const log of logs) byDate[log.log_date] = (byDate[log.log_date] ?? 0) + log.duration_hours
    const days: Array<{ label: string; hours: number }> = []
    let d = new Date(dateFrom + 'T12:00:00')
    const end = new Date(dateTo + 'T12:00:00')
    while (d <= end) {
      const key = format(d, 'yyyy-MM-dd')
      days.push({ label: format(d, 'd MMM', { locale }), hours: byDate[key] ?? 0 })
      d = addDays(d, 1)
    }
    return days
  }, [logs, dateFrom, dateTo, locale, showEmployeePerf])

  // Weekly trend: the same range grouped into Mon–Sun weeks
  const weeklyTrendData = useMemo(() => {
    if (!showEmployeePerf) return []
    const byDate: Record<string, number> = {}
    for (const log of logs) byDate[log.log_date] = (byDate[log.log_date] ?? 0) + log.duration_hours
    const weeks: Array<{ label: string; hours: number }> = []
    let weekStart = startOfWeek(new Date(dateFrom + 'T12:00:00'), { weekStartsOn: 1 })
    const rangeEnd = new Date(dateTo + 'T12:00:00')
    while (weekStart <= rangeEnd) {
      let total = 0
      for (let i = 0; i < 7; i++) {
        const key = format(addDays(weekStart, i), 'yyyy-MM-dd')
        total += byDate[key] ?? 0
      }
      weeks.push({ label: format(weekStart, 'd MMM', { locale }), hours: total })
      weekStart = addWeeks(weekStart, 1)
    }
    return weeks
  }, [logs, dateFrom, dateTo, locale, showEmployeePerf])

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('reports.title')}</h1>
        <ExportButton
          onExport={(fmt) => exportWorklogs({
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            user_id: selectedUserId || undefined,
            format: fmt,
          })}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('reports.date_from')}</label>
          <DatePicker
            value={dateFrom}
            onChange={setDateFrom}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('reports.date_to')}</label>
          <DatePicker
            value={dateTo}
            max={today}
            onChange={setDateTo}
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

      {/* Data truncation warning */}
      {isTruncated && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
          {t('reports.truncation_warning', { total: data?.total })}
        </div>
      )}

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

      {/* Today's Worklog Status — who has / hasn't logged today */}
      {canFilterByUser && weekUsers.length > 0 && (
        <TodayWorklogStatus users={weekUsers} activitySummary={activitySummary} />
      )}

      {/* Weekly Activity Matrix — calendar weeks Mon–Sun, navigable */}
      {canFilterByUser && weekUsers.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('reports.weekly_title')}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {format(new Date(weekStart + 'T12:00:00'), 'dd MMM', { locale })}
                {' — '}
                {format(new Date(weekEnd + 'T12:00:00'), 'dd MMM yyyy', { locale })}
                {weekOffset === 0 && (
                  <span className="ml-2 text-primary-500 font-medium">· {t('reports.week_current')}</span>
                )}
              </p>
            </div>
            <WeekNav weekOffset={weekOffset} setWeekOffset={setWeekOffset} t={t} />
          </div>
          <WeeklyActivityMatrix users={weekUsers} logs={weekLogs} weekDates={weekDates} />
        </div>
      )}

      {/* Weekly per-person hours + work-type donut — Mon–Sun week, navigable */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {format(new Date(weekStart + 'T12:00:00'), 'dd MMM', { locale })}
              {' — '}
              {format(new Date(weekEnd + 'T12:00:00'), 'dd MMM yyyy', { locale })}
              {weekOffset === 0 && (
                <span className="ml-2 text-primary-500 font-medium">· {t('reports.week_current')}</span>
              )}
            </p>
          </div>
          <WeekNav weekOffset={weekOffset} setWeekOffset={setWeekOffset} t={t} />
        </div>

        {!weekPivot ? (
          <div className="text-center py-12 text-gray-400">{t('reports.no_data')}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Hours per person */}
            <div className="lg:col-span-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('reports.hours_per_person')}</h2>
              <div className="space-y-2">
                {weekPivot.sortedUsers.map(([uid, uData]) => {
                  const isMax = weekMultipleUsers && uData.total === weekMaxTotal && weekMaxTotal > 0
                  return (
                    <div key={uid} className="flex items-center gap-3">
                      <div className="flex items-center gap-1 w-36 flex-shrink-0">
                        {isMax && <Trophy className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                        <span className="text-sm text-gray-600 dark:text-gray-400 truncate">{uData.name}</span>
                      </div>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-5 overflow-hidden">
                        <div className="flex h-full" style={{ width: `${(uData.total / weekMaxUserHours) * 100}%` }}>
                          {weekPivot.typeList
                            .filter(([typeId]) => (uData.byType[typeId] ?? 0) > 0)
                            .map(([typeId, type]) => (
                              <div
                                key={typeId}
                                className="h-full flex-shrink-0"
                                title={`${resolveName(t, type.name, type.name_key)}: ${(uData.byType[typeId] ?? 0).toFixed(1)}${hourAbbr}`}
                                style={{
                                  width: `${((uData.byType[typeId] ?? 0) / uData.total) * 100}%`,
                                  backgroundColor: type.color,
                                }}
                              />
                            ))
                          }
                        </div>
                      </div>
                      <span className="w-14 text-sm font-medium text-gray-700 dark:text-gray-300 text-right">
                        {uData.total.toFixed(1)}{hourAbbr}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Work-type donut */}
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('reports.by_work_type')}</h2>
              <DonutChart data={weekDonutData} hourAbbr={hourAbbr} />
            </div>
          </div>
        )}
      </div>

      {/* Employee Performance Trend — daily + weekly hours for one person over the selected date range */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <LineChart className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">
              {t('reports.employee_perf_title')}{targetUserName ? ` · ${targetUserName}` : ''}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('reports.employee_perf_subtitle')}</p>
          </div>
        </div>

        {!showEmployeePerf ? (
          <p className="text-center py-8 text-gray-400 text-sm">{t('reports.employee_perf_hint')}</p>
        ) : dailyTrendData.every((d) => d.hours === 0) ? (
          <div className="text-center py-8 text-gray-400 text-sm">{t('reports.no_data')}</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">{t('reports.daily_trend')}</h3>
              <BarTrendChart data={dailyTrendData} hourAbbr={hourAbbr} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">{t('reports.weekly_trend')}</h3>
              <BarTrendChart data={weeklyTrendData} hourAbbr={hourAbbr} />
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">{t('common.loading')}</div>
      ) : !pivot ? (
        <div className="text-center py-12 text-gray-400">{t('reports.no_data')}</div>
      ) : (
        <>
          {/* Team-wide work-type distribution for the selected date range */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('reports.by_work_type_range')}</h2>
            <div className="flex justify-center">
              <DonutChart data={rangeDonutData} hourAbbr={hourAbbr} />
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
                    <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{t('reports.trend_col', { defaultValue: 'Trend' })}</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{t('reports.total_col')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pivot.sortedUsers.map(([uid, uData]) => {
                    const isMax = multipleUsers && uData.total === maxTotal && maxTotal > 0
                    const isMin = multipleUsers && uData.total === minTotal && minTotal < maxTotal
                    return (
                      <tr
                        key={uid}
                        className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${
                          isMax ? 'bg-amber-50 dark:bg-amber-900/10' : isMin ? 'bg-red-50/40 dark:bg-red-900/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-200">
                          <span className="flex items-center gap-1.5">
                            {isMax && <Trophy className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                            {uData.name}
                          </span>
                        </td>
                        {pivot.typeList.map(([typeId]) => (
                          <td key={typeId} className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                            {uData.byType[typeId] ? `${uData.byType[typeId].toFixed(1)}${hourAbbr}` : '—'}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center">
                            <MiniSparkline dailyData={userSparklines[uid] ?? []} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800 dark:text-gray-200">
                          {uData.total.toFixed(1)}{hourAbbr}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-t-2 border-gray-300 dark:border-gray-600">
                    <td className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">{t('reports.grand_total')}</td>
                    {pivot.typeList.map(([typeId]) => (
                      <td key={typeId} className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">
                        {pivot.typeTotals[typeId] ? `${pivot.typeTotals[typeId].toFixed(1)}${hourAbbr}` : '—'}
                      </td>
                    ))}
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">
                      {pivot.grandTotal.toFixed(1)}{hourAbbr}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* User Activity Summary — superadmin and team_manager */}
      {canFilterByUser && activitySummary && activitySummary.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
            <Activity className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('reports.activity_title')}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('reports.activity_subtitle')}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('reports.user_col')}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('reports.last_login')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('reports.worklog_this_month')}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('reports.open_tasks')}</th>
                </tr>
              </thead>
              <tbody>
                {activitySummary.map((u) => (
                  <tr key={u.user_id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 dark:text-gray-200">{u.full_name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">
                      {u.last_login_at
                        ? format(new Date(u.last_login_at), 'dd MMM yyyy HH:mm')
                        : <span className="text-gray-400 italic">{t('reports.never_logged_in')}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold ${
                        u.worklog_count_this_month > 0
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {u.worklog_count_this_month}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold ${
                        u.open_task_count > 0
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {u.open_task_count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
