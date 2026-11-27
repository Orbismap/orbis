// "Offline-Karten": what is saved, how much it takes; update or delete it.
import { useState } from 'preact/hooks';
import { online } from '@/core/online';
import { Icon } from '@/ui/icons/Icon';
import { KINDS } from '../data/kinds';
import type { Region } from '../offline/db';
import { cancelDownload, deleteRegion, job, offlineView, regions, result, startDownload, storageBroken } from '../offline/state';
import { mapSize } from './mapSize';

const date = (t: number) => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(t);
const kindNames = (ids: string[]) => KINDS.filter((k) => ids.includes(k.id)).map((k) => k.name).join(', ') || 'nur die Karte';

export function OfflineManage() {
  const list = regions.value;
  const running = job.value;
  const done = result.value;
  return (
    <div class="find-sheet" role="dialog" aria-modal="true" aria-labelledby="find-manage-title" onKeyDown={(e) => { if (e.key === 'Escape') offlineView.value = null; }}>
      <div class="find-sheet-body">
        <header>
          <h1 id="find-manage-title">Offline-Karten</h1>
          <button type="button" class="find-close" aria-label="Schließen" onClick={() => (offlineView.value = null)}><Icon name="close" size={20} /></button>
        </header>
        {running && (
          <div class="find-card" role="status">
            <b>{running.replaces ? 'Aktualisiere' : 'Lade'} „{running.name}“ …</b>
            <progress max={running.total} value={running.done} />
            <p class="find-text">{Math.floor((running.done / running.total) * 100)} % · Lass die App geöffnet.</p>
            <button type="button" class="find-button find-quiet" onClick={cancelDownload}>Abbrechen</button>
          </div>
        )}
        {done && <p class={done.ok ? 'find-text' : 'find-text find-warn'} role="status">{done.text}</p>}
        {storageBroken.value && <p class="find-text find-warn">Dieser Browser erlaubt hier keinen Offline-Speicher.</p>}
        {!list.length && !running && !storageBroken.value && <p class="find-text">Noch keine Karte gespeichert.</p>}
        {list.map((r) => <Card key={r.id} region={r} />)}
        {list.length > 0 && <p class="find-text">Zusammen {mapSize(list.reduce((sum, r) => sum + r.bytes, 0))}</p>}
        <button type="button" class="find-button" disabled={!!running} onClick={() => (offlineView.value = 'download')}>Neues Gebiet herunterladen</button>
      </div>
    </div>
  );
}

function Card({ region: r }: { region: Region }) {
  /** deleting takes a second tap */
  const [sure, setSure] = useState(false);
  const busy = !!job.value;
  return (
    <article class="find-card">
      <b>{r.name}</b>
      <p class="find-text">{r.shape.type === 'outline' ? 'Stadtgrenze' : 'Kartenausschnitt'} · {mapSize(r.bytes)} · Stand {date(r.updatedAt)}</p>
      <p class="find-text">{kindNames(r.kinds)}</p>
      <div class="find-actions">
        <button type="button" class="find-button find-quiet" disabled={busy || !online.value} onClick={() => void startDownload({ name: r.name, shape: r.shape, kinds: r.kinds, replaces: r })}>Aktualisieren</button>
        {sure ? (
          <>
            <button type="button" class="find-button find-danger" disabled={busy} onClick={() => void deleteRegion(r)}>Wirklich löschen</button>
            <button type="button" class="find-button find-quiet" onClick={() => setSure(false)}>Behalten</button>
          </>
        ) : <button type="button" class="find-button find-quiet" disabled={busy} onClick={() => setSure(true)}>Löschen</button>}
      </div>
    </article>
  );
}
