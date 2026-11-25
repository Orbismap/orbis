// Bausteine für die Detailseite einer Ebene. Die Standardseite (LayerPage.tsx) und eigene Seiten (pages/<ebenen-id>.tsx) bauen daraus.
import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { setLayerOption, setLayerVisible } from '../../karten/active';
import type { KarteLayer } from '../../karten/types';
import type { LayerDef } from '../../layers/types';
import { Icon } from '../../ui/icons/Icon';
import { Switch } from '../../ui/Switch';
import { RemoveAction, SourceList } from './LayerDetails';
import { closeDetail } from './themes-state';

/** Was eine eigene Seite bekommt: die Ebene in der Karte, ihre Definition und die Karte, in der sie liegt. */
export interface LayerPageProps { layer: KarteLayer; def: LayerDef; karteId: string; removable: boolean }

/** Rahmen jeder Detailseite: Zurück-Knopf, Escape, Fokus. */
export function PageFrame({ def, from, children }: { def: LayerDef; from: string; children: ComponentChildren }) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus({ preventScroll: true });
    for (let el = back.current?.parentElement; el; el = el.parentElement) if (el.scrollTop > 0) el.scrollTop = 0;
  }, [def.id]);
  return (
    <section class="lpage" aria-label={def.title} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), closeDetail())}>
      <div class="lpage-bar">
        <button ref={back} type="button" class="lpage-back" aria-label={`Zurück zu ${from}`} onClick={closeDetail}>
          <Icon name="chevron-left" size={18} />
          <span>{from}</span>
        </button>
        <h3 class="lpage-bartitle">{def.title}</h3>
      </div>
      {children}
    </section>
  );
}

/** Ein kurzer Satz unter dem Titel in der Leiste (der Titel selbst steht im PageFrame). */
export function PageHead({ def, text = def.summary }: { def: LayerDef; text?: string }) {
  return (
    <header class="lpage-head lpage-head-plain">
      <div class="lpage-title">
        <p>{text}</p>
      </div>
    </header>
  );
}

/** Der Schalter "Auf der Karte zeigen". */
export function ShowSwitch({ layer, def, karteId }: { layer: KarteLayer; def: LayerDef; karteId: string }) {
  return (
    <div class="lpage-group">
      <Switch class="lpage-switch" label="Auf der Karte zeigen" checked={layer.visible} onChange={(v) => setLayerVisible(karteId, def.id, v)} />
    </div>
  );
}

/** Quellen und "Entfernen" am Ende einer Seite. */
export function PageFoot({ def, karteId, removable }: { def: LayerDef; karteId: string; removable: boolean }) {
  return (
    <>
      <SourceList def={def} />
      {removable && <RemoveAction def={def} karteId={karteId} />}
    </>
  );
}

/** Wert und Setzer einer Option der Ebene. */
export function useLayerOption<T extends number | string | boolean>(layer: KarteLayer, def: LayerDef, karteId: string, id: string): [T, (v: T) => void] {
  const spec = def.options?.find((o) => o.id === id);
  return [(layer.options?.[id] ?? spec?.default) as T, (v) => setLayerOption(karteId, def.id, id, v)];
}
