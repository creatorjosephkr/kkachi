import { execFile } from 'node:child_process';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActiveWindowInfo {
  id: string;
  bounds: Rect;
}

export interface ActiveWindowProbe {
  isSelf: boolean;
  window: ActiveWindowInfo | null;
}

export interface FlightDestination {
  x: number;
  y: number;
  perchedOnWindow: boolean;
}

export interface WindowEdgeRange {
  leftEdgeX: number;
  rightEdgeX: number;
  perchY: number;
}

export interface WindowStrollTarget {
  x: number;
  y: number;
  atEdge: 'left' | 'right' | null;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface SampledFlightPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const MASCOT_MARGIN = 20;
const FLIGHT_MIN_DISTANCE = 240;
// Claws sit ~94px below the top of the 132x132 mascot window
const MASCOT_FEET_OFFSET_Y = 94;
const MIN_PERCH_HEADROOM_PX = 40;
const PERCH_LEFT_INSET = 96;
const PERCH_RIGHT_INSET = 140;

export function parseBoundsCsv(raw: string): Rect | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [x, y, width, height] = parts;
  if (width < 160 || height < 100) return null;
  return { x, y, width, height };
}

export function parseActiveWindowOutput(raw: string): ActiveWindowProbe {
  const trimmed = raw.trim();
  if (!trimmed) return { isSelf: false, window: null };
  if (trimmed === 'SELF') return { isSelf: true, window: null };

  const pipeIdx = trimmed.indexOf('|');
  const boundsPart = pipeIdx >= 0 ? trimmed.slice(0, pipeIdx) : trimmed;
  const idPart = pipeIdx >= 0 ? trimmed.slice(pipeIdx + 1).trim() : '';
  const bounds = parseBoundsCsv(boundsPart);
  if (!bounds) return { isSelf: false, window: null };

  return {
    isSelf: false,
    window: {
      id: idPart || `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`,
      bounds,
    },
  };
}

const PERCH_MOVE_THRESHOLD_PX = 6;

export function hasPerchedWindowChanged(
  perched: ActiveWindowInfo,
  current: ActiveWindowInfo
): boolean {
  if (current.id !== perched.id) {
    return true;
  }
  if (
    Math.abs(current.bounds.x - perched.bounds.x) > PERCH_MOVE_THRESHOLD_PX ||
    Math.abs(current.bounds.y - perched.bounds.y) > PERCH_MOVE_THRESHOLD_PX ||
    Math.abs(current.bounds.width - perched.bounds.width) > PERCH_MOVE_THRESHOLD_PX
  ) {
    return true;
  }
  return false;
}

export function getActiveWindowInfo(
  platform: NodeJS.Platform = process.platform,
  ownPid: number = process.pid
): Promise<ActiveWindowProbe> {
  if (platform === 'darwin') {
    const script = [
      'tell application "System Events"',
      '  set frontApp to first application process whose frontmost is true',
      '  set appName to name of frontApp',
      '  if appName is "Kkachi" or appName is "까치" or appName is "Electron" then return "SELF"',
      '  tell frontApp',
      '    if (count of windows) > 0 then',
      '      set {wx, wy} to position of front window',
      '      set {ww, wh} to size of front window',
      '      set winTitle to ""',
      '      try',
      '        set winTitle to name of front window',
      '      end try',
      '      return (wx as text) & "," & (wy as text) & "," & (ww as text) & "," & (wh as text) & "|" & appName & ":" & winTitle',
      '    end if',
      '  end tell',
      'end tell',
      'return ""',
    ].join('\n');

    return new Promise((resolve) => {
      execFile('osascript', ['-e', script], { timeout: 1200 }, (err, stdout) => {
        if (err) {
          resolve({ isSelf: false, window: null });
          return;
        }
        resolve(parseActiveWindowOutput(stdout));
      });
    });
  }

  if (platform === 'win32') {
    const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinRectHelper {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@
$h = [WinRectHelper]::GetForegroundWindow()
if ($h -eq [IntPtr]::Zero) { exit 0 }
$p = 0
[WinRectHelper]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
if ($p -eq ${ownPid}) { Write-Output "SELF"; exit 0 }
$r = New-Object WinRectHelper+RECT
if ([WinRectHelper]::GetWindowRect($h, [ref]$r)) {
  Write-Output "$($r.Left),$($r.Top),$($r.Right - $r.Left),$($r.Bottom - $r.Top)|$($h.ToInt64())"
}
`.trim();

    return new Promise((resolve) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', psScript],
        { timeout: 1500, windowsHide: true },
        (err, stdout) => {
          if (err) {
            resolve({ isSelf: false, window: null });
            return;
          }
          resolve(parseActiveWindowOutput(stdout));
        }
      );
    });
  }

  return Promise.resolve({ isSelf: false, window: null });
}

export async function getActiveWindowBounds(
  platform: NodeJS.Platform = process.platform,
  ownPid: number = process.pid
): Promise<Rect | null> {
  const probe = await getActiveWindowInfo(platform, ownPid);
  return probe.window?.bounds ?? null;
}

export function computeWindowPerchTarget(
  activeWindow: Rect,
  size: number,
  workArea: Rect,
  rand: () => number = Math.random
): FlightDestination | null {
  // Require enough room above the active window's top border so Kkachi can perch visibly
  if (activeWindow.y - workArea.y < MIN_PERCH_HEADROOM_PX) {
    return null;
  }

  const workMinX = workArea.x + MASCOT_MARGIN;
  const workMaxX = Math.max(workMinX, workArea.x + workArea.width - size - MASCOT_MARGIN);

  const safeLeft = activeWindow.x + PERCH_LEFT_INSET;
  const safeRight = activeWindow.x + activeWindow.width - size - PERCH_RIGHT_INSET;

  let rawX: number;
  if (safeRight > safeLeft) {
    rawX = safeLeft + rand() * (safeRight - safeLeft);
  } else {
    rawX = activeWindow.x + (activeWindow.width - size) / 2;
  }

  const x = Math.round(Math.max(workMinX, Math.min(workMaxX, rawX)));
  const minY = workArea.y;
  const maxY = Math.max(minY, workArea.y + workArea.height - size);
  const y = Math.round(Math.max(minY, Math.min(maxY, activeWindow.y - MASCOT_FEET_OFFSET_Y)));

  return { x, y, perchedOnWindow: true };
}

export function computeWindowEdgeRange(
  activeWindow: Rect,
  size: number,
  workArea: Rect
): WindowEdgeRange | null {
  if (activeWindow.y - workArea.y < MIN_PERCH_HEADROOM_PX) {
    return null;
  }

  const workMinX = workArea.x;
  const workMaxX = Math.max(workMinX, workArea.x + workArea.width - size);
  // Allow mascot claws to reach right up to the window's left/right top corners
  const leftEdgeX = Math.round(Math.max(workMinX, Math.min(workMaxX, activeWindow.x - 14)));
  const rightEdgeX = Math.round(
    Math.max(workMinX, Math.min(workMaxX, activeWindow.x + activeWindow.width - size + 14))
  );

  if (rightEdgeX - leftEdgeX < 80) {
    return null;
  }

  const minY = workArea.y;
  const maxY = Math.max(minY, workArea.y + workArea.height - size);
  const perchY = Math.round(Math.max(minY, Math.min(maxY, activeWindow.y - MASCOT_FEET_OFFSET_Y)));

  return { leftEdgeX, rightEdgeX, perchY };
}

export function pickWindowStrollTarget(
  currentX: number,
  range: WindowEdgeRange,
  rand: () => number = Math.random
): WindowStrollTarget {
  const goToEdge = rand() < 0.58;
  if (goToEdge) {
    const distLeft = Math.abs(currentX - range.leftEdgeX);
    const distRight = Math.abs(currentX - range.rightEdgeX);
    // Prefer the farther corner so the stroll across the titlebar is noticeable
    const chooseLeft =
      distLeft > distRight + 30
        ? true
        : distRight > distLeft + 30
          ? false
          : rand() < 0.5;
    return chooseLeft
      ? { x: range.leftEdgeX, y: range.perchY, atEdge: 'left' }
      : { x: range.rightEdgeX, y: range.perchY, atEdge: 'right' };
  }

  const innerMin = Math.min(range.rightEdgeX, range.leftEdgeX + 45);
  const innerMax = Math.max(innerMin, range.rightEdgeX - 45);
  let targetX = Math.round(innerMin + rand() * (innerMax - innerMin));
  if (Math.abs(targetX - currentX) < 55) {
    const mid = Math.round((innerMin + innerMax) / 2);
    targetX = currentX < mid ? innerMax : innerMin;
  }
  return { x: targetX, y: range.perchY, atEdge: null };
}

export function rectsOverlap(a: Rect, b: Rect, padding = 0): boolean {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width > b.x - padding &&
    a.y < b.y + b.height + padding &&
    a.y + a.height > b.y - padding
  );
}

export function pickRandomPerimeterTarget(
  current: { x: number; y: number },
  size: number,
  workArea: Rect,
  rand: () => number = Math.random,
  avoidWindow?: Rect | null
): FlightDestination {
  const minX = workArea.x + MASCOT_MARGIN;
  const maxX = Math.max(minX, workArea.x + workArea.width - size - MASCOT_MARGIN);
  const minY = workArea.y + MASCOT_MARGIN;
  const maxY = Math.max(minY, workArea.y + workArea.height - size - MASCOT_MARGIN);

  const samplePerimeter = (): { x: number; y: number } => {
    const edge = Math.floor(rand() * 4);
    switch (edge) {
      case 0:
        return { x: Math.round(minX + rand() * (maxX - minX)), y: Math.round(minY) };
      case 1:
        return { x: Math.round(minX + rand() * (maxX - minX)), y: Math.round(maxY) };
      case 2:
        return { x: Math.round(minX), y: Math.round(minY + rand() * (maxY - minY)) };
      default:
        return { x: Math.round(maxX), y: Math.round(minY + rand() * (maxY - minY)) };
    }
  };

  let best = samplePerimeter();
  let bestScore = -Infinity;

  for (let i = 0; i < 14; i++) {
    const candidate = i === 0 ? best : samplePerimeter();
    const dist = Math.hypot(candidate.x - current.x, candidate.y - current.y);
    const overlaps =
      avoidWindow != null &&
      rectsOverlap({ x: candidate.x, y: candidate.y, width: size, height: size }, avoidWindow, 8);
    // Strongly prefer landing points outside the active window and at least FLIGHT_MIN_DISTANCE away
    const score = (overlaps ? -10000 : 0) + Math.min(dist, FLIGHT_MIN_DISTANCE * 2);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
    if (!overlaps && dist >= FLIGHT_MIN_DISTANCE) {
      break;
    }
  }
  return { ...best, perchedOnWindow: false };
}

function clampPoint(pt: Point2D, size: number, workArea: Rect): Point2D {
  const minX = workArea.x;
  const maxX = Math.max(minX, workArea.x + workArea.width - size);
  const minY = workArea.y;
  const maxY = Math.max(minY, workArea.y + workArea.height - size);
  return {
    x: Math.round(Math.max(minX, Math.min(maxX, pt.x))),
    y: Math.round(Math.max(minY, Math.min(maxY, pt.y))),
  };
}

function pushOutsideObstacle(
  pt: Point2D,
  size: number,
  workArea: Rect,
  obstacle: Rect
): Point2D {
  const pad = 14;
  const minX = workArea.x;
  const maxX = Math.max(minX, workArea.x + workArea.width - size);
  const minY = workArea.y;
  const maxY = Math.max(minY, workArea.y + workArea.height - size);

  const candidates: Point2D[] = [];
  // Above obstacle
  const aboveY = obstacle.y - size - pad;
  if (aboveY >= minY) {
    candidates.push({ x: Math.max(minX, Math.min(maxX, pt.x)), y: aboveY });
  }
  // Below obstacle
  const belowY = obstacle.y + obstacle.height + pad;
  if (belowY <= maxY) {
    candidates.push({ x: Math.max(minX, Math.min(maxX, pt.x)), y: belowY });
  }
  // Left of obstacle
  const leftX = obstacle.x - size - pad;
  if (leftX >= minX) {
    candidates.push({ x: leftX, y: Math.max(minY, Math.min(maxY, pt.y)) });
  }
  // Right of obstacle
  const rightX = obstacle.x + obstacle.width + pad;
  if (rightX <= maxX) {
    candidates.push({ x: rightX, y: Math.max(minY, Math.min(maxY, pt.y)) });
  }

  if (candidates.length === 0) {
    // Fallback to nearest screen edge if active window is maximized
    const edgeCandidates: Point2D[] = [
      { x: pt.x, y: minY },
      { x: pt.x, y: maxY },
      { x: minX, y: pt.y },
      { x: maxX, y: pt.y },
    ];
    edgeCandidates.sort(
      (a, b) => Math.hypot(a.x - pt.x, a.y - pt.y) - Math.hypot(b.x - pt.x, b.y - pt.y)
    );
    return clampPoint(edgeCandidates[0], size, workArea);
  }

  candidates.sort(
    (a, b) => Math.hypot(a.x - pt.x, a.y - pt.y) - Math.hypot(b.x - pt.x, b.y - pt.y)
  );
  return clampPoint(candidates[0], size, workArea);
}

/**
 * Builds a multi-waypoint wandering flight path that curves with random direction
 * changes and routes around the active window instead of flying straight across it.
 */
export function buildWanderingFlightPath(
  start: Point2D,
  end: Point2D,
  size: number,
  workArea: Rect,
  avoidWindow?: Rect | null,
  rand: () => number = Math.random
): Point2D[] {
  const waypointCount = rand() < 0.55 ? 3 : 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  // Unit perpendicular vector for lateral meandering
  const perpX = -dy / dist;
  const perpY = dx / dist;

  const waypoints: Point2D[] = [start];
  let sideSign = rand() < 0.5 ? 1 : -1;

  for (let i = 1; i <= waypointCount; i++) {
    const t = i / (waypointCount + 1);
    // Alternate sides so Kkachi visibly curves and changes direction mid-flight
    sideSign = i === 1 ? sideSign : -sideSign;
    const lateralMag = 110 + rand() * 190;
    const jitterX = (rand() - 0.5) * 180;
    const jitterY = (rand() - 0.5) * 140 - 35;

    let wp = clampPoint(
      {
        x: start.x + dx * t + perpX * lateralMag * sideSign + jitterX,
        y: start.y + dy * t + perpY * lateralMag * sideSign + jitterY,
      },
      size,
      workArea
    );

    if (avoidWindow) {
      // Sample around obstacle if this waypoint overlaps the active window body
      const overlaps = rectsOverlap(
        { x: wp.x, y: wp.y, width: size, height: size },
        avoidWindow,
        10
      );
      if (overlaps) {
        wp = pushOutsideObstacle(wp, size, workArea, avoidWindow);
      }
    }

    waypoints.push(wp);
  }

  waypoints.push(end);
  return waypoints;
}

export function estimatePathLength(waypoints: Point2D[]): number {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].y - waypoints[i - 1].y);
  }
  return total;
}

/**
 * Evaluates a smooth Catmull-Rom spline through `waypoints` for `progress` in [0, 1],
 * returning position and instantaneous velocity (vx, vy) for dynamic facing flips.
 */
export function sampleFlightPath(waypoints: Point2D[], progress: number): SampledFlightPoint {
  if (waypoints.length === 0) {
    return { x: 0, y: 0, vx: 0, vy: 0 };
  }
  if (waypoints.length === 1) {
    return { x: waypoints[0].x, y: waypoints[0].y, vx: 0, vy: 0 };
  }

  const clamped = Math.max(0, Math.min(1, progress));
  const segCount = waypoints.length - 1;
  const scaled = clamped * segCount;
  const segIdx = Math.min(segCount - 1, Math.floor(scaled));
  const u = scaled - segIdx;

  const p0 = waypoints[Math.max(0, segIdx - 1)];
  const p1 = waypoints[segIdx];
  const p2 = waypoints[Math.min(segCount, segIdx + 1)];
  const p3 = waypoints[Math.min(segCount, segIdx + 2)];

  const u2 = u * u;
  const u3 = u2 * u;

  const x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * u +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);

  const y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * u +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);

  const vx =
    0.5 *
    ((-p0.x + p2.x) +
      2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u +
      3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u2);

  const vy =
    0.5 *
    ((-p0.y + p2.y) +
      2 * (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u +
      3 * (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u2);

  return { x, y, vx, vy };
}
