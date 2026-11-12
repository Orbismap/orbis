import { useEffect, useRef } from 'preact/hooks';
import { Button } from '../../ui/Button';
import { useEscape } from '../../ui/hooks';
import { confirmPending, pendingWarning } from './warning';
import './boost.css';

/** HIG-style alert for content warnings. Cancel is the default action, Escape cancels. */
export function WarningDialog() {
  const w = pendingWarning.value;
  const cancelBtn = useRef<HTMLButtonElement>(null);
  useEscape(!!w, () => w?.cancel());
  useEffect(() => {
    if (w) cancelBtn.current?.focus();
  }, [w?.key]);
  if (!w) return null;
  return (
    <div class="wd-overlay">
      <div class="wd" role="alertdialog" aria-modal="true" aria-labelledby="wd-title" aria-describedby="wd-text">
        <h2 id="wd-title">{w.title}</h2>
        <p id="wd-text">{w.text}</p>
        <div class="wd-actions">
          <button type="button" ref={cancelBtn} class="btn btn-primary" onClick={() => w.cancel()}>
            <span class="btn-label">Abbrechen</span>
          </button>
          <Button variant="secondary" onClick={() => confirmPending(w)}>
            Anzeigen
          </Button>
        </div>
      </div>
    </div>
  );
}
