import type { PhaseStatus, MilestoneType } from '@/api/releases'

// Fixed light-theme palette — kept identical on screen and in PNG/PDF exports.

export const STATUS_KEYS: PhaseStatus[] = [
  'completed',
  'on_track',
  'at_risk',
  'high_risk',
  'not_started',
]

export const MILESTONE_KEYS: MilestoneType[] = [
  'internal_control',
  'internal_acceptance',
  'general_available',
]

export const STATUS_COLOR: Record<PhaseStatus, string> = {
  completed: '#5a6b7a',
  on_track: '#6aa84f',
  at_risk: '#e6c200',
  high_risk: '#e8392f',
  not_started: '#2b87f0',
}

// Text color that stays readable on the bar fill.
export const STATUS_TEXT: Record<PhaseStatus, string> = {
  completed: '#ffffff',
  on_track: '#ffffff',
  at_risk: '#1a1a1a',
  high_risk: '#ffffff',
  not_started: '#ffffff',
}

export const MILESTONE_COLOR: Record<MilestoneType, string> = {
  internal_control: '#7b3f00',
  internal_acceptance: '#f5b400',
  general_available: '#29abe2',
}

export const STATUS_LABEL_KEY: Record<PhaseStatus, string> = {
  completed: 'releases.status_completed',
  on_track: 'releases.status_on_track',
  at_risk: 'releases.status_at_risk',
  high_risk: 'releases.status_high_risk',
  not_started: 'releases.status_not_started',
}

export const MILESTONE_LABEL_KEY: Record<MilestoneType, string> = {
  internal_control: 'releases.ms_internal_control',
  internal_acceptance: 'releases.ms_internal_acceptance',
  general_available: 'releases.ms_general_available',
}
