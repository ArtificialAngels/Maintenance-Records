/**
 * Inline SVG icon set (lucide-style, currentColor, stroke-width 2).
 * One component, takes a `name` prop.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export type IconName =
  | 'layout-grid'
  | 'columns-3'
  | 'tag'
  | 'bar-chart-3'
  | 'history'
  | 'user'
  | 'log-out'
  | 'chevron-left'
  | 'chevron-right'
  | 'plus'
  | 'eye'
  | 'image'
  | 'trash'
  | 'check'
  | 'x'
  | 'info'
  | 'alert';

const PATHS: Record<IconName, string> = {
  'layout-grid':
    'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  'columns-3':
    'M3 3h18v18H3zM9 3v18',
  tag: 'M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
  'bar-chart-3':
    'M3 3v18h18M7 16V9m5 7V5m5 11v-3',
  history:
    'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2',
  user:
    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'log-out':
    'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  plus: 'M12 5v14M5 12h14',
  eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  image:
    'M3 5h18v14H3zM3 17l5-5 4 4 3-3 6 6M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  trash:
    'M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  info: 'M12 16v-4M12 8h.01M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z',
  alert: 'M12 9v4M12 17h.01M12 2 1 22h22z',
};

export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}