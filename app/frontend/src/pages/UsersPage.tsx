import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Pencil, Trash2, RefreshCw, ShieldCheck } from 'lucide-react'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, type User } from '@/api/users'
import UserFormModal from '@/components/users/UserFormModal'
import PermissionMatrixModal from '@/components/users/PermissionMatrixModal'

export default function UsersPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [permUser, setPermUser] = useState<User | null>(null)

  const { data, isLoading } = useUsers({ search: search || undefined, role: roleFilter || undefined })
  const deleteUser = useDeleteUser()

  async function handleDelete(user: User) {
    if (!confirm(t('common.confirm_delete'))) return
    await deleteUser.mutateAsync(user.id)
  }

  const roleLabel = (role: string) => {
    const map: Record<string, string> = {
      superadmin: t('users.role_superadmin'),
      team_manager: t('users.role_team_manager'),
      user: t('users.role_user'),
    }
    return map[role] || role
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('users.title')}</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('users.invite')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">{t('users.role')} — Tümü</option>
          <option value="superadmin">{t('users.role_superadmin')}</option>
          <option value="team_manager">{t('users.role_team_manager')}</option>
          <option value="user">{t('users.role_user')}</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('auth.full_name')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('auth.email')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('users.role')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('users.team')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('users.status')}</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">{t('common.loading')}</td></tr>
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Kullanıcı bulunamadı.</td></tr>
            ) : data?.items.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{user.full_name}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    user.role === 'superadmin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                    user.role === 'team_manager' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                  }`}>
                    {roleLabel(user.role)}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{user.team?.name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    user.is_active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {user.is_active ? t('users.active') : t('users.inactive')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setPermUser(user)}
                      className="p-1.5 rounded text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                      title="Yetkiler"
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditUser(user)}
                      className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      title={t('common.edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(user)}
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title={t('common.delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
            {data.total} kullanıcı
          </div>
        )}
      </div>

      {/* Modals */}
      {createOpen && <UserFormModal onClose={() => setCreateOpen(false)} />}
      {editUser && <UserFormModal user={editUser} onClose={() => setEditUser(null)} />}
      {permUser && <PermissionMatrixModal user={permUser} onClose={() => setPermUser(null)} />}
    </div>
  )
}
