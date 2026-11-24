import { describe, expect, it } from 'vitest';
import {
  computeWindowPerchTarget,
  parseBoundsCsv,
  pickRandomPerimeterTarget,
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
});
