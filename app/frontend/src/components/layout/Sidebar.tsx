import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import {
  LayoutDashboard, ClipboardList, Kanban, Users, Users2,
  Mail, Settings, ScrollText, BarChart3, ShieldCheck, UserCircle, Keyboard, HardDriveDownload,
  GanttChartSquare, Activity, CalendarDays, CalendarRange, Database, Megaphone, Layers,
} from 'lucide-react'

interface SidebarProps {
  open: boolean
  onShortcutsOpen?: () => void
}

interface NavItem {
  to: string
  icon: React.ComponentType<{ className?: string }>
  labelKey: string
  requiredRole?: string[]
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { to: '/worklog', icon: ClipboardList, labelKey: 'nav.worklog' },
  { to: '/kanban', icon: Kanban, labelKey: 'nav.kanban' },
  { to: '/gantt', icon: GanttChartSquare, labelKey: 'nav.gantt' },
  { to: '/timeline', icon: Activity, labelKey: 'nav.timeline' },
  { to: '/leave', icon: CalendarDays, labelKey: 'nav.leave' },
  { to: '/leave/calendar', icon: CalendarRange, labelKey: 'nav.leave_calendar', requiredRole: ['superadmin', 'team_manager'] },
  { to: '/reports', icon: BarChart3, labelKey: 'nav.reports' },
  { to: '/inventory', icon: Database, labelKey: 'nav.inventory' },
  { to: '/patches', icon: Layers, labelKey: 'nav.patches' },
  { to: '/users', icon: Users, labelKey: 'nav.users', requiredRole: ['superadmin'] },
  { to: '/teams', icon: Users2, labelKey: 'nav.teams', requiredRole: ['superadmin'] },
  { to: '/permissions', icon: ShieldCheck, labelKey: 'nav.permissions', requiredRole: ['superadmin'] },
  { to: '/settings/email/workflows', icon: Mail, labelKey: 'nav.email', requiredRole: ['superadmin'] },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings', requiredRole: ['superadmin'] },
  { to: '/admin/announcements', icon: Megaphone, labelKey: 'nav.announcements', requiredRole: ['superadmin'] },
  { to: '/admin/audit-logs', icon: ScrollText, labelKey: 'nav.auditLogs', requiredRole: ['superadmin'] },
  { to: '/admin/backup', icon: HardDriveDownload, labelKey: 'nav.backup', requiredRole: ['superadmin'] },
]

export default function Sidebar({ open, onShortcutsOpen }: SidebarProps) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)

  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: () => axios.get('/api/v1/public/branding').then((r) => r.data),
    staleTime: Infinity,
    gcTime: Infinity,   // Never evict — branding is static per session
  })

  if (!open) return null

  return (
    <aside className="w-64 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
      {/* Logo / Company name */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-gray-200 dark:border-gray-800">
        {branding?.company_logo && (
          <img src={branding.company_logo} alt="Logo" className="h-8 w-8 object-contain" />
        )}
        <span className="font-semibold text-gray-900 dark:text-white truncate">
          {branding?.company_name || t('app.name')}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, labelKey, requiredRole }) => {
          if (requiredRole && user && !requiredRole.includes(user.role)) return null
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors border-l-[3px] ${
                  isActive
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span>{t(labelKey)}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom: profile + shortcuts hint + version */}
      <div className="px-2 py-3 border-t border-gray-200 dark:border-gray-800 space-y-1">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors border-l-[3px] ${
              isActive
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`
          }
        >
          <UserCircle className="h-5 w-5 flex-shrink-0" />
          <span>{t('profile.title')}</span>
        </NavLink>

        <button
          type="button"
          onClick={onShortcutsOpen}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Keyboard className="h-3.5 w-3.5" />
          <span>{t('shortcuts.hint')}</span>
          <kbd className="ml-auto bg-gray-100 dark:bg-gray-800 px-1 rounded font-mono">?</kbd>
        </button>

        <div className="px-3 pt-1 pb-0.5">
          <span className="text-[10px] font-mono text-gray-300 dark:text-gray-700 select-none">
            v{__APP_VERSION__}
          </span>
        </div>
      </div>
    </aside>
  )
}
