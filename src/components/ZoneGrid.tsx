import type { Zone } from '../db'
import type { BattleAgg } from '../lib/stats'
import { battleRate } from '../lib/stats'

// Strike zone from the catcher's point of view: a 3x3 in-zone grid surrounded
// by four out-of-zone strips (high / low / left / right).
//
// Tap to choose where a pitch went (when onSelect is given), and/or color the
// regions by how the battle went there (when heat is given) — green = our
// pitch won (strikes, fouls, outs), red = they hit it. Both can be active at
// once: during a game the grid is a heat map AND the location picker.

const CELLS: Array<{ zone: Zone; style: React.CSSProperties; label?: string }> = [
  { zone: 'o-up', style: { gridColumn: '2 / 5', gridRow: '1' }, label: '↑' },
  { zone: 'o-left', style: { gridColumn: '1', gridRow: '2 / 5' }, label: '←' },
  { zone: 1, style: { gridColumn: '2', gridRow: '2' } },
  { zone: 2, style: { gridColumn: '3', gridRow: '2' } },
  { zone: 3, style: { gridColumn: '4', gridRow: '2' } },
  { zone: 4, style: { gridColumn: '2', gridRow: '3' } },
  { zone: 5, style: { gridColumn: '3', gridRow: '3' } },
  { zone: 6, style: { gridColumn: '4', gridRow: '3' } },
  { zone: 7, style: { gridColumn: '2', gridRow: '4' } },
  { zone: 8, style: { gridColumn: '3', gridRow: '4' } },
  { zone: 9, style: { gridColumn: '4', gridRow: '4' } },
  { zone: 'o-right', style: { gridColumn: '5', gridRow: '2 / 5' }, label: '→' },
  { zone: 'o-down', style: { gridColumn: '2 / 5', gridRow: '5' }, label: '↓' },
]

function heatColor(rate: number): string {
  // 0 = red (they hit it), 1 = green (we won the pitch)
  const hue = Math.round(rate * 120)
  return `hsl(${hue}, 55%, 30%)`
}

export default function ZoneGrid(props: {
  selected?: Zone | null
  onSelect?: (z: Zone) => void
  heat?: Map<Zone, BattleAgg>
  compact?: boolean
}) {
  const { selected, onSelect, heat, compact } = props
  return (
    <div className={`zone-grid ${compact ? 'zone-grid-compact' : ''}`}>
      {CELLS.map(({ zone, style, label }) => {
        const inZone = typeof zone === 'number'
        let bg: string | undefined
        let text = label ?? ''
        if (heat) {
          const agg = heat.get(zone)
          if (agg && agg.total > 0) {
            const rate = battleRate(agg)
            bg = rate === null ? '#64748b' : heatColor(rate)
            text = String(agg.total)
          } else if (!onSelect) {
            // pure heat map (report pages): blank empty cells
            text = ''
          }
        }
        const cls = [
          'zone-cell',
          inZone ? 'zone-in' : 'zone-out',
          selected === zone ? 'zone-selected' : '',
        ].join(' ')
        return (
          <button
            key={String(zone)}
            type="button"
            className={cls}
            style={{ ...style, ...(bg ? { background: bg, color: '#fff' } : {}) }}
            onClick={onSelect ? () => onSelect(zone) : undefined}
            data-zone={String(zone)}
            disabled={!onSelect}
          >
            {text}
          </button>
        )
      })}
    </div>
  )
}
