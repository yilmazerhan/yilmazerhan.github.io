import { Outlet, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import GlobalLoadingBar from './GlobalLoadingBar'
import Toaster from '@/components/ui/Toast'
import CommandPalette from '@/components/ui/CommandPalette'
import ShortcutsHelp from '@/components/ui/ShortcutsHelp'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useIdleTimer } from '@/hooks/useIdleTimer'
import { useAuthStore } from '@/store/authStore'
import { useTeamTasks } from '@/api/teamTasks'

// Module-level: resets on every page load (logout causes full reload)
let _popupShownThisLoad = false

function TeamTasksPopup({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data: tasks = [] } = useTeamTasks()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const myTasks = tasks.filter(
    (task) =>
      task.status !== 'done' &&
      task.assignees.some((a) => a.id === userId) &&
      new Date(task.deadline) >= today,
  )

  useEffect(() => {
    if (myTasks.length > 0 && !_popupShownThisLoad) {
      _popupShownThisLoad = true
      setOpen(true)
    }
  }, [myTasks.length])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('team_tasks.popup_title')}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{t('team_tasks.popup_subtitle')}</p>
          </div>
          <button onClick={() => setOpen(false)} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100 dark:divide-gray-800">
          {myTasks.map((task) => {
            const dl = new Date(task.deadline)
            dl.setHours(0, 0, 0, 0)
            const daysLeft = Math.round((dl.getTime() - today.getTime()) / 86400000)
            return (
              <div key={task.id} className="px-6 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                  {task.description && <p className="text-xs text-gray-400 truncate">{task.description}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{format(new Date(task.deadline), 'dd MMM yyyy')}</p>
                  <p className={`text-xs font-medium ${daysLeft === 0 ? 'text-red-500' : daysLeft <= 3 ? 'text-orange-500' : 'text-gray-400'}`}>
                    {daysLeft === 0 ? t('team_tasks.today') : `${daysLeft}g`}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex gap-3">
          <Link
            to="/team-tasks"
            onClick={() => setOpen(false)}
            className="flex-1 py-2 text-center rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {t('team_tasks.go_to_tasks')}
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const user = useAuthStore((s) => s.user)

  useIdleTimer()

  useKeyboardShortcuts({
    onSearch: () => setPaletteOpen(true),
    onHelp: () => setHelpOpen(true),
  })

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <GlobalLoadingBar />
      <Sidebar
        open={sidebarOpen}
        onShortcutsOpen={() => setHelpOpen(true)}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMenuToggle={() => setSidebarOpen((o) => !o)}
          onSearchOpen={() => setPaletteOpen(true)}
        />
        <AnnouncementBanner />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Toaster />
      {user && <TeamTasksPopup userId={user.id} />}
    </div>
  )
}
