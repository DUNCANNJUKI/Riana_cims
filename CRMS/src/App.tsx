import { Toaster } from "@crms/components/ui/toaster";
import { Toaster as Sonner } from "@crms/components/ui/sonner";
import { TooltipProvider } from "@crms/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { NativeDevelopersWorkspace } from "@crms/NativeWorkspace";
import { getCimsToken, getCimsUser } from "@crms/lib/cimsSession";

const queryClient = new QueryClient();

const App = () => {
  const user = getCimsUser();
  const role = user?.role;
  const isAllowed = role === "Admin" || role === "Teamlead" || role === "Developer" || role === "Sales";

  if (!getCimsToken() || !user || !isAllowed) {
    window.location.replace("/");
    return null;
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <main className="min-h-screen bg-background p-4 sm:p-6">
              <NativeDevelopersWorkspace userId={user.id} role={role} />
            </main>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
