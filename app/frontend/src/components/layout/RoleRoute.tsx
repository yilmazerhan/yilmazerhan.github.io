import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

interface RoleRouteProps {
  allow: string[]
}

/**
 * Guards a group of routes by user role. Authenticated users whose role is not
 * in `allow` are redirected to the dashboard. Authentication itself is handled
 * by the parent ProtectedRoute, so `user` is guaranteed present here.
 */
export default function RoleRoute({ allow }: RoleRouteProps) {
  const user = useAuthStore((s) => s.user)

  if (user && !allow.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
