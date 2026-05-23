import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { Activity } from 'lucide-react'
import { useActivityFeed } from '@/api/kanban'

const PAGE_SIZE = 50

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-green-500',
  updated: 'bg-blue-500',
  moved: 'bg-purple-500',
  archived: 'bg-gray-400',
  comment_added: 'bg-yellow-500',
  comment_deleted: 'bg-red-400',
}

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
  start_date: 'kanban.start_date',
  jira_ticket: 'kanban.jira_ticket',
  column: 'kanban.column',
  archived: 'common.status',
  comment: 'kanban.comments',
}

export default function TimelinePage() {
  const { t } = useTranslation()
  const [skip, setSkip] = useState(0)
  const [filterAction, setFilterAction] = useState('')

  const { data, isLoading } = useActivityFeed({ skip, limit: PAGE_SIZE })
  const items = data?.items ?? []
  const total = data?.total ?? 0

  const filtered = filterAction ? items.filter((i) => i.action === filterAction) : items

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-gray-600 dark:text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('timeline_page.title')}</h1>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: '', label: t('timeline_page.filter_all') },
          { value: 'created', label: t('timeline_page.filter_created') },
          { value: 'updated', label: t('timeline_page.filter_updated') },
          { value: 'moved', label: t('timeline_page.filter_moved') },
        ].map((o) => (
          <button
            key={o.value}
            onClick={() => { setFilterAction(o.value); setSkip(0) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterAction === o.value
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12 text-gray-400">{t('timeline_page.no_data')}</p>
      ) : (
        <div className="relative">
          <div className="absolute left-3.5 top-4 bottom-4 w-px bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-4">
            {filtered.map((entry) => {
              const dotColor = ACTION_COLORS[entry.action] ?? 'bg-gray-400'
              return (
                <div key={entry.id} className="flex gap-4">
                  <div
                    className={`relative z-10 w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${dotColor}`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  </div>

                  <div className="flex-1 min-w-0 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">
                          {entry.actor?.full_name ?? t('history.unknown_actor')}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 text-sm ml-1.5">
                          {t(ACTION_LABELS[entry.action] ?? entry.action)}
                        </span>
                        <span className="text-sm font-medium text-primary-600 dark:text-primary-400 ml-1.5 truncate">
                          {entry.task_title}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
                        {format(new Date(entry.created_at), 'dd MMM HH:mm')}
                      </span>
                    </div>

                    {entry.changes && entry.changes.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {entry.changes.map((ch, i) => (
                          <div key={i} className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1">
                            <span className="font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">
                              {t(FIELD_LABELS[ch.field] ?? ch.field)}:
                            </span>
                            {ch.old !== null && (
                              <span className="line-through text-gray-400 dark:text-gray-500 truncate max-w-[120px]">
                                {ch.old}
                              </span>
                            )}
                            {ch.old !== null && ch.new !== null && (
                              <span className="text-gray-400">→</span>
                            )}
                            {ch.new !== null && (
                              <span className="text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
                                {ch.new}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} / {total}
          </span>
          <div className="flex gap-2">
            {skip > 0 && (
              <button
                onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                ← Prev
              </button>
            )}
            {skip + PAGE_SIZE < total && (
              <button
                onClick={() => setSkip(skip + PAGE_SIZE)}
                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                {t('timeline_page.load_more')} →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
