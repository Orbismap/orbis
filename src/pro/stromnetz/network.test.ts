import { describe, expect, it } from 'vitest';
import type { PowerLineSample, PowerTowerSample } from '../../ext/types';
import { DESIGNS, SLOTS } from './designs';
import { buildNetwork, chooseDesign, slotPosition, spanWires } from './network';

// a line along a parallel of latitude 50°: 0.001° of longitude is about 71.6 m
const LAT = 50;
const tower = (id: string, lng: number, lat = LAT, tags: Record<string, unknown> = {}): PowerTowerSample => ({ kind: 'tower', id, lng, lat, tags });
const line = (id: string, points: [number, number][], voltageKv = 380, circuits?: number): PowerLineSample => ({ kind: 'line', id, points, voltageKv, color: '#ff8a1f', ...(circuits !== undefined ? { circuits } : {}) });
const row = (n: number, step = 0.004) => Array.from({ length: n }, (_, i) => tower(`t${i}`, 10 + i * step));
const pts = (towers: PowerTowerSample[]) => towers.map((t) => [t.lng, t.lat] as [number, number]);

describe('network', () => {
  it('connects the towers a line runs through, in order, and nothing else', () => {
    const towers = [...row(4), tower('far', 10.2, 50.01)];
    const net = buildNetwork([...towers, line('w', pts(towers.slice(0, 4)))]);
    expect(net.spans.map((s) => [s.a, s.b])).toEqual([[0, 1], [1, 2], [2, 3]]);
    expect(net.towers).toHaveLength(5);
  });

  it('connects poles that the tiles left out of the line geometry (simplified: only the ends are vertices)', () => {
    const towers = row(4);
    const net = buildNetwork([...towers, line('w', [pts(towers)[0]!, pts(towers)[3]!])]);
    expect(net.spans.map((s) => [s.a, s.b]).sort()).toEqual([[0, 1], [1, 2], [2, 3]]);
  });

  it('takes a pole a few metres beside the simplified line, not one far off it', () => {
    const towers = [tower('a', 10), tower('b', 10.004, LAT + 0.00005), tower('c', 10.008), tower('off', 10.006, LAT + 0.0004)];
    const net = buildNetwork([...towers, line('w', [pts(towers)[0]!, pts(towers)[2]!])]);
    expect(net.spans.map((s) => [s.a, s.b]).sort()).toEqual([[0, 1], [1, 2]]);
  });

  it('gives a tower to the way it stands on when another passes at a distance', () => {
    const a = row(3);
    const b = [tower('b0', 10, 50.0002), tower('b1', 10.004, 50.0002), tower('b2', 10.008, 50.0002)];
    // way a is simplified to its ends: it passes 22 m from the poles of way b, they must not join it
    const net = buildNetwork([...a, ...b, line('wa', [pts(a)[0]!, pts(a)[2]!]), line('wb', [pts(b)[0]!, pts(b)[2]!])]);
    expect(net.spans).toHaveLength(4);
    for (const s of net.spans) expect(net.towers[s.a]!.id[0]).toBe(net.towers[s.b]!.id[0]);
  });

  it('draws no shortcut over a tower that a finer piece of the same way connects (coarse and fine tiles)', () => {
    // the middle tower is 17 m off the coarse piece, which only has the two ends; the fine piece runs through all three
    const towers = [tower('a', 10), tower('b', 10.004, LAT + 0.00015), tower('c', 10.008)];
    const net = buildNetwork([...towers, line('w', [pts(towers)[0]!, pts(towers)[2]!]), line('w', pts(towers))]);
    expect(net.spans.map((s) => [s.a, s.b]).sort()).toEqual([[0, 1], [1, 2]]);
  });

  it('keeps a span past a tower that belongs to nothing on it (a pole of another line below)', () => {
    const towers = [tower('a', 10), tower('under', 10.004, LAT + 0.00018), tower('c', 10.008)];
    const net = buildNetwork([...towers, line('w', [pts(towers)[0]!, pts(towers)[2]!])]);
    expect(net.spans.map((s) => [s.a, s.b])).toEqual([[0, 2]]);
  });

  it('does not connect two lines that merely pass near each other', () => {
    const a = row(3);
    const b = [tower('b0', 10, 50.0004), tower('b1', 10.004, 50.0004), tower('b2', 10.008, 50.0004)];
    const net = buildNetwork([...a, ...b, line('wa', pts(a)), line('wb', pts(b))]);
    expect(net.spans).toHaveLength(4);
    for (const s of net.spans) expect(net.towers[s.a]!.id[0]).toBe(net.towers[s.b]!.id[0]);
  });

  it('counts one span once however many tiles hold the way', () => {
    const towers = row(3);
    const w = line('w', pts(towers), 380, 2);
    const net = buildNetwork([...towers, w, { ...w }, line('w', pts(towers.slice(0, 2)), 380, 2)]);
    expect(net.spans).toHaveLength(2);
    expect(net.spans[0]!.circuits).toBe(2);
  });

  it('adds up the circuits of separate ways on the same towers', () => {
    const towers = row(2);
    const net = buildNetwork([...towers, line('w1', pts(towers), 380, 1), line('w2', pts(towers), 380, 1)]);
    expect(net.spans).toHaveLength(1);
    expect(net.spans[0]!.circuits).toBe(2);
  });

  it('joins the two pieces of a way that a tile edge cut apart', () => {
    const towers = row(4, 0.004);
    // the edge lies between towers 1 and 2; each tile keeps the way a little past it (its buffer), so the cut ends are close together
    const cut1: [number, number] = [towers[1]!.lng + 0.0019, LAT];
    const cut2: [number, number] = [towers[2]!.lng - 0.0019, LAT];
    const net = buildNetwork([
      ...towers,
      line('w', [...pts(towers.slice(0, 2)), cut1]),
      line('w', [cut2, ...pts(towers.slice(2))]),
    ]);
    expect(net.spans.map((s) => [s.a, s.b]).sort()).toEqual([[0, 1], [1, 2], [2, 3]]);
  });

  it('does not join cut ends that point away from each other, or belong to other ways', () => {
    const towers = row(3, 0.004);
    const away: [number, number] = [towers[1]!.lng - 0.0005, LAT];
    const net = buildNetwork([...towers, line('w', [pts(towers)[0]!, away]), line('x', [away, pts(towers)[2]!])]);
    // way x really passes through towers 1 and 2; what the cut ends must not do is bridge tower 0 and 1
    expect(net.spans.map((s) => [s.a, s.b])).toEqual([[1, 2]]);
  });

  it('skips a stretch whose vertices wander off the straight way (a different route)', () => {
    const towers = row(2, 0.004);
    const detour: [number, number][] = [pts(towers)[0]!, [10.002, 50.004], pts(towers)[1]!];
    expect(buildNetwork([...towers, line('w', detour)]).spans).toHaveLength(0);
    // vertices on the straight way that are no towers do not break it
    const straight: [number, number][] = [pts(towers)[0]!, [10.002, LAT], pts(towers)[1]!];
    expect(buildNetwork([...towers, line('w', straight)]).spans).toHaveLength(1);
  });

  it('turns the tower along the line, the angle tower along the bisector', () => {
    const t = row(3);
    expect(buildNetwork([...t, line('w', pts(t))]).towers[1]!.heading).toBeCloseTo(90, 0);
    const bent = [tower('a', 10), tower('b', 10.004), tower('c', 10.004, 50.0036)];
    const net = buildNetwork([...bent, line('w', pts(bent))]);
    // arrives going east, leaves going north: the bisector runs north-east
    expect(net.towers[1]!.heading).toBeCloseTo(45, 0);
  });

  it('takes the voltage of the line and the height from the tag', () => {
    const t = [tower('a', 10, LAT, { height: '60' }), tower('b', 10.004)];
    const net = buildNetwork([...t, line('w', pts(t), 110)]);
    expect(net.towers[0]!.kv).toBe(110);
    expect(net.towers[0]!.scale).toBeCloseTo(60 / DESIGNS[net.towers[0]!.design].h, 6);
  });
});

describe('design choice', () => {
  it('follows the tags first', () => {
    expect(chooseDesign({ design: 'donau' }, 20, 1, 'x')).toBe('donau');
    expect(chooseDesign({ design: 'three-level' }, 20, 1, 'x')).toBe('tannen');
    expect(chooseDesign({ material: 'wood' }, 20, 1, 'x')).toBe('wood');
    expect(chooseDesign({ material: 'concrete' }, 110, 1, 'x')).toBe('concrete');
  });

  it('gives transmission lines lattice pylons with the arms their systems need, and varies', () => {
    const ids = Array.from({ length: 60 }, (_, i) => chooseDesign({}, 380, 2, `n${i}`));
    for (const id of ids) expect(DESIGNS[id].circuits).toBe(2);
    expect(new Set(ids).size).toBeGreaterThan(1);
    for (let i = 0; i < 30; i++) expect(DESIGNS[chooseDesign({}, 380, 1, `n${i}`)].circuits).toBe(1);
    expect(chooseDesign({}, 10, 1, 'a')).toMatch(/wood|concrete/);
  });
});

describe('wires', () => {
  const net = (voltage: number, circuits?: number, design?: 'donau' | 'tannen' | 'portal' | 'wood') => {
    const t = row(2);
    const n = buildNetwork([...t, line('w', pts(t), voltage, circuits)]);
    if (design) for (const tw of n.towers) tw.design = design;
    return n;
  };

  it('ends at the insulators of both towers, to the metre', () => {
    const n = net(380, 2, 'donau');
    const [a, b] = n.towers as [typeof n.towers[0], typeof n.towers[0]];
    const wires = spanWires(a, b, n.spans[0]!, 120, 135);
    expect(wires.filter((w) => !w.earth)).toHaveLength(6);
    expect(wires.filter((w) => w.earth)).toHaveLength(1);
    const slotsA = SLOTS.donau.map((s) => slotPosition(a, s, 120));
    const slotsB = SLOTS.donau.map((s) => slotPosition(b, s, 135));
    const near = (p: number[], list: number[][]) => Math.min(...list.map((q) => Math.hypot((p[0]! - q[0]!) * 71_600, (p[1]! - q[1]!) * 111_320, p[2]! - q[2]!)));
    for (const w of wires) {
      expect(near(w.points[0]!, slotsA)).toBeLessThan(0.01);
      expect(near(w.points[w.points.length - 1]!, slotsB)).toBeLessThan(0.01);
    }
  });

  it('keeps the wires of a system on their side and does not cross them', () => {
    const n = net(380, 2, 'donau');
    const wires = spanWires(n.towers[0]!, n.towers[1]!, n.spans[0]!, 0, 0).filter((w) => !w.earth);
    // the span runs east: left is north. Every wire keeps the order it had at the first tower.
    const order = (i: number) => wires.map((w, k) => ({ k, lat: w.points[i]![1], z: w.points[i]![2] })).sort((p, q) => p.lat - q.lat || p.z - q.z).map((p) => p.k);
    expect(order(wires[0]!.points.length - 1)).toEqual(order(0));
  });

  it('draws one system of a double tower when the line has one', () => {
    const n = net(380, 1, 'donau');
    expect(spanWires(n.towers[0]!, n.towers[1]!, n.spans[0]!, 0, 0).filter((w) => !w.earth)).toHaveLength(3);
  });

  it('hangs below the ends, never into the ground', () => {
    const n = net(380, 2, 'donau');
    for (const w of spanWires(n.towers[0]!, n.towers[1]!, n.spans[0]!, 0, 0)) {
      const alt = w.points.map((p) => p[2]);
      expect(Math.min(...alt)).toBeGreaterThan(5);
      expect(alt[Math.floor(alt.length / 2)]!).toBeLessThan(Math.min(alt[0]!, alt[alt.length - 1]!));
    }
  });

  it('pairs towers of different designs by the side they lie on', () => {
    const t = row(2);
    const n = buildNetwork([...t, line('w', pts(t), 110, 1)]);
    n.towers[0]!.design = 'portal';
    n.towers[1]!.design = 'wood';
    const wires = spanWires(n.towers[0]!, n.towers[1]!, n.spans[0]!, 0, 0);
    expect(wires.filter((w) => !w.earth)).toHaveLength(3);
    // the portal's earth wires have no partner on a wooden pole: not drawn
    expect(wires.filter((w) => w.earth)).toHaveLength(0);
  });
});
