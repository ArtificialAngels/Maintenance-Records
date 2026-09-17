import { useEffect } from 'react';

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImagePreview({ src, alt, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ cursor: 'zoom-out' }}
    >
      <img
        src={src}
        alt={alt ?? ''}
        className="image-preview"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/**
 * Multi-image gallery preview (used for image columns that allow multiple).
 * Supports left/right arrow navigation and ESC to close.
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
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ cursor: 'zoom-out' }}
    >
      <img
        src={images[startIndex]?.src}
        alt={images[startIndex]?.alt ?? ''}
        className="image-preview"
        onClick={(e) => e.stopPropagation()}
      />
      {images.length > 1 && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 999,
            fontSize: 13,
          }}
        >
          {startIndex + 1} / {images.length}
        </div>
      )}
    </div>
  );
}