import type { ComponentChildren } from 'preact';

/** Minimal outline glyphs (24 grid, stroke). Mockup only; the real app uses src/ui/icons. */
const P: Record<string, ComponentChildren> = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.25 4.25 0 0 1-.25 8.5z" />,
  warn: <><path d="M12 4 3 19.5h18z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  car: <><path d="M5 16V11l2-5h10l2 5v5M3.5 16h17" /><circle cx="8" cy="16.5" r="1.4" /><circle cx="16" cy="16.5" r="1.4" /></>,
  build: <><path d="M5 20V6l8-2v16M13 9l6 2v9M3 20h18M8 9h2M8 13h2M16 14h0" /></>,
  waves: <><path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0" /></>,
  dots: <><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>,
  x: <path d="m7 7 10 10M17 7 7 17" />,
  chev: <path d="m9 5 7 7-7 7" />,
  back: <path d="m15 5-7 7 7 7" />,
  sidebar: <><rect x="3.5" y="5" width="17" height="14" rx="3.5" /><path d="M9.5 5v14" /></>,
  wind: <path d="M3 9h10a2.5 2.5 0 1 0-2.5-2.5M3 15h14a2.5 2.5 0 1 1-2.5 2.5M3 12h7" />,
  thermo: <path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" />,
  bolt: <path d="M13 3 6 13.5h5L10 21l7-10.5h-5z" />,
  drop: <path d="M12 3.5c3.5 4.2 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2-5.8 5.5-10z" />,
  radar: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><path d="M12 12 17.5 6.5" /></>,
  plane: <path d="M10 13.5 3.5 11v-1.5L10 10V5.5l2-1.5 2 1.5V10l6.5-.5V11L14 13.5v3l2 1.5v1.5l-4-.8-4 .8V18l2-1.5z" />,
  ship: <path d="M4 15l8-3 8 3-2 4H6zM12 12V4M12 5l5 4h-5" />,
  quake: <path d="M2.5 12h4l2-5 3 10 2.5-8 1.5 3h6" />,
  fire: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 1.5.5 2.5 1.5 2.5C10 8 11 5.5 12 3z" />,
  share: <path d="M12 15V4M8 7.5 12 4l4 3.5M6 11H5v9h14v-9h-1" />,
  star: <path d="m12 4 2.3 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.8 2.7 1.1-5.4-4-3.7 5.4-.6z" />,
  pin: <><path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4" />,
  train: <><rect x="6" y="3.5" width="12" height="13" rx="3" /><path d="M6 11h12M9 20l1.5-3.5M15 20l-1.5-3.5" /></>,
  anchor: <path d="M12 8V21M8 11h8M5 14c0 3.5 3 6 7 6s7-2.5 7-6M12 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  tower: <path d="M12 3v18M8 21l4-12 4 12M9.5 15h5M7 8a7 7 0 0 1 0-0M5 6a10 10 0 0 0 0 7M19 6a10 10 0 0 1 0 7" />,
  addsq: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></>,
  pencil: <path d="m4 20 1-4L16.5 4.5a2 2 0 0 1 3 3L8 19zM14.5 6.5l3 3" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  plusc: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  minusc: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  sliders: <path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 5v4M7 15v4" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
