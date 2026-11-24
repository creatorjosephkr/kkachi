import React from 'react';
import type { MascotFacing } from '../../shared/types';

export type MascotMood =
  | 'awake'
  | 'dozing'
  | 'startled'
  | 'looking'
  | 'flying'
  | 'walking'
  | 'teetering';

export interface Kkachi3DMascotProps {
  size?: number;
  facing?: MascotFacing;
  holdingLetter: boolean;
  hideBranch?: boolean;
  lookX: number; // -1 (left) .. 1 (right)
  lookY: number; // -1 (up) .. 1 (down)
  mood: MascotMood;
  blinkAmount: number; // 0 (open) .. 1 (closed)
  wingFlap: number; // 0 (rest) .. 1 (raised)
  dozeNod: number; // 0 (upright) .. 1 (nodded down)
  jumpOffsetY: number; // vertical jump offset in viewBox units (negative = up)
  dozeTick: number; // 0..1 continuous cycle for floating Zz
  walkCycle?: number; // continuous phase for walking stride & teeter wobble
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const Kkachi3DMascot: React.FC<Kkachi3DMascotProps> = ({
  size = 112,
  facing = 'right',
  holdingLetter,
  hideBranch = false,
  lookX,
  lookY,
  mood,
  blinkAmount,
  wingFlap,
  dozeNod,
  jumpOffsetY,
  dozeTick,
  walkCycle = 0,
}) => {
  const uid = React.useId().replace(/:/g, '');
  const isMirrored = facing === 'left';
  // Mirror horizontal gaze into local SVG space when the mascot body faces left
  const lx = clamp(isMirrored ? -lookX : lookX, -1, 1);
  const ly = clamp(lookY, -1, 1);

  // Head pivot at neck (68, 54)
  const headDropY = mood === 'dozing' ? dozeNod * 5.5 : ly * 1.4;
  const headTiltDeg =
    mood === 'dozing'
      ? dozeNod * 14
      : mood === 'startled'
        ? -6
        : lx * 8 + ly * 3;

  // 2.5D spherical projection on head center (68, 40)
  const faceShiftX = lx * 9.5;
  const faceShiftY = ly * 4.5 + (mood === 'dozing' ? dozeNod * 2.5 : 0);

  // Eye positions & foreshortening as head rotates horizontally
  const leftEyeX = 68 + faceShiftX - 6.8 * (1 - Math.max(0, lx) * 0.42);
  const rightEyeX = 68 + faceShiftX + 6.8 * (1 - Math.max(0, -lx) * 0.42);
  const eyeY = 39.5 + faceShiftY;

  const leftEyeRx = 3.6 * (1 - Math.max(0, lx) * 0.45);
  const rightEyeRx = 3.6 * (1 - Math.max(0, -lx) * 0.45);
  const eyeScale = mood === 'teetering' ? 1.2 : mood === 'startled' ? 1.14 : 1;

  const pupilShiftX = lx * 1.6;
  const pupilShiftY = ly * 1.4;

  // Eyelid closure (0 = open, 1 = closed)
  const eyelidClose =
    mood === 'startled' || mood === 'teetering'
      ? 0
      : mood === 'dozing'
        ? clamp(0.65 + dozeNod * 0.35, 0, 1)
        : clamp(blinkAmount, 0, 1);

  // 3D Conical beak anchored on lower-front face sphere
  const beakBaseX = 68 + lx * 11.5;
  const beakBaseY = 44.5 + faceShiftY * 0.9;
  const beakTipX = beakBaseX + lx * 15.5;
  const beakTipY = beakBaseY + 2.2 + ly * 3.5;

  // Wing rotation around shoulder joints (positive swings front wing outward-left; negative lifts back wing upward-right)
  const frontWingDeg =
    wingFlap * (mood === 'flying' || mood === 'teetering' ? 66 : 56) +
    (mood === 'startled' || mood === 'teetering' ? 6 : 0);
  const backWingDeg = -wingFlap * (mood === 'flying' || mood === 'teetering' ? 58 : 48);
  const wingScaleY = 1 - wingFlap * 0.14;
  const bodyFlightPitchDeg =
    mood === 'flying'
      ? 11
      : mood === 'teetering'
        ? 13 + Math.sin(walkCycle * 1.6) * 11
        : mood === 'walking'
          ? 3 + Math.sin(walkCycle) * 3.5
          : 0;

  // Alternating leg stride offsets when walking or scrambling on edge
  const leftLegDx =
    mood === 'walking'
      ? Math.sin(walkCycle) * 5.2
      : mood === 'teetering'
        ? Math.sin(walkCycle * 2.2) * 3.2
        : 0;
  const leftLegDy =
    mood === 'walking'
      ? -Math.max(0, Math.cos(walkCycle)) * 3.8
      : mood === 'teetering'
        ? -Math.abs(Math.sin(walkCycle * 2.2)) * 2.5
        : 0;
  const rightLegDx =
    mood === 'walking'
      ? -Math.sin(walkCycle) * 5.2
      : mood === 'teetering'
        ? -Math.sin(walkCycle * 2.2) * 3.2
        : 0;
  const rightLegDy =
    mood === 'walking'
      ? -Math.max(0, -Math.cos(walkCycle)) * 3.8
      : mood === 'teetering'
        ? -Math.abs(Math.cos(walkCycle * 2.2)) * 2.5
        : 0;

  // Envelope orientation follows facing side smoothly
  const facingSign = lx >= -0.05 ? 1 : -1;
  const envAngle = facingSign * -10;
  const envX = beakTipX + (facingSign > 0 ? -2 : -30);
  const envY = beakTipY - 8;

  // Floating Zz animation coordinates during dozing
  const z1Progress = dozeTick % 1;
  const z2Progress = (dozeTick + 0.5) % 1;

  const bodyGradId = `body-${uid}`;
  const bellyGradId = `belly-${uid}`;
  const headGradId = `head-${uid}`;
  const wingGradId = `wing-${uid}`;
  const tailGradId = `tail-${uid}`;
  const beakTopGradId = `beakTop-${uid}`;
  const branchGradId = `branch-${uid}`;
  const envGradId = `env-${uid}`;
  const waxGradId = `wax-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient
          id={bodyGradId}
          cx="34%"
          cy="26%"
          r="72%"
          fx="30%"
          fy="22%"
        >
          <stop offset="0%" stopColor="#475569" />
          <stop offset="38%" stopColor="#1E293B" />
          <stop offset="82%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#090D16" />
        </radialGradient>

        <radialGradient
          id={bellyGradId}
          cx="35%"
          cy="28%"
          r="70%"
          fx="30%"
          fy="24%"
        >
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="65%" stopColor="#F1F5F9" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </radialGradient>

        <radialGradient
          id={headGradId}
          cx={`${36 + lx * 8}%`}
          cy={`${28 + ly * 8}%`}
          r="68%"
        >
          <stop offset="0%" stopColor="#475569" />
          <stop offset="35%" stopColor="#1E293B" />
          <stop offset="82%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#070B14" />
        </radialGradient>

        <linearGradient id={wingGradId} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#2DD4BF" />
          <stop offset="42%" stopColor="#2563EB" />
          <stop offset="85%" stopColor="#1E3A8A" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>

        <linearGradient id={tailGradId} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="45%" stopColor="#0D9488" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>

        <linearGradient id={beakTopGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="55%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>

        <linearGradient id={branchGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#78716C" />
          <stop offset="50%" stopColor="#44403C" />
          <stop offset="100%" stopColor="#1C1917" />
        </linearGradient>

        <linearGradient id={envGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>

        <radialGradient id={waxGradId} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#FCA5A5" />
          <stop offset="45%" stopColor="#EF4444" />
          <stop offset="100%" stopColor="#B91C1C" />
        </radialGradient>
      </defs>

      <g transform={isMirrored ? 'translate(140 0) scale(-1 1)' : undefined}>
      {/* 3D Branch Perch (hidden while flying or perched directly on a window) */}
      {mood !== 'flying' && !hideBranch && (
        <>
          <path
            d="M 24 109 Q 70 97 116 105"
            stroke={`url(#${branchGradId})`}
            strokeWidth="6.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 26 107.2 Q 70 95.4 114 103.2"
            stroke="#A8A29E"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.55"
            fill="none"
          />
        </>
      )}

      {/* Bird Root Group (jumps vertically when startled, pitches forward when flying) */}
      <g
        transform={`translate(0 ${jumpOffsetY.toFixed(2)})${
          bodyFlightPitchDeg ? ` rotate(${bodyFlightPitchDeg} 70 72)` : ''
        }`}
      >
        {/* Back Wing (flaps behind torso when startled) */}
        <g transform={`translate(76 64) rotate(${backWingDeg.toFixed(1)}) scale(1 ${wingScaleY.toFixed(2)})`}>
          <path
            d="M -2 -4 C 12 -14 26 -10 28 2 C 29 12 16 20 2 18 Z"
            fill={`url(#${wingGradId})`}
            stroke="#0F172A"
            strokeWidth="1"
            opacity={wingFlap > 0.04 ? 0.96 : 0}
          />
        </g>

        {/* 3D Graduated Tail */}
        <path
          d="M 52 80 L 14 118 C 11.5 120.5 14 124 17.5 122.5 L 34 113 L 61 86 Z"
          fill={`url(#${tailGradId})`}
          stroke="#1E293B"
          strokeWidth="1.1"
        />
        {/* Glossy 3D Ridge on Tail */}
        <path
          d="M 53 81.5 L 18 117.5"
          stroke="#5EEAD4"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.4"
        />

        {/* 3D Feet & Claws (animated stride while walking or scrambling on edge) */}
        <g stroke="#334155" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <g transform={`translate(${leftLegDx.toFixed(2)} ${leftLegDy.toFixed(2)})`}>
            <path d="M 60 92 L 58 103 M 58 103 L 53.5 105.5 M 58 103 L 61.5 106" />
          </g>
          <g transform={`translate(${rightLegDx.toFixed(2)} ${rightLegDy.toFixed(2)})`}>
            <path d="M 74 92 L 75 102.5 M 75 102.5 L 71 105 M 75 102.5 L 79 105" />
          </g>
        </g>

        {/* Cute panic sweat drop when teetering at window corner */}
        {mood === 'teetering' && (
          <path
            d="M 45 26 C 45 26 41 32 41 34.8 C 41 37 42.8 38.6 45 38.6 C 47.2 38.6 49 37 49 34.8 C 49 32 45 26 45 26 Z"
            fill="#38BDF8"
            stroke="#0284C7"
            strokeWidth="0.9"
            opacity="0.92"
          />
        )}

        {/* 3D Plump Torso Sphere/Pear */}
        <path
          d="M 68 48 C 80 48 90 58 90 73 C 90 88 79 97 65 97 C 50 97 41 87 42 73 C 43 59 54 48 68 48 Z"
          fill={`url(#${bodyGradId})`}
          stroke="#334155"
          strokeWidth="1.2"
        />

        {/* 3D White Belly Dome */}
        <path
          d="M 69 64 C 81 64 88 73 86 84 C 84 93 74 97 64 96 C 55 95 51 89 52 81 C 53 71 60 64 69 64 Z"
          fill={`url(#${bellyGradId})`}
          stroke="#CBD5E1"
          strokeWidth="1"
        />
        {/* Soft Shadow under Neck on Belly */}
        <ellipse cx="69" cy="66.5" rx="11" ry="3.2" fill="#94A3B8" opacity="0.28" />

        {/* 3D Front Wing (pivots at shoulder 53, 64) */}
        <g transform={`translate(53 64) rotate(${frontWingDeg.toFixed(1)}) scale(1 ${wingScaleY.toFixed(2)})`}>
          <path
            d="M -4 -3 C 4 -12 18 -10 21 0 C 23 11 13 24 -2 27 C -9 28 -13 22 -11 14 C -9 7 -7 1 -4 -3 Z"
            fill={`url(#${wingGradId})`}
            stroke="#1E293B"
            strokeWidth="1.1"
          />
          {/* Puffy White Scapular Patch */}
          <path
            d="M -2 -1 C 5 -7 15 -5 17 2 C 18 7 11 11 4 11 C -3 11 -6 6 -2 -1 Z"
            fill={`url(#${bellyGradId})`}
            stroke="#CBD5E1"
            strokeWidth="0.9"
          />
          {/* Wing Gloss Highlight */}
          <path
            d="M -5 15 C 0 21 8 22 14 16"
            stroke="#93C5FD"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.45"
          />
        </g>

        {/* Wing Flap Motion Lines when Startled */}
        {wingFlap > 0.25 && (
          <g stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" opacity={wingFlap * 0.7}>
            <path d="M 24 44 C 21 50 21 57 25 63" />
            <path d="M 108 46 C 111 52 111 59 107 65" />
          </g>
        )}

        {/* 3D Interactive Head Group (pivots at neck 68, 54) */}
        <g transform={`translate(0 ${headDropY.toFixed(2)}) rotate(${headTiltDeg.toFixed(2)} 68 54)`}>
          {/* 3D Head Sphere */}
          <circle
            cx="68"
            cy="40"
            r="20.5"
            fill={`url(#${headGradId})`}
            stroke="#334155"
            strokeWidth="1.2"
          />
          {/* 3D Crown Glossy Reflection */}
          <ellipse
            cx={62 + lx * 3}
            cy={27 + ly * 1.5}
            rx="8.5"
            ry="3.6"
            transform={`rotate(-12 ${62 + lx * 3} ${27 + ly * 1.5})`}
            fill="#94A3B8"
            opacity="0.22"
          />

          {/* Subtle Cute 3D Cheek Blushes */}
          <ellipse
            cx={leftEyeX - 1.5}
            cy={eyeY + 5.2}
            rx={3.2 * (1 - Math.max(0, lx) * 0.4)}
            ry="1.7"
            fill="#FB7185"
            opacity="0.24"
          />
          <ellipse
            cx={rightEyeX + 1.5}
            cy={eyeY + 5.2}
            rx={3.2 * (1 - Math.max(0, -lx) * 0.4)}
            ry="1.7"
            fill="#FB7185"
            opacity="0.24"
          />

          {/* Left 3D Glossy Eye */}
          <g transform={`translate(${leftEyeX.toFixed(2)} ${eyeY.toFixed(2)}) scale(1 ${eyeScale})`}>
            {eyelidClose < 0.72 ? (
              <>
                <ellipse cx="0" cy="0" rx={leftEyeRx} ry={3.9} fill="#FFFFFF" />
                <ellipse
                  cx={pupilShiftX * (leftEyeRx / 3.6)}
                  cy={pupilShiftY}
                  rx={leftEyeRx * 0.62}
                  ry={2.45}
                  fill="#090D16"
                />
                <circle
                  cx={pupilShiftX * 0.5 + leftEyeRx * 0.28}
                  cy={pupilShiftY * 0.5 - 1.1}
                  r="1.05"
                  fill="#FFFFFF"
                />
                {eyelidClose > 0.05 && (
                  <path
                    d={`M ${-leftEyeRx - 0.5} -4.2 L ${leftEyeRx + 0.5} -4.2 L ${leftEyeRx + 0.5} ${-4.2 + eyelidClose * 8.4} L ${-leftEyeRx - 0.5} ${-4.2 + eyelidClose * 8.4} Z`}
                    fill="#1E293B"
                  />
                )}
              </>
            ) : (
              <path
                d={`M ${-leftEyeRx} 0.5 Q 0 3.2 ${leftEyeRx} 0.5`}
                stroke="#CBD5E1"
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
            )}
          </g>

          {/* Right 3D Glossy Eye */}
          <g transform={`translate(${rightEyeX.toFixed(2)} ${eyeY.toFixed(2)}) scale(1 ${eyeScale})`}>
            {eyelidClose < 0.72 ? (
              <>
                <ellipse cx="0" cy="0" rx={rightEyeRx} ry={3.9} fill="#FFFFFF" />
                <ellipse
                  cx={pupilShiftX * (rightEyeRx / 3.6)}
                  cy={pupilShiftY}
                  rx={rightEyeRx * 0.62}
                  ry={2.45}
                  fill="#090D16"
                />
                <circle
                  cx={pupilShiftX * 0.5 + rightEyeRx * 0.28}
                  cy={pupilShiftY * 0.5 - 1.1}
                  r="1.05"
                  fill="#FFFFFF"
                />
                {eyelidClose > 0.05 && (
                  <path
                    d={`M ${-rightEyeRx - 0.5} -4.2 L ${rightEyeRx + 0.5} -4.2 L ${rightEyeRx + 0.5} ${-4.2 + eyelidClose * 8.4} L ${-rightEyeRx - 0.5} ${-4.2 + eyelidClose * 8.4} Z`}
                    fill="#1E293B"
                  />
                )}
              </>
            ) : (
              <path
                d={`M ${-rightEyeRx} 0.5 Q 0 3.2 ${rightEyeRx} 0.5`}
                stroke="#CBD5E1"
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
            )}
          </g>

          {/* Lower Beak (behind held letter) */}
          <path
            d={`M ${(beakBaseX - 3.6).toFixed(2)} ${(beakBaseY + 0.5).toFixed(2)} L ${beakTipX.toFixed(2)} ${beakTipY.toFixed(2)} L ${(beakBaseX + 3.6).toFixed(2)} ${(beakBaseY + 0.5).toFixed(2)} L ${beakBaseX.toFixed(2)} ${(beakBaseY + 3.8).toFixed(2)} Z`}
            fill="#1E293B"
            stroke="#0F172A"
            strokeWidth="0.7"
          />

          {/* Letter Held in Beak (only when new/unread mail exists) */}
          {holdingLetter && (
            <g transform={`rotate(${envAngle} ${beakTipX.toFixed(1)} ${beakTipY.toFixed(1)})`}>
              <rect
                x={envX}
                y={envY}
                width="34"
                height="23"
                rx="3.2"
                fill={`url(#${envGradId})`}
                stroke="#94A3B8"
                strokeWidth="1.3"
              />
              <path
                d={`M ${envX + 2} ${envY + 20.5} L ${envX + 13} ${envY + 12} M ${envX + 32} ${envY + 20.5} L ${envX + 21} ${envY + 12}`}
                stroke="#CBD5E1"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
              <path
                d={`M ${envX + 1} ${envY + 1.5} L ${envX + 17} ${envY + 13.5} L ${envX + 33} ${envY + 1.5}`}
                fill="#F8FAFC"
                stroke="#94A3B8"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <circle cx={envX + 17} cy={envY + 13} r="3.7" fill={`url(#${waxGradId})`} />
              <circle
                cx={envX + 17}
                cy={envY + 13}
                r="2.1"
                fill="none"
                stroke="#FECACA"
                strokeWidth="0.65"
                opacity="0.75"
              />
            </g>
          )}

          {/* 3D Upper Beak (overlaps letter edge so bird grips it cleanly) */}
          <path
            d={`M ${(beakBaseX - 3.8).toFixed(2)} ${(beakBaseY + 0.4).toFixed(2)} L ${beakBaseX.toFixed(2)} ${(beakBaseY - 3.6).toFixed(2)} L ${(beakBaseX + 3.8).toFixed(2)} ${(beakBaseY + 0.4).toFixed(2)} L ${beakTipX.toFixed(2)} ${beakTipY.toFixed(2)} Z`}
            fill={`url(#${beakTopGradId})`}
            stroke="#334155"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
          {/* Beak Top Ridge Highlight */}
          <path
            d={`M ${beakBaseX.toFixed(2)} ${(beakBaseY - 2.4).toFixed(2)} L ${beakTipX.toFixed(2)} ${beakTipY.toFixed(2)}`}
            stroke="#E2E8F0"
            strokeWidth="0.9"
            strokeLinecap="round"
            opacity="0.5"
          />
        </g>
      </g>
      </g>

      {/* Unmirrored Status Effects (vertical jump offset only, so Zz and ! never mirror horizontally) */}
      <g transform={`translate(0 ${jumpOffsetY.toFixed(2)})`}>
        {/* Dozing Floating "z Z" */}
        {mood === 'dozing' && (
          <g fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontWeight="700">
            <text
              x={(isMirrored ? 40 : 88) + Math.sin(z1Progress * Math.PI * 2) * 3}
              y={36 - z1Progress * 14}
              fontSize="11"
              fill="#60A5FA"
              stroke="#FFFFFF"
              strokeWidth="0.4"
              opacity={Math.sin(z1Progress * Math.PI)}
            >
              z
            </text>
            <text
              x={(isMirrored ? 28 : 97) + Math.cos(z2Progress * Math.PI * 2) * 3.5}
              y={33 - z2Progress * 17}
              fontSize="14"
              fill="#3B82F6"
              stroke="#FFFFFF"
              strokeWidth="0.45"
              opacity={Math.sin(z2Progress * Math.PI)}
            >
              Z
            </text>
          </g>
        )}

        {/* Startled Exclamation Spark "!" */}
        {mood === 'startled' && (
          <g transform={`translate(${isMirrored ? 38 : 88} 10)`}>
            <path
              d="M 4 0 L 8.5 0 L 7.4 10.5 L 5.1 10.5 Z"
              fill="#F59E0B"
              stroke="#B45309"
              strokeWidth="0.8"
              strokeLinejoin="round"
            />
            <circle cx="6.25" cy="14.2" r="1.9" fill="#F59E0B" stroke="#B45309" strokeWidth="0.8" />
          </g>
        )}
      </g>
    </svg>
  );
};
