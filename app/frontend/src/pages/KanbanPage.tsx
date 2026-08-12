import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { Plus, Search, CheckSquare, X, ChevronLeft, Tag, ExternalLink } from 'lucide-react'
import KanbanBoard from '@/components/kanban/KanbanBoard'
import TaskModal from '@/components/kanban/TaskModal'
import { useColumns, useBulkUpdateTasks, useBoard, useLabels, useBoards } from '@/api/kanban'
import { useTeams } from '@/api/teams'
import { useUsers } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import { resolveName } from '@/utils/i18nName'
import ExportButton from '@/components/ui/ExportButton'
import { exportTasks } from '@/api/export'

export default function KanbanPage() {
  const { t } = useTranslation()
  const { boardId } = useParams<{ boardId: string }>()
  const { data: board } = useBoard(boardId)
  const { data: columns = [] } = useColumns(boardId)
  const { user } = useAuthStore()
  const [addOpen, setAddOpen] = useState(false)

  // Filters
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  const [selectedPriority, setSelectedPriority] = useState<string>('')
  const [searchText, setSearchText] = useState<string>('')
  const [selectedLabelId, setSelectedLabelId] = useState<string>('')

  const { data: labels = [] } = useLabels()

  // Bulk selection
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const bulkUpdate = useBulkUpdateTasks()

  const isSuperAdmin = user?.role === 'superadmin'
  const isTeamManager = user?.role === 'team_manager'
  const canFilterUsers = isSuperAdmin || isTeamManager

  // Only superadmin needs the team dropdown
  const { data: teamsData } = useTeams({ is_active: true }, isSuperAdmin)
  const teams = teamsData?.items ?? []

  // Superadmin: filter users by selected team; team_manager: backend scopes automatically
  const { data: usersData } = useUsers(
    canFilterUsers
      ? (isSuperAdmin && selectedTeamId ? { team_id: selectedTeamId, is_active: true } : { is_active: true })
      : undefined,
    canFilterUsers,
  )
  const teamUsers = usersData?.items ?? []

  // When superadmin/manager selects a user, find their personal board so we can link to it
  const shouldFetchPersonalBoard = canFilterUsers && !!selectedUserId
  const { data: selectedUserBoards = [] } = useBoards(
    { personal_owner_id: selectedUserId },
    shouldFetchPersonalBoard,
  )
  const selectedUserPersonalBoard = shouldFetchPersonalBoard
    ? selectedUserBoards.find((b) => b.is_personal && b.created_by === selectedUserId)
    : undefined
  // Don't show the link if we're already on that personal board
  const showPersonalBoardLink = selectedUserPersonalBoard && selectedUserPersonalBoard.id !== boardId

  // Build task params — always include board_id to scope to this board
  const taskParams: { team_id?: string; assignee_id?: string; priority?: string; search?: string; board_id?: string; label_id?: string } = {}
  if (boardId) taskParams.board_id = boardId
  if (isSuperAdmin) {
    if (selectedUserId) taskParams.assignee_id = selectedUserId
    else if (selectedTeamId) taskParams.team_id = selectedTeamId
  } else if (isTeamManager && selectedUserId) {
    taskParams.assignee_id = selectedUserId
  }
  if (selectedPriority) taskParams.priority = selectedPriority
  if (searchText.trim()) taskParams.search = searchText.trim()
  if (selectedLabelId) taskParams.label_id = selectedLabelId

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
    try {
      await bulkUpdate.mutateAsync({ task_ids: [...selectedTaskIds], column_id: columnId })
      clearSelection()
    } catch (err: any) { alert(err.response?.data?.detail || t('common.error')) }
  }

  async function handleBulkArchive() {
    if (selectedTaskIds.size === 0) return
    try {
      await bulkUpdate.mutateAsync({ task_ids: [...selectedTaskIds], is_archived: true })
      clearSelection()
    } catch (err: any) { alert(err.response?.data?.detail || t('common.error')) }
  }

  const hasFilters = selectedTeamId || selectedUserId || selectedPriority || searchText || selectedLabelId

  // Banner: show when viewing another user's personal board
  const isViewingOthersPersonalBoard =
    board?.is_personal && board.created_by && board.created_by !== user?.id
  const boardOwnerName = isViewingOthersPersonalBoard
    ? (teamUsers.find((u) => u.id === board.created_by)?.full_name ?? null)
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/kanban"
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('kanban.boards_title')}
          </Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {board ? (
              <span className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: board.color }}
                />
                {board.name}
              </span>
            ) : t('kanban.title')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            onExport={(fmt) => exportTasks({
              board_id: boardId,
              assignee_id: selectedUserId || undefined,
              priority: selectedPriority || undefined,
              format: fmt,
            })}
          />
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

      {/* Banner: viewing another user's personal board */}
      {boardOwnerName && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 text-sm text-violet-700 dark:text-violet-300">
          <ExternalLink className="h-4 w-4 flex-shrink-0" />
          <span>{t('kanban.viewing_personal_board_of', { name: boardOwnerName })}</span>
        </div>
      )}

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

        {canFilterUsers && teamUsers.length > 0 && (
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

        {showPersonalBoardLink && (
          <Link
            to={`/kanban/${selectedUserPersonalBoard.id}`}
            title={t('kanban.view_personal_board_tooltip')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-800/30 font-medium"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('kanban.view_personal_board', {
              name: teamUsers.find((u) => u.id === selectedUserId)?.full_name ?? '',
            })}
          </Link>
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

        {/* Label filter */}
        {labels.length > 0 && (
          <div className="flex items-center gap-1">
            <Tag className="h-3.5 w-3.5 text-gray-400" />
            <select
              value={selectedLabelId}
              onChange={(e) => setSelectedLabelId(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
            >
              <option value="">{t('kanban.filter_all_labels')}</option>
              {labels.map((label) => (
                <option key={label.id} value={label.id}>{label.name}</option>
              ))}
            </select>
          </div>
        )}

        {hasFilters && (
          <button
            onClick={() => { setSelectedTeamId(''); setSelectedUserId(''); setSelectedPriority(''); setSearchText(''); setSelectedLabelId('') }}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
          >
            {t('common.clear_filters')}
          </button>
        )}
      </div>

      <KanbanBoard
        taskParams={taskParams}
        columns={columns}
        selectionMode={selectionMode}
        selectedTaskIds={selectedTaskIds}
        onToggleSelect={(id) => setSelectedTaskIds((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })}
        isPersonalBoard={board?.is_personal}
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
              <option key={col.id} value={col.id}>{resolveName(t, col.name, col.name_key)}</option>
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
          isPersonalBoard={board?.is_personal}
        />
      )}
    </div>
  )
}
