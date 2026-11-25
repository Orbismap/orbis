// Detailseite der Tierzüge: die Arten als Bilder zum Antippen, sonst nichts.
import { useEffect } from 'preact/hooks';
import { loadSpeciesImage, speciesImages } from '../../../data/migration/images';
import { SPECIES, type Species } from '../../../data/migration/species';
import { MULTI_ALL, multiHas, multiValues, toggleMulti } from '../../../layers/multi';
import { PageFoot, PageHead, ShowSwitch, useLayerOption, type LayerPageProps } from '../page-kit';
import './zugvoegel.css';

const ALL = SPECIES.map((s) => s.id);

function Tile({ sp, on, onClick }: { sp: Species; on: boolean; onClick(): void }) {
  const img = speciesImages.value[sp.id];
  return (
    <button type="button" role="checkbox" aria-checked={on} class={`zv-tile${on ? ' is-on' : ''}`} style={{ ['--c' as string]: sp.color }} onClick={onClick}>
      <span class="zv-photo">{img ? <img src={img} alt="" loading="lazy" decoding="async" draggable={false} /> : null}</span>
      <span class="zv-name">{sp.name.replace(/ \(.*\)$/, '')}</span>
    </button>
  );
}

export default function Zugvoegel({ layer, def, karteId, removable }: LayerPageProps) {
  const [value, set] = useLayerOption<string>(layer, def, karteId, 'arten');
  useEffect(() => SPECIES.forEach(loadSpeciesImage), []);
  const filtered = multiValues(value) !== null;
  return (
    <>
      <PageHead def={def} />
      <ShowSwitch layer={layer} def={def} karteId={karteId} />
      <div class="zv-grid" role="group" aria-label="Arten">
        {SPECIES.map((sp) => (
          <Tile key={sp.id} sp={sp} on={multiHas(value, sp.id)} onClick={() => set(toggleMulti(value, sp.id, ALL))} />
        ))}
      </div>
      {filtered && (
        <button type="button" class="linkbtn zv-all" onClick={() => set(MULTI_ALL)}>
          Alle Arten zeigen
        </button>
      )}
      <p class="ld-note zv-credit">
        Simuliert nach Zugwegen aus der Literatur, keine Messdaten. Fotos: <a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>
      </p>
      <PageFoot def={def} karteId={karteId} removable={removable} />
    </>
  );
}
