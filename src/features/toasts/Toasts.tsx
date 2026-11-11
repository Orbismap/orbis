import { dismissToast, toasts } from '../../ui/toast';
import { Icon } from '../../ui/icons/Icon';
import './toasts.css';

/** Region for toasts; always mounted so screen readers pick up new entries (aria-live). */
export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite" aria-atomic="false">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast toast-${t.kind}`}>
          {t.kind === 'error' && <Icon name="warning" size={16} />}
          {t.kind === 'ok' && <Icon name="check" size={16} />}
          <span class="toast-text">{t.text}</span>
          {t.action && (
            <button
              type="button"
              class="toast-action"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
