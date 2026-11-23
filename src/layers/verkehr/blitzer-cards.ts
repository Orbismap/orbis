// Cards of the speed cameras (the Blitzer layer and the cameras along a route show the same ones).
import { formatAge, formatNumber } from '../../core/format';
import type { MobileProps } from '../../data/parsers/blitzerde';
import { directionFact, osmNodeLink } from '../../render/cameras';
import type { InspectCard } from '../types';

const KINDS: Record<string, string> = { cam: 'Ortsfester Blitzer', section: 'Abschnittskontrolle', signals: 'Rotlicht-Blitzer' };
export const fixedCameraTitle = (kind?: string): string => KINDS[kind ?? 'cam'] ?? KINDS.cam!;

export interface FixedCameraProps { kind?: string; speed?: string; dir?: number; operator?: string; ref?: string; id?: number }

/** Card of a camera from the OpenStreetMap set. */
export function fixedCameraCard(p: FixedCameraProps): InspectCard {
  return {
    title: fixedCameraTitle(p.kind),
    subtitle: 'Lageplan, keine Fahrwarnung',
    facts: [
      ...(p.speed ? [{ label: 'Erlaubt', value: /^\d+$/.test(p.speed) ? `${formatNumber(Number(p.speed))} km/h` : p.speed, emphasis: true }] : []),
      ...directionFact(p.dir),
      ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
      ...(p.ref ? [{ label: 'Kennung', value: p.ref }] : []),
    ],
    text: 'Nach OpenStreetMap erfasst, unvollständig und ohne mobile Kontrollen. In Deutschland ist die Nutzung solcher Hinweise während der Fahrt verboten.',
    links: osmNodeLink(p.id),
  };
}

/** Card of a reported mobile check (Blitzer.de). */
export function mobileCameraCard(p: MobileProps): InspectCard {
  return {
    title: p.title, subtitle: 'Mobile Kontrolle, Meldung von Autofahrern', time: p.reported || undefined,
    facts: [
      ...(p.where ? [{ label: 'Ort', value: p.where }] : []),
      ...(p.speed > 0 ? [{ label: 'Erlaubt', value: `${formatNumber(p.speed)} km/h`, emphasis: true }] : []),
      ...(p.reported ? [{ label: 'Gemeldet', value: formatAge(p.reported) }] : []),
      ...(p.votes > 0 ? [{ label: 'Bestätigungen', value: String(p.votes) }] : []),
    ],
    text: `${p.desc ? `${p.desc}. ` : ''}Mobile Kontrollen kommen aus einer inoffiziellen Community-Quelle (Blitzer.de) und sind oft schon vorbei. Keine Fahrwarnung: In Deutschland ist die Nutzung solcher Hinweise während der Fahrt verboten (§ 23 StVO).`,
  };
}
