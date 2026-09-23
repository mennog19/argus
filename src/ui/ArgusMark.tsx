import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BLINK_DURATION_MS,
  DOUBLE_BLINK_CHANCE,
  DOUBLE_BLINK_GAP_MS,
  nextBlinkDelay,
} from "./argus-blink";
import { gazeOffset, type GazeOffset } from "./argus-gaze";

interface ArgusMarkProps {
  /** `watching` idles with a slow drift; `focusing` narrows the pupil and spins up while unlocking. */
  state?: "watching" | "focusing";
  /** Source of randomness for blink timing; injectable for tests. */
  random?: () => number;
}

const TICKS = Array.from({ length: 36 }, (_, index) => index * 10);

/** The app's eye mark — Argus, the watchman who never (quite) slept. */
export function ArgusMark({ state = "watching", random = Math.random }: ArgusMarkProps) {
  const [blinking, setBlinking] = useState(false);
  const [gaze, setGaze] = useState<GazeOffset>({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const blink = (after: () => void) => {
      setBlinking(true);
      timer = setTimeout(() => {
        setBlinking(false);
        after();
      }, BLINK_DURATION_MS);
    };
    const waitForNextBlink = () => {
      timer = setTimeout(() => {
        if (random() < DOUBLE_BLINK_CHANCE) {
          blink(() => {
            timer = setTimeout(() => blink(waitForNextBlink), DOUBLE_BLINK_GAP_MS);
          });
        } else {
          blink(waitForNextBlink);
        }
      }, nextBlinkDelay(random()));
    };
    waitForNextBlink();
    return () => clearTimeout(timer);
  }, [random]);

  // The eye follows the pointer anywhere on screen, not just over the mark.
  useEffect(() => {
    const root = rootRef.current!;
    const follow = (event: PointerEvent) => {
      const box = root.getBoundingClientRect();
      setGaze(
        gazeOffset(
          event.clientX - (box.left + box.width / 2),
          event.clientY - (box.top + box.height / 2),
        ),
      );
    };
    window.addEventListener("pointermove", follow);
    return () => window.removeEventListener("pointermove", follow);
  }, []);

  return (
    <div
      ref={rootRef}
      className="argus-mark"
      data-state={state}
      data-blinking={blinking ? "true" : undefined}
      aria-hidden="true"
      style={
        {
          "--argus-gaze-x": `${gaze.x}px`,
          "--argus-gaze-y": `${gaze.y}px`,
        } as CSSProperties
      }
    >
      <svg viewBox="0 0 96 96">
        <defs>
          <radialGradient id="argus-iris" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-accent-hover)" />
            <stop offset="70%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.35" />
          </radialGradient>
        </defs>
        <g className="argus-mark-ticks">
          {TICKS.map((angle) => (
            <line
              key={angle}
              x1="48"
              y1="4"
              x2="48"
              y2={angle % 30 === 0 ? 10 : 7.5}
              transform={`rotate(${angle} 48 48)`}
            />
          ))}
        </g>
        <g className="argus-mark-ring">
          <circle cx="48" cy="48" r="30" strokeDasharray="36 11.12" />
        </g>
        <g className="argus-mark-eye">
          <circle className="argus-mark-iris" cx="48" cy="48" r="20" fill="url(#argus-iris)" />
          <circle className="argus-mark-pupil" cx="48" cy="48" r="8" />
          <circle className="argus-mark-glint" cx="54" cy="41" r="2.4" />
        </g>
      </svg>
    </div>
  );
}
