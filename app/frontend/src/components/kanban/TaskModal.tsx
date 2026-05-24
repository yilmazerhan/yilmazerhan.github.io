import { useState, useRef } from 'react'
import { X, Trash2, Send, History, MessageSquare, ClipboardList, CheckSquare, Square, ListChecks, Plus, Paperclip, Download, Tag } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import {
  useCreateTask, useUpdateTask, useDeleteTask, useMoveTask,
  useTaskComments, useCreateComment, useDeleteComment,
  useTaskHistory, useTaskSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask,
  useTaskAttachments, useUploadAttachment, useDeleteAttachment, getAttachmentDownloadUrl,
  useLabels,
  type Task, type TaskHistoryEntry,
} from '@/api/kanban'
import type { KanbanColumn } from '@/api/kanban'
import { useUsers } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import { resolveName } from '@/utils/i18nName'
import LabelChip from './LabelChip'

interface Props {
  task?: Task | null
  defaultColumnId?: string
  columns: KanbanColumn[]
  onClose: () => void
  onTaskCompleted?: (task: Task) => void
}

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const

type Tab = 'details' | 'subtasks' | 'comments' | 'history' | 'attachments'

// ─── History timeline ─────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  created: 'history.action_created',
  updated: 'history.action_updated',
  moved: 'history.action_moved',
  archived: 'history.action_archived',
  comment_added: 'history.action_comment_added',
  comment_deleted: 'history.action_comment_deleted',
}

const FIELD_LABELS: Record<string, string> = {
  title: 'kanban.task_title',
  description: 'kanban.description',
  assignee: 'kanban.assignee',
  priority: 'kanban.priority',
  due_date: 'kanban.due_date',
  jira_ticket: 'kanban.jira_ticket',
  column: 'kanban.column',
  archived: 'common.status',
  comment: 'kanban.comments',
}

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-green-500',
  updated: 'bg-blue-500',
  moved: 'bg-purple-500',
  archived: 'bg-gray-400',
  comment_added: 'bg-yellow-500',
  comment_deleted: 'bg-red-400',
}

function HistoryTimeline({ entries }: { entries: TaskHistoryEntry[] }) {
  const { t } = useTranslation()

  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
        {t('history.empty')}
      </p>
    )
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-3 top-4 bottom-4 w-px bg-gray-200 dark:bg-gray-700" />

      <div className="space-y-4">
        {entries.map((entry) => {
          const dotColor = ACTION_COLORS[entry.action] ?? 'bg-gray-400'
          return (
            <div key={entry.id} className="flex gap-3">
              {/* Dot */}
              <div className={`relative z-10 w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${dotColor}`}>
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {entry.actor?.full_name ?? t('history.unknown_actor')}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {t(ACTION_LABELS[entry.action] ?? entry.action)}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto whitespace-nowrap">
                    {format(new Date(entry.created_at), 'dd MMM HH:mm')}
                  </span>
                </div>

                {entry.changes && entry.changes.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {entry.changes.map((ch, i) => {
                      const fieldLabel = FIELD_LABELS[ch.field]
                        ? t(FIELD_LABELS[ch.field])
                        : ch.field

                      if (ch.field === 'comment') {
                        return (
                          <p key={i} className="text-xs text-gray-500 dark:text-gray-400 italic truncate">
                            «{ch.new ?? ch.old}»
                          </p>
                        )
                      }

                      return (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                          <span className="font-medium text-gray-600 dark:text-gray-300">{fieldLabel}:</span>
                          {ch.old !== null && ch.old !== undefined && (
                            <>
                              <span className="line-through text-red-400 dark:text-red-500 max-w-[120px] truncate">
                                {ch.old}
                              </span>
                              <span className="text-gray-300 dark:text-gray-600">→</span>
                            </>
                          )}
                          {ch.new !== null && ch.new !== undefined && (
                            <span className="text-green-600 dark:text-green-400 max-w-[120px] truncate">
                              {ch.new}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function TaskModal({ task, defaultColumnId, columns, onClose, onTaskCompleted }: Props) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isEdit = !!task
  const [activeTab, setActiveTab] = useState<Tab>('details')

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [columnId, setColumnId] = useState(task?.column_id ?? defaultColumnId ?? columns[0]?.id ?? '')
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '')
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>(task?.priority ?? 'medium')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [startDate, setStartDate] = useState(task?.start_date ?? '')
  const [jiraTicket, setJiraTicket] = useState(task?.jira_ticket ?? '')
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>(task?.labels?.map((l) => l.id) ?? [])
  const [labelDropdownOpen, setLabelDropdownOpen] = useState(false)
  const [error, setError] = useState('')

  const { data: allLabels = [] } = useLabels()

  const { data: usersData } = useUsers({ limit: 200 })
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const moveTask = useMoveTask()
  const loading = createTask.isPending || updateTask.isPending || moveTask.isPending

  const { data: comments = [] } = useTaskComments(isEdit ? task?.id : undefined)
  const createComment = useCreateComment(task?.id ?? '')
  const deleteComment = useDeleteComment(task?.id ?? '')
  const [commentText, setCommentText] = useState('')

  const { data: subtasks = [] } = useTaskSubtasks(isEdit ? task?.id : null)
  const createSubtask = useCreateSubtask(task?.id ?? '')
  const updateSubtask = useUpdateSubtask(task?.id ?? '')
  const deleteSubtask = useDeleteSubtask(task?.id ?? '')
  const [subtaskInput, setSubtaskInput] = useState('')
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionPos, setMentionPos] = useState(0)
  const { data: allUsersData } = useUsers({ limit: 200 })
  const allUsers = allUsersData?.items ?? []
  const mentionResults = mentionQuery
    ? allUsers.filter(u =>
        u.username.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        u.full_name.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 6)
    : []

  const { data: historyEntries = [] } = useTaskHistory(isEdit ? task?.id : undefined)
  const { data: attachments = [] } = useTaskAttachments(isEdit ? task?.id : null)
  const uploadAttachment = useUploadAttachment(task?.id ?? '')
  const deleteAttachment = useDeleteAttachment(task?.id ?? '')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault()
    const text = commentText.trim()
    if (!text) return
    try {
      await createComment.mutateAsync(text)
      setCommentText('')
    } catch {
      // ignore
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm(t('kanban.delete_comment'))) return
    await deleteComment.mutateAsync(commentId)
  }

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
          start_date: startDate || null,
          jira_ticket: jiraTicket.trim() || null,
          label_ids: selectedLabelIds,
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
          start_date: startDate || undefined,
          jira_ticket: jiraTicket.trim() || undefined,
          label_ids: selectedLabelIds.length > 0 ? selectedLabelIds : undefined,
        })
      }
      onClose()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(Array.isArray(detail) ? detail.map((d: any) => d.msg).join(', ') : detail || t('common.error'))
    }
  }

  async function handleDelete() {
    if (!task) return
    if (!confirm(t('common.confirm_delete'))) return
    try {
      await deleteTask.mutateAsync(task.id)
      onClose()
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setError(Array.isArray(detail) ? detail.map((d: any) => d.msg).join(', ') : detail || t('common.error'))
    }
  }

  const subtasksDone = subtasks.filter((s) => s.is_completed).length
  const subtasksTotal = subtasks.length

  const TABS: { key: Tab; icon: React.ComponentType<{ className?: string }>; labelKey: string; count?: number }[] = [
    { key: 'details', icon: ClipboardList, labelKey: 'kanban_tabs.details' },
    { key: 'subtasks', icon: ListChecks, labelKey: 'kanban.subtasks', count: subtasksTotal || undefined },
    { key: 'comments', icon: MessageSquare, labelKey: 'kanban.comments', count: comments.length || undefined },
    { key: 'attachments', icon: Paperclip, labelKey: 'attachments.title', count: attachments.length || undefined },
    { key: 'history', icon: History, labelKey: 'history.title', count: historyEntries.length || undefined },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
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

        {/* Tabs (only when editing) */}
        {isEdit && (
          <div className="flex border-b border-gray-200 dark:border-gray-800 flex-shrink-0 px-4 overflow-x-auto">
            {TABS.map(({ key, icon: Icon, labelKey, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0 ${
                  activeTab === key
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {key === 'details' ? t('kanban.task_title').split(' ')[0] : t(labelKey)}
                {count !== undefined && count > 0 && (
                  <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 rounded-full">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Details tab ── */}
          {activeTab === 'details' && (
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  {error}
                </p>
              )}

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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('kanban.column')}</label>
                <select
                  value={columnId}
                  onChange={(e) => setColumnId(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
                >
                  {columns.map((col) => (
                    <option key={col.id} value={col.id}>{resolveName(t, col.name, col.name_key)}</option>
                  ))}
                </select>
              </div>

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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('kanban.start_date')}
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
                />
              </div>

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

              {/* Labels */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('kanban.labels')}
                </label>
                <div className="flex flex-wrap gap-1 mb-1">
                  {selectedLabelIds.map((lid) => {
                    const label = allLabels.find((l) => l.id === lid)
                    if (!label) return null
                    return (
                      <LabelChip
                        key={lid}
                        label={label}
                        onRemove={canEdit ? () => setSelectedLabelIds((prev) => prev.filter((id) => id !== lid)) : undefined}
                      />
                    )
                  })}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setLabelDropdownOpen((o) => !o)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
                  >
                    <Tag className="h-3 w-3" />
                    {t('kanban.add_label')}
                  </button>
                )}
                {labelDropdownOpen && (
                  <div className="absolute top-full mt-1 left-0 z-20 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                    {allLabels.map((label) => {
                      const checked = selectedLabelIds.includes(label.id)
                      return (
                        <button
                          key={label.id}
                          type="button"
                          onClick={() => {
                            setSelectedLabelIds((prev) =>
                              checked ? prev.filter((id) => id !== label.id) : [...prev, label.id]
                            )
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${checked ? 'bg-gray-50 dark:bg-gray-700/50' : ''}`}
                        >
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                          <span className="flex-1 text-left text-gray-700 dark:text-gray-300">{label.name}</span>
                          {checked && <span className="text-primary-500">✓</span>}
                        </button>
                      )
                    })}
                    {allLabels.length === 0 && (
                      <p className="text-xs text-gray-400 p-3 text-center">{t('kanban.no_labels')}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => setLabelDropdownOpen(false)}
                      className="w-full px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-100 dark:border-gray-700"
                    >
                      {t('common.close')}
                    </button>
                  </div>
                )}
              </div>

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
          )}

          {/* ── Subtasks tab ── */}
          {activeTab === 'subtasks' && isEdit && task && (
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {subtasksTotal > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{t('kanban.subtasks_progress', { done: subtasksDone, total: subtasksTotal })}</span>
                    <span>{Math.round((subtasksDone / subtasksTotal) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all"
                      style={{ width: `${(subtasksDone / subtasksTotal) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                {subtasks.map((subtask) => (
                  <div key={subtask.id} className="flex items-center gap-2 group py-0.5">
                    <button
                      onClick={() => updateSubtask.mutate({ subtaskId: subtask.id, is_completed: !subtask.is_completed })}
                      className="flex-shrink-0 text-gray-400 hover:text-primary-500"
                    >
                      {subtask.is_completed
                        ? <CheckSquare className="h-4 w-4 text-primary-500" />
                        : <Square className="h-4 w-4" />}
                    </button>
                    <span className={`flex-1 text-sm ${subtask.is_completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {subtask.title}
                    </span>
                    <button
                      onClick={() => deleteSubtask.mutate(subtask.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 transition-opacity"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {subtasks.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">{t('kanban.no_subtasks')}</p>
              )}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={subtaskInput}
                  onChange={(e) => setSubtaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && subtaskInput.trim()) {
                      createSubtask.mutate({ title: subtaskInput.trim(), sort_order: subtasks.length })
                      setSubtaskInput('')
                    }
                  }}
                  placeholder={t('kanban.subtask_placeholder')}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={() => {
                    if (subtaskInput.trim()) {
                      createSubtask.mutate({ title: subtaskInput.trim(), sort_order: subtasks.length })
                      setSubtaskInput('')
                    }
                  }}
                  disabled={!subtaskInput.trim()}
                  className="px-3 py-1.5 rounded-lg bg-primary-500 text-white disabled:opacity-40 hover:bg-primary-600"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Comments tab ── */}
          {activeTab === 'comments' && isEdit && task && (
            <div className="p-6 space-y-4">
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">{t('kanban.no_comments')}</p>
                ) : comments.map((c) => (
                  <div key={c.id} className="flex gap-2 group">
                    <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {c.author?.full_name ?? '—'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {format(new Date(c.created_at), 'dd MMM HH:mm')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                        {c.content.split(/(@[A-Za-z0-9_.]+)/g).map((part, i) =>
                          part.startsWith('@') ? (
                            <span key={i} className="text-primary-600 dark:text-primary-400 font-medium">{part}</span>
                          ) : part
                        )}
                      </p>
                    </div>
                    {(user?.role === 'superadmin' || c.user_id === user?.id) && (
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-opacity self-start mt-1"
                        title={t('kanban.delete_comment')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddComment} className="flex gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={commentInputRef}
                    value={commentText}
                    onChange={(e) => {
                      const val = e.target.value
                      setCommentText(val)
                      const cursor = e.target.selectionStart ?? val.length
                      const before = val.slice(0, cursor)
                      const match = before.match(/@([A-Za-z0-9_.]*)$/)
                      if (match) {
                        setMentionQuery(match[1])
                        setMentionPos(cursor - match[0].length)
                        setMentionOpen(true)
                      } else {
                        setMentionOpen(false)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (mentionOpen) {
                        if (e.key === 'Escape') { setMentionOpen(false); return }
                        if (e.key === 'Enter' && mentionResults.length > 0) {
                          e.preventDefault()
                          const u = mentionResults[0]
                          const before = commentText.slice(0, mentionPos)
                          const after = commentText.slice(commentText.indexOf(' ', mentionPos) === -1 ? commentText.length : commentText.indexOf(' ', mentionPos))
                          setCommentText(before + `@${u.username} ` + after)
                          setMentionOpen(false)
                          return
                        }
                      }
                      if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) {
                        e.preventDefault()
                        handleAddComment(e as any)
                      }
                    }}
                    rows={2}
                    placeholder={t('kanban.add_comment')}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                  {mentionOpen && mentionResults.length > 0 && (
                    <div className="absolute bottom-full mb-1 left-0 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden">
                      {mentionResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            const before = commentText.slice(0, mentionPos)
                            const after = commentText.slice(mentionPos + mentionQuery.length + 1)
                            setCommentText(before + `@${u.username} ` + after)
                            setMentionOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                        >
                          <span className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                            {u.full_name[0].toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{u.full_name}</p>
                            <p className="text-xs text-gray-400 truncate">@{u.username}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!commentText.trim() || createComment.isPending}
                  className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg disabled:opacity-40 self-end"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}

          {/* ── Attachments tab ── */}
          {activeTab === 'attachments' && isEdit && task && (
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {/* Upload area */}
              <div
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-primary-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('attachments.drop_hint')}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    try {
                      await uploadAttachment.mutateAsync(file)
                    } catch (err: any) {
                      const detail = err.response?.data?.detail
                      alert(detail || t('common.error'))
                    }
                    e.target.value = ''
                  }}
                />
              </div>

              {/* Attachment list */}
              {attachments.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-4">{t('attachments.no_attachments')}</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((att) => {
                    const sizeKb = Math.round(att.file_size / 1024)
                    const sizeLabel = att.file_size < 1024 * 1024
                      ? `${sizeKb} ${t('attachments.size_kb')}`
                      : `${(att.file_size / (1024 * 1024)).toFixed(1)} ${t('attachments.size_mb')}`
                    return (
                      <div
                        key={att.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 group"
                      >
                        <Paperclip className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{att.original_filename}</p>
                          <p className="text-xs text-gray-400">{sizeLabel}</p>
                        </div>
                        <a
                          href={getAttachmentDownloadUrl(task.id, att.id)}
                          download={att.original_filename}
                          className="p-1.5 rounded text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                          title={t('attachments.download')}
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <button
                          onClick={async () => {
                            if (!confirm(t('attachments.confirm_delete'))) return
                            await deleteAttachment.mutateAsync(att.id)
                          }}
                          className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title={t('attachments.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── History tab ── */}
          {activeTab === 'history' && isEdit && (
            <div className="p-6">
              <HistoryTimeline entries={historyEntries} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
