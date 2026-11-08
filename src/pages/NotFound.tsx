import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-riana">
        <h1 className="text-4xl font-bold text-primary mb-2">404</h1>
        <p className="text-base text-muted-foreground mb-6">Oops! Page not found</p>
        <a href="/" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
