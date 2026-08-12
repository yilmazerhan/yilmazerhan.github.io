import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export interface ResponsibilityMember {
  id: string
  user: { id: string; full_name: string; email: string }
  modules: string[]
  created_at: string
}

export interface ResponsibilityGroup {
  id: string
  name: string
  description: string | null
  color: string
  display_order: number
  members: ResponsibilityMember[]
  created_at: string
  updated_at: string
}

export interface GroupCreate {
  name: string
  description?: string | null
  color?: string
  display_order?: number
}

export interface GroupUpdate {
  name?: string
  description?: string | null
  color?: string
  display_order?: number
}

export interface MemberCreate {
  user_id: string
  modules: string[]
}

export interface MemberUpdate {
  modules: string[]
}

const respKeys = {
  all: ['responsibility-groups'] as const,
}

export function useResponsibilityGroups() {
  return useQuery({
    queryKey: respKeys.all,
    queryFn: () => apiClient.get<ResponsibilityGroup[]>('/responsibility-groups').then((r) => r.data),
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: GroupCreate) =>
      apiClient.post<ResponsibilityGroup>('/responsibility-groups', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: respKeys.all }),
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & GroupUpdate) =>
      apiClient.patch<ResponsibilityGroup>(`/responsibility-groups/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: respKeys.all }),
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/responsibility-groups/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: respKeys.all }),
  })
}

export function useAddMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, ...data }: { groupId: string } & MemberCreate) =>
      apiClient
        .post<ResponsibilityMember>(`/responsibility-groups/${groupId}/members`, data)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: respKeys.all }),
  })
}

export function useUpdateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      groupId,
      memberId,
      ...data
    }: { groupId: string; memberId: string } & MemberUpdate) =>
      apiClient
        .patch<ResponsibilityMember>(
          `/responsibility-groups/${groupId}/members/${memberId}`,
          data,
        )
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: respKeys.all }),
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, memberId }: { groupId: string; memberId: string }) =>
      apiClient
        .delete(`/responsibility-groups/${groupId}/members/${memberId}`)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: respKeys.all }),
  })
}
