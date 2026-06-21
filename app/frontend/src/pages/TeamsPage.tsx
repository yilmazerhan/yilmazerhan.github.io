import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Users, ChevronDown, ChevronRight, UserPlus, X, Check } from 'lucide-react'
import {
  useTeams, useTeam, useCreateTeam, useUpdateTeam, useDeleteTeam,
  useAddTeamMember, useRemoveTeamMember, type Team,
} from '@/api/teams'
import { useUsers } from '@/api/users'

interface TeamFormData {
  name: string
  description: string
  manager_id: string
  is_active: boolean
}

const EMPTY_FORM: TeamFormData = { name: '', description: '', manager_id: '', is_active: true }

function MemberRow({ member, teamId }: { member: { id: string; full_name: string; email: string; role: string }; teamId: string }) {
  const { t } = useTranslation()
  const remove = useRemoveTeamMember(teamId)
  return (
    <tr className="bg-blue-50/30 dark:bg-blue-900/10 border-b border-gray-100 dark:border-gray-800">
      <td className="px-4 py-2 pl-14 text-sm text-gray-700 dark:text-gray-300">{member.full_name}</td>
      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{member.email}</td>
      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 capitalize">{member.role}</td>
      <td className="px-4 py-2" />
      <td className="px-4 py-2 text-right">
        <button
          onClick={() => remove.mutate(member.id)}
          disabled={remove.isPending}
          className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
          title={t('teams.remove_member')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

function AddMemberRow({ teamId, existingMemberIds }: { teamId: string; existingMemberIds: string[] }) {
  const { t } = useTranslation()
  const [selectedUserId, setSelectedUserId] = useState('')
  const { data: usersData } = useUsers({ is_active: true, limit: 200 })
  const addMember = useAddTeamMember(teamId)

  const available = (usersData?.items ?? []).filter((u) => !existingMemberIds.includes(u.id))

  async function handleAdd() {
    if (!selectedUserId) return
    try {
      await addMember.mutateAsync(selectedUserId)
      setSelectedUserId('')
    } catch (err: any) {
      alert(err.response?.data?.detail || t('common.error'))
    }
  }

  return (
    <tr className="bg-blue-50/30 dark:bg-blue-900/10 border-b border-gray-100 dark:border-gray-800">
      <td colSpan={4} className="px-4 py-2 pl-14">
        <div className="flex items-center gap-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="flex-1 max-w-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          >
            <option value="">{t('teams.select_user')}</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selectedUserId || addMember.isPending}
            className="flex items-center gap-1 px-3 py-1 bg-primary-500 hover:bg-primary-600 text-white text-xs rounded disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" />
            {t('teams.add_member')}
          </button>
        </div>
      </td>
      <td />
    </tr>
  )
}

function TeamRow({ team, onEdit }: { team: Team; onEdit: (t: Team) => void }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const { data: detail } = useTeam(team.id)
  const deleteTeam = useDeleteTeam()

  const memberIds = detail?.members?.map((m) => m.id) ?? []

  return (
    <>
      <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-2 font-medium text-gray-900 dark:text-white"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {team.name}
            {team.description && (
              <span className="text-xs text-gray-400 font-normal ml-1">— {team.description}</span>
            )}
          </button>
        </td>
        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-sm">
          {team.manager?.full_name || <span className="text-gray-300 dark:text-gray-600 italic">{t('teams.not_assigned')}</span>}
        </td>
        <td className="px-4 py-3">
          <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400 text-sm">
            <Users className="h-3.5 w-3.5" /> {team.member_count}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            team.is_active
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
          }`}>
            {team.is_active ? t('common.active') : t('common.inactive')}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => onEdit(team)}
              className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              title={t('common.edit')}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={async () => {
                if (confirm(t('teams.confirm_delete'))) {
                  await deleteTeam.mutateAsync(team.id)
                }
              }}
              disabled={deleteTeam.isPending}
              className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
              title={t('common.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <>
          {detail?.members?.map((member) => (
            <MemberRow key={member.id} member={member} teamId={team.id} />
          ))}
          <AddMemberRow teamId={team.id} existingMemberIds={memberIds} />
        </>
      )}
    </>
  )
}

function TeamForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial: TeamFormData
  onSave: (data: TeamFormData) => Promise<void>
  onCancel: () => void
  isPending: boolean
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<TeamFormData>(initial)
  const [error, setError] = useState('')
  const { data: usersData } = useUsers({ is_active: true, limit: 200 })

  const managers = (usersData?.items ?? []).filter((u) => u.role === 'team_manager' || u.role === 'superadmin')

  function set(field: keyof TeamFormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError(t('teams.name_required')); return }
    try {
      await onSave(form)
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || t('common.error'))
    }
  }

  const isEdit = !!initial.name

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4"
    >
      <h3 className="font-semibold text-gray-900 dark:text-white">
        {isEdit ? t('teams.edit_title') : t('teams.create_title')}
      </h3>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {t('teams.team_name')} <span className="text-red-500">*</span>
          </label>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('teams.name_placeholder')}
            required
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {t('teams.manager')}
          </label>
          <select
            value={form.manager_id}
            onChange={(e) => set('manager_id', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('teams.manager_placeholder')}</option>
            {managers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role === 'superadmin' ? t('users.role_superadmin') : t('users.role_team_manager')})
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {t('teams.description_label')}
          </label>
          <input
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder={t('teams.description_placeholder')}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {isEdit && (
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set('is_active', e.target.checked)}
                className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{t('common.active')}</span>
            </label>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm rounded-lg disabled:opacity-50 font-medium"
        >
          <Check className="h-4 w-4" />
          {isPending ? t('common.saving') : t('common.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}

export default function TeamsPage() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle')
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)

  const { data, isLoading } = useTeams()
  const createTeam = useCreateTeam()
  const updateTeam = useUpdateTeam(editingTeam?.id ?? '')

  function openCreate() {
    setEditingTeam(null)
    setMode('create')
  }

  function openEdit(team: Team) {
    setEditingTeam(team)
    setMode('edit')
  }

  function handleClose() {
    setMode('idle')
    setEditingTeam(null)
  }

  async function handleCreate(form: TeamFormData) {
    await createTeam.mutateAsync({
      name: form.name,
      description: form.description || undefined,
      manager_id: form.manager_id || undefined,
    })
    handleClose()
  }

  async function handleEdit(form: TeamFormData) {
    await updateTeam.mutateAsync({
      name: form.name,
      description: form.description || undefined,
      manager_id: form.manager_id || undefined,
      is_active: form.is_active,
    })
    handleClose()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('teams.title')}</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> {t('teams.add_team')}
        </button>
      </div>

      {mode === 'create' && (
        <TeamForm
          initial={EMPTY_FORM}
          onSave={handleCreate}
          onCancel={handleClose}
          isPending={createTeam.isPending}
        />
      )}

      {mode === 'edit' && editingTeam && (
        <TeamForm
          initial={{
            name: editingTeam.name,
            description: editingTeam.description ?? '',
            manager_id: editingTeam.manager_id ?? '',
            is_active: editingTeam.is_active,
          }}
          onSave={handleEdit}
          onCancel={handleClose}
          isPending={updateTeam.isPending}
        />
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('teams.team_name')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('teams.manager')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('teams.member_count')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.status')}</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">{t('common.loading')}</td>
              </tr>
            ) : !data?.items.length ? (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">
                  {t('teams.no_teams')}
                </td>
              </tr>
            ) : (
              data.items.map((team) => (
                <TeamRow key={team.id} team={team} onEdit={openEdit} />
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
