import { X } from 'lucide-react'
import type { TaskLabel } from '@/api/kanban'

interface Props {
  label: TaskLabel
  onRemove?: () => void
  small?: boolean
}

export default function LabelChip({ label, onRemove, small }: Props) {
  const bg = label.color + '22'  // 13% opacity background
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}`}
      style={{ backgroundColor: bg, color: label.color, border: `1px solid ${label.color}44` }}
    >
      <span
        className={`rounded-full flex-shrink-0 ${small ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}
        style={{ backgroundColor: label.color }}
      />
      {label.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 hover:opacity-70"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  )
}
