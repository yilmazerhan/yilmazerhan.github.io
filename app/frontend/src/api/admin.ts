import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface SslCertificate {
  id: string
  name: string
  expires_at: string
  is_active: boolean
  uploaded_by: string | null
  created_at: string
}

export interface BrandingData {
  company_name: string
  company_logo: string
  primary_color: string
}

const adminKeys = {
  ssl: ['admin', 'ssl'] as const,
  branding: ['admin', 'branding'] as const,
}

export function useSslCertificates() {
  return useQuery({
    queryKey: adminKeys.ssl,
    queryFn: () => apiClient.get<SslCertificate[]>('/admin/ssl').then((r) => r.data),
  })
}

export function useUploadPem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; certFile: File; keyFile: File }) => {
      const fd = new FormData()
      fd.append('name', data.name)
      fd.append('cert_file', data.certFile)
      fd.append('key_file', data.keyFile)
      return apiClient.post<SslCertificate>('/admin/ssl/upload-pem', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.ssl }),
  })
}

export function useUploadJks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; jksFile: File; password: string }) => {
      const fd = new FormData()
      fd.append('name', data.name)
      fd.append('password', data.password)
      fd.append('jks_file', data.jksFile)
      return apiClient.post<SslCertificate>('/admin/ssl/upload-jks', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.ssl }),
  })
}

export function useActivateCertificate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post<SslCertificate>(`/admin/ssl/activate/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.ssl }),
  })
}

export function useDeleteCertificate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/ssl/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.ssl }),
  })
}

export function useBranding() {
  return useQuery({
    queryKey: adminKeys.branding,
    queryFn: () => apiClient.get<BrandingData>('/admin/settings/branding').then((r) => r.data),
  })
}

export function useUpdateBranding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { company_name?: string; primary_color?: string }) =>
      apiClient.put<BrandingData>('/admin/settings/branding', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.branding })
      qc.invalidateQueries({ queryKey: ['branding'] })
    },
  })
}

export function useUploadLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (logoFile: File) => {
      const fd = new FormData()
      fd.append('logo', logoFile)
      return apiClient.post<BrandingData>('/admin/settings/branding/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then((r) => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.branding })
      qc.invalidateQueries({ queryKey: ['branding'] })
    },
  })
}
