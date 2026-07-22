import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { tr, enUS } from 'date-fns/locale'
import { jsPDF } from 'jspdf'
import { toast } from '@/store/toastStore'
import {
  Plus, Pencil, Trash2, Loader2, X, GanttChartSquare, List, Image as ImageIcon,
  FileText, Rocket, Flag, CalendarDays,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import ReleaseGanttChart from '@/components/releases/ReleaseGanttChart'
import {
  STATUS_KEYS, MILESTONE_KEYS, STATUS_COLOR, STATUS_TEXT, MILESTONE_COLOR,
  STATUS_LABEL_KEY, MILESTONE_LABEL_KEY,
} from '@/lib/releaseMeta'
import {
  useReleases,
  useCreateRelease, useUpdateRelease, useDeleteRelease,
  useAddPhase, useUpdatePhase, useDeletePhase,
  useAddMilestone, useUpdateMilestone, useDeleteMilestone,
  type Release, type ReleasePhase, type ReleaseMilestone,
  type PhaseStatus, type MilestoneType,
} from '@/api/releases'
import DatePicker from '@/components/ui/DatePicker'

// ─── Modal shell ────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-shadow'
const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

function FooterButtons({
  onClose,
  saving,
  disabled,
  t,
}: {
  onClose: () => void
  saving: boolean
  disabled?: boolean
  t: (k: string) => string
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
      >
        {t('releases.cancel')}
      </button>
      <button
        type="submit"
        disabled={saving || disabled}
        className="px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors flex items-center gap-2"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('releases.save')}
      </button>
    </div>
  )
}

// ─── Release modal ────────────────────────────────────────────────────────────────

function ReleaseModal({
  initial,
  onClose,
  onSave,
}: {
  initial: Release | null
  onClose: () => void
  onSave: (data: { name: string; description: string | null; display_order: number }) => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [order, setOrder] = useState(initial?.display_order ?? 0)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ name: name.trim(), description: description.trim() || null, display_order: order })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={initial ? t('releases.edit_release') : t('releases.add_release')} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-4">
        <div>
          <label className={labelCls}>
            {t('releases.release_name')} <span className="text-red-500">*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputCls} placeholder="3.9.0" />
        </div>
        <div>
          <label className={labelCls}>{t('releases.release_description')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={inputCls + ' resize-none'}
            placeholder={t('releases.description_placeholder')}
          />
          <p className="text-xs text-gray-400 mt-1.5">{t('releases.description_hint')}</p>
        </div>
        <div>
          <label className={labelCls}>{t('releases.order')}</label>
          <input type="number" min={0} value={order} onChange={(e) => setOrder(Number(e.target.value))} className={inputCls + ' w-24'} />
        </div>
        <FooterButtons onClose={onClose} saving={saving} disabled={!name.trim()} t={t} />
      </form>
    </ModalShell>
  )
}

// ─── Phase modal ────────────────────────────────────────────────────────────────

function PhaseModal({
  initial,
  onClose,
  onSave,
}: {
  initial: ReleasePhase | null
  onClose: () => void
  onSave: (data: {
    name: string
    start_date: string
    end_date: string
    status: PhaseStatus
    display_order: number
  }) => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initial?.name ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? '')
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [status, setStatus] = useState<PhaseStatus>(initial?.status ?? 'not_started')
  const [order, setOrder] = useState(initial?.display_order ?? 0)
  const [saving, setSaving] = useState(false)

  const dateError = startDate && endDate && endDate < startDate

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (dateError) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), start_date: startDate, end_date: endDate, status, display_order: order })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={initial ? t('releases.edit_phase') : t('releases.add_phase')} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-4">
        <div>
          <label className={labelCls}>
            {t('releases.phase_name')} <span className="text-red-500">*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputCls} placeholder={t('releases.phase_name_placeholder')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              {t('releases.start_date')} <span className="text-red-500">*</span>
            </label>
            <DatePicker value={startDate} onChange={setStartDate} required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>
              {t('releases.end_date')} <span className="text-red-500">*</span>
            </label>
            <DatePicker value={endDate} onChange={setEndDate} required className={inputCls} />
          </div>
        </div>
        {dateError && <p className="text-xs text-red-500 -mt-2">{t('releases.date_error')}</p>}
        <div>
          <label className={labelCls}>{t('releases.status')}</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as PhaseStatus)} className={inputCls}>
            {STATUS_KEYS.map((s) => (
              <option key={s} value={s}>
                {t(STATUS_LABEL_KEY[s])}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t('releases.order')}</label>
          <input type="number" min={0} value={order} onChange={(e) => setOrder(Number(e.target.value))} className={inputCls + ' w-24'} />
        </div>
        <FooterButtons onClose={onClose} saving={saving} disabled={!name.trim() || !startDate || !endDate || !!dateError} t={t} />
      </form>
    </ModalShell>
  )
}

// ─── Milestone modal ────────────────────────────────────────────────────────────

function MilestoneModal({
  initial,
  onClose,
  onSave,
}: {
  initial: ReleaseMilestone | null
  onClose: () => void
  onSave: (data: { type: MilestoneType; date: string; label: string | null }) => Promise<void>
}) {
  const { t } = useTranslation()
  const [type, setType] = useState<MilestoneType>(initial?.type ?? 'internal_control')
  const [date, setDate] = useState(initial?.date ?? '')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ type, date, label: label.trim() || null })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell title={initial ? t('releases.edit_milestone') : t('releases.add_milestone')} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-4">
        <div>
          <label className={labelCls}>{t('releases.milestone_type')}</label>
          <select value={type} onChange={(e) => setType(e.target.value as MilestoneType)} className={inputCls}>
            {MILESTONE_KEYS.map((m) => (
              <option key={m} value={m}>
                {t(MILESTONE_LABEL_KEY[m])}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>
            {t('releases.milestone_date')} <span className="text-red-500">*</span>
          </label>
          <DatePicker value={date} onChange={setDate} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('releases.milestone_label')}</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder={t('releases.milestone_label_placeholder')} />
        </div>
        <FooterButtons onClose={onClose} saving={saving} disabled={!date} t={t} />
      </form>
    </ModalShell>
  )
}

// ─── Badges ────────────────────────────────────────────────────────────────────

function StatusBadge({ status, t }: { status: PhaseStatus; t: (k: string) => string }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: STATUS_COLOR[status], color: STATUS_TEXT[status] }}
    >
      {t(STATUS_LABEL_KEY[status])}
    </span>
  )
}

// ─── List view ──────────────────────────────────────────────────────────────────

function ReleaseListCard({
  release,
  canEdit,
  t,
  onEditRelease,
  onDeleteRelease,
  onAddPhase,
  onEditPhase,
  onDeletePhase,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
}: {
  release: Release
  canEdit: boolean
  t: (k: string) => string
  onEditRelease: () => void
  onDeleteRelease: () => void
  onAddPhase: () => void
  onEditPhase: (p: ReleasePhase) => void
  onDeletePhase: (p: ReleasePhase) => void
  onAddMilestone: () => void
  onEditMilestone: (m: ReleaseMilestone) => void
  onDeleteMilestone: (m: ReleaseMilestone) => void
}) {
  const phases = [...release.phases].sort(
    (a, b) => a.display_order - b.display_order || a.start_date.localeCompare(b.start_date),
  )
  const milestones = [...release.milestones].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
      <div className="px-5 py-4 flex items-start gap-3 bg-gradient-to-r from-primary-50 to-transparent dark:from-primary-900/20">
        <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center flex-shrink-0">
          <Rocket className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{release.name}</h3>
          {release.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 whitespace-pre-line">{release.description}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onEditRelease} className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-white/60 dark:hover:bg-gray-700/60">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDeleteRelease} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-white/60 dark:hover:bg-gray-700/60">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        {/* Phases */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {t('releases.phases')}
            </h4>
            {canEdit && (
              <button onClick={onAddPhase} className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" />
                {t('releases.add_phase')}
              </button>
            )}
          </div>
          {phases.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-1">{t('releases.no_phases')}</p>
          ) : (
            <div className="space-y-1.5">
              {phases.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 group">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 min-w-0 truncate">{p.name}</span>
                  <StatusBadge status={p.status} t={t} />
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
                    {p.start_date} → {p.end_date}
                  </span>
                  {canEdit && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEditPhase(p)} className="p-1 text-gray-400 hover:text-blue-500 rounded">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onDeletePhase(p)} className="p-1 text-gray-400 hover:text-red-500 rounded">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Milestones */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5" />
              {t('releases.milestones')}
            </h4>
            {canEdit && (
              <button onClick={onAddMilestone} className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" />
                {t('releases.add_milestone')}
              </button>
            )}
          </div>
          {milestones.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-1">{t('releases.no_milestones')}</p>
          ) : (
            <div className="space-y-1.5">
              {milestones.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 group">
                  <span
                    className="w-3 h-3 flex-shrink-0 rotate-45 rounded-[2px]"
                    style={{ backgroundColor: MILESTONE_COLOR[m.type] }}
                  />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1 min-w-0 truncate">
                    {t(MILESTONE_LABEL_KEY[m.type])}
                    {m.label ? ` — ${m.label}` : ''}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">{m.date}</span>
                  {canEdit && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEditMilestone(m)} className="p-1 text-gray-400 hover:text-blue-500 rounded">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onDeleteMilestone(m)} className="p-1 text-gray-400 hover:text-red-500 rounded">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

type ModalState =
  | { kind: 'release'; release: Release | null }
  | { kind: 'phase'; releaseId: string; phase: ReleasePhase | null }
  | { kind: 'milestone'; releaseId: string; milestone: ReleaseMilestone | null }
  | null

export default function ReleaseCalendarPage() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const canEdit = user?.role === 'superadmin'
  const locale = i18n.language.startsWith('tr') ? tr : enUS

  const [view, setView] = useState<'roadmap' | 'list'>('roadmap')
  const [modal, setModal] = useState<ModalState>(null)
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const { data: releases = [], isLoading } = useReleases()

  const createRelease = useCreateRelease()
  const updateRelease = useUpdateRelease()
  const deleteRelease = useDeleteRelease()
  const addPhase = useAddPhase()
  const updatePhase = useUpdatePhase()
  const deletePhase = useDeletePhase()
  const addMilestone = useAddMilestone()
  const updateMilestone = useUpdateMilestone()
  const deleteMilestone = useDeleteMilestone()

  const sorted = [...releases].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
  const hasDates = releases.some((r) => r.phases.length > 0 || r.milestones.length > 0)

  // ─── Export ──────────────────────────────────────────────────────────────

  async function renderCanvas(): Promise<HTMLCanvasElement> {
    const svg = svgRef.current
    if (!svg) throw new Error('SVG element not found')
    const xml = new XMLSerializer().serializeToString(svg)
    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
    const w = Number(svg.getAttribute('width')) || 800
    const h = Number(svg.getAttribute('height')) || 400
    const img = new Image()
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('SVG render failed'))
      img.src = dataUrl
    })
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0, w, h)
    return canvas
  }

  function triggerDownload(url: string, filename: string) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function exportPng() {
    setExporting('png')
    try {
      const canvas = await renderCanvas()
      await new Promise<void>((res, rej) => {
        canvas.toBlob((b) => {
          if (!b) { rej(new Error('Canvas toBlob failed')); return }
          triggerDownload(URL.createObjectURL(b), 'release-takvimi.png')
          res()
        }, 'image/png')
      })
      toast.success(t('releases.export_success'))
    } catch (e) {
      console.error('PNG export error:', e)
      toast.error(t('releases.export_error'))
    } finally {
      setExporting(null)
    }
  }

  async function exportPdf() {
    setExporting('pdf')
    try {
      const canvas = await renderCanvas()
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const wPx = canvas.width
      const hPx = canvas.height
      const orientation = wPx >= hPx ? 'landscape' : 'portrait'
      const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 24
      const ratio = Math.min((pageW - margin * 2) / wPx, (pageH - margin * 2) / hPx)
      const drawW = wPx * ratio
      const drawH = hPx * ratio
      pdf.addImage(imgData, 'JPEG', (pageW - drawW) / 2, (pageH - drawH) / 2, drawW, drawH)
      pdf.save('release-takvimi.pdf')
      toast.success(t('releases.export_success'))
    } catch (e) {
      console.error('PDF export error:', e)
      toast.error(t('releases.export_error'))
    } finally {
      setExporting(null)
    }
  }

  // ─── Save handlers ─────────────────────────────────────────────────────────

  async function handleDeleteRelease(id: string) {
    if (!confirm(t('releases.delete_release_confirm'))) return
    await deleteRelease.mutateAsync(id)
  }
  async function handleDeletePhase(releaseId: string, phaseId: string) {
    if (!confirm(t('releases.delete_phase_confirm'))) return
    await deletePhase.mutateAsync({ releaseId, phaseId })
  }
  async function handleDeleteMilestone(releaseId: string, milestoneId: string) {
    if (!confirm(t('releases.delete_milestone_confirm'))) return
    await deleteMilestone.mutateAsync({ releaseId, milestoneId })
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/30">
            <GanttChartSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('releases.title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('releases.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setView('roadmap')}
              title={t('releases.view_roadmap')}
              className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${
                view === 'roadmap' ? 'bg-primary-500 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <GanttChartSquare className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              title={t('releases.view_list')}
              className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${
                view === 'list' ? 'bg-primary-500 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Export (roadmap only) */}
          {view === 'roadmap' && hasDates && (
            <>
              <button
                onClick={exportPng}
                disabled={exporting !== null}
                className="px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5"
              >
                {exporting === 'png' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                PNG
              </button>
              <button
                onClick={exportPdf}
                disabled={exporting !== null}
                className="px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5"
              >
                {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                PDF
              </button>
            </>
          )}

          {canEdit && (
            <button
              onClick={() => setModal({ kind: 'release', release: null })}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm shadow-primary-500/30"
            >
              <Plus className="h-4 w-4" />
              {t('releases.add_release')}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Rocket className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-base font-medium text-gray-700 dark:text-gray-300">{t('releases.no_releases')}</p>
          {canEdit && (
            <button
              onClick={() => setModal({ kind: 'release', release: null })}
              className="px-4 py-2 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {t('releases.add_release')}
            </button>
          )}
        </div>
      ) : view === 'roadmap' ? (
        hasDates ? (
          <div className="bg-white rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <ReleaseGanttChart releases={sorted} t={t} locale={locale} svgRef={svgRef} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <CalendarDays className="h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('releases.no_dates')}</p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {sorted.map((rel) => (
            <ReleaseListCard
              key={rel.id}
              release={rel}
              canEdit={canEdit}
              t={t}
              onEditRelease={() => setModal({ kind: 'release', release: rel })}
              onDeleteRelease={() => handleDeleteRelease(rel.id)}
              onAddPhase={() => setModal({ kind: 'phase', releaseId: rel.id, phase: null })}
              onEditPhase={(p) => setModal({ kind: 'phase', releaseId: rel.id, phase: p })}
              onDeletePhase={(p) => handleDeletePhase(rel.id, p.id)}
              onAddMilestone={() => setModal({ kind: 'milestone', releaseId: rel.id, milestone: null })}
              onEditMilestone={(m) => setModal({ kind: 'milestone', releaseId: rel.id, milestone: m })}
              onDeleteMilestone={(m) => handleDeleteMilestone(rel.id, m.id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {modal?.kind === 'release' && (
        <ReleaseModal
          initial={modal.release}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.release) await updateRelease.mutateAsync({ id: modal.release.id, ...data })
            else await createRelease.mutateAsync(data)
          }}
        />
      )}
      {modal?.kind === 'phase' && (
        <PhaseModal
          initial={modal.phase}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.phase) await updatePhase.mutateAsync({ releaseId: modal.releaseId, phaseId: modal.phase.id, ...data })
            else await addPhase.mutateAsync({ releaseId: modal.releaseId, ...data })
          }}
        />
      )}
      {modal?.kind === 'milestone' && (
        <MilestoneModal
          initial={modal.milestone}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (modal.milestone) await updateMilestone.mutateAsync({ releaseId: modal.releaseId, milestoneId: modal.milestone.id, ...data })
            else await addMilestone.mutateAsync({ releaseId: modal.releaseId, ...data })
          }}
        />
      )}
    </div>
  )
}
