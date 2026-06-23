import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from './client'

export type PhaseStatus = 'completed' | 'on_track' | 'at_risk' | 'high_risk' | 'not_started'
export type MilestoneType = 'internal_control' | 'internal_acceptance' | 'general_available'

export interface ReleasePhase {
  id: string
  name: string
  start_date: string
  end_date: string
  status: PhaseStatus
  display_order: number
}

export interface ReleaseMilestone {
  id: string
  type: MilestoneType
  date: string
  label: string | null
}

export interface Release {
  id: string
  name: string
  description: string | null
  display_order: number
  phases: ReleasePhase[]
  milestones: ReleaseMilestone[]
  created_at: string
  updated_at: string
}

export interface ReleaseCreate {
  name: string
  description?: string | null
  display_order?: number
}
export type ReleaseUpdate = Partial<ReleaseCreate>

export interface PhaseCreate {
  name: string
  start_date: string
  end_date: string
  status: PhaseStatus
  display_order?: number
}
export type PhaseUpdate = Partial<PhaseCreate>

export interface MilestoneCreate {
  type: MilestoneType
  date: string
  label?: string | null
}
export type MilestoneUpdate = Partial<MilestoneCreate>

const releaseKeys = {
  all: ['releases'] as const,
}

export function useReleases() {
  return useQuery({
    queryKey: releaseKeys.all,
    queryFn: () => apiClient.get<Release[]>('/releases').then((r) => r.data),
  })
}

// ─── Release CRUD ──────────────────────────────────────────────────────────────

export function useCreateRelease() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ReleaseCreate) =>
      apiClient.post<Release>('/releases', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: releaseKeys.all }),
  })
}

export function useUpdateRelease() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & ReleaseUpdate) =>
      apiClient.patch<Release>(`/releases/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: releaseKeys.all }),
  })
}

export function useDeleteRelease() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/releases/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: releaseKeys.all }),
  })
}

// ─── Phase CRUD ────────────────────────────────────────────────────────────────

export function useAddPhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ releaseId, ...data }: { releaseId: string } & PhaseCreate) =>
      apiClient.post<ReleasePhase>(`/releases/${releaseId}/phases`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: releaseKeys.all }),
  })
}

export function useUpdatePhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ releaseId, phaseId, ...data }: { releaseId: string; phaseId: string } & PhaseUpdate) =>
      apiClient
        .patch<ReleasePhase>(`/releases/${releaseId}/phases/${phaseId}`, data)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: releaseKeys.all }),
  })
}

export function useDeletePhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ releaseId, phaseId }: { releaseId: string; phaseId: string }) =>
      apiClient.delete(`/releases/${releaseId}/phases/${phaseId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: releaseKeys.all }),
  })
}

// ─── Milestone CRUD ──────────────────────────────────────────────────────────────

export function useAddMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ releaseId, ...data }: { releaseId: string } & MilestoneCreate) =>
      apiClient.post<ReleaseMilestone>(`/releases/${releaseId}/milestones`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: releaseKeys.all }),
  })
}

export function useUpdateMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      releaseId,
      milestoneId,
      ...data
    }: { releaseId: string; milestoneId: string } & MilestoneUpdate) =>
      apiClient
        .patch<ReleaseMilestone>(`/releases/${releaseId}/milestones/${milestoneId}`, data)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: releaseKeys.all }),
  })
}

export function useDeleteMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ releaseId, milestoneId }: { releaseId: string; milestoneId: string }) =>
      apiClient.delete(`/releases/${releaseId}/milestones/${milestoneId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: releaseKeys.all }),
  })
}
