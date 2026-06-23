import { useMemo } from 'react'
import type { Locale } from 'date-fns'
import {
  parseISO, isValid, startOfMonth, endOfMonth, addMonths, addDays, getDaysInMonth, format,
} from 'date-fns'
import type { Release } from '@/api/releases'
import {
  STATUS_COLOR, STATUS_TEXT, MILESTONE_COLOR, STATUS_KEYS, MILESTONE_KEYS,
  STATUS_LABEL_KEY, MILESTONE_LABEL_KEY,
} from '@/lib/releaseMeta'

type TFn = (key: string) => string

const LEFT_W = 240
const MONTH_W = 92
const TITLE_H = 46
const HEADER_Q_H = 30
const HEADER_M_H = 30
const ROW_H = 34
const BAR_H = 22
const MS_H = 32
const GROUP_PAD = 8
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const words = raw.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = ''
    for (const w of words) {
      if (!line) line = w
      else if ((line + ' ' + w).length <= maxChars) line += ' ' + w
      else {
        out.push(line)
        line = w
      }
    }
    if (line) out.push(line)
  }
  if (out.length > maxLines) {
    const trimmed = out.slice(0, maxLines)
    trimmed[maxLines - 1] = trimmed[maxLines - 1].slice(0, maxChars - 1) + '…'
    return trimmed
  }
  return out
}

export default function ReleaseGanttChart({
  releases,
  t,
  locale,
  svgRef,
}: {
  releases: Release[]
  t: TFn
  locale: Locale
  svgRef?: React.Ref<SVGSVGElement>
}) {
  const layout = useMemo(() => {
    const allDates: Date[] = []
    for (const rel of releases) {
      for (const ph of rel.phases) {
        const s = parseISO(ph.start_date)
        const e = parseISO(ph.end_date)
        if (isValid(s)) allDates.push(s)
        if (isValid(e)) allDates.push(e)
      }
      for (const ms of rel.milestones) {
        const d = parseISO(ms.date)
        if (isValid(d)) allDates.push(d)
      }
    }
    if (allDates.length === 0) return null

    const minDate = startOfMonth(new Date(Math.min(...allDates.map((d) => d.getTime()))))
    const maxDate = endOfMonth(new Date(Math.max(...allDates.map((d) => d.getTime()))))

    const months: { date: Date; label: string }[] = []
    let cur = minDate
    while (cur <= maxDate) {
      months.push({ date: cur, label: format(cur, 'LLL', { locale }) })
      cur = addMonths(cur, 1)
    }
    const minY = minDate.getFullYear()
    const minM = minDate.getMonth()

    const xForDate = (d: Date): number => {
      const idx = (d.getFullYear() - minY) * 12 + (d.getMonth() - minM)
      if (idx < 0) return 0
      if (idx >= months.length) return months.length * MONTH_W
      const dim = getDaysInMonth(d)
      return idx * MONTH_W + ((d.getDate() - 1) / dim) * MONTH_W
    }

    // Quarter headers
    const quarters: { label: string; x: number; width: number }[] = []
    let qi = 0
    while (qi < months.length) {
      const m = months[qi]
      const q = Math.floor(m.date.getMonth() / 3) + 1
      const year = m.date.getFullYear()
      let qj = qi
      while (
        qj < months.length &&
        Math.floor(months[qj].date.getMonth() / 3) + 1 === q &&
        months[qj].date.getFullYear() === year
      )
        qj++
      quarters.push({ label: `${year} Q${q}`, x: qi * MONTH_W, width: (qj - qi) * MONTH_W })
      qi = qj
    }

    const gridTop = TITLE_H + HEADER_Q_H + HEADER_M_H

    let y = gridTop
    const groups = releases.map((rel) => {
      const phases = [...rel.phases].sort(
        (a, b) => a.display_order - b.display_order || a.start_date.localeCompare(b.start_date),
      )
      const nRows = Math.max(phases.length, 1)
      const hasMs = rel.milestones.length > 0
      const descLines = rel.description ? wrap(rel.description, 38, 8) : []
      const leftH = 24 + descLines.length * 12 + 6
      const phasesH = GROUP_PAD + nRows * ROW_H + (hasMs ? MS_H : 0) + GROUP_PAD
      const height = Math.max(phasesH, leftH)
      const g = { rel, phases, descLines, top: y, height, nRows, hasMs }
      y += height
      return g
    })
    const contentBottom = y

    const totalWidth = LEFT_W + months.length * MONTH_W

    // Legend items (positions computed for export SVG at totalWidth)
    const legendItems = [
      ...STATUS_KEYS.map((s) => ({ kind: 'status' as const, color: STATUS_COLOR[s], label: t(STATUS_LABEL_KEY[s]) })),
      ...MILESTONE_KEYS.map((m) => ({ kind: 'ms' as const, color: MILESTONE_COLOR[m], label: t(MILESTONE_LABEL_KEY[m]) })),
    ]
    const LEG_ROW_H = 26
    const SWATCH = 26
    const GAP = 8
    const ITEM_GAP = 24
    let lx = 16
    let ly = 0
    const legend = legendItems.map((it) => {
      const wEst = SWATCH + GAP + it.label.length * 6.6 + ITEM_GAP
      if (lx + wEst > totalWidth - 16 && lx > 16) {
        lx = 16
        ly += LEG_ROW_H
      }
      const pos = { ...it, x: lx, y: ly }
      lx += wEst
      return pos
    })
    const legendTop = contentBottom + 16
    const legendH = ly + LEG_ROW_H
    const totalHeight = legendTop + legendH + 12

    return {
      months, quarters, xForDate, groups, gridTop, totalWidth, totalHeight,
      legend, legendItems, legendTop, contentBottom,
      LEG_ROW_H, SWATCH, GAP, ITEM_GAP,
    }
  }, [releases, t, locale])

  if (!layout) {
    return null
  }

  const {
    months, quarters, xForDate, groups, gridTop, totalWidth, totalHeight,
    legend, legendItems, legendTop, contentBottom,
    LEG_ROW_H, SWATCH, GAP, ITEM_GAP,
  } = layout

  // ─── Export SVG (hidden, full width) ─────────────────────────────────────

  const els: React.ReactNode[] = []

  els.push(<rect key="bg" x={0} y={0} width={totalWidth} height={totalHeight} fill="#ffffff" />)
  els.push(
    <text key="title" x={16} y={30} fontFamily={FONT} fontSize={22} fontWeight={700} fill="#2563eb">
      {t('releases.title')}
    </text>,
  )
  groups.forEach((g, gi) => {
    els.push(<rect key={`band-${gi}`} x={0} y={g.top} width={totalWidth} height={g.height} fill={gi % 2 === 0 ? '#eef2f7' : '#e2e8f0'} />)
    els.push(<text key={`rname-${gi}`} x={14} y={g.top + 22} fontFamily={FONT} fontSize={15} fontWeight={700} fill="#111827">{g.rel.name}</text>)
    g.descLines.forEach((line, li) => {
      els.push(<text key={`rdesc-${gi}-${li}`} x={14} y={g.top + 38 + li * 12} fontFamily={FONT} fontSize={10} fill="#4b5563">{line}</text>)
    })
  })
  months.forEach((_, mi) => {
    const x = LEFT_W + mi * MONTH_W
    els.push(<line key={`grid-${mi}`} x1={x} y1={gridTop} x2={x} y2={contentBottom} stroke="#cbd5e1" strokeWidth={1} />)
  })
  els.push(<line key="grid-right" x1={totalWidth} y1={gridTop} x2={totalWidth} y2={contentBottom} stroke="#cbd5e1" strokeWidth={1} />)
  els.push(<line key="divider" x1={LEFT_W} y1={TITLE_H} x2={LEFT_W} y2={contentBottom} stroke="#94a3b8" strokeWidth={1.5} />)
  quarters.forEach((q, i) => {
    els.push(<g key={`q-${i}`}>
      <rect x={LEFT_W + q.x} y={TITLE_H} width={q.width} height={HEADER_Q_H} fill="#cddc39" stroke="#ffffff" strokeWidth={1} />
      <text x={LEFT_W + q.x + q.width / 2} y={TITLE_H + HEADER_Q_H / 2 + 5} fontFamily={FONT} fontSize={14} fontWeight={700} fill="#1a1a1a" textAnchor="middle">{q.label}</text>
    </g>)
  })
  els.push(<rect key="corner-q" x={0} y={TITLE_H} width={LEFT_W} height={HEADER_Q_H} fill="#cddc39" stroke="#ffffff" strokeWidth={1} />)
  els.push(<rect key="corner-m" x={0} y={TITLE_H + HEADER_Q_H} width={LEFT_W} height={HEADER_M_H} fill="#2b87f0" stroke="#ffffff" strokeWidth={1} />)
  els.push(<text key="corner-label" x={14} y={TITLE_H + HEADER_Q_H + HEADER_M_H / 2 + 5} fontFamily={FONT} fontSize={13} fontWeight={700} fill="#ffffff">{t('releases.release_col')}</text>)
  months.forEach((m, mi) => {
    els.push(<g key={`m-${mi}`}>
      <rect x={LEFT_W + mi * MONTH_W} y={TITLE_H + HEADER_Q_H} width={MONTH_W} height={HEADER_M_H} fill="#2b87f0" stroke="#ffffff" strokeWidth={1} />
      <text x={LEFT_W + mi * MONTH_W + MONTH_W / 2} y={TITLE_H + HEADER_Q_H + HEADER_M_H / 2 + 5} fontFamily={FONT} fontSize={13} fontWeight={600} fill="#ffffff" textAnchor="middle">{m.label}</text>
    </g>)
  })
  groups.forEach((g, gi) => {
    g.phases.forEach((ph, pi) => {
      const s = parseISO(ph.start_date)
      const e = parseISO(ph.end_date)
      if (!isValid(s) || !isValid(e)) return
      const left = LEFT_W + xForDate(s)
      const right = LEFT_W + xForDate(addDays(e, 1))
      const w = Math.max(right - left, 4)
      const rowY = g.top + GROUP_PAD + pi * ROW_H
      const barY = rowY + (ROW_H - BAR_H) / 2
      const notch = Math.min(10, w / 3)
      const fill = STATUS_COLOR[ph.status]
      const points = `${left},${barY} ${left + w - notch},${barY} ${left + w},${barY + BAR_H / 2} ${left + w - notch},${barY + BAR_H} ${left},${barY + BAR_H}`
      const labelFits = w > ph.name.length * 6.4 + 16
      els.push(<g key={`bar-${gi}-${pi}`}>
        <polygon points={points} fill={fill} stroke="#ffffff" strokeWidth={1} />
        <title>{`${ph.name} (${ph.start_date} → ${ph.end_date})`}</title>
        {labelFits
          ? <text x={left + (w - notch) / 2} y={barY + BAR_H / 2 + 4} fontFamily={FONT} fontSize={11} fontWeight={600} fill={STATUS_TEXT[ph.status]} textAnchor="middle">{ph.name}</text>
          : <text x={left + w + 6} y={barY + BAR_H / 2 + 4} fontFamily={FONT} fontSize={11} fontWeight={600} fill="#374151">{ph.name}</text>}
      </g>)
    })
    if (g.hasMs) {
      const msY = g.top + GROUP_PAD + g.nRows * ROW_H + MS_H / 2
      g.rel.milestones.forEach((ms, mi) => {
        const d = parseISO(ms.date)
        if (!isValid(d)) return
        const cx = LEFT_W + xForDate(d)
        const s = 7
        const points = `${cx},${msY - s} ${cx + s},${msY} ${cx},${msY + s} ${cx - s},${msY}`
        els.push(<g key={`ms-${gi}-${mi}`}>
          <polygon points={points} fill={MILESTONE_COLOR[ms.type]} stroke="#ffffff" strokeWidth={1} />
          <title>{`${t(MILESTONE_LABEL_KEY[ms.type])}${ms.label ? ' — ' + ms.label : ''} (${ms.date})`}</title>
        </g>)
      })
    }
  })
  legend.forEach((it, i) => {
    const x = it.x
    const y = legendTop + it.y
    if (it.kind === 'status') {
      const w = 26, h = 14, notch = 6
      els.push(<polygon key={`leg-${i}`} points={`${x},${y} ${x + w - notch},${y} ${x + w},${y + h / 2} ${x + w - notch},${y + h} ${x},${y + h}`} fill={it.color} />)
    } else {
      const cx = x + 13, cy = y + 7, s = 7
      els.push(<polygon key={`leg-${i}`} points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`} fill={it.color} />)
    }
    els.push(<text key={`legt-${i}`} x={x + 34} y={y + 12} fontFamily={FONT} fontSize={11} fill="#1f2937">{it.label}</text>)
  })

  // ─── Display: left sticky column + right scrollable timeline ─────────────

  const rightW = totalWidth - LEFT_W

  // Recompute legend positions for the right panel width
  let lxR = 16, lyR = 0
  const legendRight = legendItems.map((it) => {
    const wEst = SWATCH + GAP + it.label.length * 6.6 + ITEM_GAP
    if (lxR + wEst > rightW - 16 && lxR > 16) { lxR = 16; lyR += LEG_ROW_H }
    const pos = { ...it, x: lxR, y: lyR }
    lxR += wEst
    return pos
  })
  const legendHR = lyR + LEG_ROW_H
  const displayHeight = Math.max(totalHeight, legendTop + legendHR + 12)

  // ─── Left panel elements ──────────────────────────────────────────────────

  const leftEls: React.ReactNode[] = []

  leftEls.push(<rect key="bg" x={0} y={0} width={LEFT_W} height={displayHeight} fill="#ffffff" />)
  leftEls.push(
    <text key="title" x={16} y={30} fontFamily={FONT} fontSize={22} fontWeight={700} fill="#2563eb">
      {t('releases.title')}
    </text>,
  )
  groups.forEach((g, gi) => {
    leftEls.push(<rect key={`band-${gi}`} x={0} y={g.top} width={LEFT_W} height={g.height} fill={gi % 2 === 0 ? '#eef2f7' : '#e2e8f0'} />)
    leftEls.push(<text key={`rname-${gi}`} x={14} y={g.top + 22} fontFamily={FONT} fontSize={15} fontWeight={700} fill="#111827">{g.rel.name}</text>)
    g.descLines.forEach((line, li) => {
      leftEls.push(<text key={`rdesc-${gi}-${li}`} x={14} y={g.top + 38 + li * 12} fontFamily={FONT} fontSize={10} fill="#4b5563">{line}</text>)
    })
  })
  leftEls.push(<rect key="corner-q" x={0} y={TITLE_H} width={LEFT_W} height={HEADER_Q_H} fill="#cddc39" stroke="#ffffff" strokeWidth={1} />)
  leftEls.push(<rect key="corner-m" x={0} y={TITLE_H + HEADER_Q_H} width={LEFT_W} height={HEADER_M_H} fill="#2b87f0" stroke="#ffffff" strokeWidth={1} />)
  leftEls.push(
    <text key="corner-label" x={14} y={TITLE_H + HEADER_Q_H + HEADER_M_H / 2 + 5} fontFamily={FONT} fontSize={13} fontWeight={700} fill="#ffffff">
      {t('releases.release_col')}
    </text>,
  )
  // Right-edge shadow/border so left panel has a clear visual edge
  leftEls.push(<line key="divider" x1={LEFT_W - 0.75} y1={TITLE_H} x2={LEFT_W - 0.75} y2={contentBottom} stroke="#94a3b8" strokeWidth={1.5} />)

  // ─── Right panel elements ─────────────────────────────────────────────────

  const rightEls: React.ReactNode[] = []

  rightEls.push(<rect key="bg" x={0} y={0} width={rightW} height={displayHeight} fill="#ffffff" />)
  groups.forEach((g, gi) => {
    rightEls.push(<rect key={`band-${gi}`} x={0} y={g.top} width={rightW} height={g.height} fill={gi % 2 === 0 ? '#eef2f7' : '#e2e8f0'} />)
  })
  months.forEach((_, mi) => {
    const x = mi * MONTH_W
    rightEls.push(<line key={`grid-${mi}`} x1={x} y1={gridTop} x2={x} y2={contentBottom} stroke="#cbd5e1" strokeWidth={1} />)
  })
  rightEls.push(<line key="grid-right" x1={rightW} y1={gridTop} x2={rightW} y2={contentBottom} stroke="#cbd5e1" strokeWidth={1} />)
  quarters.forEach((q, i) => {
    rightEls.push(<g key={`q-${i}`}>
      <rect x={q.x} y={TITLE_H} width={q.width} height={HEADER_Q_H} fill="#cddc39" stroke="#ffffff" strokeWidth={1} />
      <text x={q.x + q.width / 2} y={TITLE_H + HEADER_Q_H / 2 + 5} fontFamily={FONT} fontSize={14} fontWeight={700} fill="#1a1a1a" textAnchor="middle">{q.label}</text>
    </g>)
  })
  months.forEach((m, mi) => {
    rightEls.push(<g key={`m-${mi}`}>
      <rect x={mi * MONTH_W} y={TITLE_H + HEADER_Q_H} width={MONTH_W} height={HEADER_M_H} fill="#2b87f0" stroke="#ffffff" strokeWidth={1} />
      <text x={mi * MONTH_W + MONTH_W / 2} y={TITLE_H + HEADER_Q_H + HEADER_M_H / 2 + 5} fontFamily={FONT} fontSize={13} fontWeight={600} fill="#ffffff" textAnchor="middle">{m.label}</text>
    </g>)
  })
  groups.forEach((g, gi) => {
    g.phases.forEach((ph, pi) => {
      const s = parseISO(ph.start_date)
      const e = parseISO(ph.end_date)
      if (!isValid(s) || !isValid(e)) return
      const left = xForDate(s)
      const right = xForDate(addDays(e, 1))
      const w = Math.max(right - left, 4)
      const rowY = g.top + GROUP_PAD + pi * ROW_H
      const barY = rowY + (ROW_H - BAR_H) / 2
      const notch = Math.min(10, w / 3)
      const fill = STATUS_COLOR[ph.status]
      const points = `${left},${barY} ${left + w - notch},${barY} ${left + w},${barY + BAR_H / 2} ${left + w - notch},${barY + BAR_H} ${left},${barY + BAR_H}`
      const labelFits = w > ph.name.length * 6.4 + 16
      rightEls.push(<g key={`bar-${gi}-${pi}`}>
        <polygon points={points} fill={fill} stroke="#ffffff" strokeWidth={1} />
        <title>{`${ph.name} (${ph.start_date} → ${ph.end_date})`}</title>
        {labelFits
          ? <text x={left + (w - notch) / 2} y={barY + BAR_H / 2 + 4} fontFamily={FONT} fontSize={11} fontWeight={600} fill={STATUS_TEXT[ph.status]} textAnchor="middle">{ph.name}</text>
          : <text x={left + w + 6} y={barY + BAR_H / 2 + 4} fontFamily={FONT} fontSize={11} fontWeight={600} fill="#374151">{ph.name}</text>}
      </g>)
    })
    if (g.hasMs) {
      const msY = g.top + GROUP_PAD + g.nRows * ROW_H + MS_H / 2
      g.rel.milestones.forEach((ms, mi) => {
        const d = parseISO(ms.date)
        if (!isValid(d)) return
        const cx = xForDate(d)
        const s = 7
        const pts = `${cx},${msY - s} ${cx + s},${msY} ${cx},${msY + s} ${cx - s},${msY}`
        rightEls.push(<g key={`ms-${gi}-${mi}`}>
          <polygon points={pts} fill={MILESTONE_COLOR[ms.type]} stroke="#ffffff" strokeWidth={1} />
          <title>{`${t(MILESTONE_LABEL_KEY[ms.type])}${ms.label ? ' — ' + ms.label : ''} (${ms.date})`}</title>
        </g>)
      })
    }
  })
  legendRight.forEach((it, i) => {
    const x = it.x
    const y = legendTop + it.y
    if (it.kind === 'status') {
      const w = 26, h = 14, notch = 6
      rightEls.push(<polygon key={`leg-${i}`} points={`${x},${y} ${x + w - notch},${y} ${x + w},${y + h / 2} ${x + w - notch},${y + h} ${x},${y + h}`} fill={it.color} />)
    } else {
      const cx = x + 13, cy = y + 7, s = 7
      rightEls.push(<polygon key={`leg-${i}`} points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`} fill={it.color} />)
    }
    rightEls.push(<text key={`legt-${i}`} x={x + 34} y={y + 12} fontFamily={FONT} fontSize={11} fill="#1f2937">{it.label}</text>)
  })

  return (
    <>
      {/* Hidden export SVG — keeps svgRef intact for PNG/PDF export */}
      <svg
        ref={svgRef}
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        style={{ display: 'none' }}
      >
        {els}
      </svg>

      {/* Sticky-column display: overflow-x on outer div, sticky left panel inside */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex' }}>
          {/* Left column — sticks to left edge while timeline scrolls */}
          <div style={{ position: 'sticky', left: 0, zIndex: 10, flexShrink: 0 }}>
            <svg width={LEFT_W} height={displayHeight} style={{ display: 'block' }}>
              {leftEls}
            </svg>
          </div>
          {/* Timeline — scrolls horizontally */}
          <svg width={rightW} height={displayHeight} style={{ display: 'block', flexShrink: 0 }}>
            {rightEls}
          </svg>
        </div>
      </div>
    </>
  )
}
