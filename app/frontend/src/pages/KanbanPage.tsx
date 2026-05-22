import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import KanbanBoard from '@/components/kanban/KanbanBoard'
import TaskModal from '@/components/kanban/TaskModal'
import { useColumns } from '@/api/kanban'

export default function KanbanPage() {
  const { t } = useTranslation()
  const { data: columns = [] } = useColumns()
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('kanban.title')}</h1>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          {t('kanban.add_task')}
        </button>
      </div>

      <KanbanBoard />

      {addOpen && (
        <TaskModal
          columns={[...columns].sort((a, b) => a.sort_order - b.sort_order)}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  )
}
