import type { BasemapId } from '../../map/types';

// Hand-drawn 72x48 thumbnails: one abstract coastline, tinted per basemap.
const LAND = 'M6 30c2-6 8-9 12-8 3-4 9-6 13-3 2-2 6-2 8 1 4-1 8 1 9 5-3 2-3 5-7 6-3 3-8 2-11 1-4 3-10 3-14 0-4 0-8-1-10-2z';
const ISLE = 'M52 13c2-2 6-2 8 0 1 2-1 4-4 4-3 0-5-2-4-4z';

export function Thumb({ id }: { id: BasemapId }) {
  const common = { width: 72, height: 48, viewBox: '0 0 72 48', 'aria-hidden': true as const };
  switch (id) {
    case 'orbis-dark':
      return (
        <svg {...common}>
          <rect width="72" height="48" fill="#0b1220" />
          <path d={LAND} fill="#172136" stroke="#2c3d58" stroke-width="1" />
          <path d={ISLE} fill="#172136" stroke="#2c3d58" />
          <path d="M0 40h72M0 14h72M24 0v48M48 0v48" stroke="#16202f" stroke-width="0.6" />
        </svg>
      );
    case 'orbis-light':
      return (
        <svg {...common}>
          <rect width="72" height="48" fill="#dfe8f1" />
          <path d={LAND} fill="#f6f4ee" stroke="#b7c3d1" stroke-width="1" />
          <path d={ISLE} fill="#f6f4ee" stroke="#b7c3d1" />
          <path d="M0 40h72M0 14h72M24 0v48M48 0v48" stroke="#cfd9e5" stroke-width="0.6" />
        </svg>
      );
    case 'satellite':
      return (
        <svg {...common}>
          <rect width="72" height="48" fill="#0d2438" />
          <path d={LAND} fill="#3f5a38" />
          <path d="M14 27c3-3 7-3 10 0 3-4 8-3 11-1 3-3 7-2 10 1-4 2-6 5-10 4-3 2-8 2-11 0-4 1-8 0-10-4z" fill="#5d6d45" opacity=".8" />
          <path d="M20 24c2 0 4 1 5 3M40 21c3-1 5 0 7 2M30 30c2 1 5 1 7 0" stroke="#8a7a52" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".7" />
          <path d={ISLE} fill="#46633d" />
        </svg>
      );
    case 'terrain':
      return (
        <svg {...common}>
          <rect width="72" height="48" fill="#cfe0e8" />
          <path d={LAND} fill="#d9dfb7" stroke="#a9b58a" stroke-width=".8" />
          <path d="M14 29c3-3 7-3 10-1M20 26c3-3 7-3 10-1M34 24c3-3 7-3 11-1M40 28c3-3 6-3 9 0M26 31c3-2 7-2 10 0" stroke="#b08b5a" stroke-width=".9" fill="none" opacity=".75" />
          <path d="M30 20c2-3 6-3 8-1M36 26c2-2 5-2 7 0" stroke="#8a6a3f" stroke-width=".9" fill="none" opacity=".85" />
          <path d={ISLE} fill="#d9dfb7" stroke="#a9b58a" stroke-width=".8" />
        </svg>
      );
    case 'bluemarble':
      return (
        <svg {...common}>
          <rect width="72" height="48" fill="#123a73" />
          <path d={LAND} fill="#4f8a4a" />
          <path d="M18 27c3-4 8-4 11-1 3-3 7-3 10 0-2 3-4 5-8 5-5 1-10 0-13-4z" fill="#b19b5a" opacity=".8" />
          <path d="M44 20c3-1 6 0 8 2" stroke="#e9f0f6" stroke-width="2" stroke-linecap="round" opacity=".7" fill="none" />
          <path d="M10 18c4-2 9-2 13 0" stroke="#e9f0f6" stroke-width="2" stroke-linecap="round" opacity=".5" fill="none" />
          <path d={ISLE} fill="#5b9a52" />
        </svg>
      );
  }
}
