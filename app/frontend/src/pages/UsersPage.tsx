import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Search, Pencil, Trash2, ShieldCheck, KeyRound, BarChart3, RotateCcw, Skull, UserX, ShieldPlus } from 'lucide-react'
import { useUsers, useDeleteUser, useRestoreUser, useHardDeleteUser, type User } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import UserFormModal from '@/components/users/UserFormModal'
import PermissionMatrixModal from '@/components/users/PermissionMatrixModal'
import BulkPermissionModal from '@/components/users/BulkPermissionModal'
import SetPasswordModal from '@/components/users/SetPasswordModal'
import { Pagination } from '@/components/ui/Pagination'

const LIMIT = 50

export default function UsersPage() {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [page, setPage] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [permUser, setPermUser] = useState<User | null>(null)
  const [setPwUser, setSetPwUser] = useState<User | null>(null)
  const [bulkPermOpen, setBulkPermOpen] = useState(false)

  const isSuperAdmin = currentUser?.role === 'superadmin'

  const { data, isLoading } = useUsers({
    search: search || undefined,
    role: roleFilter || undefined,
    include_deleted: isSuperAdmin && showDeleted ? true : undefined,
    skip: page * LIMIT,
    limit: LIMIT,
  })
  const deleteUser = useDeleteUser()
  const restoreUser = useRestoreUser()
  const hardDeleteUser = useHardDeleteUser()

  function canSetPassword(target: User): boolean {
    if (!currentUser) return false
    if (currentUser.role === 'superadmin') return true
    if (currentUser.role === 'team_manager') {
      return (
        target.team_id !== null &&
        target.team_id === currentUser.team_id &&
        target.role === 'user'
      )
    }
    return false
  }

  async function handleDelete(user: User) {
    if (!confirm(t('common.confirm_delete'))) return
    await deleteUser.mutateAsync(user.id)
  }

  async function handleRestore(user: User) {
    if (!confirm(t('users.confirm_restore'))) return
    await restoreUser.mutateAsync(user.id)
  }

  async function handleHardDelete(user: User) {
    if (!confirm(t('users.confirm_hard_delete'))) return
    await hardDeleteUser.mutateAsync(user.id)
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
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <button
              onClick={() => setBulkPermOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-300 dark:border-gray-600"
            >
              <ShieldPlus className="h-4 w-4" />
              {t('permissions.bulk_button')}
            </button>
          )}
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('users.invite')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(0) }}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">{t('users.role')} — {t('users.role_all')}</option>
          <option value="superadmin">{t('users.role_superadmin')}</option>
          <option value="team_manager">{t('users.role_team_manager')}</option>
          <option value="user">{t('users.role_user')}</option>
        </select>

        {/* Show deleted toggle — superadmin only */}
        {isSuperAdmin && (
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => { setShowDeleted(!showDeleted); setPage(0) }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                showDeleted ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  showDeleted ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <UserX className="h-3.5 w-3.5" />
              {t('users.show_deleted')}
            </span>
          </label>
        )}
      </div>

      {/* Deleted users notice */}
      {showDeleted && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          <UserX className="h-4 w-4 shrink-0" />
          <span>Silinen kullanıcılar kırmızı satırlarla gösterilmektedir. Geri yükleyebilir veya kalıcı olarak silebilirsiniz.</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('auth.full_name')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('auth.username')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('auth.email')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('users.role')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('users.team')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('users.status')}</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">{t('common.loading')}</td></tr>
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">{t('users.not_found')}</td></tr>
            ) : data?.items.map((user) => (
              <tr
                key={user.id}
                className={`border-b border-gray-100 dark:border-gray-800 ${
                  user.is_deleted
                    ? 'bg-red-50/50 dark:bg-red-900/10 opacity-75'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                }`}
              >
                <td className="px-4 py-3 font-medium max-w-[160px] truncate" title={user.full_name}>
                  <span className={user.is_deleted ? 'line-through text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-white'}>
                    {user.full_name}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs">{user.username}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={user.email}>{user.email}</td>
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
                  {user.is_deleted ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      {t('users.deleted')}
                    </span>
                  ) : (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      user.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {user.is_active ? t('users.active') : t('users.inactive')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {user.is_deleted ? (
                      /* Actions for DELETED users */
                      <>
                        <button
                          onClick={() => handleRestore(user)}
                          disabled={restoreUser.isPending}
                          className="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                          title={t('users.restore')}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleHardDelete(user)}
                          disabled={hardDeleteUser.isPending}
                          className="p-1.5 rounded text-gray-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title={t('users.hard_delete')}
                        >
                          <Skull className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      /* Actions for ACTIVE users */
                      <>
                        {(currentUser?.role === 'superadmin' || currentUser?.role === 'team_manager') && (
                          <Link
                            to={`/reports/user/${user.id}`}
                            className="p-1.5 rounded text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                            title={t('activity.title')}
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Link>
                        )}
                        <button
                          onClick={() => setPermUser(user)}
                          className="p-1.5 rounded text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                          title={t('users.permissions')}
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </button>
                        {canSetPassword(user) && (
                          <button
                            onClick={() => setSetPwUser(user)}
                            className="p-1.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            title={t('users.set_password')}
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                        )}
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
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {data && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
            {t('users.user_count', { count: data.total })}
          </div>
        )}
      </div>

      {data && <Pagination page={page} limit={LIMIT} total={data.total} onPageChange={setPage} />}

      {/* Modals */}
      {createOpen && <UserFormModal onClose={() => setCreateOpen(false)} />}
      {editUser && <UserFormModal user={editUser} onClose={() => setEditUser(null)} />}
      {permUser && <PermissionMatrixModal user={permUser} onClose={() => setPermUser(null)} />}
      {setPwUser && <SetPasswordModal user={setPwUser} onClose={() => setSetPwUser(null)} />}
      {bulkPermOpen && <BulkPermissionModal onClose={() => setBulkPermOpen(false)} />}
    </div>
  )
}
