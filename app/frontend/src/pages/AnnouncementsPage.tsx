import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, Megaphone, ToggleLeft, ToggleRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import {
  useAllAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  type Announcement,
} from '@/api/announcements'
import { useTeams } from '@/api/teams'
import { useUsers } from '@/api/users'

const TYPE_COLORS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
}

export default function AnnouncementsPage() {
  const { t } = useTranslation()
  const { data: announcements = [], isLoading } = useAllAnnouncements()
  const { data: teamsData } = useTeams()
  const { data: usersData } = useUsers({ limit: 200 })
  const teams = teamsData?.items ?? []
  const users = usersData?.items ?? []

  const createAnn = useCreateAnnouncement()
  const updateAnn = useUpdateAnnouncement()
  const deleteAnn = useDeleteAnnouncement()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [langTab, setLangTab] = useState<'tr' | 'en'>('tr')

  // Form state
  const [titleTr, setTitleTr] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [messageTr, setMessageTr] = useState('')
  const [messageEn, setMessageEn] = useState('')
  const [type, setType] = useState('info')
  const [targetType, setTargetType] = useState('all')
  const [selectedTeams, setSelectedTeams] = useState<string[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [error, setError] = useState('')

  function toLocalDatetime(iso: string) {
    try {
      const d = parseISO(iso)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    } catch {
      return ''
    }
  }

  function openCreate() {
    setEditing(null); setLangTab('tr')
    setTitleTr(''); setTitleEn(''); setMessageTr(''); setMessageEn('')
    setType('info'); setTargetType('all')
    setSelectedTeams([]); setSelectedUsers([])
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    setStartsAt(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`)
    setEndsAt(''); setIsActive(true); setError('')
    setShowForm(true)
  }

  function openEdit(ann: Announcement) {
    setEditing(ann); setLangTab('tr')
    setTitleTr(ann.title); setTitleEn(ann.title_en ?? '')
    setMessageTr(ann.message); setMessageEn(ann.message_en ?? '')
    setType(ann.type); setTargetType(ann.target_type)
    if (ann.target_type === 'specific_teams') setSelectedTeams(ann.target_ids ?? [])
    else if (ann.target_type === 'specific_users') setSelectedUsers(ann.target_ids ?? [])
    else { setSelectedTeams([]); setSelectedUsers([]) }
    setStartsAt(toLocalDatetime(ann.starts_at))
    setEndsAt(ann.ends_at ? toLocalDatetime(ann.ends_at) : '')
    setIsActive(ann.is_active); setError('')
    setShowForm(true)
  }

  function toggleMulti(id: string, list: string[], setter: (v: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!titleTr.trim() || !messageTr.trim()) {
      setLangTab('tr')
      setError(t('announcements.tr_required'))
      return
    }
    if (!startsAt) { setError(t('announcements.starts_at_required')); return }

    let target_ids: string[] | null = null
    if (targetType === 'specific_teams') target_ids = selectedTeams
    else if (targetType === 'specific_users') target_ids = selectedUsers

    const payload = {
      title: titleTr.trim(),
      title_en: titleEn.trim() || null,
      message: messageTr.trim(),
      message_en: messageEn.trim() || null,
      type,
      target_type: targetType,
      target_ids,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      is_active: isActive,
    }

    try {
      if (editing) await updateAnn.mutateAsync({ id: editing.id, ...payload })
      else await createAnn.mutateAsync(payload)
      setShowForm(false)
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await deleteAnn.mutateAsync(id)
  }

  async function handleToggle(ann: Announcement) {
    await updateAnn.mutateAsync({ id: ann.id, is_active: !ann.is_active })
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary-500" />
          {t('announcements.title')}
        </h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> {t('announcements.add')}
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : announcements.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-10 text-center">
          <Megaphone className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">{t('announcements.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => {
            const now = new Date()
            const starts = new Date(ann.starts_at)
            const ends = ann.ends_at ? new Date(ann.ends_at) : null
            const live = ann.is_active && starts <= now && (!ends || ends > now)
            return (
              <div key={ann.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white">{ann.title}</span>
                      {ann.title_en && (
                        <span className="text-xs text-gray-400">/ {ann.title_en}</span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[ann.type] ?? ''}`}>
                        {t(`announcements.type_${ann.type}`)}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${live ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                        {live ? t('announcements.live') : ann.is_active ? t('announcements.scheduled') : t('common.inactive')}
                      </span>
                      {ann.title_en && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                          TR + EN
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{ann.message}</p>
                    {ann.message_en && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-1 italic">{ann.message_en}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-400">
                      <span>{t('announcements.target')}: {t(`announcements.target_${ann.target_type}`)}</span>
                      <span>{t('announcements.starts_at')}: {format(parseISO(ann.starts_at), 'dd MMM yyyy HH:mm')}</span>
                      {ann.ends_at && <span>{t('announcements.ends_at')}: {format(parseISO(ann.ends_at), 'dd MMM yyyy HH:mm')}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleToggle(ann)} className="p-1.5 rounded text-gray-400 hover:text-primary-500" title={ann.is_active ? t('common.deactivate') : t('common.activate')}>
                      {ann.is_active ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button onClick={() => openEdit(ann)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(ann.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? t('announcements.edit') : t('announcements.add')}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>}

              {/* Language tabs */}
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLangTab('tr')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${langTab === 'tr' ? 'bg-primary-500 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  🇹🇷 Türkçe <span className="text-xs opacity-75">({t('announcements.lang_required')})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLangTab('en')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${langTab === 'en' ? 'bg-primary-500 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  🇬🇧 English <span className="text-xs opacity-75">({t('announcements.lang_optional')})</span>
                </button>
              </div>

              {/* TR fields */}
              {langTab === 'tr' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('announcements.form_title')} (TR) *</label>
                    <input value={titleTr} onChange={(e) => setTitleTr(e.target.value)} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('announcements.form_message')} (TR) *</label>
                    <textarea rows={3} value={messageTr} onChange={(e) => setMessageTr(e.target.value)} className={`${inputClass} resize-none`} />
                  </div>
                </>
              )}

              {/* EN fields */}
              {langTab === 'en' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('announcements.form_title')} (EN)</label>
                    <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder={t('announcements.en_placeholder_title')} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('announcements.form_message')} (EN)</label>
                    <textarea rows={3} value={messageEn} onChange={(e) => setMessageEn(e.target.value)} placeholder={t('announcements.en_placeholder_message')} className={`${inputClass} resize-none`} />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('announcements.form_type')}</label>
                <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
                  {(['info', 'warning', 'error', 'success'] as const).map((v) => (
                    <option key={v} value={v}>{t(`announcements.type_${v}`)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('announcements.form_target')}</label>
                <select value={targetType} onChange={(e) => { setTargetType(e.target.value); setSelectedTeams([]); setSelectedUsers([]) }} className={inputClass}>
                  <option value="all">{t('announcements.target_all')}</option>
                  <option value="specific_teams">{t('announcements.target_specific_teams')}</option>
                  <option value="specific_users">{t('announcements.target_specific_users')}</option>
                </select>
              </div>

              {targetType === 'specific_teams' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('announcements.select_teams')}</label>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                    {teams.map((team) => (
                      <label key={team.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                        <input type="checkbox" checked={selectedTeams.includes(team.id)} onChange={() => toggleMulti(team.id, selectedTeams, setSelectedTeams)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
                        <span className="text-sm text-gray-900 dark:text-white">{team.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {targetType === 'specific_users' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('announcements.select_users')}</label>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                    {users.filter((u) => u.is_active && !u.is_deleted).map((user) => (
                      <label key={user.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                        <input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={() => toggleMulti(user.id, selectedUsers, setSelectedUsers)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
                        <span className="text-sm text-gray-900 dark:text-white">{user.full_name}</span>
                        <span className="text-xs text-gray-400">{user.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('announcements.starts_at')} *</label>
                  <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('announcements.ends_at')}</label>
                  <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="ann-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
                <label htmlFor="ann-active" className="text-sm text-gray-700 dark:text-gray-300">{t('announcements.form_active')}</label>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={createAnn.isPending || updateAnn.isPending} className="flex-1 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-60">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
