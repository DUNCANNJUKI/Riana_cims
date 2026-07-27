import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MaintenanceNetwork } from "@/components/maintenance/MaintenanceNetwork";
import { useMaintenanceStatus, type MaintenanceState } from "@/hooks/useMaintenanceStatus";

const formatDateTime = (value?: string | null) => {
  if (!value) return "To be confirmed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "To be confirmed";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const RianaLogoLockup = () => (
  <div className="flex items-center justify-center gap-3" aria-label="RIANA Group">
    <img src="/Riana_mark_transparent.png" alt="" className="h-16 w-auto object-contain drop-shadow-sm" aria-hidden="true" />
    <div className="text-left leading-none text-[#1b99a7]">
      <div className="text-[25px] font-extrabold tracking-[0.24em]">RIANA</div>
      <div className="mt-2 text-[11px] font-bold tracking-[0.68em] text-[#49aeb9]">GROUP</div>
    </div>
  </div>
);

interface MaintenancePageProps {
  status?: MaintenanceState | null;
}

export const MaintenancePage = ({ status }: MaintenancePageProps) => {
  const navigate = useNavigate();
  const { maintenance, isLoading, refresh } = useMaintenanceStatus({ pollMs: 60_000, enabled: !status });
  const current = status || maintenance;

  useEffect(() => {
    if (!isLoading && current && !current.enabled) navigate("/", { replace: true });
  }, [current, isLoading, navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef8fb] p-4">
      <MaintenanceNetwork />
      <Card className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-xl border border-[#dcebf0] bg-white/95 shadow-[0_24px_70px_-34px_rgba(8,84,96,0.42)] backdrop-blur">
        <MaintenanceNetwork />
        <CardContent className="relative z-10 px-7 py-10 text-center sm:px-10">
          <RianaLogoLockup />
          <div className="mt-8">
            <h1 className="text-2xl font-extrabold text-[#111827]">RIANA CIMS</h1>
            <p className="mt-3 text-lg font-bold text-[#167d8d]">Scheduled Maintenance</p>
          </div>

          <p className="mx-auto mt-6 max-w-md text-sm leading-6 text-[#667588]">
            {current?.message || "RIANA CIMS is temporarily unavailable while scheduled maintenance is in progress."}
          </p>

          <div className="mt-7 grid gap-3 text-left">
            <div className="flex items-start gap-3 rounded-md border border-[#d9e9ef] bg-[#eef6ff]/80 p-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#178b9b]" />
              <div>
                <p className="text-sm font-bold text-[#1f2937]">{current?.reason || "Maintenance in progress"}</p>
                <p className="mt-1 text-xs leading-5 text-[#6f7b8a]">Super Administrators can sign in while maintenance is active.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-md border border-[#d9e9ef] bg-white/80 p-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#178b9b]" />
              <div>
                <p className="text-sm font-bold text-[#1f2937]">Estimated completion</p>
                <p className="mt-1 text-xs leading-5 text-[#6f7b8a]">{formatDateTime(current?.estimated_completion)}</p>
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button className="h-11 flex-1 rounded-md bg-gradient-to-r from-[#0f8595] to-[#24c7d2] font-bold text-white" onClick={() => void refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" className="h-11 flex-1 rounded-md border-[#cfe2ea] text-[#167d8d]" onClick={() => navigate("/")}>
              Super Admin Sign In
            </Button>
          </div>

          <div className="mt-8 space-y-2 text-center">
            <div className="h-px bg-[#dbe5ec]" />
            <p className="text-xs font-medium text-[#7c8794]">{"\u00a9"} {new Date().getFullYear()} RIANA Group. All rights reserved.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
