import { useState, useRef } from 'react'
import { X, Trash2, Send, History, MessageSquare, ClipboardList } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import {
  useCreateTask, useUpdateTask, useDeleteTask, useMoveTask,
  useTaskComments, useCreateComment, useDeleteComment,
  useTaskHistory,
  type Task, type TaskHistoryEntry,
} from '@/api/kanban'
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

type Tab = 'details' | 'comments' | 'history'

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
  const [jiraTicket, setJiraTicket] = useState(task?.jira_ticket ?? '')
  const [error, setError] = useState('')

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

  const TABS: { key: Tab; icon: React.ComponentType<{ className?: string }>; labelKey: string; count?: number }[] = [
    { key: 'details', icon: ClipboardList, labelKey: 'kanban.task_title' },
    { key: 'comments', icon: MessageSquare, labelKey: 'kanban.comments', count: comments.length || undefined },
    { key: 'history', icon: History, labelKey: 'history.title', count: historyEntries.length || undefined },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
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
          <div className="flex border-b border-gray-200 dark:border-gray-800 flex-shrink-0 px-6">
            {TABS.map(({ key, icon: Icon, labelKey, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
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
                    <option key={col.id} value={col.id}>{col.name}</option>
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
