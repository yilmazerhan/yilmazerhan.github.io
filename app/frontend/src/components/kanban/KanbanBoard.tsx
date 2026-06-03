import { useState, useMemo, useRef, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  pointerWithin,
  closestCenter,
  getFirstCollision,
  type CollisionDetection,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { useColumns, useTasks, useMoveTask, type Task, type KanbanColumn } from '@/api/kanban'
import KanbanColumnComp from './KanbanColumn'
import TaskCard from './TaskCard'
import TaskModal from './TaskModal'
import WorkLogFromTaskModal from './WorkLogFromTaskModal'

interface Props {
  onAddTask?: (columnId: string) => void
  taskParams?: { assignee_id?: string; team_id?: string; priority?: string; search?: string; board_id?: string }
  columns?: KanbanColumn[]
  selectionMode?: boolean
  selectedTaskIds?: Set<string>
  onToggleSelect?: (id: string) => void
  isPersonalBoard?: boolean
}

export default function KanbanBoard({ taskParams, columns: columnsProp, selectionMode, selectedTaskIds, onToggleSelect, isPersonalBoard }: Props) {
  const { t } = useTranslation()
  // Use passed columns (board-scoped) or fall back to fetching all columns
  const { data: columnsFromQuery = [], isLoading: colLoading } = useColumns(taskParams?.board_id)
  const columns = columnsProp ?? columnsFromQuery
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

  // Custom collision detection: prefer task cards over column containers so
  // same-column reordering works correctly. pointerWithin finds the exact
  // element under the cursor; closestCenter is used as fallback.
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const colIds = new Set(sortedColumns.map((c) => c.id))

      // 1. Pointer-within: find the precise draggable under the cursor
      const withinHits = pointerWithin(args)

      // Prefer task cards (filter out column droppables)
      const taskHits = withinHits.filter(({ id }) => !colIds.has(String(id)))
      if (taskHits.length > 0) return taskHits

      // 2. Pointer is over a column container area (empty space / column bg)
      const firstColHit = getFirstCollision(withinHits, 'id')
      if (firstColHit != null) {
        const colId = String(firstColHit)
        const colTaskIds = (tasksByColumn[colId] ?? []).map((t) => t.id)
        if (colTaskIds.length > 0) {
          // Snap to the closest task inside that column
          return closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter(({ id }) =>
              colTaskIds.includes(String(id))
            ),
          })
        }
        // Empty column — accept the column itself
        return withinHits
      }

      // 3. Fallback
      return closestCenter(args)
    },
    [sortedColumns, tasksByColumn]
  )

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

    if (!targetColumnId) return

    if (dragged.column_id === targetColumnId) {
      // Same-column reorder — only act when hovering over another task
      if (!overTask) return

      const colTasks = current
        .filter((t) => t.column_id === targetColumnId && !t.is_archived)
        .sort((a, b) => a.sort_order - b.sort_order)

      const oldIndex = colTasks.findIndex((t) => t.id === activeId)
      const newIndex = colTasks.findIndex((t) => t.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const reordered = arrayMove(colTasks, oldIndex, newIndex).map((t, i) => ({
        ...t,
        sort_order: i + 1,
      }))

      const colTaskIds = new Set(colTasks.map((t) => t.id))
      const updated = [...current.filter((t) => !colTaskIds.has(t.id)), ...reordered]
      localTasksRef.current = updated
      setLocalTasksSnapshot(updated)
    } else {
      // Cross-column move
      const updated = current.map((t) =>
        t.id === activeId ? { ...t, column_id: targetColumnId } : t
      )
      localTasksRef.current = updated
      setLocalTasksSnapshot(updated)
    }
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

    const targetColumnId = draggedTask.column_id  // already updated by onDragOver for cross-column
    const isSameColumn = dragSourceColumnId === targetColumnId

    const sourceColumn = sortedColumns.find((c) => c.id === dragSourceColumnId)
    const targetColumn = sortedColumns.find((c) => c.id === targetColumnId)

    let newSortOrder: number

    if (isSameColumn) {
      // onDragOver already reordered tasks with sort_order 1,2,3…
      const colTasks = localTasks
        .filter((t) => t.column_id === targetColumnId && !t.is_archived)
        .sort((a, b) => a.sort_order - b.sort_order)
      const finalIndex = colTasks.findIndex((t) => t.id === activeId)
      newSortOrder = finalIndex >= 0 ? finalIndex + 1 : colTasks.length + 1
    } else {
      // Cross-column: use drop target to determine position in new column
      const overTask = localTasks.find((t) => t.id === overId)
      const colTasks = localTasks
        .filter((t) => t.column_id === targetColumnId && t.id !== activeId && !t.is_archived)
        .sort((a, b) => a.sort_order - b.sort_order)
      if (overTask && overTask.column_id === targetColumnId) {
        const overIndex = colTasks.findIndex((t) => t.id === overId)
        newSortOrder = overIndex + 1
      } else {
        newSortOrder = colTasks.length + 1
      }
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
        collisionDetection={collisionDetection}
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
              onTaskClick={(task) => {
                if (selectionMode && onToggleSelect) {
                  onToggleSelect(task.id)
                } else {
                  setSelectedTask(task)
                }
              }}
              selectionMode={selectionMode}
              selectedTaskIds={selectedTaskIds}
              onToggleSelect={onToggleSelect}
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
          isPersonalBoard={isPersonalBoard}
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
