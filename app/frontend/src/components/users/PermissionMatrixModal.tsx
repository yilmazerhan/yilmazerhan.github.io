import { useState, useEffect } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffectivePermissions, useSetPermissions, usePermissions, type User } from '@/api/users'

interface Props {
  user: User
  onClose: () => void
}

type Override = { module: string; action: string; is_allowed: boolean }

export default function PermissionMatrixModal({ user, onClose }: Props) {
  const { t } = useTranslation()
  const { data: savedOverrides, isLoading: loadingOverrides } = usePermissions(user.id)
  const { data: effectivePerms } = useEffectivePermissions(user.id)
  const setPermissions = useSetPermissions(user.id)

  const MODULES = [
    { key: 'worklog', label: t('permissions.module_worklog') },
    { key: 'kanban', label: t('permissions.module_kanban') },
    { key: 'inventory', label: t('permissions.module_inventory') },
    { key: 'user_management', label: t('permissions.module_user_management') },
    { key: 'email_workflows', label: t('permissions.module_email_workflows') },
    { key: 'jira_config', label: t('permissions.module_jira_config') },
    { key: 'ssl_management', label: t('permissions.module_ssl_management') },
    { key: 'branding', label: t('permissions.module_branding') },
  ]

  const ACTIONS = [
    { key: 'view', label: t('permissions.action_view') },
    { key: 'create', label: t('permissions.action_create') },
    { key: 'edit', label: t('permissions.action_edit') },
    { key: 'delete', label: t('permissions.action_delete') },
  ]

  const [overrides, setOverrides] = useState<Map<string, boolean | null>>(new Map())
  const [initialized, setInitialized] = useState(false)
  const [saved, setSaved] = useState(false)

  // Initialize overrides Map from DB data when it loads
  useEffect(() => {
    if (savedOverrides !== undefined && !initialized) {
      const newMap = new Map<string, boolean | null>()
      savedOverrides.forEach((o) => {
        newMap.set(`${o.module}:${o.action}`, o.is_allowed)
      })
      setOverrides(newMap)
      setInitialized(true)
    }
  }, [savedOverrides, initialized])

  const key = (module: string, action: string) => `${module}:${action}`

  const getState = (module: string, action: string): boolean | null => {
    const k = key(module, action)
    return overrides.has(k) ? (overrides.get(k) as boolean | null) : null
  }

  const cycle = (module: string, action: string) => {
    const k = key(module, action)
    const current = overrides.get(k) ?? null
    const next = current === null ? true : current === true ? false : null
    const newMap = new Map(overrides)
    if (next === null) {
      newMap.delete(k)
    } else {
      newMap.set(k, next)
    }
    setOverrides(newMap)
  }

  async function handleSave() {
    const payload: Override[] = []
    overrides.forEach((is_allowed, k) => {
      if (is_allowed !== null) {
        const [module, action] = k.split(':')
        payload.push({ module, action, is_allowed: is_allowed as boolean })
      }
    })
    await setPermissions.mutateAsync(payload)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const cellClass = (state: boolean | null, defaultAllow: boolean) => {
    if (state === true) return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 ring-1 ring-green-400'
    if (state === false) return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 ring-1 ring-red-400'
    return defaultAllow
      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
      : 'bg-gray-50 dark:bg-gray-800 text-gray-400'
  }

  const cellLabel = (state: boolean | null, defaultAllow: boolean) => {
    if (state === true) return t('permissions.cell_grant')
    if (state === false) return t('permissions.cell_deny')
    return defaultAllow ? t('permissions.cell_default_allowed') : t('permissions.cell_default_denied')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-4xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('permissions.edit_title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{user.full_name} · <span className="capitalize">{user.role}</span></p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loadingOverrides ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                {t('permissions.click_cycle_hint')} <span className="text-blue-600">{t('permissions.default_label')}</span> → <span className="text-green-600">{t('permissions.grant_label')}</span> → <span className="text-red-600">{t('permissions.deny_label')}</span> → {t('permissions.default_label')}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left pb-3 text-gray-600 dark:text-gray-400 font-medium">{t('permissions.module_label')}</th>
                      {ACTIONS.map((a) => (
                        <th key={a.key} className="pb-3 text-center text-gray-600 dark:text-gray-400 font-medium px-2">
                          {a.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="space-y-1">
                    {MODULES.map((mod) => (
                      <tr key={mod.key} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-2 pr-4 font-medium text-gray-700 dark:text-gray-300">{mod.label}</td>
                        {ACTIONS.map((act) => {
                          const state = getState(mod.key, act.key)
                          const defaultAllow = effectivePerms?.permissions?.[mod.key]?.[act.key] ?? false
                          return (
                            <td key={act.key} className="py-2 px-2 text-center">
                              {user.role === 'superadmin' ? (
                                <span className="text-xs text-gray-400">{t('permissions.superadmin_note')}</span>
                              ) : (
                                <button
                                  onClick={() => cycle(mod.key, act.key)}
                                  className={`text-xs px-2 py-1 rounded-md font-medium transition-all ${cellClass(state, defaultAllow)}`}
                                  title={`${t('permissions.click_cycle_hint')} ${t('permissions.default_label')} → ${t('permissions.grant_label')} → ${t('permissions.deny_label')}`}
                                >
                                  {cellLabel(state, defaultAllow)}
                                </button>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          {saved && <span className="text-sm text-green-600 dark:text-green-400">{t('permissions.saved')}</span>}
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            {t('common.close')}
          </button>
          {user.role !== 'superadmin' && (
            <button
              onClick={handleSave}
              disabled={setPermissions.isPending || loadingOverrides}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {setPermissions.isPending ? t('common.saving') : t('common.save')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
