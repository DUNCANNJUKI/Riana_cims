import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";
import { assetIdFromScan } from "./hardwareApi";

export function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (disposed || !video.current) return;
        const controls = await new BrowserQRCodeReader().decodeFromVideoDevice(
          undefined,
          video.current,
          (result) => {
            if (result && !disposed) {
              onScan(assetIdFromScan(result.getText()));
              setOpen(false);
            }
          },
        );
        stop = () => controls.stop();
        if (disposed) stop();
      })
      .catch(() =>
        setError("Camera unavailable. Enter the serial or asset ID instead."),
      );
    return () => {
      disposed = true;
      stop?.();
    };
  }, [open, onScan]);
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setError("");
          setOpen(!open);
        }}
      >
        <Camera className="mr-2 h-4 w-4" />
        {open ? "Close Camera" : "Scan QR"}
      </Button>
      {open && (
        <div className="relative max-w-md">
          <video
            ref={video}
            className="aspect-video w-full rounded-md bg-black"
            muted
            playsInline
          />
          <Button
            aria-label="Close camera"
            title="Close camera"
            size="icon"
            className="absolute right-2 top-2"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
