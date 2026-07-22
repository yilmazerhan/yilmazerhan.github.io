import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  format, parseISO, isValid, isToday as isDateToday, isSameDay, isSameMonth,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, addDays,
} from 'date-fns'
import { tr as trLocale, enUS } from 'date-fns/locale'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  className?: string
  placeholder?: string
  title?: string
}

/** Custom calendar dropdown — always starts the week on Monday, unlike the
 *  native `<input type="date">` picker, whose first day of week follows the
 *  browser/OS locale (and can't be overridden by web app code). */
export default function DatePicker({
  value, onChange, min, max, required, disabled, className, placeholder, title,
}: DatePickerProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'tr' ? trLocale : enUS
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = value ? parseISO(value) : null
  const validSelected = selected && isValid(selected) ? selected : null
  const minDate = min ? parseISO(min) : null
  const maxDate = max ? parseISO(max) : null

  const [viewMonth, setViewMonth] = useState(validSelected ?? new Date())

  useEffect(() => {
    if (open) setViewMonth(validSelected ?? new Date())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const weekDayLabels = Array.from({ length: 7 }, (_, i) => format(addDays(gridStart, i), 'EEEEEE', { locale }))

  function isDisabled(day: Date) {
    if (minDate && day < minDate) return true
    if (maxDate && day > maxDate) return true
    return false
  }

  function pick(day: Date) {
    if (isDisabled(day)) return
    onChange(format(day, 'yyyy-MM-dd'))
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`${className ?? ''} min-w-[8.5rem] flex items-center justify-between gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span className={validSelected ? '' : 'text-gray-400 dark:text-gray-500'}>
          {validSelected ? format(validSelected, 'dd.MM.yyyy') : (placeholder ?? '')}
        </span>
        <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-64 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setViewMonth((m) => subMonths(m, 1))} className="p-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {format(viewMonth, 'MMMM yyyy', { locale })}
            </span>
            <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))} className="p-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {weekDayLabels.map((label, i) => (
              <div key={i} className="text-center text-[11px] font-medium text-gray-400 dark:text-gray-500 py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const dayDisabled = isDisabled(day)
              const isSelected = validSelected && isSameDay(day, validSelected)
              const inMonth = isSameMonth(day, viewMonth)
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={dayDisabled}
                  onClick={() => pick(day)}
                  className={`h-7 w-full rounded text-xs flex items-center justify-center transition-colors
                    ${isSelected
                      ? 'bg-primary-500 text-white font-semibold'
                      : dayDisabled
                        ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed'
                        : inMonth
                          ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                          : 'text-gray-300 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'}
                    ${!isSelected && isDateToday(day) ? 'ring-1 ring-primary-400 ring-inset' : ''}
                  `}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            {!required ? (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                {t('common.clear')}
              </button>
            ) : <span />}
            <button
              type="button"
              onClick={() => pick(new Date())}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              {t('common.today')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
