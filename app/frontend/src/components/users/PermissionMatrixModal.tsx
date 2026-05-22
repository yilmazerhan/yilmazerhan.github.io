import { useState, useEffect } from 'react'
import { X, Save } from 'lucide-react'
import { useEffectivePermissions, useSetPermissions, type User } from '@/api/users'

const MODULES = [
  { key: 'worklog', label: 'İş Günlüğü' },
  { key: 'kanban', label: 'Kanban' },
  { key: 'user_management', label: 'Kullanıcı Yönetimi' },
  { key: 'email_workflows', label: 'Email Workflow' },
  { key: 'jira_config', label: 'Jira Yapılandırması' },
  { key: 'ssl_management', label: 'SSL Yönetimi' },
  { key: 'branding', label: 'Marka Ayarları' },
]

const ACTIONS = [
  { key: 'view', label: 'Görüntüle' },
  { key: 'create', label: 'Oluştur' },
  { key: 'edit', label: 'Düzenle' },
  { key: 'delete', label: 'Sil' },
]

interface Props {
  user: User
  onClose: () => void
}

type Override = { module: string; action: string; is_allowed: boolean }

export default function PermissionMatrixModal({ user, onClose }: Props) {
  const { data: effectivePerms } = useEffectivePermissions(user.id)
  const setPermissions = useSetPermissions(user.id)

  // Local overrides state: null = inherit role default, true = grant, false = deny
  const [overrides, setOverrides] = useState<Map<string, boolean | null>>(new Map())
  const [saved, setSaved] = useState(false)

  const key = (module: string, action: string) => `${module}:${action}`

  const getState = (module: string, action: string): boolean | null => {
    const k = key(module, action)
    return overrides.has(k) ? overrides.get(k)! : null
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
      const [module, action] = k.split(':')
      payload.push({ module, action, is_allowed })
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
    if (state === true) return '✓ Ver'
    if (state === false) return '✗ Reddet'
    return defaultAllow ? '○ Varsayılan (İzinli)' : '○ Varsayılan (Yok)'
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-4xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Yetki Düzenle</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{user.full_name} · <span className="capitalize">{user.role}</span></p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Hücreye tıklayarak: <span className="text-blue-600">Varsayılan</span> → <span className="text-green-600">Ver</span> → <span className="text-red-600">Reddet</span> → Varsayılan
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left pb-3 text-gray-600 dark:text-gray-400 font-medium">Modül</th>
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
                            <span className="text-xs text-gray-400">Süper Admin</span>
                          ) : (
                            <button
                              onClick={() => cycle(mod.key, act.key)}
                              className={`text-xs px-2 py-1 rounded-md font-medium transition-all ${cellClass(state, defaultAllow)}`}
                              title="Tıkla: Varsayılan → Ver → Reddet"
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
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          {saved && <span className="text-sm text-green-600 dark:text-green-400">Kaydedildi!</span>}
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            Kapat
          </button>
          {user.role !== 'superadmin' && (
            <button
              onClick={handleSave}
              disabled={setPermissions.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {setPermissions.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
