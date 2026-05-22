import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  closestCorners,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { useColumns, useTasks, useMoveTask, type Task, type KanbanColumn } from '@/api/kanban'
import KanbanColumnComp from './KanbanColumn'
import TaskCard from './TaskCard'
import TaskModal from './TaskModal'

interface Props {
  onAddTask?: (columnId: string) => void
  taskParams?: { assignee_id?: string; team_id?: string }
}

export default function KanbanBoard({ taskParams }: Props) {
  const { t } = useTranslation()
  const { data: columns = [], isLoading: colLoading } = useColumns()
  const { data: tasksData, isLoading: taskLoading } = useTasks(taskParams)
  const moveTask = useMoveTask()

  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [addColumnId, setAddColumnId] = useState<string | null>(null)

  // Local optimistic task state for smooth DnD
  const [localTasks, setLocalTasks] = useState<Task[] | null>(null)
  const tasks = localTasks ?? tasksData?.items ?? []

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => a.sort_order - b.sort_order),
    [columns]
  )

  const tasksByColumn = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const col of sortedColumns) {
      map[col.id] = tasks
        .filter((t) => t.column_id === col.id && !t.is_archived)
        .sort((a, b) => a.sort_order - b.sort_order)
    }
    return map
  }, [tasks, sortedColumns])

  function onDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === 'Task') {
      setActiveTask(event.active.data.current.task)
      // snapshot current tasks for optimistic updates
      setLocalTasks(tasks.slice())
    }
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over || !localTasks) return

    const activeId = active.id as string
    const overId = over.id as string
    if (activeId === overId) return

    const activeTask = localTasks.find((t) => t.id === activeId)
    if (!activeTask) return

    const overTask = localTasks.find((t) => t.id === overId)
    const overCol = sortedColumns.find((c) => c.id === overId)
    const targetColumnId = overTask ? overTask.column_id : overCol?.id

    if (!targetColumnId || activeTask.column_id === targetColumnId) return

    setLocalTasks((prev) =>
      (prev ?? []).map((t) =>
        t.id === activeId ? { ...t, column_id: targetColumnId } : t
      )
    )
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveTask(null)

    if (!over || !localTasks) {
      setLocalTasks(null)
      return
    }

    const activeId = active.id as string
    const overId = over.id as string
    const activeTask = localTasks.find((t) => t.id === activeId)
    if (!activeTask) { setLocalTasks(null); return }

    const overTask = localTasks.find((t) => t.id === overId)
    const overCol = sortedColumns.find((c) => c.id === overId)
    const targetColumnId = overTask ? overTask.column_id : overCol?.id ?? activeTask.column_id

    // Determine new sort order
    const colTasks = localTasks
      .filter((t) => t.column_id === targetColumnId && !t.is_archived)
      .sort((a, b) => a.sort_order - b.sort_order)

    let newSortOrder: number
    if (overTask && overTask.column_id === targetColumnId) {
      const overIndex = colTasks.findIndex((t) => t.id === overId)
      newSortOrder = overIndex + 1
    } else {
      newSortOrder = colTasks.length + 1
    }

    setLocalTasks(null)

    try {
      await moveTask.mutateAsync({ id: activeId, column_id: targetColumnId, sort_order: newSortOrder })
    } catch {
      // mutation failure — query will refetch to correct state
    }
  }

  if (colLoading || taskLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-200px)]">
          {sortedColumns.map((col) => (
            <KanbanColumnComp
              key={col.id}
              column={col}
              tasks={tasksByColumn[col.id] ?? []}
              onAddTask={(colId) => setAddColumnId(colId)}
              onTaskClick={(task) => setSelectedTask(task)}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <TaskCard task={activeTask} onClick={() => {}} isDragOverlay />
          )}
        </DragOverlay>
      </DndContext>

      {(selectedTask || addColumnId) && (
        <TaskModal
          task={selectedTask}
          defaultColumnId={addColumnId ?? undefined}
          columns={sortedColumns}
          onClose={() => { setSelectedTask(null); setAddColumnId(null) }}
        />
      )}
    </>
  )
}
