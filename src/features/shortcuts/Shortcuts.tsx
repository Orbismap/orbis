import { useEffect, useRef } from 'preact/hooks';
import { shortcutsOpen } from '../../state/ui';
import { IconButton } from '../../ui/Button';
import { Kbd } from '../../ui/Chip';
import { useEscape } from '../../ui/hooks';
import './shortcuts.css';

const GROUPS: { title: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    title: 'Karte',
    rows: [
      { keys: ['mod+K', '/'], label: 'Suche' },
      { keys: ['G'], label: 'Globus oder flache Karte' },
      { keys: ['mod+B', '['], label: 'Seitenleiste ein- oder ausklappen' },
      { keys: ['1', '5'], label: 'Standardkarten wechseln (1 bis 5)' },
      { keys: ['mod+,'], label: 'Einstellungen' },
    ],
  },
  {
    title: 'Zeit',
    rows: [
      { keys: ['Space'], label: 'Abspielen oder anhalten' },
      { keys: ['Left', 'Right'], label: 'Einen Zeitschritt zurück oder vor' },
      { keys: ['J'], label: 'Zurück zu Jetzt' },
    ],
  },
  {
    title: 'Ebenen und Oberfläche',
    rows: [
      { keys: ['Alt+Up', 'Alt+Down'], label: 'Fokussierte Ebene verschieben' },
      { keys: ['Esc'], label: 'Schließen, eine Stufe zurück' },
      { keys: ['?'], label: 'Diese Übersicht' },
    ],
  },
];

export function Shortcuts() {
  const ref = useRef<HTMLDivElement>(null);
  const close = () => (shortcutsOpen.value = false);
  useEscape(true, close);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div class="sc-overlay" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div class="sc" role="dialog" aria-modal="true" aria-label="Tastenkürzel" ref={ref}>
        <div class="sc-head">
          <h2>Tastenkürzel</h2>
          <IconButton icon="close" label="Schließen" onClick={close} />
        </div>
        <div class="sc-body">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map((r) => (
                  <div class="sc-row" key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>
                      {r.keys.map((k, i) => (
                        <span key={k}>
                          {i > 0 && <span class="sc-or">oder</span>}
                          <Kbd keys={k} />
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
