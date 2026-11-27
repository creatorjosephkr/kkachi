import { describe, expect, it } from 'vitest';
import {
  buildWanderingFlightPath,
  computeWindowEdgeRange,
  computeWindowPerchTarget,
  hasPerchedWindowChanged,
  parseActiveWindowOutput,
  parseBoundsCsv,
  pickRandomPerimeterTarget,
  pickWindowStrollTarget,
  rectsOverlap,
  sampleFlightPath,
} from '../src/main/mascotFlight';

describe('mascotFlight helpers', () => {
  it('parses valid window bounds CSV and rejects tiny/malformed values', () => {
    expect(parseBoundsCsv('120, 180, 960, 720')).toEqual({
      x: 120,
      y: 180,
      width: 960,
      height: 720,
    });
    expect(parseBoundsCsv('')).toBeNull();
    expect(parseBoundsCsv('10,20,80,80')).toBeNull();
    expect(parseBoundsCsv('bad,input')).toBeNull();
  });

  it('computes perch coordinates resting claws on top edge of active window with headroom', () => {
    const workArea = { x: 0, y: 25, width: 1440, height: 875 };
    const activeWindow = { x: 200, y: 180, width: 900, height: 600 };

    const target = computeWindowPerchTarget(activeWindow, 132, workArea, () => 0.5);
    expect(target).not.toBeNull();
    expect(target?.perchedOnWindow).toBe(true);
    // Active window top 180 - feet offset 94 = 86
    expect(target?.y).toBe(86);
    expect(target!.x).toBeGreaterThanOrEqual(activeWindow.x + 96);
    expect(target!.x).toBeLessThanOrEqual(activeWindow.x + activeWindow.width - 132 - 140);
  });

  it('returns null when active window has insufficient headroom near top menubar', () => {
    const workArea = { x: 0, y: 25, width: 1440, height: 875 };
    const maximizedWindow = { x: 0, y: 25, width: 1440, height: 875 };

    expect(computeWindowPerchTarget(maximizedWindow, 132, workArea)).toBeNull();
  });

  it('picks a perimeter flight target inside workArea bounds', () => {
    const workArea = { x: 0, y: 25, width: 1440, height: 875 };
    const dest = pickRandomPerimeterTarget({ x: 20, y: 45 }, 132, workArea, () => 0.8);

    expect(dest.perchedOnWindow).toBe(false);
    expect(dest.x).toBeGreaterThanOrEqual(20);
    expect(dest.x).toBeLessThanOrEqual(1440 - 132 - 20);
    expect(dest.y).toBeGreaterThanOrEqual(45);
    expect(dest.y).toBeLessThanOrEqual(25 + 875 - 132 - 20);
  });

  it('computes walkable edge range and chooses edge or interior stroll targets', () => {
    const workArea = { x: 0, y: 25, width: 1440, height: 875 };
    const activeWindow = { x: 200, y: 200, width: 800, height: 500 };

    const range = computeWindowEdgeRange(activeWindow, 132, workArea);
    expect(range).not.toBeNull();
    expect(range!.leftEdgeX).toBe(186);
    expect(range!.rightEdgeX).toBe(882);
    expect(range!.perchY).toBe(106);

    // Low random value (< 0.58) targets the farther corner edge
    const edgeTarget = pickWindowStrollTarget(250, range!, () => 0.2);
    expect(edgeTarget.atEdge).toBe('right');
    expect(edgeTarget.x).toBe(range!.rightEdgeX);

    // Higher random value (>= 0.58) targets an interior stroll spot
    const midTarget = pickWindowStrollTarget(250, range!, () => 0.8);
    expect(midTarget.atEdge).toBeNull();
    expect(midTarget.x).toBeGreaterThan(range!.leftEdgeX);
    expect(midTarget.x).toBeLessThan(range!.rightEdgeX);
  });

  it('builds a non-linear wandering flight path avoiding the active window obstacle', () => {
    const workArea = { x: 0, y: 25, width: 1440, height: 875 };
    const activeWindow = { x: 350, y: 220, width: 720, height: 500 };
    const start = { x: 20, y: 400 };
    const end = { x: 1280, y: 400 };

    const seq = [0.2, 0.3, 0.7, 0.6, 0.4, 0.8, 0.5, 0.2, 0.9, 0.1, 0.6];
    let idx = 0;
    const rand = () => seq[idx++ % seq.length];

    const waypoints = buildWanderingFlightPath(start, end, 132, workArea, activeWindow, rand);
    expect(waypoints.length).toBeGreaterThanOrEqual(4);
    expect(waypoints[0]).toEqual(start);
    expect(waypoints[waypoints.length - 1]).toEqual(end);

    // Intermediate waypoints must stay outside the active window body
    for (const wp of waypoints.slice(1, -1)) {
      const overlaps = rectsOverlap(
        { x: wp.x, y: wp.y, width: 132, height: 132 },
        activeWindow,
        0
      );
      expect(overlaps).toBe(false);
    }

    // Spline starts at start, ends at end, and curves smoothly
    const s0 = sampleFlightPath(waypoints, 0);
    const s1 = sampleFlightPath(waypoints, 1);
    const sMid = sampleFlightPath(waypoints, 0.5);
    expect(Math.round(s0.x)).toBe(start.x);
    expect(Math.round(s0.y)).toBe(start.y);
    expect(Math.round(s1.x)).toBe(end.x);
    expect(Math.round(s1.y)).toBe(end.y);
    expect(Math.abs(sMid.y - 400)).toBeGreaterThan(20);
  });

  it('parses active window identity output and detects when another window becomes active', () => {
    expect(parseActiveWindowOutput('SELF')).toEqual({ isSelf: true, window: null });
    expect(parseActiveWindowOutput('')).toEqual({ isSelf: false, window: null });

    const parsed = parseActiveWindowOutput('120,180,960,720|Safari:GitHub');
    expect(parsed).toEqual({
      isSelf: false,
      window: {
        id: 'Safari:GitHub',
        bounds: { x: 120, y: 180, width: 960, height: 720 },
      },
    });

    const perched = parsed.window!;
    // Same window with sub-threshold jitter (<= 6px) -> not changed
    expect(
      hasPerchedWindowChanged(perched, {
        id: 'Safari:GitHub',
        bounds: { x: 123, y: 184, width: 960, height: 720 },
      })
    ).toBe(false);

    // Same window moved by user (> 6px) -> changed (spooks Kkachi)
    expect(
      hasPerchedWindowChanged(perched, {
        id: 'Safari:GitHub',
        bounds: { x: 140, y: 180, width: 960, height: 720 },
      })
    ).toBe(true);

    // Same window resized horizontally (> 6px) -> changed
    expect(
      hasPerchedWindowChanged(perched, {
        id: 'Safari:GitHub',
        bounds: { x: 120, y: 180, width: 1020, height: 720 },
      })
    ).toBe(true);

    // Different window activated -> changed
    expect(
      hasPerchedWindowChanged(perched, {
        id: 'Code:email-moni',
        bounds: { x: 120, y: 180, width: 960, height: 720 },
      })
    ).toBe(true);

    // Same window dragged far away -> changed
    expect(
      hasPerchedWindowChanged(perched, {
        id: 'Safari:GitHub',
        bounds: { x: 400, y: 350, width: 960, height: 720 },
      })
    ).toBe(true);
  });
});
