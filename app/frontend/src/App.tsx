import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useThemeStore } from '@/store/themeStore'
import AppShell from '@/components/layout/AppShell'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import LoginPage from '@/pages/LoginPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import ActivateAccountPage from '@/pages/ActivateAccountPage'
import DashboardPage from '@/pages/DashboardPage'
import WorkLogPage from '@/pages/WorkLogPage'
import KanbanPage from '@/pages/KanbanPage'
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
            <Route path="/kanban" element={<KanbanPage />} />
            <Route path="/gantt" element={<GanttPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/permissions" element={<PermissionsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings/email/templates" element={<EmailTemplatesPage />} />
            <Route path="/settings/email/workflows" element={<EmailWorkflowsPage />} />
            <Route path="/settings/email/logs" element={<EmailLogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
            <Route path="/admin/backup" element={<BackupPage />} />
            <Route path="/reports/user/:userId" element={<UserActivityPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
