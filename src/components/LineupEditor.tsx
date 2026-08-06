import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { displayName, type Batter } from '../db'

// Drag-to-reorder list of batters. `order` is an array of batterIds; onChange
// gets the new order. Touch-capable so it works on a phone at the field.

function Row({ batter, index }: { batter: Batter; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: batter.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="list-item lineup-row">
      <span className="lineup-num">{index + 1}</span>
      <span className="grow">{batter.number ? `#${batter.number} ` : ''}{displayName(batter)}</span>
      <span className="pill">bats {batter.bats}</span>
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag ${displayName(batter)}`}
        {...attributes}
        {...listeners}
      >
        ≡
      </button>
    </div>
  )
}

export default function LineupEditor({
  order,
  batters,
  onChange,
}: {
  order: string[]
  batters: Batter[]
  onChange: (order: string[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )
  const byId = new Map(batters.map((b) => [b.id, b]))
  const rows = order.map((id) => byId.get(id)).filter((b): b is Batter => !!b)

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = order.indexOf(String(active.id))
    const to = order.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    onChange(arrayMove(order, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="list">
          {rows.map((b, i) => <Row key={b.id} batter={b} index={i} />)}
        </div>
      </SortableContext>
    </DndContext>
  )
}
