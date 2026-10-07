/* Copyright (c) 2026 Jeffrey Kerley. SPDX-License-Identifier: LicenseRef-Jeffrey-Kerley-NC-NoAI-1.0 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../PureAttractors/pointMarks.js', import.meta.url), 'utf8');
const { POINT_SHAPES, BRIGHTNESS_MODES, buildDensity, buildMarks } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`,
);

const markCount = groups => groups.reduce((sum, group) => sum + group.marks, 0);
const orbit = {
  points: Float64Array.from([0, 0, 0, 0, 0, 0, 0.8, 0.2]),
  count: 4,
  maxRadius: 1,
};

function verifyClosedMarks(groups) {
  for (const { level, d, marks } of groups) {
    assert.ok(Number.isInteger(level) && level >= 0 && level <= 31);
    assert.ok(!/NaN|Infinity|undefined/.test(d));
    const paths = d.split('M').slice(1);
    assert.equal(paths.length, marks);
    assert.equal((d.match(/z/g) || []).length, marks);
    assert.ok(paths.every(path => path.endsWith('z')));
  }
}

test('density counts actual visits and preserves the measured extent', () => {
  const density = buildDensity(orbit, 8);
  assert.ok(density.cells instanceof Uint32Array);
  assert.equal(density.resolution, 8);
  assert.equal(density.extent, 1.04);
  assert.equal(density.cells.reduce((sum, count) => sum + count, 0), 4);
  assert.deepEqual([...density.cells].filter(Boolean).sort(), [1, 3]);
  assert.equal(density.reference, 3);
});

test('each supported shape is distinct and closed in both placements and every brightness mode', () => {
  const density = buildDensity(orbit, 8);
  for (const placement of ['Orbit density', 'Orbit points']) {
    const distinct = new Set();
    for (const shape of POINT_SHAPES) {
      for (const brightnessMode of BRIGHTNESS_MODES) {
        const groups = buildMarks(orbit, density, { placement, shape, brightnessMode, pointSize: 1.6, exposure: 2 });
        verifyClosedMarks(groups);
        assert.ok(markCount(groups) > 0);
        if (brightnessMode === 'Palette') distinct.add(groups.map(group => group.d).join(''));
        if (shape === 'Circle') assert.ok(groups.every(group => group.d.includes('a')));
        else assert.ok(groups.every(group => !group.d.includes('a')));
      }
    }
    assert.equal(distinct.size, POINT_SHAPES.length);
  }
});

test('orbit-point color levels use local visit density rather than distance from the origin', () => {
  const density = buildDensity(orbit, 8);
  const cells = buildMarks(orbit, density, { placement: 'Orbit density' });
  const points = buildMarks(orbit, density, { placement: 'Orbit points' });
  assert.deepEqual(cells.map(({ level, marks }) => [level, marks]), [[16, 1], [31, 1]]);
  assert.deepEqual(points.map(({ level, marks }) => [level, marks]), [[16, 1], [31, 3]]);
  assert.deepEqual(
    buildMarks(orbit, density, { exposure: 0.4 }),
    buildMarks(orbit, density, { exposure: 3 }),
    'palette exposure belongs in the color scale, allowing geometry reuse',
  );
});

function tonalGrid() {
  const resolution = 24;
  const cells = new Uint32Array(resolution * resolution);
  const points = [];
  for (let i = 0; i < cells.length; i += 1) {
    cells[i] = i % 3 === 0 ? 0 : 1 + i % 60;
    // Include points in empty cells too: buildMarks must reject those points.
    points.push((i % resolution + 0.5) / resolution * 2 - 1,
      1 - (Math.floor(i / resolution) + 0.5) / resolution * 2);
  }
  return {
    orbit: { points: Float64Array.from(points), count: points.length / 2, maxRadius: Math.SQRT2 },
    density: { cells, resolution, extent: 1, reference: 100 },
  };
}

test('both dithering modes are deterministic and exposure can only add marks', () => {
  const grid = tonalGrid();
  for (const placement of ['Orbit density', 'Orbit points']) {
    for (const brightnessMode of ['Ordered dither', 'Stochastic dither']) {
      let previous = 0;
      const counts = [];
      for (const exposure of [0.3, 0.6, 1, 2, 3]) {
        const options = { placement, brightnessMode, exposure, shape: 'Square' };
        const first = buildMarks(grid.orbit, grid.density, options);
        assert.deepEqual(first, buildMarks(grid.orbit, grid.density, options));
        const count = markCount(first);
        assert.ok(count >= previous, `${placement}, ${brightnessMode}: exposure lost coverage`);
        previous = count;
        counts.push(count);
      }
      assert.ok(counts.at(-1) > counts[0], `${brightnessMode} did not respond to exposure`);
    }
  }
});

test('no placement or brightness mode creates marks in empty cells', () => {
  const grid = tonalGrid();
  for (const placement of ['Orbit density', 'Orbit points']) {
    for (const brightnessMode of BRIGHTNESS_MODES) {
      // Squares start half their width above/left of their center. Halftone
      // widths come from the returned quantized brightness level.
      const groups = buildMarks(grid.orbit, grid.density, { placement, brightnessMode, shape: 'Square' });
      for (const group of groups) {
        const half = (brightnessMode === 'Size halftone' ? Math.sqrt(group.level / 31) : 1) / 2;
        for (const match of group.d.matchAll(/M(-?[\d.]+),(-?[\d.]+)/g)) {
          const x = Math.floor(Number(match[1]) + half + 1e-6);
          const y = Math.floor(Number(match[2]) + half + 1e-6);
          assert.ok(grid.density.cells[y * grid.density.resolution + x] > 0);
        }
      }
    }
  }
});

test('halftone area follows quantized brightness and never exceeds the requested point size', () => {
  const density = buildDensity(orbit, 8);
  for (const exposure of [0.3, 1, 3]) {
    const groups = buildMarks(orbit, density, { brightnessMode: 'Size halftone', shape: 'Square', pointSize: 2, exposure });
    for (const group of groups) {
      const width = Number(group.d.match(/h([\d.]+)/)[1]);
      assert.ok(width > 0 && width <= 2);
      assert.ok(Math.abs(width - 2 * Math.sqrt(group.level / 31)) < 0.001);
    }
  }
});

test('zero extent, absent points, and zero mark size have finite, predictable outcomes', () => {
  const origin = { points: Float64Array.from([0, 0]), count: 1, maxRadius: 0 };
  const density = buildDensity(origin, 8);
  assert.ok(Number.isFinite(density.extent) && density.extent > 0);
  for (const placement of ['Orbit density', 'Orbit points']) {
    const groups = buildMarks(origin, { ...density, extent: 0 }, { placement });
    verifyClosedMarks(groups);
    assert.equal(markCount(groups), 1);
  }
  assert.deepEqual(buildMarks(origin, density, { pointSize: 0 }), []);
  const empty = { points: new Float64Array(0), count: 0, maxRadius: 0 };
  assert.deepEqual(buildMarks(empty, buildDensity(empty, 8)), []);
  assert.deepEqual(buildMarks(empty, null), []);
});

test('large orbit inputs are capped at 300,000 marks with compact path commands', () => {
  const large = { points: new Float64Array(300010 * 2), count: 300010, maxRadius: 1 };
  const density = buildDensity(large, 16);
  assert.equal(density.cells.reduce((sum, count) => sum + count, 0), 300000);
  const groups = buildMarks(large, density, { placement: 'Orbit points', shape: 'Square' });
  assert.equal(markCount(groups), 300000);
  assert.ok(groups.reduce((sum, group) => sum + group.d.length, 0) < 12000000);
});
