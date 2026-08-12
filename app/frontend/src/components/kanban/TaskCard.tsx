import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format, isToday, isPast, parseISO } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Clock, Link, CheckSquare, Square, ListChecks } from 'lucide-react'
import type { Task } from '@/api/kanban'
import { useTaskSubtasks } from '@/api/kanban'
import LabelChip from './LabelChip'

const PRIORITY_CONFIG = {
  low: { label: 'priority_low', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  medium: { label: 'priority_medium', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  high: { label: 'priority_high', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  critical: { label: 'priority_critical', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
}

const PRIORITY_STRIPE: Record<string, string> = {
  low: '#9ca3af',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
}

interface Props {
  task: Task
  onClick: (task: Task) => void
  isDragOverlay?: boolean
  isTerminal?: boolean
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
}

export default function TaskCard({ task, onClick, isDragOverlay = false, isTerminal = false, selectionMode, isSelected, onToggleSelect }: Props) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'tr' ? tr : enUS

  const { data: subtasks = [] } = useTaskSubtasks(isDragOverlay ? null : task.id)
  const subtasksTotal = subtasks.length
  const subtasksDone = subtasks.filter((s) => s.is_completed).length
  const allSubtasksDone = subtasksTotal > 0 && subtasksDone === subtasksTotal

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'Task', task },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium
  const stripeColor = PRIORITY_STRIPE[task.priority] ?? PRIORITY_STRIPE.low

  let dueDateStatus: 'overdue' | 'today' | 'soon' | 'upcoming' | null = null
  if (task.due_date && !isTerminal) {
    const d = parseISO(task.due_date)
    if (isPast(d) && !isToday(d)) dueDateStatus = 'overdue'
    else if (isToday(d)) dueDateStatus = 'today'
    else {
      const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86400000)
      dueDateStatus = daysLeft <= 2 ? 'soon' : 'upcoming'
    }
  }

  const dueDateBadgeCls =
    dueDateStatus === 'overdue'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded font-medium'
      : dueDateStatus === 'today'
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium'
      : dueDateStatus === 'soon'
      ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium'
      : 'text-gray-500 dark:text-gray-400'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative bg-white dark:bg-gray-800 rounded-lg border overflow-hidden shadow-sm select-none
        ${isDragging ? 'opacity-40' : ''}
        ${isDragOverlay ? 'shadow-xl rotate-1 opacity-95 cursor-grabbing' : 'cursor-grab active:cursor-grabbing'}
        ${isSelected
          ? 'border-primary-400 dark:border-primary-500 ring-2 ring-primary-300 dark:ring-primary-700'
          : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600'}
      `}
      onClick={() => {
        if (isDragging) return
        if (selectionMode && onToggleSelect) {
          onToggleSelect(task.id)
        } else {
          onClick(task)
        }
      }}
    >
      {/* Priority stripe */}
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: stripeColor }} />

      {/* Selection checkbox */}
      {selectionMode && (
        <div className="absolute top-2 right-2 z-10">
          {isSelected
            ? <CheckSquare className="h-4 w-4 text-primary-500" />
            : <Square className="h-4 w-4 text-gray-400" />}
        </div>
      )}

      <div className="pl-4 pr-3 pt-3 pb-3 space-y-2">
        {/* Labels */}
        {task.labels && task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.labels.map((label) => (
              <LabelChip key={label.id} label={label} small />
            ))}
          </div>
        )}

        {/* Title */}
        <p className={`text-sm font-medium text-gray-900 dark:text-white leading-snug line-clamp-2 ${selectionMode ? 'pr-6' : ''}`}>
          {task.title}
        </p>

        {/* Meta row */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${priority.cls}`}>
            {t(`kanban.${priority.label}`)}
          </span>

          {task.due_date && (
            <span className={`inline-flex items-center gap-0.5 text-xs ${dueDateBadgeCls}`}>
              <Clock className="h-3 w-3" />
              {dueDateStatus === 'overdue'
                ? t('kanban.overdue')
                : dueDateStatus === 'today'
                ? t('kanban.due_today')
                : format(parseISO(task.due_date), 'd MMM', { locale })}
            </span>
          )}

          {task.jira_ticket && (
            <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400">
              <Link className="h-3 w-3" />
              {task.jira_ticket}
            </span>
          )}
        </div>

        {/* Assignee */}
        {task.assignee && (
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary-700 dark:text-primary-300 leading-none">
                {task.assignee.full_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {task.assignee.full_name}
            </span>
          </div>
        )}

        {/* Subtasks progress */}
        {subtasksTotal > 0 && (
          <div className="flex items-center gap-1.5">
            <ListChecks className={`h-3.5 w-3.5 flex-shrink-0 ${allSubtasksDone ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'}`} />
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${allSubtasksDone ? 'bg-green-500' : 'bg-primary-500'}`}
                style={{ width: `${Math.round((subtasksDone / subtasksTotal) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {subtasksDone}/{subtasksTotal}{allSubtasksDone ? ' ✓' : ''}
            </span>
          </div>
        )}

        {/* Overdue indicator */}
        {dueDateStatus === 'overdue' && (
          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
        )}
      </div>
    </div>
  )
}
