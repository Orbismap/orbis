import { cx } from './hooks';
import './controls.css';

export interface SwitchProps {
  checked: boolean;
  onChange(next: boolean): void;
  /** Accessible name when there is no visible `label`. */
  'aria-label'?: string;
  label?: string;
  disabled?: boolean;
  class?: string;
}

const track = (
  <span class="switch-track" aria-hidden="true">
    <span class="switch-thumb" />
  </span>
);

/** The look of a switch without a control of its own, for a row that is the switch itself. Mouse and touch only. */
export function SwitchMark({ checked, onClick }: { checked: boolean; onClick(): void }) {
  return (
    <span class="switch switch-mark" aria-checked={checked} aria-hidden="true" onClick={onClick}>
      {track}
    </span>
  );
}

/** Toggle switch (role="switch"). With `label` the whole row is the hit area. */
export function Switch({ checked, onChange, label, disabled, class: cls, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : aria['aria-label']}
      disabled={disabled}
      class={cx('switch', label && 'switch-row', cls)}
      onClick={() => onChange(!checked)}
    >
      {label && <span class="switch-label">{label}</span>}
      {track}
    </button>
  );
}
