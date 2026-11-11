/** Orbis mark: a thin limb-blue arc (the atmosphere's edge) over a dark disc. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg class="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="12" fill="var(--ink-0)" />
      <circle cx="16" cy="16" r="12" fill="none" stroke="var(--line)" stroke-width="1" />
      <path d="M6.2 21.2A11 11 0 0 1 21.6 5.6" fill="none" stroke="var(--limb)" stroke-width="2.4" stroke-linecap="round" />
    </svg>
  );
}
