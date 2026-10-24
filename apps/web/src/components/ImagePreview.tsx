import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icons';

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

/** Shared shell: backdrop + close button + Esc handling + exit animation. */
function useLeavingClose(onClose: () => void) {
  const [leaving, setLeaving] = useState(false);
  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, 180);
  }, [onClose]);
  return { leaving, close };
}

export function ImagePreview({ src, alt, onClose }: Props) {
  const { leaving, close } = useLeavingClose(onClose);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      className={`modal-backdrop ${leaving ? 'leaving' : ''}`}
      onClick={close}
      style={{ cursor: 'zoom-out' }}
    >
      <img
        key={src}
        src={src}
        alt={alt ?? ''}
        className="image-preview"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        className="gallery-close"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        aria-label="关闭预览"
      >
        <Icon name="x" size={19} />
      </button>
    </div>
  );
}

/**
 * Multi-image gallery preview (used for image columns that allow multiple).
 * Supports left/right arrow navigation (buttons + keyboard), counter, ESC.
 */
export function ImageGallery({
  images,
  startIndex = 0,
  onClose,
}: {
  images: { src: string; alt?: string }[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, images.length - 1)));
  const { leaving, close } = useLeavingClose(onClose);

  const prev = useCallback(
    () => setIndex((i) => (i - 1 + images.length) % images.length),
    [images.length],
  );
  const next = useCallback(
    () => setIndex((i) => (i + 1) % images.length),
    [images.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, prev, next]);

  const current = images[index];
  const multi = images.length > 1;

  return (
    <div
      className={`modal-backdrop ${leaving ? 'leaving' : ''}`}
      onClick={close}
      style={{ cursor: 'zoom-out' }}
    >
      <img
        key={current?.src}
        src={current?.src}
        alt={current?.alt ?? ''}
        className="image-preview"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        className="gallery-close"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        aria-label="关闭预览"
      >
        <Icon name="x" size={19} />
      </button>
      {multi && (
        <>
          <button
            className="gallery-nav prev"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="上一张"
          >
            <Icon name="chevron-left" size={22} />
          </button>
          <button
            className="gallery-nav next"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="下一张"
          >
            <Icon name="chevron-right" size={22} />
          </button>
          <div className="gallery-counter" onClick={(e) => e.stopPropagation()}>
            {index + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
}
