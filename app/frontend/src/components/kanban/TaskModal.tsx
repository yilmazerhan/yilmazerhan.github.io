import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useCreateTask, useUpdateTask, useDeleteTask, useMoveTask, type Task } from '@/api/kanban'
import type { KanbanColumn } from '@/api/kanban'
import { useUsers } from '@/api/users'
import { useAuthStore } from '@/store/authStore'

interface Props {
  task?: Task | null
  defaultColumnId?: string
  columns: KanbanColumn[]
  onClose: () => void
  onTaskCompleted?: (task: Task) => void
}

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const

export default function TaskModal({ task, defaultColumnId, columns, onClose, onTaskCompleted }: Props) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isEdit = !!task

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [columnId, setColumnId] = useState(task?.column_id ?? defaultColumnId ?? columns[0]?.id ?? '')
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '')
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>(task?.priority ?? 'medium')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [jiraTicket, setJiraTicket] = useState(task?.jira_ticket ?? '')
  const [error, setError] = useState('')

  const { data: usersData } = useUsers({ limit: 200 })
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const moveTask = useMoveTask()
  const loading = createTask.isPending || updateTask.isPending || moveTask.isPending

  const canEdit = !isEdit ||
    user?.role === 'superadmin' ||
    user?.role === 'team_manager' ||
    task?.created_by === user?.id ||
    task?.assignee_id === user?.id

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError(t('kanban.title_required')); return }

    try {
      if (isEdit && task) {
        await updateTask.mutateAsync({
          id: task.id,
          title: title.trim(),
          description: description.trim() || undefined,
          assignee_id: assigneeId || null,
          priority,
          due_date: dueDate || null,
          jira_ticket: jiraTicket.trim() || null,
        })

        let finalTask: Task = task
        if (columnId !== task.column_id) {
          finalTask = await moveTask.mutateAsync({ id: task.id, column_id: columnId, sort_order: task.sort_order })
        }

        const sourceCol = columns.find((c) => c.id === task.column_id)
        const targetCol = columns.find((c) => c.id === columnId)
        if (targetCol?.is_terminal && !sourceCol?.is_terminal && onTaskCompleted) {
          onTaskCompleted(finalTask)
          return
        }
      } else {
        await createTask.mutateAsync({
          title: title.trim(),
          column_id: columnId,
          description: description.trim() || undefined,
          assignee_id: assigneeId || undefined,
          priority,
          due_date: dueDate || undefined,
          jira_ticket: jiraTicket.trim() || undefined,
        })
      }
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    }
  }

  async function handleDelete() {
    if (!task) return
    if (!confirm(t('common.confirm_delete'))) return
    try {
      await deleteTask.mutateAsync(task.id)
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? t('kanban.edit_task') : t('kanban.add_task')}
          </h2>
          <div className="flex items-center gap-2">
            {isEdit && canEdit && (
              <button
                onClick={handleDelete}
                className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                title={t('kanban.archive')}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              {error}
            </p>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('kanban.task_title')} *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={!canEdit}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
            />
          </div>

          {/* Column */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('kanban.column')}</label>
            <select
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
            >
              {columns.map((col) => (
                <option key={col.id} value={col.id}>{col.name}</option>
              ))}
            </select>
          </div>

          {/* Priority + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('kanban.priority')}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                disabled={!canEdit}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{t(`kanban.priority_${p}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('kanban.due_date')}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={!canEdit}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
              />
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('kanban.assignee')}
            </label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
            >
              <option value="">{t('kanban.unassigned')}</option>
              {usersData?.items.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('kanban.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={!canEdit}
              placeholder={t('kanban.optional_description')}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none disabled:opacity-60"
            />
          </div>

          {/* Jira ticket */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('kanban.jira_ticket')}
            </label>
            <input
              type="text"
              value={jiraTicket}
              onChange={(e) => setJiraTicket(e.target.value)}
              disabled={!canEdit}
              placeholder="PROJ-123"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
            />
          </div>

          {isEdit && task && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('kanban.created_by')}: {task.creator.full_name}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium"
            >
              {t('common.cancel')}
            </button>
            {canEdit && (
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {loading ? t('common.loading') : t('common.save')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
