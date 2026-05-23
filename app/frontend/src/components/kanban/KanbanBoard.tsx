import { useState, useMemo, useRef } from 'react'
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
import { useTranslation } from 'react-i18next'
import { useColumns, useTasks, useMoveTask, type Task, type KanbanColumn } from '@/api/kanban'
import KanbanColumnComp from './KanbanColumn'
import TaskCard from './TaskCard'
import TaskModal from './TaskModal'
import WorkLogFromTaskModal from './WorkLogFromTaskModal'

interface Props {
  onAddTask?: (columnId: string) => void
  taskParams?: { assignee_id?: string; team_id?: string; priority?: string }
}

export default function KanbanBoard({ taskParams }: Props) {
  const { t } = useTranslation()
  const { data: columns = [], isLoading: colLoading } = useColumns()
  const { data: tasksData, isLoading: taskLoading } = useTasks(taskParams)
  const moveTask = useMoveTask()

  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [addColumnId, setAddColumnId] = useState<string | null>(null)
  const [completedTask, setCompletedTask] = useState<Task | null>(null)

  // Refs for drag state — synchronous, no re-render delay
  const localTasksRef = useRef<Task[] | null>(null)
  const dragSourceColumnIdRef = useRef<string | null>(null)
  const [localTasksSnapshot, setLocalTasksSnapshot] = useState<Task[] | null>(null)

  const tasks = localTasksSnapshot ?? tasksData?.items ?? []

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
      const t = event.active.data.current.task as Task
      setActiveTask(t)
      // Use refs for synchronous access — no React re-render delay
      const snapshot = (tasksData?.items ?? []).slice()
      localTasksRef.current = snapshot
      dragSourceColumnIdRef.current = t.column_id
      setLocalTasksSnapshot(snapshot)
    }
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over || !localTasksRef.current) return

    const activeId = active.id as string
    const overId = over.id as string
    if (activeId === overId) return

    const current = localTasksRef.current
    const dragged = current.find((t) => t.id === activeId)
    if (!dragged) return

    const overTask = current.find((t) => t.id === overId)
    const overCol = sortedColumns.find((c) => c.id === overId)
    const targetColumnId = overTask ? overTask.column_id : overCol?.id

    if (!targetColumnId || dragged.column_id === targetColumnId) return

    const updated = current.map((t) =>
      t.id === activeId ? { ...t, column_id: targetColumnId } : t
    )
    localTasksRef.current = updated
    setLocalTasksSnapshot(updated)
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveTask(null)

    const localTasks = localTasksRef.current
    const dragSourceColumnId = dragSourceColumnIdRef.current

    // Reset refs and snapshot
    localTasksRef.current = null
    dragSourceColumnIdRef.current = null
    setLocalTasksSnapshot(null)

    if (!over || !localTasks) return

    const activeId = active.id as string
    const overId = over.id as string
    const draggedTask = localTasks.find((t) => t.id === activeId)
    if (!draggedTask) return

    const overTask = localTasks.find((t) => t.id === overId)
    const overCol = sortedColumns.find((c) => c.id === overId)
    const targetColumnId = overTask ? overTask.column_id : overCol?.id ?? draggedTask.column_id

    const sourceColumn = sortedColumns.find((c) => c.id === dragSourceColumnId)
    const targetColumn = sortedColumns.find((c) => c.id === targetColumnId)

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

    try {
      const movedTask = await moveTask.mutateAsync({ id: activeId, column_id: targetColumnId, sort_order: newSortOrder })
      if (targetColumn?.is_terminal && !sourceColumn?.is_terminal) {
        setCompletedTask(movedTask)
      }
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
          onTaskCompleted={(task) => { setSelectedTask(null); setAddColumnId(null); setCompletedTask(task) }}
        />
      )}

      {completedTask && (
        <WorkLogFromTaskModal
          task={completedTask}
          onClose={() => setCompletedTask(null)}
        />
      )}
    </>
  )
}
