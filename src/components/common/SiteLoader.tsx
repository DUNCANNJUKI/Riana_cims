import { useState, useEffect } from "react";

interface SiteLoaderProps {
  isLoading: boolean;
  minDuration?: number;
}

const LOADER_LETTERS = "RIANA CIMS".split("");

export const SiteLoader = ({ isLoading, minDuration = 800 }: SiteLoaderProps) => {
  const [showLoader, setShowLoader] = useState(isLoading);

  useEffect(() => {
    if (isLoading) {
      setShowLoader(true);
    } else {
      const timer = setTimeout(() => setShowLoader(false), minDuration);
      return () => clearTimeout(timer);
    }
  }, [isLoading, minDuration]);

  if (!showLoader) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#086f76]">
      <div className="flex flex-col items-center space-y-6 animate-fade-in">
        <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl bg-[#086f76] shadow-2xl ring-1 ring-white/20">
          <img
            src="/pwa-icon.svg"
            alt="RIANA CIMS"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 rounded-2xl ring-4 ring-white/10 animate-ping" />
        </div>

        <div className="flex h-10 items-end justify-center gap-1 text-2xl font-extrabold text-white sm:text-3xl" aria-label="RIANA CIMS loading">
          {LOADER_LETTERS.map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              className={letter === " " ? "w-3" : "inline-block animate-bounce"}
              style={letter === " " ? undefined : { animationDelay: `${index * 80}ms`, animationDuration: "900ms" }}
              aria-hidden="true"
            >
              {letter === " " ? "\u00A0" : letter}
            </span>
          ))}
        </div>

        <div className="h-1 w-52 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white animate-[progress_1.5s_ease-in-out_infinite]" />
        </div>

        <p className="text-xs font-medium text-white/75">Loading system resources...</p>
      </div>
    </div>
  );
};
