import type { Settings as S } from '../../state/settings';
import { settings, updateSettings } from '../../state/settings';
import { leftView, shortcutsOpen } from '../../state/ui';
import { Button, IconButton } from '../../ui/Button';
import { Segmented } from '../../ui/Segmented';
import { BoostSection } from '../boost/BoostSection';
import { allSources } from '../attribution/credits';
import './settings.css';

type Units = S['units'];

const UNIT_ROWS: { key: keyof Units; label: string; options: { value: string; label: string }[] }[] = [
  { key: 'temperature', label: 'Temperatur', options: [{ value: 'c', label: '°C' }, { value: 'f', label: '°F' }] },
  { key: 'wind', label: 'Wind', options: [{ value: 'kmh', label: 'km/h' }, { value: 'ms', label: 'm/s' }, { value: 'kn', label: 'kn' }, { value: 'bft', label: 'Bft' }] },
  { key: 'pressure', label: 'Luftdruck', options: [{ value: 'hpa', label: 'hPa' }, { value: 'inhg', label: 'inHg' }] },
  { key: 'precip', label: 'Niederschlag', options: [{ value: 'mm', label: 'mm' }, { value: 'in', label: 'in' }] },
  { key: 'distance', label: 'Entfernung', options: [{ value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }] },
];

/** Settings view inside the left panel / sheet (no modal dialog). */
export function SettingsView() {
  const s = settings.value;
  const sources = allSources();
  return (
    <div class="set">
      <div class="set-head">
        <IconButton icon="chevron-left" label="Zurück zu den Ebenen" onClick={() => (leftView.value = 'layers')} />
        <h2>Einstellungen</h2>
      </div>
      <section class="set-sec" aria-labelledby="set-units">
        <h3 id="set-units">Einheiten</h3>
        <div class="setgroup">
        {UNIT_ROWS.map((r) => (
          <div class="set-row" key={r.key}>
            <span class="set-label">{r.label}</span>
            <Segmented size="sm" aria-label={r.label} value={s.units[r.key]} options={r.options} onChange={(v) => updateSettings({ units: { [r.key]: v } as Partial<Units> })} />
          </div>
        ))}
        </div>
      </section>
      <section class="set-sec" aria-labelledby="set-look">
        <h3 id="set-look">Darstellung</h3>
        <div class="setgroup">
        <div class="set-row">
          <span class="set-label">Thema</span>
          <Segmented
            size="sm"
            aria-label="Thema"
            value={s.theme}
            options={[{ value: 'auto', label: 'Automatisch' }, { value: 'dark', label: 'Dunkel' }, { value: 'light', label: 'Hell' }]}
            onChange={(v) => updateSettings({ theme: v })}
          />
        </div>
        <div class="set-row">
          <span class="set-label">Bewegung</span>
          <Segmented
            size="sm"
            aria-label="Bewegung"
            value={s.motion}
            options={[{ value: 'auto', label: 'Automatisch' }, { value: 'reduce', label: 'Reduziert' }, { value: 'full', label: 'Voll' }]}
            onChange={(v) => updateSettings({ motion: v })}
          />
        </div>
        <div class="set-row">
          <span class="set-label">Tastenkürzel</span>
          <Button variant="secondary" icon="keyboard" onClick={() => (shortcutsOpen.value = true)}>
            Übersicht
          </Button>
        </div>
        </div>
      </section>
      <BoostSection />
      <section class="set-sec" aria-labelledby="set-about">
        <h3 id="set-about">Über Orbis Map</h3>
        <div class="setgroup set-about">
        <p class="set-text">Orbis Map zeigt, was auf der Erde gerade passiert: Wetter, Gefahren, Verkehr, Infrastruktur, Umwelt. Alle Daten stammen aus offenen Quellen, die Ebenen nennen Quelle, Lizenz und Alter.</p>
        <details class="set-details">
          <summary>Datenquellen und Lizenzen ({sources.length})</summary>
          <ul role="list">
            {sources.map((c) => (
              <li key={c.name}>
                <a href={c.url} target="_blank" rel="noopener noreferrer">
                  {c.name}
                </a>
                <span>{[c.license, c.layers?.join(', ')].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </details>
        </div>
      </section>
    </div>
  );
}
