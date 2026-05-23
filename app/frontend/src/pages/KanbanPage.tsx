import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, CheckSquare, X } from 'lucide-react'
import KanbanBoard from '@/components/kanban/KanbanBoard'
import TaskModal from '@/components/kanban/TaskModal'
import { useColumns, useBulkUpdateTasks } from '@/api/kanban'
import { useTeams } from '@/api/teams'
import { useUsers } from '@/api/users'
import { useAuthStore } from '@/store/authStore'

export default function KanbanPage() {
  const { t } = useTranslation()
  const { data: columns = [] } = useColumns()
  const { user } = useAuthStore()
  const [addOpen, setAddOpen] = useState(false)

  // Filters
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [selectedPriority, setSelectedPriority] = useState<string>('')
  const [searchText, setSearchText] = useState<string>('')

  // Bulk selection
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const bulkUpdate = useBulkUpdateTasks()

  const isSuperAdmin = user?.role === 'superadmin'
  const isTeamMember = !isSuperAdmin && !!user?.team_id

  const { data: teamsData } = useTeams({ is_active: true })
  const teams = teamsData?.items ?? []

  const filterTeamId = isSuperAdmin ? selectedTeamId : (user?.team_id ?? '')
  const { data: usersData } = useUsers(
    filterTeamId ? { team_id: filterTeamId, is_active: true } : undefined
  )
  const teamUsers = usersData?.items ?? []

  // Build task params
  const taskParams: { team_id?: string; assignee_id?: string; priority?: string; search?: string } = {}
  if (isSuperAdmin) {
    if (selectedUserId) taskParams.assignee_id = selectedUserId
    else if (selectedTeamId) taskParams.team_id = selectedTeamId
  } else if (isTeamMember && selectedUserId) {
    taskParams.assignee_id = selectedUserId
  }
  if (selectedPriority) taskParams.priority = selectedPriority
  if (searchText.trim()) taskParams.search = searchText.trim()

  const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const

  function handleTeamChange(teamId: string) {
    setSelectedTeamId(teamId)
    setSelectedUserId('')
  }

  function clearSelection() {
    setSelectedTaskIds(new Set())
    setSelectionMode(false)
  }

  async function handleBulkMove(columnId: string) {
    if (selectedTaskIds.size === 0) return
    await bulkUpdate.mutateAsync({ task_ids: [...selectedTaskIds], column_id: columnId })
    clearSelection()
  }

  async function handleBulkArchive() {
    if (selectedTaskIds.size === 0) return
    await bulkUpdate.mutateAsync({ task_ids: [...selectedTaskIds], is_archived: true })
    clearSelection()
  }

  const hasFilters = selectedTeamId || selectedUserId || selectedPriority || searchText

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('kanban.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSelectionMode(!selectionMode); if (selectionMode) clearSelection() }}
            title={t('kanban.selection_mode')}
            className={`p-2 rounded-lg border text-sm ${selectionMode ? 'bg-primary-500 border-primary-500 text-white' : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            <CheckSquare className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            {t('kanban.add_task')}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t('kanban.search_tasks')}
            className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 w-44"
          />
        </div>

        {isSuperAdmin && (
          <select
            value={selectedTeamId}
            onChange={(e) => handleTeamChange(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            <option value="">{t('kanban.filter_all_teams')}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        )}

        {(isSuperAdmin || isTeamMember) && teamUsers.length > 0 && (
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            <option value="">{t('kanban.filter_all_users')}</option>
            {teamUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        )}

        <select
          value={selectedPriority}
          onChange={(e) => setSelectedPriority(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
        >
          <option value="">{t('kanban.filter_all_priorities')}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{t(`kanban.priority_${p}`)}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => { setSelectedTeamId(''); setSelectedUserId(''); setSelectedPriority(''); setSearchText('') }}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
          >
            {t('common.clear_filters')}
          </button>
        )}
      </div>

      <KanbanBoard
        taskParams={taskParams}
        selectionMode={selectionMode}
        selectedTaskIds={selectedTaskIds}
        onToggleSelect={(id) => setSelectedTaskIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })}
      />

      {/* Bulk actions bar */}
      {selectedTaskIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-gray-100 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 z-50">
          <span className="text-sm text-white dark:text-gray-900 font-medium">
            {selectedTaskIds.size} {t('kanban.selected')}
          </span>
          <div className="h-4 w-px bg-gray-600 dark:bg-gray-400" />
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) handleBulkMove(e.target.value); e.currentTarget.value = '' }}
            className="text-sm bg-gray-800 dark:bg-white text-white dark:text-gray-900 border border-gray-600 dark:border-gray-300 rounded px-2 py-1"
          >
            <option value="">{t('kanban.bulk_move_to')}</option>
            {[...columns].sort((a, b) => a.sort_order - b.sort_order).map((col) => (
              <option key={col.id} value={col.id}>{col.name}</option>
            ))}
          </select>
          <button
            onClick={handleBulkArchive}
            className="text-sm text-amber-300 dark:text-amber-700 hover:underline"
          >
            {t('kanban.bulk_archive')}
          </button>
          <div className="h-4 w-px bg-gray-600 dark:bg-gray-400" />
          <button onClick={clearSelection} className="text-gray-400 hover:text-white dark:hover:text-gray-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {addOpen && (
        <TaskModal
          columns={[...columns].sort((a, b) => a.sort_order - b.sort_order)}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  )
}
