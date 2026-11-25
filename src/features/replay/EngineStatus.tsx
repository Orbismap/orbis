import type { Actor } from '../../replay/types';
import { replayEvent, replayT } from '../../state/replay';

// The engine display of a rocket live stream: the engines of a vehicle as rings, the burning ones lit. It only shows while a
// vehicle burns (and a few seconds after), so it comes and goes with the burns.

/** a vehicle stays on show this many seconds after its last burning engine */
const LINGER_S = 6;
const STEP_S = 2;

/** radii of the rings in drawing units, by number of rings */
const RINGS: Record<number, { r: number; size: number }[]> = {
  2: [{ r: 0.95, size: 0.55 }, { r: 2.4, size: 0.7 }],
  3: [{ r: 0.8, size: 0.52 }, { r: 2.25, size: 0.5 }, { r: 3.85, size: 0.5 }],
};

/** the indices of the `n` lit engines among `total` in a ring, spread evenly round it */
export function litIndices(total: number, n: number): Set<number> {
  const out = new Set<number>();
  for (let k = 0; k < n; k++) out.add(Math.floor((k * total) / n) % total);
  return out;
}

function burning(actor: Actor, t: number): number[] | null {
  const now = actor.at(t)?.engines;
  if (!now) return null;
  if (now.some((n) => n > 0)) return now;
  // recently burning: keep the display up, everything dark
  for (let back = STEP_S; back <= LINGER_S; back += STEP_S) if (actor.at(t - back)?.engines?.some((n) => n > 0)) return now;
  return null;
}

function Rings({ actor, lit }: { actor: Actor; lit: number[] }) {
  const layout = actor.engines!;
  const rings = RINGS[layout.groups.length] ?? RINGS[3]!;
  const extent = rings[rings.length - 1]!.r + 0.9;
  return (
    <svg class="rp-eng-svg" viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`} aria-hidden="true">
      {layout.groups.map((g, gi) => {
        const ring = rings[gi]!;
        const on = litIndices(g.total, lit[gi] ?? 0);
        // a ring of three is a triangle with a point up; the others start at the top as well
        return Array.from({ length: g.total }, (_, i) => {
          const a = -Math.PI / 2 + (i / g.total) * Math.PI * 2;
          return <circle key={`${gi}-${i}`} class={on.has(i) ? 'rp-eng on' : 'rp-eng'} cx={Math.cos(a) * ring.r} cy={Math.sin(a) * ring.r} r={ring.size} />;
        });
      })}
    </svg>
  );
}

/** One panel per vehicle that is burning; nothing at all when none is. */
export function EngineStatus() {
  const ev = replayEvent.value;
  const t = replayT.value;
  if (!ev) return null;
  const panels = ev.actors
    .filter((a) => a.engines)
    .map((a) => ({ actor: a, lit: burning(a, t) }))
    .filter((p): p is { actor: Actor; lit: number[] } => p.lit !== null);
  if (!panels.length) return null;
  return (
    <div class="rp-engines" role="group" aria-label="Triebwerke">
      {panels.map(({ actor, lit }) => {
        const total = actor.engines!.groups.reduce((n, g) => n + g.total, 0);
        const on = lit.reduce((n, x) => n + x, 0);
        return (
          <div key={actor.id} class="cap rp-eng-card">
            <Rings actor={actor} lit={lit} />
            <div class="rp-eng-text num">
              <span class="rp-eng-title">{actor.engines!.title}</span>
              <span class="rp-eng-count">
                <b>{on}</b> / {total} Triebwerke
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
