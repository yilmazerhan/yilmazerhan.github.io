import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Kanban, Plus, Pencil, Trash2, Archive, ArchiveRestore, Columns, CheckSquare, Lock } from 'lucide-react'
import { useBoards, useCreateBoard, useUpdateBoard, useDeleteBoard, KanbanBoard } from '@/api/kanban'
import { useAuthStore } from '@/store/authStore'

interface BoardFormData {
  name: string
  description: string
  color: string
}

const DEFAULT_COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316',
]

function BoardFormModal({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial?: Partial<BoardFormData>
  onClose: () => void
  onSave: (data: BoardFormData) => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState<BoardFormData>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    color: initial?.color ?? '#6366f1',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {initial?.name ? t('kanban.edit_board') : t('kanban.create_board')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('kanban.board_name')} *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('kanban.board_name_placeholder')}
              maxLength={100}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('kanban.board_description')}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder={t('kanban.board_description_placeholder')}
              rows={3}
              maxLength={1000}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('kanban.board_color')}
            </label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${form.color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="w-7 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                title={t('kanban.custom_color')}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-medium disabled:opacity-50"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function KanbanBoardsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const { data: boards = [], isLoading } = useBoards()
  const createBoard = useCreateBoard()
  const updateBoard = useUpdateBoard()
  const deleteBoard = useDeleteBoard()

  const [showCreate, setShowCreate] = useState(false)
  const [editBoard, setEditBoard] = useState<KanbanBoard | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<KanbanBoard | null>(null)

  const isSuperAdmin = currentUser?.role === 'superadmin'
  const isManager = currentUser?.role === 'team_manager' || isSuperAdmin

  /** Can the current user manage (edit/delete/archive) a given board? */
  function canManageBoard(board: KanbanBoard): boolean {
    if (isSuperAdmin) return true
    if (board.created_by === currentUser?.id) return true
    if (isManager) return true  // simplified: managers can manage all boards they can see
    return false
  }

  async function handleCreate(data: BoardFormData) {
    const board = await createBoard.mutateAsync({ ...data, description: data.description || null })
    setShowCreate(false)
    navigate(`/kanban/${board.id}`)
  }

  async function handleEdit(data: BoardFormData) {
    if (!editBoard) return
    await updateBoard.mutateAsync({ id: editBoard.id, ...data, description: data.description || null })
    setEditBoard(null)
  }

  async function handleArchive(board: KanbanBoard) {
    await updateBoard.mutateAsync({ id: board.id, is_archived: !board.is_archived })
  }

  async function handleDelete() {
    if (!confirmDelete) return
    await deleteBoard.mutateAsync(confirmDelete.id)
    setConfirmDelete(null)
  }

  // Separate personal boards from shared
  const personalBoards = boards.filter((b) => b.is_personal)
  const sharedBoards = boards.filter((b) => !b.is_personal)

  function BoardCard({ board }: { board: KanbanBoard }) {
    const canManage = canManageBoard(board)

    return (
      <div
        key={board.id}
        className={`group relative bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all cursor-pointer ${board.is_archived ? 'opacity-60' : ''}`}
        onClick={() => navigate(`/kanban/${board.id}`)}
      >
        {/* Color strip */}
        <div
          className="h-2 rounded-t-xl"
          style={{ backgroundColor: board.color }}
        />
        <div className="p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                  {board.name}
                </h3>
                {board.is_personal && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-medium">
                    <Lock className="h-3 w-3" />
                    {t('kanban.personal')}
                  </span>
                )}
              </div>
              {board.description && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                  {board.description}
                </p>
              )}
            </div>
            {board.is_archived && (
              <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {t('kanban.archived')}
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Columns className="h-3.5 w-3.5" />
              {board.column_count} {t('kanban.columns_count')}
            </span>
            <span className="flex items-center gap-1">
              <CheckSquare className="h-3.5 w-3.5" />
              {board.task_count} {t('kanban.tasks_count')}
            </span>
          </div>
        </div>

        {/* Action buttons — only for board managers, hidden for personal boards that aren't ours */}
        {canManage && (
          <div
            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* No edit on personal boards (name/desc are fixed) — only color allowed */}
            <button
              onClick={() => setEditBoard(board)}
              title={t('common.edit')}
              className="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {/* Archive not available for personal boards */}
            {!board.is_personal && (
              <button
                onClick={() => handleArchive(board)}
                title={board.is_archived ? t('kanban.unarchive') : t('kanban.archive')}
                className="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              >
                {board.is_archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              </button>
            )}
            {/* Delete not available for personal boards */}
            {!board.is_personal && (
              <button
                onClick={() => setConfirmDelete(board)}
                title={t('common.delete')}
                className="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 dark:text-gray-400 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Kanban className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('kanban.boards_title')}</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          {t('kanban.create_board')}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">{t('common.loading')}</div>
      ) : (
        <>
          {/* Personal board section */}
          {personalBoards.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-violet-500" />
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  {t('kanban.personal_boards')}
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {personalBoards.map((board) => (
                  <BoardCard key={board.id} board={board} />
                ))}
              </div>
            </div>
          )}

          {/* Shared boards section */}
          {sharedBoards.length > 0 ? (
            <div className="space-y-3">
              {personalBoards.length > 0 && (
                <div className="flex items-center gap-2">
                  <Kanban className="h-4 w-4 text-primary-500" />
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    {t('kanban.shared_boards')}
                  </h2>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sharedBoards.map((board) => (
                  <BoardCard key={board.id} board={board} />
                ))}
              </div>
            </div>
          ) : personalBoards.length === 0 ? (
            <div className="text-center py-16">
              <Kanban className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">{t('kanban.no_boards')}</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
              >
                {t('kanban.create_first_board')}
              </button>
            </div>
          ) : null}
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <BoardFormModal
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
          saving={createBoard.isPending}
        />
      )}

      {/* Edit modal */}
      {editBoard && (
        <BoardFormModal
          initial={{ name: editBoard.name, description: editBoard.description ?? '', color: editBoard.color }}
          onClose={() => setEditBoard(null)}
          onSave={handleEdit}
          saving={updateBoard.isPending}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{t('kanban.delete_board_title')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('kanban.delete_board_confirm', { name: confirmDelete.name })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteBoard.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium disabled:opacity-50"
              >
                {deleteBoard.isPending ? t('common.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
