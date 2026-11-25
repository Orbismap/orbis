// Eigene Detailseiten: eine Datei `pages/<ebenen-id>.tsx` mit `export default function Seite(props: LayerPageProps)` ersetzt den Körper der
// Standardseite (Rahmen und Zurück-Knopf bleiben). Bausteine in ../page-kit.tsx. Es gibt keine Liste, in die man die Seite eintragen müsste.
import type { ComponentType } from 'preact';
import type { LayerPageProps } from '../page-kit';

const modules = import.meta.glob<{ default?: ComponentType<LayerPageProps> }>('./*.tsx', { eager: true });
const pages = new Map<string, ComponentType<LayerPageProps>>();
for (const [path, mod] of Object.entries(modules)) {
  const id = path.replace(/^\.\//, '').replace(/\.tsx$/, '');
  if (mod.default) pages.set(id, mod.default);
}

export const customPage = (layerId: string): ComponentType<LayerPageProps> | undefined => pages.get(layerId);
