import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck } from 'lucide-react'
import { useUsers, type User } from '@/api/users'
import PermissionMatrixModal from '@/components/users/PermissionMatrixModal'

const ROLE_BADGE: Record<string, string> = {
  superadmin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  team_manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  user: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export default function PermissionsPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const { data, isLoading } = useUsers({ limit: 200 })
  const users = (data?.items ?? []).filter((u) =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.permissions')}</h1>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('common.search')}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      />

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.name')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('users.role')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('users.team')}</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">{t('common.loading')}</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">{t('users.not_found')}</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 dark:text-white">{u.full_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[u.role] ?? ''}`}>
                    {t(`users.role_${u.role}`)}
                  </span>
                  {u.role === 'superadmin' && (
                    <span className="ml-1 text-xs text-gray-400">— {t('permissions.superadmin_note')}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {u.team?.name ?? <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setSelectedUser(u)}
                    className="flex items-center gap-1.5 ml-auto px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                    disabled={u.role === 'superadmin'}
                    title={u.role === 'superadmin' ? t('permissions.superadmin_note') : t('users.permissions')}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t('users.permissions')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {selectedUser && (
        <PermissionMatrixModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  )
}
