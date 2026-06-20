import { useState, useEffect } from "react";

interface SiteLoaderProps {
  isLoading: boolean;
  minDuration?: number;
}

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="flex flex-col items-center space-y-6 animate-fade-in">
        {/* Company Logo */}
        <div className="relative">
          <img 
            src="/rianacims-uploads/5fe53914-47f9-4dab-ac6a-15b2a4002f36.png" 
            alt="RIANA Group" 
            className="h-20 w-auto animate-pulse"
          />
          {/* Glow effect */}
          <div className="absolute inset-0 blur-xl opacity-30 bg-primary rounded-full"></div>
        </div>
        
        {/* Company Name */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-wider">RIANA CIMS</h1>
          <p className="text-sm text-slate-400 mt-1">Client Installation Management System</p>
        </div>
        
        {/* Loading Animation */}
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-48 h-1 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full animate-[progress_1.5s_ease-in-out_infinite]"></div>
        </div>
        
        <p className="text-xs text-slate-500">Loading system resources...</p>
      </div>
    </div>
  );
};
