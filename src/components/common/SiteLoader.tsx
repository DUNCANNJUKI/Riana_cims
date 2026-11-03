import { useEffect, useRef, useState, type CSSProperties } from "react";

import "./SiteLoader.css";

interface SiteLoaderProps {
  isLoading: boolean;
  minDuration?: number;
}

const LOADER_LETTERS = "RIANA CIMS".split("");
const NETWORK_NODES = [
  { cx: 20, cy: 74, delay: 0 }, { cx: 76, cy: 52, delay: 1 },
  { cx: 116, cy: 78, delay: 2 }, { cx: 180, cy: 45, delay: 3 },
  { cx: 224, cy: 66, delay: 4 }, { cx: 270, cy: 88, delay: 5 },
  { cx: 330, cy: 60, delay: 6 }, { cx: 260, cy: 126, delay: 7 },
  { cx: 310, cy: 108, delay: 8 }, { cx: 18, cy: 128, delay: 9 },
  { cx: 72, cy: 108, delay: 10 },
];

type AnimationStyle = CSSProperties & { "--animation-order": number };

export const SiteLoader = ({ isLoading, minDuration = 0 }: SiteLoaderProps) => {
  const [showLoader, setShowLoader] = useState(isLoading);
  const visibleSince = useRef(isLoading ? Date.now() : 0);

  useEffect(() => {
    if (isLoading) {
      visibleSince.current = Date.now();
      setShowLoader(true);
      return;
    }

    const remainingDuration = Math.max(0, minDuration - (Date.now() - visibleSince.current));
    if (remainingDuration === 0) {
      setShowLoader(false);
      return;
    }

    const timer = window.setTimeout(() => setShowLoader(false), remainingDuration);
    return () => window.clearTimeout(timer);
  }, [isLoading, minDuration]);

  if (!showLoader) return null;

  return (
    <div className="riana-loader" role="status" aria-live="polite" aria-busy="true">
      <div className="riana-loader__content">
        <div className="riana-loader__network" aria-hidden="true">
          <svg viewBox="0 0 350 150" focusable="false">
            <g className="riana-loader__links">
              <path d="M20 74 L76 52 L116 78" />
              <path d="M116 78 L180 45 L224 66 L270 88 L330 60" />
              <path d="M18 128 L72 108" />
              <path d="M260 126 L310 108 L344 134" />
            </g>
            <circle className="riana-loader__orbit" cx="180" cy="88" r="56" />
            {NETWORK_NODES.map(({ cx, cy, delay }) => (
              <circle key={`${cx}-${cy}`} className="riana-loader__node" cx={cx} cy={cy}
                r={delay % 3 === 0 ? 4 : 2.75}
                style={{ "--animation-order": delay } as AnimationStyle} />
            ))}
          </svg>
          <span className="riana-loader__logo" aria-hidden="true">
            <img src="/Riana_logo_transparent.png" alt="" />
          </span>
        </div>

        <div className="riana-loader__title" aria-label="RIANA CIMS">
          {LOADER_LETTERS.map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              aria-hidden="true"
              className={letter === " " ? "riana-loader__letter riana-loader__letter--space" : "riana-loader__letter"}
              style={{ "--animation-order": index } as AnimationStyle}
            >
              {letter === " " ? "\u00A0" : letter}
            </span>
          ))}
        </div>

        <p className="riana-loader__message">Establishing secure workspace...</p>
        <div className="riana-loader__progress" aria-label="Loading application">
          <span className="riana-loader__progress-value" />
        </div>
        <p className="riana-loader__hint">Please wait a moment</p>
      </div>
    </div>
  );
};
