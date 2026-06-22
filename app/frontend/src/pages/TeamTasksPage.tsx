import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { Plus, Pencil, Trash2, Loader2, CheckCircle2, Clock, AlertCircle, Users, Search, Check, RotateCcw, LayoutGrid, List } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useAuthStore } from '@/store/authStore'
import {
  useTeamTasks,
  useCreateTeamTask,
  useUpdateTeamTask,
  useDeleteTeamTask,
  useCompleteTeamTask,
  type TeamTask,
  type TeamTaskUser,
} from '@/api/teamTasks'
import { useUsers } from '@/api/users'

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
}

const COLUMN_CONFIG: Record<TeamTask['status'], {
  labelKey: string
  border: string
  header: string
  dot: string
  icon: React.ReactNode
}> = {
  pending: {
    labelKey: 'team_tasks.status_pending',
    border: 'border-gray-200 dark:border-gray-700',
    header: 'bg-gray-50 dark:bg-gray-800',
    dot: 'bg-gray-400',
    icon: <AlertCircle className="h-4 w-4 text-gray-400" />,
  },
  in_progress: {
    labelKey: 'team_tasks.status_in_progress',
    border: 'border-blue-200 dark:border-blue-800',
    header: 'bg-blue-50 dark:bg-blue-900/20',
    dot: 'bg-blue-500',
    icon: <Clock className="h-4 w-4 text-blue-500" />,
  },
  done: {
    labelKey: 'team_tasks.status_done',
    border: 'border-green-200 dark:border-green-800',
    header: 'bg-green-50 dark:bg-green-900/20',
    dot: 'bg-green-500',
    icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  },
}

// ─── Small shared components ─────────────────────────────────────────────────

function DaysLeftBadge({ deadline }: { deadline: string }) {
  const { t } = useTranslation()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dl = new Date(deadline)
  dl.setHours(0, 0, 0, 0)
  const diff = Math.round((dl.getTime() - today.getTime()) / 86400000)

  if (diff < 0) return <span className="text-xs font-medium text-red-500">{t('team_tasks.overdue')}</span>
  if (diff === 0) return <span className="text-xs font-medium text-red-500">{t('team_tasks.today')}</span>
  if (diff <= 3) return <span className="text-xs font-medium text-orange-500">{t('settings.days_left', { n: diff })}</span>
  return <span className="text-xs text-gray-500 dark:text-gray-400">{t('settings.days_left', { n: diff })}</span>
}

function AssigneeTiming({ assignee, deadline }: { assignee: TeamTaskUser; deadline: string }) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'tr' ? tr : enUS
  const dl = new Date(deadline)
  dl.setHours(0, 0, 0, 0)

  if (assignee.completed_at) {
    const done = new Date(assignee.completed_at)
    const doneDay = new Date(done)
    doneDay.setHours(0, 0, 0, 0)
    const lateDays = Math.round((doneDay.getTime() - dl.getTime()) / 86400000)
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] text-gray-400 whitespace-nowrap">
          {format(done, 'dd MMM HH:mm', { locale: dateLocale })}
        </span>
        {lateDays > 0 && (
          <span className="text-[10px] font-medium text-red-500 whitespace-nowrap">
            {t('team_tasks.days_late', { n: lateDays })}
          </span>
        )}
      </span>
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueDays = Math.round((today.getTime() - dl.getTime()) / 86400000)
  if (overdueDays > 0) {
    return (
      <span className="text-[10px] font-medium text-red-500 whitespace-nowrap">
        {t('team_tasks.days_overdue', { n: overdueDays })}
      </span>
    )
  }
  return null
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'in_progress') return <Clock className="h-4 w-4 text-blue-500" />
  return <AlertCircle className="h-4 w-4 text-gray-400" />
}

// ─── Hover detail tooltip ────────────────────────────────────────────────────

function TaskDetailTooltip({ task, pos }: { task: TeamTask; pos: { top: number; left: number } }) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'tr' ? tr : enUS

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800
  const tooltipWidth = 300
  const left = pos.left + tooltipWidth > viewportWidth - 8 ? pos.left - tooltipWidth - 16 : pos.left
  const top = Math.min(pos.top, viewportHeight - 420)

  return (
    <div
      className="fixed z-50 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-4 space-y-3 pointer-events-none"
      style={{ top, left }}
    >
      <div>
        <div className="font-semibold text-gray-900 dark:text-white text-sm leading-snug">{task.title}</div>
        {task.description && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-wrap">{task.description}</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <StatusIcon status={task.status} />
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[task.status]}`}>
          {t(`team_tasks.status_${task.status}`)}
        </span>
      </div>
      <div className="text-xs space-y-0.5">
        <div className="flex gap-1">
          <span className="font-medium text-gray-700 dark:text-gray-300">{t('team_tasks.deadline')}:</span>
          <span className="text-gray-600 dark:text-gray-400">{format(new Date(task.deadline), 'dd MMM yyyy', { locale: dateLocale })}</span>
        </div>
        {task.creator && (
          <div className="flex gap-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">{t('team_tasks.created_by')}:</span>
            <span className="text-gray-600 dark:text-gray-400">{task.creator.full_name}</span>
          </div>
        )}
        <div className="flex gap-1">
          <span className="font-medium text-gray-700 dark:text-gray-300">{t('team_tasks.reminder_days')}:</span>
          <span className="text-gray-600 dark:text-gray-400">{t('team_tasks.reminder_days_label', { n: task.reminder_days_before })}</span>
        </div>
      </div>
      {task.assignees.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{t('team_tasks.assignees')}:</div>
          <div className="flex flex-col gap-1">
            {task.assignees.map((a) => (
              <div key={a.id} className="flex items-center gap-1.5">
                {a.completed_at
                  ? <Check className="h-3 w-3 text-green-500 shrink-0" />
                  : <span className="h-3 w-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 inline-block" />
                }
                <span className={`text-xs ${a.completed_at ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {a.full_name}
                </span>
                <AssigneeTiming assignee={a} deadline={task.deadline} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Kanban components ────────────────────────────────────────────────────────

interface KanbanCardProps {
  task: TeamTask
  isManager: boolean
  isDraggingGlobal: boolean
  me: TeamTaskUser | null
  completeIsPending: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleComplete: () => void
  onHoverTask: (task: TeamTask, pos: { top: number; left: number }) => void
  onHoverEnd: () => void
}

function KanbanCard({
  task,
  isManager,
  isDraggingGlobal,
  me,
  completeIsPending,
  onEdit,
  onDelete,
  onToggleComplete,
  onHoverTask,
  onHoverEnd,
}: KanbanCardProps) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'tr' ? tr : enUS
  const doneCount = task.assignees.filter((a) => a.completed_at).length

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !isManager,
  })

  const style: React.CSSProperties = {
    opacity: isDragging ? 0 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-3 shadow-sm select-none transition-shadow hover:shadow-md ${isManager ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onMouseEnter={(e) => {
        if (!isDraggingGlobal) {
          const rect = e.currentTarget.getBoundingClientRect()
          onHoverTask(task, { top: rect.top, left: rect.right + 12 })
        }
      }}
      onMouseLeave={onHoverEnd}
      {...(isManager ? { ...listeners, ...attributes } : {})}
    >
      {/* Title row + action buttons */}
      <div className="flex items-start justify-between gap-1.5 mb-2">
        <div className="font-medium text-sm text-gray-900 dark:text-white leading-snug flex-1 min-w-0">
          {task.title}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {me && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleComplete() }}
              disabled={completeIsPending}
              title={me.completed_at ? t('team_tasks.mark_undone') : t('team_tasks.mark_done')}
              className={`p-1 rounded transition-colors ${
                me.completed_at
                  ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                  : 'text-gray-300 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
              }`}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          {isManager && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit() }}
                className="p-1 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Deadline + days left */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {format(new Date(task.deadline), 'dd MMM yyyy', { locale: dateLocale })}
        </span>
        {task.status !== 'done' && <DaysLeftBadge deadline={task.deadline} />}
      </div>

      {/* Assignees */}
      {task.assignees.length > 0 && (
        <div className="flex flex-col gap-0.5 pt-2 border-t border-gray-100 dark:border-gray-800">
          {task.assignees.map((a) => (
            <div key={a.id} className="flex items-center gap-1.5">
              {a.completed_at
                ? <Check className="h-2.5 w-2.5 text-green-500 shrink-0" />
                : <span className="h-2.5 w-2.5 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 inline-block" />
              }
              <span className={`text-xs truncate ${a.completed_at ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                {a.full_name}
              </span>
              <AssigneeTiming assignee={a} deadline={task.deadline} />
            </div>
          ))}
          {task.assignees.length > 1 && (
            <span className="text-[10px] text-gray-400 mt-0.5">
              {t('team_tasks.completed_count', { done: doneCount, total: task.assignees.length })}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

interface KanbanColumnProps {
  status: TeamTask['status']
  tasks: TeamTask[]
  isManager: boolean
  isDraggingGlobal: boolean
  completeIsPending: boolean
  myAssignee: (task: TeamTask) => TeamTaskUser | null
  onEdit: (task: TeamTask) => void
  onDelete: (task: TeamTask) => void
  onToggleComplete: (taskId: string) => void
  onHoverTask: (task: TeamTask, pos: { top: number; left: number }) => void
  onHoverEnd: () => void
}

function KanbanColumn({
  status,
  tasks,
  isManager,
  isDraggingGlobal,
  completeIsPending,
  myAssignee,
  onEdit,
  onDelete,
  onToggleComplete,
  onHoverTask,
  onHoverEnd,
}: KanbanColumnProps) {
  const { t } = useTranslation()
  const { isOver, setNodeRef } = useDroppable({ id: status })
  const cfg = COLUMN_CONFIG[status]

  return (
    <div className={`flex flex-col rounded-xl border ${cfg.border} overflow-hidden transition-shadow ${isOver && isDraggingGlobal ? 'shadow-lg ring-2 ring-primary-400 ring-offset-1' : ''}`}>
      {/* Column header */}
      <div className={`flex items-center justify-between px-3 py-2.5 ${cfg.header}`}>
        <div className="flex items-center gap-2">
          {cfg.icon}
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            {t(cfg.labelKey)}
          </span>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 shadow-sm">
          {tasks.length}
        </span>
      </div>

      {/* Droppable card area */}
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 p-2 flex-1 min-h-[8rem] transition-colors ${
          isOver && isDraggingGlobal ? 'bg-primary-50 dark:bg-primary-900/10' : 'bg-gray-50/50 dark:bg-gray-800/30'
        }`}
      >
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            isManager={isManager}
            isDraggingGlobal={isDraggingGlobal}
            me={myAssignee(task)}
            completeIsPending={completeIsPending}
            onEdit={() => onEdit(task)}
            onDelete={() => onDelete(task)}
            onToggleComplete={() => onToggleComplete(task.id)}
            onHoverTask={onHoverTask}
            onHoverEnd={onHoverEnd}
          />
        ))}
        {tasks.length === 0 && !isDraggingGlobal && (
          <div className="flex-1 flex items-center justify-center py-6">
            <p className="text-xs text-gray-400 dark:text-gray-600 italic">{t('team_tasks.column_empty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

interface KanbanViewProps {
  tasks: TeamTask[]
  isManager: boolean
  completeIsPending: boolean
  myAssignee: (task: TeamTask) => TeamTaskUser | null
  onEdit: (task: TeamTask) => void
  onDelete: (task: TeamTask) => void
  onToggleComplete: (taskId: string) => void
  onHoverTask: (task: TeamTask, pos: { top: number; left: number }) => void
  onHoverEnd: () => void
}

function KanbanView({
  tasks,
  isManager,
  completeIsPending,
  myAssignee,
  onEdit,
  onDelete,
  onToggleComplete,
  onHoverTask,
  onHoverEnd,
}: KanbanViewProps) {
  const { i18n } = useTranslation()
  const dateLocale = i18n.language === 'tr' ? tr : enUS
  const updateTask = useUpdateTeamTask()
  const [activeTask, setActiveTask] = useState<TeamTask | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const byStatus: Record<TeamTask['status'], TeamTask[]> = {
    pending: tasks.filter((t) => t.status === 'pending'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    done: tasks.filter((t) => t.status === 'done'),
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveTask(event.active.data.current?.task ?? null)
    onHoverEnd()
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null)
    const { active, over } = event
    if (!over || !isManager) return
    const task = active.data.current?.task as TeamTask | undefined
    const newStatus = over.id as TeamTask['status']
    if (task && task.status !== newStatus) {
      updateTask.mutate({ id: task.id, status: newStatus })
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['pending', 'in_progress', 'done'] as const).map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={byStatus[status]}
            isManager={isManager}
            isDraggingGlobal={!!activeTask}
            completeIsPending={completeIsPending}
            myAssignee={myAssignee}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleComplete={onToggleComplete}
            onHoverTask={onHoverTask}
            onHoverEnd={onHoverEnd}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask && (
          <div className="bg-white dark:bg-gray-900 border-2 border-primary-400 rounded-xl p-3 shadow-2xl w-64 opacity-95 rotate-1">
            <div className="font-medium text-sm text-gray-900 dark:text-white leading-snug">{activeTask.title}</div>
            {activeTask.description && (
              <p className="text-xs text-gray-400 mt-1 line-clamp-2">{activeTask.description}</p>
            )}
            <div className="text-xs text-gray-500 mt-2">
              {format(new Date(activeTask.deadline), 'dd MMM yyyy', { locale: dateLocale })}
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ─── Task create / edit modal ────────────────────────────────────────────────

interface TaskModalProps {
  task: TeamTask | null
  onClose: () => void
}

function TaskModal({ task, onClose }: TaskModalProps) {
  const { t } = useTranslation()
  const createTask = useCreateTeamTask()
  const updateTask = useUpdateTeamTask()
  const { data: usersData, isLoading: usersLoading } = useUsers({ is_active: true, limit: 200 })
  const users = usersData?.items ?? []

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [deadline, setDeadline] = useState(task?.deadline ?? '')
  const [reminderDays, setReminderDays] = useState(task?.reminder_days_before ?? 3)
  const [status, setStatus] = useState(task?.status ?? 'pending')
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assignees.map((a) => a.id) ?? [])
  const [assigneeSearch, setAssigneeSearch] = useState('')
  const [error, setError] = useState('')

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (task) {
        await updateTask.mutateAsync({ id: task.id, title, description: description || undefined, deadline, reminder_days_before: reminderDays, status: status as TeamTask['status'], assignee_ids: assigneeIds })
      } else {
        await createTask.mutateAsync({ title, description: description || undefined, deadline, reminder_days_before: reminderDays, assignee_ids: assigneeIds })
      }
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    }
  }

  const isPending = createTask.isPending || updateTask.isPending

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {task ? t('team_tasks.edit_task') : t('team_tasks.new_task')}
          </h3>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('team_tasks.title')} *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={1}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('team_tasks.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('team_tasks.deadline')} *</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('team_tasks.reminder_days')}</label>
              <input
                type="number"
                min={1}
                max={365}
                value={reminderDays}
                onChange={(e) => setReminderDays(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {task && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('team_tasks.status')}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TeamTask['status'])}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="pending">{t('team_tasks.status_pending')}</option>
                <option value="in_progress">{t('team_tasks.status_in_progress')}</option>
                <option value="done">{t('team_tasks.status_done')}</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('team_tasks.assignees')}</label>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="relative border-b border-gray-200 dark:border-gray-700">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={assigneeSearch}
                  onChange={(e) => setAssigneeSearch(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
                />
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                {usersLoading ? (
                  <p className="text-sm text-gray-400 p-3">{t('common.loading')}</p>
                ) : users
                    .filter((u) => {
                      const q = assigneeSearch.toLowerCase()
                      return !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
                    })
                    .map((u) => (
                      <label key={u.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                        <input
                          type="checkbox"
                          checked={assigneeIds.includes(u.id)}
                          onChange={() => toggleAssignee(u.id)}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-900 dark:text-white">{u.full_name}</span>
                        <span className="text-xs text-gray-400 ml-auto">{u.email}</span>
                      </label>
                    ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">{t('common.cancel')}</button>
            <button type="submit" disabled={isPending} className="flex-1 py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function TeamTasksPage() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'tr' ? tr : enUS
  const user = useAuthStore((s) => s.user)
  const isManager = user?.role === 'superadmin' || user?.role === 'team_manager'

  const { data: tasks = [], isLoading } = useTeamTasks()
  const deleteTask = useDeleteTeamTask()
  const completeTask = useCompleteTeamTask()

  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const [modalTask, setModalTask] = useState<TeamTask | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [filterTitle, setFilterTitle] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [hoveredTask, setHoveredTask] = useState<TeamTask | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

  const filtered = tasks.filter((task) => {
    if (filterTitle && !task.title.toLowerCase().includes(filterTitle.toLowerCase())) return false
    if (filterFrom && task.deadline < filterFrom) return false
    if (filterTo && task.deadline > filterTo) return false
    return true
  })

  const hasFilter = filterTitle || filterFrom || filterTo

  function openCreate() { setModalTask(null); setShowModal(true) }
  function openEdit(task: TeamTask) { setModalTask(task); setShowModal(true) }
  function closeModal() { setShowModal(false); setModalTask(null) }

  async function handleDelete(task: TeamTask) {
    if (!confirm(t('team_tasks.confirm_delete'))) return
    try { await deleteTask.mutateAsync(task.id) }
    catch (err: any) { alert(err.response?.data?.detail || t('common.error')) }
  }

  async function handleToggleComplete(taskId: string) {
    try { await completeTask.mutateAsync(taskId) }
    catch (err: any) { alert(err.response?.data?.detail || t('common.error')) }
  }

  function myAssignee(task: TeamTask) {
    return task.assignees.find((a) => a.id === user?.id) ?? null
  }

  function handleHoverTask(task: TeamTask, pos: { top: number; left: number }) {
    setHoveredTask(task)
    setTooltipPos(pos)
  }

  function handleHoverEnd() {
    setHoveredTask(null)
    setTooltipPos(null)
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('team_tasks.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('team_tasks.description')}</p>
        </div>
        {isManager && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            {t('team_tasks.new_task')}
          </button>
        )}
      </div>

      {/* Filter bar + view toggle */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={filterTitle}
            onChange={(e) => setFilterTitle(e.target.value)}
            placeholder={t('team_tasks.filter_title')}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            title={t('team_tasks.filter_from')}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <span className="text-gray-400 text-sm">–</span>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            title={t('team_tasks.filter_to')}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        {hasFilter && (
          <button
            onClick={() => { setFilterTitle(''); setFilterFrom(''); setFilterTo('') }}
            className="px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700"
          >
            {t('team_tasks.clear_filters')}
          </button>
        )}
        {/* View toggle */}
        <div className="flex items-center rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden ml-auto">
          <button
            onClick={() => setViewMode('table')}
            title={t('team_tasks.view_table')}
            className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-primary-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            title={t('team_tasks.view_kanban')}
            className={`p-2 transition-colors ${viewMode === 'kanban' ? 'bg-primary-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : tasks.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-12 text-center">
          <Users className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500">{t('team_tasks.empty')}</p>
          {isManager && (
            <button onClick={openCreate} className="mt-3 text-sm text-primary-600 dark:text-primary-400 hover:underline">
              {t('team_tasks.new_task')}
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-12 text-center">
          <Search className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 dark:text-gray-500">{t('team_tasks.no_results')}</p>
        </div>
      ) : viewMode === 'kanban' ? (
        // ── Kanban board ──────────────────────────────────────────────────────
        <KanbanView
          tasks={filtered}
          isManager={isManager}
          completeIsPending={completeTask.isPending}
          myAssignee={myAssignee}
          onEdit={openEdit}
          onDelete={handleDelete}
          onToggleComplete={handleToggleComplete}
          onHoverTask={handleHoverTask}
          onHoverEnd={handleHoverEnd}
        />
      ) : (
        // ── Table / mobile cards ──────────────────────────────────────────────
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-xs font-medium text-gray-500 dark:text-gray-400 tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">{t('team_tasks.col_title')}</th>
                  <th className="px-4 py-3 text-left">{t('team_tasks.col_assignees')}</th>
                  <th className="px-4 py-3 text-left">{t('team_tasks.col_deadline')}</th>
                  <th className="px-4 py-3 text-left">{t('team_tasks.col_remaining')}</th>
                  <th className="px-4 py-3 text-left">{t('team_tasks.col_reminder')}</th>
                  <th className="px-4 py-3 text-left">{t('team_tasks.col_status')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((task) => {
                  const me = myAssignee(task)
                  const doneCount = task.assignees.filter((a) => a.completed_at).length
                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        handleHoverTask(task, { top: rect.top, left: rect.right + 12 })
                      }}
                      onMouseLeave={handleHoverEnd}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{task.title}</div>
                        {task.description && <div className="text-xs text-gray-400 truncate max-w-[220px]">{task.description}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {task.assignees.length === 0 ? (
                          <span className="text-gray-400 text-xs">{t('team_tasks.no_assignees')}</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {task.assignees.map((a) => (
                              <div key={a.id} className="flex items-center gap-1.5">
                                {a.completed_at
                                  ? <Check className="h-3 w-3 text-green-500 shrink-0" />
                                  : <span className="h-3 w-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 inline-block" />
                                }
                                <span className={`text-xs ${a.completed_at ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                  {a.full_name}
                                </span>
                                <AssigneeTiming assignee={a} deadline={task.deadline} />
                              </div>
                            ))}
                            {task.assignees.length > 1 && (
                              <span className="text-[10px] text-gray-400 mt-0.5">
                                {t('team_tasks.completed_count', { done: doneCount, total: task.assignees.length })}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {format(new Date(task.deadline), 'dd MMM yyyy', { locale: dateLocale })}
                      </td>
                      <td className="px-4 py-3">
                        {task.status !== 'done' && <DaysLeftBadge deadline={task.deadline} />}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {t('team_tasks.reminder_days_label', { n: task.reminder_days_before })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <StatusIcon status={task.status} />
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[task.status]}`}>
                            {t(`team_tasks.status_${task.status}`)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {me && (
                            <button
                              onClick={() => handleToggleComplete(task.id)}
                              disabled={completeTask.isPending}
                              title={me.completed_at ? t('team_tasks.mark_undone') : t('team_tasks.mark_done')}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                me.completed_at
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                              }`}
                            >
                              {me.completed_at
                                ? <><RotateCcw className="h-3 w-3" />{t('team_tasks.mark_undone')}</>
                                : <><Check className="h-3 w-3" />{t('team_tasks.mark_done')}</>
                              }
                            </button>
                          )}
                          {isManager && (
                            <>
                              <button onClick={() => openEdit(task)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={() => handleDelete(task)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((task) => {
              const me = myAssignee(task)
              const doneCount = task.assignees.filter((a) => a.completed_at).length
              return (
                <div key={task.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                  <div
                    className="flex items-start justify-between gap-2 mb-2 cursor-pointer"
                    onClick={() => setExpandedCardId(expandedCardId === task.id ? null : task.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white">{task.title}</div>
                      {task.description && (
                        <div className={`text-xs text-gray-400 mt-0.5 ${expandedCardId === task.id ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                          {task.description}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusIcon status={task.status} />
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[task.status]}`}>
                        {t(`team_tasks.status_${task.status}`)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <span>{format(new Date(task.deadline), 'dd MMM yyyy', { locale: dateLocale })}</span>
                    {task.status !== 'done' && <DaysLeftBadge deadline={task.deadline} />}
                    <span>{t('team_tasks.reminder_days_label', { n: task.reminder_days_before })}</span>
                  </div>
                  {task.assignees.length > 0 && (
                    <div className="flex flex-col gap-0.5 mb-2">
                      {task.assignees.map((a) => (
                        <div key={a.id} className="flex items-center gap-1.5">
                          {a.completed_at
                            ? <Check className="h-3 w-3 text-green-500 shrink-0" />
                            : <span className="h-3 w-3 rounded-full border border-gray-300 dark:border-gray-600 shrink-0 inline-block" />
                          }
                          <span className={`text-xs ${a.completed_at ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {a.full_name}
                          </span>
                          <AssigneeTiming assignee={a} deadline={task.deadline} />
                        </div>
                      ))}
                      {task.assignees.length > 1 && (
                        <span className="text-[10px] text-gray-400">
                          {t('team_tasks.completed_count', { done: doneCount, total: task.assignees.length })}
                        </span>
                      )}
                    </div>
                  )}
                  {expandedCardId === task.id && task.creator && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{t('team_tasks.created_by')}: </span>
                      {task.creator.full_name}
                    </div>
                  )}
                  <div className="flex gap-1 justify-end pt-2 border-t border-gray-100 dark:border-gray-800">
                    {me && (
                      <button
                        onClick={() => handleToggleComplete(task.id)}
                        disabled={completeTask.isPending}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          me.completed_at
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                        }`}
                      >
                        {me.completed_at
                          ? <><RotateCcw className="h-3 w-3" />{t('team_tasks.mark_undone')}</>
                          : <><Check className="h-3 w-3" />{t('team_tasks.mark_done')}</>
                        }
                      </button>
                    )}
                    {isManager && (
                      <>
                        <button onClick={() => openEdit(task)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(task)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {showModal && <TaskModal task={modalTask} onClose={closeModal} />}
      {hoveredTask && tooltipPos && <TaskDetailTooltip task={hoveredTask} pos={tooltipPos} />}
    </div>
  )
}
