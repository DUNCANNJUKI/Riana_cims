import { useEffect, useRef } from "react";
import "./AuthNetworkBackground.css";

type Point = readonly [x: number, y: number, radius: number];
type Connection = readonly [from: number, to: number];

const desktopNodes: readonly Point[] = [
  [2, 23, 2], [8, 13, 2.6], [16, 17, 1.8], [23, 9, 2.2], [28, 20, 1.9],
  [11, 30, 2.3], [21, 34, 1.7], [4, 43, 1.6], [24, 49, 2],
  [72, 15, 2], [81, 8, 2.2], [85, 24, 2.7], [94, 14, 1.8], [98, 32, 2],
  [76, 34, 1.5], [91, 41, 2.1],
  [1, 76, 1.8], [8, 65, 2], [13, 80, 2.6], [18, 68, 1.7], [25, 81, 2.1],
  [8, 94, 2], [20, 94, 1.5], [31, 91, 1.9],
  [72, 74, 1.8], [81, 63, 1.9], [91, 65, 2.5], [99, 57, 1.6], [97, 79, 1.9],
  [87, 85, 2.5], [75, 90, 2.1], [94, 96, 1.6],
];

const desktopConnections: readonly Connection[] = [
  [0, 1], [0, 5], [1, 2], [2, 3], [2, 5], [2, 6], [3, 4], [4, 6], [5, 7], [5, 6], [6, 8],
  [9, 10], [9, 11], [10, 12], [11, 12], [11, 14], [11, 15], [12, 13], [13, 15], [14, 15],
  [16, 17], [16, 18], [17, 18], [17, 19], [18, 20], [18, 21], [18, 22], [19, 20], [20, 22], [20, 23],
  [24, 25], [24, 29], [24, 30], [25, 26], [26, 27], [26, 28], [26, 29], [28, 29], [29, 30], [29, 31],
];

const mobileNodes: readonly Point[] = [
  [1, 14, 1.6], [13, 7, 2.2], [25, 12, 1.5], [9, 20, 1.8],
  [76, 12, 1.5], [88, 6, 2.1], [97, 16, 1.8],
  [2, 84, 1.6], [12, 92, 2.1], [25, 88, 1.6], [34, 98, 1.8],
  [78, 85, 1.6], [90, 91, 2.2], [99, 81, 1.5], [95, 98, 1.7],
];

const mobileConnections: readonly Connection[] = [
  [0, 1], [0, 3], [1, 2], [2, 3], [4, 5], [5, 6], [4, 6],
  [7, 8], [8, 9], [9, 10], [11, 12], [12, 13], [12, 14],
];

function NetworkGraph({ mobile = false }: { mobile?: boolean }) {
  const nodes = mobile ? mobileNodes : desktopNodes;
  const connections = mobile ? mobileConnections : desktopConnections;
  const signals: readonly Connection[] = mobile ? [[1, 2], [12, 11]] : [[2, 6], [12, 11], [18, 20], [29, 26]];

  const line = ([from, to]: Connection) => ({
    x1: `${nodes[from][0]}%`, y1: `${nodes[from][1]}%`,
    x2: `${nodes[to][0]}%`, y2: `${nodes[to][1]}%`,
  });

  return (
    <svg className={`auth-network__graph auth-network__graph--${mobile ? "mobile" : "desktop"}`} width="100%" height="100%" focusable="false" aria-hidden="true">
      <g className="auth-network__links">
        {connections.map(edge => <line key={edge.join("-")} {...line(edge)} />)}
      </g>
      <g className="auth-network__signals">
        {signals.map((edge, index) => (
          <line key={edge.join("-")} {...line(edge)} pathLength={100}
            style={{ animationDuration: `${29 + index * 4}s`, animationDelay: `${-(index * 13 + 11)}s` }} />
        ))}
      </g>
      <g className="auth-network__nodes">
        {nodes.map(([x, y, radius]) => (
          <circle key={`${x}-${y}`} cx={`${x}%`} cy={`${y}%`} r={radius}
            style={{ animationDuration: `${10 + (x * 7 + y * 3) % 11}s`, animationDelay: `${-((x * 3 + y * 7) % 29)}s` }} />
        ))}
      </g>
    </svg>
  );
}

export function AuthNetworkBackground() {
  const backdrop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncVisibility = () => backdrop.current?.toggleAttribute("data-paused", document.hidden);
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  return (
    <div className="auth-network" ref={backdrop} aria-hidden="true">
      <NetworkGraph />
      <NetworkGraph mobile />
    </div>
  );
}
