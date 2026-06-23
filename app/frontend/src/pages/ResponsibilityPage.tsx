import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Pencil, Trash2, Loader2, Search, X, Users, Package,
  ChevronDown, ChevronUp, UserPlus,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useUsers } from '@/api/users'
import {
  useResponsibilityGroups,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useAddMember,
  useUpdateMember,
  useRemoveMember,
  type ResponsibilityGroup,
  type ResponsibilityMember,
  type GroupCreate,
  type GroupUpdate,
  type MemberCreate,
  type MemberUpdate,
} from '@/api/responsibility'

const COLOR_PALETTE = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#f97316',
  '#06b6d4',
  '#64748b',
]

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ─── Module tag input ─────────────────────────────────────────────────────────

function ModuleTagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addModule() {
    const trimmed = input.trim().replace(/,$/, '')
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addModule()
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div
      className="min-h-[80px] border border-gray-300 dark:border-gray-600 rounded-lg p-2.5 flex flex-wrap gap-1.5 cursor-text focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500 transition-shadow"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((mod) => (
        <span
          key={mod}
          className="flex items-center gap-1 px-2.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full text-xs font-medium"
        >
          {mod}
          <button
            type="button"
            onClick={() => onChange(value.filter((m) => m !== mod))}
            className="text-primary-400 hover:text-primary-600 leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addModule}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[180px] outline-none bg-transparent text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400"
      />
    </div>
  )
}

// ─── Group modal ──────────────────────────────────────────────────────────────

function GroupModal({
  isOpen,
  onClose,
  initial,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  initial: ResponsibilityGroup | null
  onSave: (data: GroupCreate | GroupUpdate) => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [displayOrder, setDisplayOrder] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setName(initial?.name ?? '')
      setDescription(initial?.description ?? '')
      setColor(initial?.color ?? '#6366f1')
      setDisplayOrder(initial?.display_order ?? 0)
    }
  }, [isOpen, initial])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        color,
        display_order: displayOrder,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {initial ? t('responsibility.edit_group') : t('responsibility.add_group')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('responsibility.group_name')} <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('responsibility.group_description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none transition-shadow"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('responsibility.group_color')}
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-8 h-8 rounded-full transition-all hover:scale-110 ${
                    color === c
                      ? 'ring-2 ring-offset-2 ring-gray-500 dark:ring-offset-gray-900 scale-110'
                      : ''
                  }`}
                />
              ))}
              <div
                className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center"
                style={{ backgroundColor: COLOR_PALETTE.includes(color) ? 'transparent' : color }}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('responsibility.group_order')}
            </label>
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(Number(e.target.value))}
              min={0}
              className="w-24 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-shadow"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              {t('responsibility.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('responsibility.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Member modal ─────────────────────────────────────────────────────────────

function MemberModal({
  isOpen,
  onClose,
  initial,
  existingUserIds,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  initial: ResponsibilityMember | null
  existingUserIds: string[]
  onSave: (data: MemberCreate | MemberUpdate) => Promise<void>
}) {
  const { t } = useTranslation()
  const [userId, setUserId] = useState('')
  const [modules, setModules] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const { data: usersData, isLoading: usersLoading } = useUsers(
    { limit: 200 },
    isOpen && !initial,
  )
  const availableUsers = (usersData?.items ?? []).filter(
    (u) => !u.is_deleted && (!existingUserIds.includes(u.id) || u.id === initial?.user.id),
  )

  useEffect(() => {
    if (isOpen) {
      setUserId(initial?.user.id ?? '')
      setModules(initial?.modules ?? [])
    }
  }, [isOpen, initial])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (initial) {
        await onSave({ modules } as MemberUpdate)
      } else {
        await onSave({ user_id: userId, modules } as MemberCreate)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {initial ? t('responsibility.edit_member') : t('responsibility.add_member')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {initial ? (
            <div className="flex items-center gap-3 py-1">
              <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 text-sm font-semibold">
                {getInitials(initial.user.full_name)}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {initial.user.full_name}
                </div>
                <div className="text-xs text-gray-500">{initial.user.email}</div>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('responsibility.user')} <span className="text-red-500">*</span>
              </label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                required
                disabled={usersLoading}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 outline-none transition-shadow disabled:opacity-60"
              >
                <option value="">
                  {usersLoading ? t('common.loading') : t('responsibility.select_user')}
                </option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('responsibility.modules')}
            </label>
            <ModuleTagInput
              value={modules}
              onChange={setModules}
              placeholder={t('responsibility.module_placeholder')}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              {t('responsibility.module_hint')}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              {t('responsibility.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || (!initial && !userId)}
              className="px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('responsibility.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({
  member,
  groupColor,
  isSuperadmin,
  onEdit,
  onRemove,
  moduleFilter,
}: {
  member: ResponsibilityMember
  groupColor: string
  isSuperadmin: boolean
  onEdit: () => void
  onRemove: () => void
  moduleFilter: string
}) {
  const { t } = useTranslation()
  const initials = getInitials(member.user.full_name)

  const highlightedModules = moduleFilter
    ? member.modules.filter((m) => m.toLowerCase().includes(moduleFilter.toLowerCase()))
    : member.modules

  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
        style={{ backgroundColor: groupColor }}
      >
        {initials}
      </div>
      <div className="min-w-0 w-44 flex-shrink-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {member.user.full_name}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.user.email}</div>
      </div>
      <div className="flex-1 flex flex-wrap gap-1.5">
        {member.modules.length === 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-600 italic">
            {t('responsibility.no_modules')}
          </span>
        )}
        {(moduleFilter ? highlightedModules : member.modules).map((mod) => (
          <span
            key={mod}
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all"
            style={{
              borderColor: `${groupColor}60`,
              color: groupColor,
              backgroundColor: `${groupColor}12`,
            }}
          >
            {mod}
          </span>
        ))}
        {moduleFilter && member.modules.length > highlightedModules.length && (
          <span className="text-xs text-gray-400 italic">
            +{member.modules.length - highlightedModules.length} daha
          </span>
        )}
      </div>
      {isSuperadmin && (
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-blue-500 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({
  group,
  isSuperadmin,
  userFilter,
  moduleFilter,
  onEditGroup,
  onDeleteGroup,
  onAddMember,
  onEditMember,
  onRemoveMember,
}: {
  group: ResponsibilityGroup
  isSuperadmin: boolean
  userFilter: string
  moduleFilter: string
  onEditGroup: () => void
  onDeleteGroup: () => void
  onAddMember: () => void
  onEditMember: (member: ResponsibilityMember) => void
  onRemoveMember: (memberId: string) => void
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)

  const filteredMembers = group.members.filter((m) => {
    const nameMatch =
      !userFilter || m.user.full_name.toLowerCase().includes(userFilter.toLowerCase())
    const moduleMatch =
      !moduleFilter ||
      m.modules.some((mod) => mod.toLowerCase().includes(moduleFilter.toLowerCase()))
    return nameMatch && moduleMatch
  })

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Group header */}
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{
          background: `linear-gradient(135deg, ${group.color}18 0%, ${group.color}08 100%)`,
          borderLeft: `4px solid ${group.color}`,
        }}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
            style={{ backgroundColor: group.color }}
          >
            <Users className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-semibold text-gray-900 dark:text-white truncate">
                {group.name}
              </span>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full text-white flex-shrink-0"
                style={{ backgroundColor: group.color }}
              >
                {filteredMembers.length}{' '}
                {filteredMembers.length === 1
                  ? t('responsibility.member_singular')
                  : t('responsibility.member_plural')}
              </span>
            </div>
            {group.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {group.description}
              </p>
            )}
          </div>
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
          )}
        </button>
        {isSuperadmin && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onAddMember}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors text-white hover:opacity-90"
              style={{ backgroundColor: group.color }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {t('responsibility.add_member')}
            </button>
            <button
              onClick={onEditGroup}
              className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-white/60 dark:hover:bg-gray-700/60 transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={onDeleteGroup}
              className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-white/60 dark:hover:bg-gray-700/60 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Members */}
      {!collapsed && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {filteredMembers.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-gray-400 dark:text-gray-600">
              <Users className="h-8 w-8 opacity-50" />
              <p className="text-sm">
                {userFilter || moduleFilter
                  ? t('responsibility.no_results')
                  : t('responsibility.no_members')}
              </p>
            </div>
          ) : (
            filteredMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                groupColor={group.color}
                isSuperadmin={isSuperadmin}
                onEdit={() => onEditMember(member)}
                onRemove={() => onRemoveMember(member.id)}
                moduleFilter={moduleFilter}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ResponsibilityPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isSuperadmin = user?.role === 'superadmin'

  const [userFilter, setUserFilter] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')

  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ResponsibilityGroup | null>(null)

  const [memberModalOpen, setMemberModalOpen] = useState(false)
  const [memberGroupId, setMemberGroupId] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<{
    member: ResponsibilityMember
    groupId: string
  } | null>(null)

  const { data: groups = [], isLoading } = useResponsibilityGroups()

  const createGroup = useCreateGroup()
  const updateGroup = useUpdateGroup()
  const deleteGroup = useDeleteGroup()
  const addMember = useAddMember()
  const updateMember = useUpdateMember()
  const removeMember = useRemoveMember()

  const visibleGroups = groups
    .filter((g) => {
      if (!userFilter && !moduleFilter) return true
      return g.members.some((m) => {
        const nameMatch = !userFilter || m.user.full_name.toLowerCase().includes(userFilter.toLowerCase())
        const moduleMatch =
          !moduleFilter ||
          m.modules.some((mod) => mod.toLowerCase().includes(moduleFilter.toLowerCase()))
        return nameMatch && moduleMatch
      })
    })
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))

  function openAddGroup() {
    setEditingGroup(null)
    setGroupModalOpen(true)
  }

  function openEditGroup(group: ResponsibilityGroup) {
    setEditingGroup(group)
    setGroupModalOpen(true)
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm(t('responsibility.delete_group_confirm'))) return
    await deleteGroup.mutateAsync(id)
  }

  function openAddMember(groupId: string) {
    setMemberGroupId(groupId)
    setEditingMember(null)
    setMemberModalOpen(true)
  }

  function openEditMember(member: ResponsibilityMember, groupId: string) {
    setMemberGroupId(groupId)
    setEditingMember({ member, groupId })
    setMemberModalOpen(true)
  }

  async function handleRemoveMember(groupId: string, memberId: string) {
    if (!confirm(t('responsibility.remove_member_confirm'))) return
    await removeMember.mutateAsync({ groupId, memberId })
  }

  async function handleGroupSave(data: GroupCreate | GroupUpdate) {
    if (editingGroup) {
      await updateGroup.mutateAsync({ id: editingGroup.id, ...data })
    } else {
      await createGroup.mutateAsync(data as GroupCreate)
    }
  }

  async function handleMemberSave(data: MemberCreate | MemberUpdate) {
    if (!memberGroupId) return
    if (editingMember) {
      await updateMember.mutateAsync({
        groupId: memberGroupId,
        memberId: editingMember.member.id,
        modules: (data as MemberUpdate).modules,
      })
    } else {
      const mc = data as MemberCreate
      await addMember.mutateAsync({ groupId: memberGroupId, user_id: mc.user_id, modules: mc.modules })
    }
  }

  const currentGroup = memberGroupId ? groups.find((g) => g.id === memberGroupId) : null
  const existingUserIds = currentGroup?.members.map((m) => m.user.id) ?? []

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/30 flex-shrink-0">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('responsibility.title')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {t('responsibility.subtitle')}
            </p>
          </div>
        </div>
        {isSuperadmin && (
          <button
            onClick={openAddGroup}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm shadow-primary-500/30 flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            {t('responsibility.add_group')}
          </button>
        )}
      </div>

      {/* Search filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder={t('responsibility.search_user')}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
          />
          {userFilter && (
            <button
              onClick={() => setUserFilter('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="relative flex-1">
          <Package className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            placeholder={t('responsibility.search_module')}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow"
          />
          {moduleFilter && (
            <button
              onClick={() => setModuleFilter('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Groups */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Users className="h-8 w-8 text-gray-400" />
          </div>
          <div>
            <p className="text-base font-medium text-gray-700 dark:text-gray-300">
              {userFilter || moduleFilter
                ? t('responsibility.no_results')
                : t('responsibility.no_groups')}
            </p>
            {isSuperadmin && !userFilter && !moduleFilter && (
              <p className="text-sm text-gray-400 mt-1">
                {t('responsibility.no_groups_hint')}
              </p>
            )}
          </div>
          {isSuperadmin && !userFilter && !moduleFilter && (
            <button
              onClick={openAddGroup}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('responsibility.add_group')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              isSuperadmin={isSuperadmin}
              userFilter={userFilter}
              moduleFilter={moduleFilter}
              onEditGroup={() => openEditGroup(group)}
              onDeleteGroup={() => handleDeleteGroup(group.id)}
              onAddMember={() => openAddMember(group.id)}
              onEditMember={(member) => openEditMember(member, group.id)}
              onRemoveMember={(memberId) => handleRemoveMember(group.id, memberId)}
            />
          ))}
        </div>
      )}

      {/* Group modal */}
      <GroupModal
        isOpen={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        initial={editingGroup}
        onSave={handleGroupSave}
      />

      {/* Member modal */}
      <MemberModal
        isOpen={memberModalOpen}
        onClose={() => setMemberModalOpen(false)}
        initial={editingMember?.member ?? null}
        existingUserIds={existingUserIds}
        onSave={handleMemberSave}
      />
    </div>
  )
}
