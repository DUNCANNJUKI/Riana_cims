import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "./table.css";

/** Keeps wide tables within their panel and exposes keyboard scrolling when needed. */
export function TableScrollArea({ children, label = "Data table", mobileLayout = "scroll", className = "" }: {
  children: ReactNode;
  label?: string;
  mobileLayout?: "scroll" | "cards";
  className?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const table = viewport?.querySelector("table");
    if (!viewport || !table) return;
    const measure = () => setOverflowing(viewport.scrollWidth > viewport.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="cims-table-region" data-mobile-layout={mobileLayout}>
      <div
        ref={viewportRef}
        className={["cims-table-scroll", className].filter(Boolean).join(" ")}
        role={overflowing ? "region" : undefined}
        aria-label={overflowing ? `${label}: scrollable columns` : undefined}
        aria-describedby={overflowing ? hintId : undefined}
        tabIndex={overflowing ? 0 : undefined}
      >
        {children}
      </div>
      {overflowing && <p id={hintId} className="cims-table-scroll-hint">Scroll horizontally to view all columns. Swipe or use the arrow keys.</p>}
    </div>
  );
}
