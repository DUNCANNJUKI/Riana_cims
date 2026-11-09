import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { FeedbackForm } from "./pages/FeedbackForm";
import { ResetPassword } from "./pages/ResetPassword";
import InstallApp from "./pages/InstallApp";
import { MaintenancePage } from "@/components/maintenance/MaintenancePage";
import { PublicAssetHistory } from "@/pages/PublicAssetHistory";
import { ClientChangeRequestForm } from "./pages/ClientChangeRequestForm";
import { ClientCompletionReview } from "./pages/ClientCompletionReview";
import { ClientRequestTracking } from "./pages/ClientRequestTracking";

import { GlobalErrorBoundary } from "@/components/common/GlobalErrorBoundary";

const queryClient = new QueryClient();

const App = () => (
  <GlobalErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/asset/:assetId" element={<PublicAssetHistory />} />
          <Route path="/install" element={<InstallApp />} />
          <Route path="/feedback/:clientSlug/:token" element={<FeedbackForm />} />
          <Route path="/feedback/:token" element={<FeedbackForm />} />
          <Route path="/change-request/submit/:token" element={<ClientChangeRequestForm />} />
          <Route path="/client-request/:token" element={<ClientChangeRequestForm />} />
          <Route path="/change-request/review/:token" element={<ClientCompletionReview />} />
          <Route path="/change-request/accept/:token" element={<ClientCompletionReview />} />
          <Route path="/change-request/track/:token" element={<ClientRequestTracking />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/*" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </GlobalErrorBoundary>
);

export default App;
