import { describe, expect, it } from 'vitest';
import { BuildingGrid } from './building-grid';

/** a square of `size` degrees with its south-west corner at x, y */
const square = (x: number, y: number, size = 0.0002): [number, number][][] => [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]];
const VIEW = [2, 48, 3, 49] as const;

describe('building grid', () => {
  it('finds the part of a merged MultiPolygon that holds the point, and nothing between the parts', () => {
    const grid = new BuildingGrid();
    grid.add({ type: 'MultiPolygon', coordinates: [square(2.3, 48.85), square(2.31, 48.86)] }, 20, VIEW);
    expect(grid.heightAt(2.3001, 48.8501)).toBe(20);
    expect(grid.heightAt(2.3101, 48.8601)).toBe(20);
    expect(grid.heightAt(2.305, 48.855)).toBe(0);
  });

  it('takes the highest of overlapping buildings, above the given height only', () => {
    const grid = new BuildingGrid();
    grid.add({ type: 'Polygon', coordinates: square(2.3, 48.85) }, 10, VIEW);
    grid.add({ type: 'Polygon', coordinates: square(2.3001, 48.8501) }, 30, VIEW);
    expect(grid.heightAt(2.30015, 48.85015)).toBe(30);
    expect(grid.heightAt(2.30015, 48.85015, 40)).toBe(40);
    expect(grid.maxH).toBe(30);
  });

  it('finds a building from every cell it covers', () => {
    const grid = new BuildingGrid();
    grid.add({ type: 'Polygon', coordinates: square(2.3, 48.85, 0.003) }, 12, VIEW);
    expect(grid.heightAt(2.3029, 48.8529)).toBe(12);
  });

  it('leaves out what is outside the view', () => {
    const grid = new BuildingGrid();
    grid.add({ type: 'Polygon', coordinates: square(5, 50) }, 12, VIEW);
    expect(grid.empty).toBe(true);
  });
});
