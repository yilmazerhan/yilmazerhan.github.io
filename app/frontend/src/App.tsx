import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useThemeStore } from '@/store/themeStore'
import AppShell from '@/components/layout/AppShell'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import RoleRoute from '@/components/layout/RoleRoute'
import LoginPage from '@/pages/LoginPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import ActivateAccountPage from '@/pages/ActivateAccountPage'
import DashboardPage from '@/pages/DashboardPage'
import WorkLogPage from '@/pages/WorkLogPage'
import KanbanPage from '@/pages/KanbanPage'
import KanbanBoardsPage from '@/pages/KanbanBoardsPage'
import UsersPage from '@/pages/UsersPage'
import TeamsPage from '@/pages/TeamsPage'
import EmailTemplatesPage from '@/pages/EmailTemplatesPage'
import EmailWorkflowsPage from '@/pages/EmailWorkflowsPage'
import EmailLogsPage from '@/pages/EmailLogsPage'
import SettingsPage from '@/pages/SettingsPage'
import AuditLogsPage from '@/pages/AuditLogsPage'
import ReportsPage from '@/pages/ReportsPage'
import PermissionsPage from '@/pages/PermissionsPage'
import ProfilePage from '@/pages/ProfilePage'
import BackupPage from '@/pages/BackupPage'
import UserActivityPage from '@/pages/UserActivityPage'
import GanttPage from '@/pages/GanttPage'
import TimelinePage from '@/pages/TimelinePage'
import LeavePage from '@/pages/LeavePage'
import LeaveCalendarPage from '@/pages/LeaveCalendarPage'
import InventoryPage from '@/pages/InventoryPage'
import AnnouncementsPage from '@/pages/AnnouncementsPage'
import PatchesPage from '@/pages/PatchesPage'

function BrandingInit() {
  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: () => axios.get('/api/v1/public/branding').then((r) => r.data),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (branding?.primary_color) {
      document.documentElement.style.setProperty('--color-primary', branding.primary_color)
    }
    if (branding?.company_name) {
      document.title = branding.company_name
    }
    if (branding?.favicon) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = branding.favicon
      link.type = branding.favicon.startsWith('data:image/x-icon') ? 'image/x-icon' : 'image/png'
    }
  }, [branding])

  return null
}

export default function App() {
  const { theme } = useThemeStore()

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  return (
    <BrowserRouter>
      <BrandingInit />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/activate/:token" element={<ActivateAccountPage />} />

        {/* Protected routes inside AppShell */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/worklog" element={<WorkLogPage />} />
            <Route path="/kanban" element={<KanbanBoardsPage />} />
            <Route path="/kanban/:boardId" element={<KanbanPage />} />
            <Route path="/gantt" element={<GanttPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/leave" element={<LeavePage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/patches" element={<PatchesPage />} />

            {/* Manager+ routes */}
            <Route element={<RoleRoute allow={['superadmin', 'team_manager']} />}>
              <Route path="/leave/calendar" element={<LeaveCalendarPage />} />
              <Route path="/reports/user/:userId" element={<UserActivityPage />} />
            </Route>

            {/* Superadmin-only routes */}
            <Route element={<RoleRoute allow={['superadmin']} />}>
              <Route path="/users" element={<UsersPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/permissions" element={<PermissionsPage />} />
              <Route path="/settings/email/templates" element={<EmailTemplatesPage />} />
              <Route path="/settings/email/workflows" element={<EmailWorkflowsPage />} />
              <Route path="/settings/email/logs" element={<EmailLogsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
              <Route path="/admin/backup" element={<BackupPage />} />
              <Route path="/admin/announcements" element={<AnnouncementsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
