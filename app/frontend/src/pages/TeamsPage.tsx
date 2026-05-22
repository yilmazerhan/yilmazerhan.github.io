import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Users, ChevronDown, ChevronRight } from 'lucide-react'
import { useTeams, useTeam, useCreateTeam, useUpdateTeam, useDeleteTeam, type Team } from '@/api/teams'

function TeamRow({ team }: { team: Team }) {
  const [expanded, setExpanded] = useState(false)
  const { data: detail } = useTeam(team.id)
  const deleteTeam = useDeleteTeam()
  const { t } = useTranslation()

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
          </button>
        </td>
        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{team.manager?.full_name || '—'}</td>
        <td className="px-4 py-3">
          <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
            <Users className="h-3.5 w-3.5" /> {team.member_count}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${team.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
            {team.is_active ? t('users.active') : t('users.inactive')}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={async () => {
              if (confirm(t('common.confirm_delete'))) await deleteTeam.mutateAsync(team.id)
            }}
            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </td>
      </tr>
      {expanded && detail?.members?.map((member) => (
        <tr key={member.id} className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800">
          <td className="px-4 py-2 pl-12 text-sm text-gray-700 dark:text-gray-300">{member.full_name}</td>
          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{member.email}</td>
          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 capitalize">{member.role}</td>
          <td colSpan={2} />
        </tr>
      ))}
    </>
  )
}

export default function TeamsPage() {
  const { t } = useTranslation()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [error, setError] = useState('')

  const { data, isLoading } = useTeams()
  const createTeam = useCreateTeam()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await createTeam.mutateAsync({ name: newName, description: newDesc || undefined })
      setNewName('')
      setNewDesc('')
      setShowCreate(false)
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.teams')}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Takım Ekle
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
          <h3 className="font-medium text-gray-900 dark:text-white">Yeni Takım</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Takım adı *"
              required
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Açıklama"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createTeam.isPending} className="px-4 py-2 bg-primary-500 text-white text-sm rounded-lg disabled:opacity-50">
              {createTeam.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-700 dark:text-gray-300 text-sm rounded-lg border border-gray-300 dark:border-gray-700">
              İptal
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Takım Adı</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Yönetici</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Üye</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Durum</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">{t('common.loading')}</td></tr>
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Takım bulunamadı.</td></tr>
            ) : data?.items.map((team) => <TeamRow key={team.id} team={team} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
