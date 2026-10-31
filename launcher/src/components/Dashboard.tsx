import { GripVertical, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { HomeBlockId, HomeBlockLayout } from '@shared/types';

export const GRID_COLUMNS = 12;
const ROW_HEIGHT = 36;
const GAP = 16;
export const MIN_W = 3;
export const MAX_H = 24;
export const MIN_H = 2;

export interface BlockDef {
  title: string;
  render(): ReactNode;
  /** Keep the content clickable in edit mode (it has its own edit controls). */
  interactiveInEdit?: boolean;
}

interface Props {
  blocks: Record<HomeBlockId, BlockDef>;
  layout: HomeBlockLayout[];
  editing: boolean;
  /** Live update while dragging or resizing. */
  onChange(layout: HomeBlockLayout[]): void;
  /** Final state to persist. */
  onCommit(layout: HomeBlockLayout[]): void;
}

/**
 * 12-column grid of home blocks. In edit mode blocks can be reordered by
 * dragging their handle, resized from their bottom-right corner (snapped to
 * the grid) and hidden.
 */
export function Dashboard({ blocks, layout, editing, onChange, onCommit }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<HomeBlockId | null>(null);
  const latest = useRef(layout);
  latest.current = layout;

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const colWidth = (width - GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  // On narrow windows small blocks are widened so their content stays readable.
  const effectiveW = (w: number) => (width < 640 ? GRID_COLUMNS : width < 900 ? Math.max(w, 6) : w);

  const moveBefore = (dragId: HomeBlockId, targetId: HomeBlockId) => {
    if (dragId === targetId) return;
    const list = [...latest.current];
    const from = list.findIndex((b) => b.id === dragId);
    const to = list.findIndex((b) => b.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    onChange(list);
  };

  const update = (id: HomeBlockId, patch: Partial<HomeBlockLayout>, commit = false) => {
    const next = latest.current.map((b) => (b.id === id ? { ...b, ...patch } : b));
    onChange(next);
    if (commit) onCommit(next);
  };

  const startResize = (e: React.PointerEvent, block: HomeBlockLayout) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const { w, h } = block;
    const onMove = (ev: PointerEvent) => {
      const dw = Math.round((ev.clientX - startX) / (colWidth + GAP));
      const dh = Math.round((ev.clientY - startY) / (ROW_HEIGHT + GAP));
      const nw = Math.min(GRID_COLUMNS, Math.max(MIN_W, w + dw));
      const nh = Math.min(MAX_H, Math.max(MIN_H, h + dh));
      const cur = latest.current.find((b) => b.id === block.id);
      if (cur && (cur.w !== nw || cur.h !== nh)) update(block.id, { w: nw, h: nh });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('resizing');
      onCommit(latest.current);
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Commit the order when a drag ends anywhere.
  useEffect(() => {
    if (!dragging) return;
    const end = () => {
      setDragging(null);
      onCommit(latest.current);
    };
    window.addEventListener('dragend', end);
    return () => window.removeEventListener('dragend', end);
  }, [dragging, onCommit]);

  return (
    <div ref={gridRef} className={`dashboard${editing ? ' editing' : ''}`} style={{ gridAutoRows: ROW_HEIGHT, gap: GAP }}>
      {layout
        .filter((b) => !b.hidden && blocks[b.id])
        .map((b) => {
          const def = blocks[b.id];
          const style: CSSProperties = { gridColumn: `span ${effectiveW(b.w)}`, gridRow: `span ${b.h}` };
          return (
            <div
              key={b.id}
              className={`dash-block${dragging === b.id ? ' dragging' : ''}`}
              style={style}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                moveBefore(dragging, b.id);
              }}
            >
              <div className={`dash-content${editing && !def.interactiveInEdit ? ' inert' : ''}`}>{def.render()}</div>
              {editing && (
                <>
                  <div className="dash-toolbar">
                    <span
                      className="dash-handle"
                      draggable
                      title="Glisser pour déplacer"
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', b.id);
                        setDragging(b.id);
                      }}
                    >
                      <GripVertical size={14} /> {def.title}
                    </span>
                    <span className="dash-size">
                      {b.w}×{b.h}
                    </span>
                    <button className="dash-remove" title="Retirer ce bloc" onClick={() => update(b.id, { hidden: true }, true)}>
                      <X size={14} />
                    </button>
                  </div>
                  <span className="dash-resize" title="Glisser pour redimensionner" onPointerDown={(e) => startResize(e, b)} />
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}
