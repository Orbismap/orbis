import type { ModeGroup } from '../data/types';

/** Ein Symbol, 24 × 24, Strichzeichnung. Die Pfade stammen aus den Mockups. */
const PATHS = {
  fern: 'M7 21V9.5C7 5.6 9.2 3 12 3s5 2.6 5 6.5V21zM8.5 9h7v4.5h-7zM9 17.5h.01M15 17.5h.01',
  regio: 'M5 3h14a0 0 0 0 1 0 0v11a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V3zM5 10.5h14M9 14.5h.01M15 14.5h.01M8 21.5l1.5-3M16 21.5l-1.5-3',
  ubahn: 'M5 9a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v4a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5zM9 12h6M9 15h.01M15 15h.01M8 21.5L9.5 18M16 21.5L14.5 18',
  tram: 'M9 6h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zM6 12h12M9 21.5l1.5-3.5M15 21.5l-1.5-3.5M12 6V2.5M8 2.5h8',
  bus: 'M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM4 11h16M8 14.5h.01M16 14.5h.01M7 21v-3M17 21v-3',
  fernbus: 'M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM4 11h16M8 14.5h.01M16 14.5h.01M7 21v-3M17 21v-3',
  faehre: 'M3 17l2 3c2 0 2-1.500 4-1.500S11 20 13 20s2-1.500 4-1.500S19 20 21 20l-2-6H5zM8 14V8h8v6M12 8V4',
  fuss: 'M13 6.300a1.800 1.800 0 1 0 0-3.600 1.800 1.800 0 0 0 0 3.600zM12 9l-2 4 3 2v6M12 9l3 3 3 1M10 13l-2 7',
  sonst: 'M7 3h10a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM4 11h16',
  // Oberfläche
  home: 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  map: 'M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  star: 'M12 3l2.700 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.9z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  swap: 'M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
  locate: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3',
  bell: 'M6 17V11a6 6 0 0 1 12 0v6l1.500 2h-15zM10 21h4',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v8h14v-8',
  pin: 'M12 21s7-6.200 7-11.500A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21zM12 7.500a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  recent: 'M3 12a9 9 0 1 0 3-6.700L3 8M3 3v5h5M12 8v4l3 2',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, class: cls }: { name: IconName; size?: number; class?: string }) {
  return (
    <svg class={`bn-icon ${cls ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export const modeIcon = (mode: ModeGroup): IconName => (mode === 'sbahn' ? 'regio' : mode);
