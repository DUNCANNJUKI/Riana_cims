import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="mb-2 text-4xl font-bold text-primary">404</h1>
        <p className="mb-6 text-base text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
