import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import type { KanbanColumn as ColType, Task } from '@/api/kanban'
import TaskCard from './TaskCard'

interface Props {
  column: ColType
  tasks: Task[]
  onAddTask: (columnId: string) => void
  onTaskClick: (task: Task) => void
}

export default function KanbanColumnComp({ column, tasks, onAddTask, onTaskClick }: Props) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { type: 'Column', column } })

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column header */}
      <div
        className="flex items-center justify-between px-3 py-2 rounded-t-xl"
        style={{ backgroundColor: column.color + '33' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: column.color }}
          />
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{column.name}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium bg-white/60 dark:bg-gray-800/60 px-1.5 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(column.id)}
          className="p-1 rounded text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-700 transition-colors"
          title={t('kanban.add_task')}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Task list */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] p-2 rounded-b-xl space-y-2 transition-colors
          ${isOver
            ? 'bg-primary-50 dark:bg-primary-900/10 border-2 border-primary-300 dark:border-primary-700 border-dashed'
            : 'bg-gray-50 dark:bg-gray-900/50 border-2 border-transparent'
          }`}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-600 text-center py-6">
              {t('kanban.no_tasks')}
            </p>
          ) : (
            tasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={onTaskClick} />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  )
}
