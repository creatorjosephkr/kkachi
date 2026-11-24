import { execFile } from 'node:child_process';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlightDestination {
  x: number;
  y: number;
  perchedOnWindow: boolean;
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

export function getActiveWindowBounds(
  platform: NodeJS.Platform = process.platform,
  ownPid: number = process.pid
): Promise<Rect | null> {
  if (platform === 'darwin') {
    const script = [
      'tell application "System Events"',
      '  set frontApp to first application process whose frontmost is true',
      '  set appName to name of frontApp',
      '  if appName is "Kkachi" or appName is "Electron" then return ""',
      '  tell frontApp',
      '    if (count of windows) > 0 then',
      '      set {wx, wy} to position of front window',
      '      set {ww, wh} to size of front window',
      '      return (wx as text) & "," & (wy as text) & "," & (ww as text) & "," & (wh as text)',
      '    end if',
      '  end tell',
      'end tell',
      'return ""',
    ].join('\n');

    return new Promise((resolve) => {
      execFile('osascript', ['-e', script], { timeout: 1200 }, (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        resolve(parseBoundsCsv(stdout));
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
if ($p -eq ${ownPid}) { exit 0 }
$r = New-Object WinRectHelper+RECT
if ([WinRectHelper]::GetWindowRect($h, [ref]$r)) {
  Write-Output "$($r.Left),$($r.Top),$($r.Right - $r.Left),$($r.Bottom - $r.Top)"
}
`.trim();

    return new Promise((resolve) => {
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', psScript],
        { timeout: 1500, windowsHide: true },
        (err, stdout) => {
          if (err) {
            resolve(null);
            return;
          }
          resolve(parseBoundsCsv(stdout));
        }
      );
    });
  }

  return Promise.resolve(null);
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

export function pickRandomPerimeterTarget(
  current: { x: number; y: number },
  size: number,
  workArea: Rect,
  rand: () => number = Math.random
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
  let bestDist = Math.hypot(best.x - current.x, best.y - current.y);
  for (let i = 0; i < 8 && bestDist < FLIGHT_MIN_DISTANCE; i++) {
    const candidate = samplePerimeter();
    const dist = Math.hypot(candidate.x - current.x, candidate.y - current.y);
    if (dist > bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return { ...best, perchedOnWindow: false };
}
