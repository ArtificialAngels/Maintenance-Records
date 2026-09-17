import { useRef, useState, useCallback } from 'react';

/**
 * Drag-to-resize handle. Streams width to parent during drag for live feedback,
 * commits to persisted store on mouseup.
 */
export function useColumnResize(opts: {
  initialWidth: number;
  minWidth?: number;
  /** Stream the in-progress width so the grid can reflow while dragging. */
  onLive?: (width: number) => void;
  /** Persist the final width on mouseup. */
  onCommit: (finalWidth: number) => void;
}) {
  const { initialWidth, minWidth = 60, onLive, onCommit } = opts;
  const [width, setWidth] = useState(initialWidth);
  const startX = useRef(0);
  const startW = useRef(initialWidth);
  const lastW = useRef(initialWidth);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startX.current = e.clientX;
      startW.current = initialWidth;
      lastW.current = initialWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX.current;
        const next = Math.max(minWidth, startW.current + delta);
        lastW.current = next;
        setWidth(next);
        // Stream to parent — without this, drag gives zero visual feedback
        // (parent's gridTemplateColumns won't change until mouseup).
        onLive?.(next);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        onCommit(lastW.current);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [initialWidth, minWidth, onLive, onCommit],
  );

  return { width, onMouseDown };
}

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  visible?: boolean;
}

export function ResizeHandle({ onMouseDown, visible }: ResizeHandleProps) {
  return (
    <span
      role="separator"
      aria-label="拖动调整列宽"
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 6,
        cursor: 'col-resize',
        background: visible ? 'var(--primary)' : 'transparent',
        borderRight: visible ? '2px solid var(--primary)' : 'none',
        opacity: visible ? 0.6 : 0,
        transition: 'opacity var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out)',
        zIndex: 3,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLSpanElement).style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        if (!visible) (e.currentTarget as HTMLSpanElement).style.opacity = '0';
      }}
    />
  );
}