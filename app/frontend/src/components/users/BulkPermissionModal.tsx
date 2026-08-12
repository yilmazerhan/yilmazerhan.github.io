import { useState } from 'react'
import { X, ShieldCheck, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBulkApplyPermissions, type BulkCellAction } from '@/api/users'

interface Props {
  onClose: () => void
}

const MODULES = [
  'worklog', 'kanban', 'inventory', 'releases', 'responsibility',
  'user_management', 'email_workflows', 'jira_config', 'ssl_management', 'branding',
]
const ACTIONS = ['view', 'create', 'edit', 'delete']

type Matrix = Record<string, Record<string, BulkCellAction>>

const CYCLE: BulkCellAction[] = ['skip', 'grant', 'deny', 'reset']

function nextAction(current: BulkCellAction): BulkCellAction {
  const idx = CYCLE.indexOf(current)
  return CYCLE[(idx + 1) % CYCLE.length]
}

function cellStyle(action: BulkCellAction): string {
  switch (action) {
    case 'grant': return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 ring-1 ring-green-400'
    case 'deny':  return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 ring-1 ring-red-400'
    case 'reset': return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-blue-400'
    default:      return 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
  }
}

function initMatrix(): Matrix {
  const m: Matrix = {}
  for (const mod of MODULES) {
    m[mod] = {}
    for (const act of ACTIONS) {
      m[mod][act] = 'skip'
    }
  }
  return m
}

export default function BulkPermissionModal({ onClose }: Props) {
  const { t } = useTranslation()
  const [matrix, setMatrix] = useState<Matrix>(initMatrix)
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [done, setDone] = useState<{ affected: number } | null>(null)
  const bulkApply = useBulkApplyPermissions()

  function toggle(mod: string, act: string) {
    setMatrix((prev) => ({
      ...prev,
      [mod]: { ...prev[mod], [act]: nextAction(prev[mod][act]) },
    }))
  }

  function setColumn(act: string, value: BulkCellAction) {
    setMatrix((prev) => {
      const next = { ...prev }
      for (const mod of MODULES) next[mod] = { ...next[mod], [act]: value }
      return next
    })
  }

  function setRow(mod: string, value: BulkCellAction) {
    setMatrix((prev) => ({
      ...prev,
      [mod]: Object.fromEntries(ACTIONS.map((a) => [a, value])) as Record<string, BulkCellAction>,
    }))
  }

  const hasChanges = MODULES.some((m) => ACTIONS.some((a) => matrix[m][a] !== 'skip'))

  async function handleApply() {
    const items = MODULES.flatMap((mod) =>
      ACTIONS.map((act) => ({ module: mod, action: act, cell_action: matrix[mod][act] }))
    ).filter((i) => i.cell_action !== 'skip')

    const result = await bulkApply.mutateAsync({
      items,
      role_filter: roleFilter || null,
    })
    setDone({ affected: result.affected_users })
    setTimeout(() => { setDone(null); onClose() }, 2000)
  }

  const cellLabel = (a: BulkCellAction) => t(`permissions.bulk_cell_${a}`)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-5xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary-500" />
              {t('permissions.bulk_title')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('permissions.bulk_subtitle')}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* Role filter */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
              {t('permissions.bulk_target')}
            </label>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{t('permissions.bulk_role_all')}</option>
              <option value="user">{t('users.role_user')}</option>
              <option value="team_manager">{t('users.role_team_manager')}</option>
            </select>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-xs">
            {CYCLE.map((a) => (
              <span key={a} className={`px-2 py-1 rounded-md font-medium ${cellStyle(a)}`}>
                {cellLabel(a)}
              </span>
            ))}
            <span className="text-gray-400 dark:text-gray-500 self-center ml-1">
              {t('permissions.bulk_cycle_hint')}
            </span>
          </div>

          {/* Matrix */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left pb-3 text-gray-600 dark:text-gray-400 font-medium pr-4">
                    {t('permissions.module_label')}
                  </th>
                  {ACTIONS.map((act) => (
                    <th key={act} className="pb-3 text-center text-gray-600 dark:text-gray-400 font-medium px-2 min-w-[110px]">
                      <div>{t(`permissions.action_${act}`)}</div>
                      {/* Column quick-set */}
                      <div className="flex justify-center gap-1 mt-1">
                        {(['grant', 'deny', 'reset', 'skip'] as BulkCellAction[]).map((v) => (
                          <button
                            key={v}
                            onClick={() => setColumn(act, v)}
                            title={cellLabel(v)}
                            className={`text-[10px] px-1 py-0.5 rounded ${cellStyle(v)} opacity-70 hover:opacity-100`}
                          >
                            {v === 'grant' ? '✓' : v === 'deny' ? '✗' : v === 'reset' ? '↺' : '−'}
                          </button>
                        ))}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((mod) => (
                  <tr key={mod} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-4 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {t(`permissions.module_${mod}`)}
                        {/* Row quick-set */}
                        <div className="flex gap-1 ml-1">
                          {(['grant', 'deny', 'reset', 'skip'] as BulkCellAction[]).map((v) => (
                            <button
                              key={v}
                              onClick={() => setRow(mod, v)}
                              title={cellLabel(v)}
                              className={`text-[10px] px-1 py-0.5 rounded ${cellStyle(v)} opacity-60 hover:opacity-100`}
                            >
                              {v === 'grant' ? '✓' : v === 'deny' ? '✗' : v === 'reset' ? '↺' : '−'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </td>
                    {ACTIONS.map((act) => (
                      <td key={act} className="py-2 px-2 text-center">
                        <button
                          onClick={() => toggle(mod, act)}
                          className={`text-xs px-2 py-1 rounded-md font-medium transition-all w-24 ${cellStyle(matrix[mod][act])}`}
                        >
                          {cellLabel(matrix[mod][act])}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {!hasChanges
              ? t('permissions.bulk_no_changes')
              : t('permissions.bulk_will_apply', {
                  count: MODULES.flatMap((m) => ACTIONS.filter((a) => matrix[m][a] !== 'skip')).length,
                })}
          </p>
          <div className="flex items-center gap-3">
            {done && (
              <span className="text-sm text-green-600 dark:text-green-400">
                {t('permissions.bulk_done', { count: done.affected })}
              </span>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {t('common.close')}
            </button>
            <button
              onClick={handleApply}
              disabled={!hasChanges || bulkApply.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {bulkApply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {t('permissions.bulk_apply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
