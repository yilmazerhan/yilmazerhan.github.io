import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import KanbanBoard from '@/components/kanban/KanbanBoard'
import TaskModal from '@/components/kanban/TaskModal'
import { useColumns } from '@/api/kanban'
import { useTeams } from '@/api/teams'
import { useUsers } from '@/api/users'
import { useAuthStore } from '@/store/authStore'

export default function KanbanPage() {
  const { t } = useTranslation()
  const { data: columns = [] } = useColumns()
  const { user } = useAuthStore()
  const [addOpen, setAddOpen] = useState(false)

  // Superadmin filters
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  const isSuperAdmin = user?.role === 'superadmin'
  const isTeamMember = !isSuperAdmin && !!user?.team_id

  const { data: teamsData } = useTeams({ is_active: true })
  const teams = teamsData?.items ?? []

  // For superadmin: fetch users in the selected team; for team member: fetch own team's users
  const filterTeamId = isSuperAdmin ? selectedTeamId : (user?.team_id ?? '')
  const { data: usersData } = useUsers(
    filterTeamId ? { team_id: filterTeamId, is_active: true } : undefined
  )
  const teamUsers = usersData?.items ?? []

  const [selectedPriority, setSelectedPriority] = useState<string>('')

  // Build task params based on role and filter state
  const taskParams: { team_id?: string; assignee_id?: string; priority?: string } = {}
  if (isSuperAdmin) {
    if (selectedUserId) taskParams.assignee_id = selectedUserId
    else if (selectedTeamId) taskParams.team_id = selectedTeamId
  } else if (isTeamMember && selectedUserId) {
    taskParams.assignee_id = selectedUserId
  }
  if (selectedPriority) taskParams.priority = selectedPriority

  const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const

  function handleTeamChange(teamId: string) {
    setSelectedTeamId(teamId)
    setSelectedUserId('')
  }

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

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
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

        {(selectedTeamId || selectedUserId || selectedPriority) && (
          <button
            onClick={() => { setSelectedTeamId(''); setSelectedUserId(''); setSelectedPriority('') }}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
          >
            {t('common.clear_filters')}
          </button>
        )}
      </div>

      <KanbanBoard taskParams={taskParams} />

      {addOpen && (
        <TaskModal
          columns={[...columns].sort((a, b) => a.sort_order - b.sort_order)}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  )
}
