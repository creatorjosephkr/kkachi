import React, { useEffect, useRef, useState } from 'react';
import type { MascotState } from '../../shared/types';
import { Kkachi3DMascot, type MascotMood } from './Kkachi3DMascot';

const DOUBLE_CLICK_DELAY_MS = 240;
const IDLE_BEFORE_DOZE_MS = 45000;
const STARTLE_DURATION_MS = 1100;
const LOOKING_DURATION_MS = 2100;

interface AnimFrameState {
  lookX: number;
  lookY: number;
  mood: MascotMood;
  blinkAmount: number;
  wingFlap: number;
  dozeNod: number;
  jumpOffsetY: number;
  dozeTick: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export const MascotWidget: React.FC = () => {
  const [state, setState] = useState<MascotState>({
    unreadCount: 0,
    hasNewAlert: false,
    isChecking: false,
    facing: 'right',
  });

  const [anim, setAnim] = useState<AnimFrameState>({
    lookX: 0.45,
    lookY: 0,
    mood: 'awake',
    blinkAmount: 0,
    wingFlap: 0,
    dozeNod: 0,
    jumpOffsetY: 0,
    dozeTick: 0,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const draggingRef = useRef(false);
  const hoveringRef = useRef(false);
  const lastScreenPosRef = useRef({ x: 0, y: 0 });
  const totalMovedRef = useRef(0);
  const clickTimerRef = useRef<number | null>(null);

  // Animation engine refs
  const targetLookRef = useRef({ x: 0.45, y: 0 });
  const currentLookRef = useRef({ x: 0.45, y: 0 });
  const moodRef = useRef<MascotMood>('awake');
  const moodEnteredAtRef = useRef(Date.now());
  const idleSinceRef = useRef(Date.now());
  const nextStartleAtRef = useRef<number | null>(null);
  const nextBlinkAtRef = useRef(Date.now() + 3000);
  const blinkStartAtRef = useRef<number | null>(null);
  const lastCommittedAnimRef = useRef<AnimFrameState | null>(null);

  const clearClickTimer = () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  };

  const wakeUp = () => {
    idleSinceRef.current = Date.now();
    nextStartleAtRef.current = null;
    if (moodRef.current !== 'awake') {
      moodRef.current = 'awake';
      moodEnteredAtRef.current = Date.now();
    }
  };

  const openInboxWindow = () => {
    const cur = stateRef.current;
    const emailId =
      cur.hasNewAlert && cur.latestEmailId && cur.latestEmailId !== 'sample-test-email'
        ? cur.latestEmailId
        : undefined;
    void window.kkachi.openMainWindow(emailId);
  };

  useEffect(() => {
    document.documentElement.classList.add('mascot-mode');
    document.body.classList.add('mascot-mode');

    void window.kkachi.getMascotState().then((initial) => {
      setState(initial);
      const restX = initial.facing === 'left' ? -0.45 : 0.45;
      targetLookRef.current = { x: restX, y: 0 };
      currentLookRef.current = { x: restX, y: 0 };
      if (initial.unreadCount > 0 || initial.hasNewAlert) {
        wakeUp();
      }
    });

    const unsubState = window.kkachi.onMascotState((next) => {
      const prevFacing = stateRef.current.facing;
      setState(next);
      if (next.facing !== prevFacing) {
        targetLookRef.current.x = next.facing === 'left' ? -0.45 : 0.45;
      }
      if (next.unreadCount > 0 || next.hasNewAlert) {
        wakeUp();
      }
    });

    const unsubCursor = window.kkachi.onMascotCursor(({ dx, dy }) => {
      // Normalize pointer delta smoothly into [-1, 1]
      targetLookRef.current = {
        x: Math.tanh(dx / 240),
        y: Math.tanh(dy / 200),
      };
    });

    return () => {
      clearClickTimer();
      document.documentElement.classList.remove('mascot-mode');
      document.body.classList.remove('mascot-mode');
      unsubState();
      unsubCursor();
    };
  }, []);

  // Main 60fps animation & idle/dozing/startled state machine
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (nowPerf: number) => {
      const dtSec = Math.min(0.05, (nowPerf - lastTime) / 1000);
      lastTime = nowPerf;
      const now = Date.now();

      const hasMail = stateRef.current.unreadCount > 0 || stateRef.current.hasNewAlert;
      const isFlying = Boolean(stateRef.current.isFlying);

      if (isFlying) {
        idleSinceRef.current = now;
        nextStartleAtRef.current = null;
        if (moodRef.current !== 'flying') {
          moodRef.current = 'flying';
          moodEnteredAtRef.current = now;
        }
      } else if (moodRef.current === 'flying') {
        moodRef.current = 'awake';
        moodEnteredAtRef.current = now;
        idleSinceRef.current = now;
      }

      if (!isFlying && (hasMail || hoveringRef.current || draggingRef.current)) {
        idleSinceRef.current = now;
        if (moodRef.current === 'dozing') {
          moodRef.current = 'awake';
          moodEnteredAtRef.current = now;
          nextStartleAtRef.current = null;
        }
      }

      // Transition awake -> dozing after long quiet period with no new mail
      if (
        moodRef.current === 'awake' &&
        !hasMail &&
        !hoveringRef.current &&
        !draggingRef.current &&
        now - idleSinceRef.current >= IDLE_BEFORE_DOZE_MS
      ) {
        moodRef.current = 'dozing';
        moodEnteredAtRef.current = now;
        nextStartleAtRef.current = now + 25000 + Math.random() * 20000;
      }

      // Transition dozing -> startled -> looking -> awake + status notice
      if (
        moodRef.current === 'dozing' &&
        nextStartleAtRef.current !== null &&
        now >= nextStartleAtRef.current
      ) {
        moodRef.current = 'startled';
        moodEnteredAtRef.current = now;
        nextStartleAtRef.current = null;
      }

      const elapsedInMood = now - moodEnteredAtRef.current;

      if (moodRef.current === 'startled' && elapsedInMood >= STARTLE_DURATION_MS) {
        moodRef.current = 'looking';
        moodEnteredAtRef.current = now;
      } else if (moodRef.current === 'looking' && elapsedInMood >= LOOKING_DURATION_MS) {
        moodRef.current = 'awake';
        moodEnteredAtRef.current = now;
        idleSinceRef.current = now;
        if (!hasMail) {
          void window.kkachi.showMascotStatusNotice('새 이메일이 없습니다');
        }
      }

      // Determine look target per mood
      let goalX = targetLookRef.current.x;
      let goalY = targetLookRef.current.y;
      let wingFlap = 0;
      let dozeNod = 0;
      let jumpOffsetY = 0;
      let dozeTick = 0;

      if (moodRef.current === 'flying') {
        const sec = elapsedInMood / 1000;
        goalX = stateRef.current.facing === 'left' ? -0.78 : 0.78;
        goalY = -0.14;
        wingFlap = 0.22 + 0.78 * Math.abs(Math.sin(sec * 16));
        jumpOffsetY = -Math.sin(sec * 16) * 4.5 - 3;
      } else if (moodRef.current === 'dozing') {
        const sec = elapsedInMood / 1000;
        // Slow heavy head droop + gentle catch bob
        const wave = Math.sin(sec * 1.45);
        dozeNod = clamp(0.62 + wave * 0.35, 0.25, 1);
        goalX = stateRef.current.facing === 'left' ? -0.2 : 0.2;
        goalY = 0.45;
        dozeTick = (sec * 0.32) % 1;
      } else if (moodRef.current === 'startled') {
        const sec = elapsedInMood / 1000;
        goalX = 0;
        goalY = -0.18;
        wingFlap = Math.abs(Math.sin(sec * 24));
        jumpOffsetY = -Math.abs(Math.sin(sec * 10)) * 7.5;
      } else if (moodRef.current === 'looking') {
        const p = elapsedInMood / LOOKING_DURATION_MS;
        if (p < 0.26) {
          goalX = -0.92;
          goalY = -0.05;
        } else if (p < 0.54) {
          goalX = 0.92;
          goalY = -0.05;
        } else if (p < 0.78) {
          goalX = -0.78;
          goalY = 0.08;
        } else {
          goalX = stateRef.current.facing === 'left' ? -0.35 : 0.35;
          goalY = 0;
        }
      }

      // Smoothly interpolate gaze & head angle
      const followSpeed = moodRef.current === 'looking' ? 14 : moodRef.current === 'startled' ? 18 : 9;
      const factor = Math.min(1, dtSec * followSpeed);
      currentLookRef.current = {
        x: lerp(currentLookRef.current.x, goalX, factor),
        y: lerp(currentLookRef.current.y, goalY, factor),
      };

      // Periodic natural blinking when awake/looking
      let blinkAmount = 0;
      if (moodRef.current === 'awake' || moodRef.current === 'looking') {
        if (blinkStartAtRef.current === null && now >= nextBlinkAtRef.current) {
          blinkStartAtRef.current = now;
        }
        if (blinkStartAtRef.current !== null) {
          const blinkElapsed = now - blinkStartAtRef.current;
          const blinkDur = 160;
          if (blinkElapsed >= blinkDur) {
            blinkStartAtRef.current = null;
            nextBlinkAtRef.current = now + 2800 + Math.random() * 3200;
          } else {
            blinkAmount = Math.sin((blinkElapsed / blinkDur) * Math.PI);
          }
        }
      }

      const nextAnim: AnimFrameState = {
        lookX: currentLookRef.current.x,
        lookY: currentLookRef.current.y,
        mood: moodRef.current,
        blinkAmount,
        wingFlap,
        dozeNod,
        jumpOffsetY,
        dozeTick,
      };

      const prev = lastCommittedAnimRef.current;
      const changed =
        !prev ||
        prev.mood !== nextAnim.mood ||
        Math.abs(prev.lookX - nextAnim.lookX) > 0.0015 ||
        Math.abs(prev.lookY - nextAnim.lookY) > 0.0015 ||
        Math.abs(prev.blinkAmount - nextAnim.blinkAmount) > 0.005 ||
        Math.abs(prev.wingFlap - nextAnim.wingFlap) > 0.005 ||
        Math.abs(prev.dozeNod - nextAnim.dozeNod) > 0.003 ||
        Math.abs(prev.jumpOffsetY - nextAnim.jumpOffsetY) > 0.02 ||
        Math.abs(prev.dozeTick - nextAnim.dozeTick) > 0.005;

      if (changed) {
        lastCommittedAnimRef.current = nextAnim;
        setAnim(nextAnim);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.screenX - lastScreenPosRef.current.x;
      const dy = e.screenY - lastScreenPosRef.current.y;
      if (dx === 0 && dy === 0) return;
      lastScreenPosRef.current = { x: e.screenX, y: e.screenY };
      totalMovedRef.current += Math.hypot(dx, dy);
      if (totalMovedRef.current > 4) {
        clearClickTimer();
      }
      void window.kkachi.moveMascotBy(dx, dy);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;

      if (totalMovedRef.current <= 4 && e.button === 0) {
        if (clickTimerRef.current !== null) {
          clearClickTimer();
          openInboxWindow();
        } else {
          clickTimerRef.current = window.setTimeout(() => {
            clickTimerRef.current = null;
            void window.kkachi.openMascotMenu();
          }, DOUBLE_CLICK_DELAY_MS);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const hasNewMail = state.unreadCount > 0 || state.hasNewAlert;
  const badgeText =
    state.unreadCount > 99 ? '99+' : state.unreadCount > 0 ? String(state.unreadCount) : '';

  const tooltip = state.hasNewAlert && state.latestEmailSubject
    ? `새 메일 도착: ${state.latestFromName || ''} - ${state.latestEmailSubject}\n(클릭: 메뉴 / 더블클릭: 이메일함 열기)`
    : state.unreadCount > 0
      ? `까치 (Kkachi) · 안 읽은 메일 ${state.unreadCount}통\n(클릭: 메뉴 / 더블클릭: 이메일함 열기)`
      : '까치 (Kkachi) · 모니터링 중\n(클릭: 메뉴 / 더블클릭: 이메일함 열기)';

  return (
    <div className="mascot-container">
      <button
        type="button"
        className={`mascot-widget ${state.hasNewAlert ? 'has-alert' : ''}`}
        title={tooltip}
        onPointerEnter={() => {
          hoveringRef.current = true;
          wakeUp();
        }}
        onPointerLeave={() => {
          hoveringRef.current = false;
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          wakeUp();
          draggingRef.current = true;
          lastScreenPosRef.current = { x: e.screenX, y: e.screenY };
          totalMovedRef.current = 0;
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          clearClickTimer();
          wakeUp();
          void window.kkachi.openMascotMenu();
        }}
      >
        <div className="mascot-icon-wrap">
          <Kkachi3DMascot
            size={112}
            facing={state.facing}
            holdingLetter={hasNewMail}
            lookX={anim.lookX}
            lookY={anim.lookY}
            mood={anim.mood}
            blinkAmount={anim.blinkAmount}
            wingFlap={anim.wingFlap}
            dozeNod={anim.dozeNod}
            jumpOffsetY={anim.jumpOffsetY}
            dozeTick={anim.dozeTick}
          />
          {state.hasNewAlert && <span className="mascot-pulse-ring" />}
          {badgeText && <span className="mascot-badge">{badgeText}</span>}
          {state.isChecking && <span className="mascot-checking-dot" />}
        </div>
      </button>
    </div>
  );
};
