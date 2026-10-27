import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import type { Driver } from "driver.js";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { can, type Capability } from "@/security/accessControl";
import type { User } from "@/types";

type TourStep = {
  title: string;
  tab: string;
  permission?: Capability;
  description: string;
  items: string[];
};

const steps: TourStep[] = [
  {
    title: "Hardware & Inventory Tour",
    tab: "registry",
    description:
      "Follow a device from registration to installation and its continuing history.",
    items: [
      "This walkthrough is read-only: it does not issue serials, allocate stock or modify records.",
      "Your permissions and subsidiary determine the records and actions available.",
      "Use Back and Next to explore. Closing the tour restores your previous tab.",
    ],
  },
  {
    title: "Understand the Stock Overview",
    tab: "registry",
    description:
      "Generated serials and physically available equipment are different.",
    items: [
      "Generated means a serial is issued but the physical device is not yet verified.",
      "Available counts only verified, approved and reconciled equipment eligible for allocation.",
      "Click a stock metric to filter the registry. All Stock Metrics reveals the other lifecycle states.",
    ],
  },
  {
    title: "Review Official Models",
    tab: "models",
    description: "Every issued serial belongs to an approved hardware model.",
    items: [
      "A model such as Wave-26-C1 identifies the hardware design and model introduction year.",
      "Model administrators approve proposals and record reasons. Submitting a proposal does not approve it.",
      "Retired models remain for historical backfill; software or cosmetic amendments do not create a new model.",
    ],
  },
  {
    title: "Approve the Serialization Policy",
    tab: "policy",
    permission: "inventory.policy",
    description:
      "Organizational approval is required before official issuance.",
    items: [
      "Review per-model sequencing and the field-registration approval rule.",
      "Record a real organizational approval reference before enabling serial issuance.",
      "Superadmin has all defined permissions, but unique identities, physical checks and lifecycle rules still apply.",
    ],
  },
  {
    title: "Generate Serials",
    tab: "registry",
    permission: "inventory.generate_serial",
    description:
      "Issue one serial or an authorized batch using an approved current model.",
    items: [
      "Choose the model, owning subsidiary, manufacturing year, quantity and optional stock location.",
      "Serial year follows the model introduction year. The backend allocates the next unused sequence; never type or invent an official serial.",
      "Issued records start as Generated, not Available. Generated records are selected for label printing.",
    ],
  },
  {
    title: "Receive and Verify Physical Stock",
    tab: "registry",
    permission: "inventory.receive",
    description:
      "Open the serial and choose Receive & Verify after inspecting the device.",
    items: [
      "Record the manufacturer identity, actual physical condition and stock location, then confirm the physical device and serial.",
      "Not Assessed is a missing condition; approval, physical verification and reconciliation are separate fields.",
      "Historical devices with missing identities need reconciliation. Do not create a new serial to conceal an unknown historical identity.",
    ],
  },
  {
    title: "Allocate Equipment",
    tab: "registry",
    permission: "inventory.assign",
    description: "Open available equipment and choose Assign or Reserve.",
    items: [
      "Select the client, its branch installation and the receiving technician. Client selection narrows installation choices.",
      "Alternatively allocate custody to a technician first. They can link their allocated stock to their authorized installation later.",
      "Reservations require an installation and expire after the chosen period. Conflicting active allocations and normal allocation to completed installations are blocked.",
    ],
  },
  {
    title: "Confirm Installation",
    tab: "registry",
    permission: "inventory.install",
    description:
      "Hardware selection continues inside the existing installation workflow.",
    items: [
      "Select or scan eligible equipment in Equipment / Hardware Details and confirm physical identity.",
      "Authorized field registration generates a new serial for a verified device; configured approval may be required before installation completion.",
      "Confirm Installed before completing the installation. Multiple devices are supported; completed handover hardware snapshots are preserved.",
    ],
  },
  {
    title: "Scan for Device History",
    tab: "registry",
    description:
      "A permanent QR identifies the asset throughout its lifecycle.",
    items: [
      "Scan QR in the registry or open the printed QR link on a phone. Sign in when prompted.",
      "The authorized profile opens with its lifecycle timeline, then current details, assignments and supporting documents.",
      "History shows actions, recorded operators and EAT dates/times according to your permissions. Scanning never bypasses login or subsidiary access.",
    ],
  },
  {
    title: "Search and Report",
    tab: "reports",
    permission: "inventory.view_reports",
    description:
      "Use real inventory data to review current stock and recorded movements.",
    items: [
      "Search by serial, model, manufacturer serial or asset ID. Advanced Filters adds client, branch, model, location, technician and date filters.",
      "Choose a Hardware Report. Movement reports show who performed each action, when it happened and its recorded details.",
      "Export CSV, Excel or PDF if permitted. Reports retain scope and filters; avoid concurrent inventory changes when preparing reconciled paginated exports.",
    ],
  },
  {
    title: "Reconcile Physical Stock",
    tab: "registry",
    permission: "inventory.reconcile",
    description:
      "Stocktake compares physical observations with recorded equipment.",
    items: [
      "Select the subsidiary and inventory location, then scan or enter observed asset IDs or serials.",
      "Review matched, missing and unexpected observations before resolving discrepancies.",
      "Missing equipment is not eligible available stock. Preserve evidence and use authorized reconciliation rather than deleting history.",
    ],
  },
  {
    title: "Follow the Asset Lifecycle",
    tab: "alerts",
    description: "Keep faults, service, transfers and replacements traceable.",
    items: [
      "Open an asset to see state-appropriate actions allowed by your permissions; record the required reasons and approval references.",
      "Stock Alerts shows configured low stock, aging, warranty and reconciliation warnings. It does not yet send scheduled email or SMS alerts.",
      "Replace installed/faulty equipment before sending the removed unit to maintenance. Retired/disposed devices are not deployable, and registered history is retained.",
    ],
  },
  {
    title: "Inventory Locations",
    tab: "locations",
    description:
      "Stock locations are managed here, separately from client branches.",
    items: [
      "Create and review subsidiary-aware warehouse and stock locations using your permitted actions.",
    ],
  },
  {
    title: "Advanced Registry Filters",
    tab: "registry",
    description:
      "Expand this control to find family, model, location, client, branch, technician and date filters.",
    items: [
      "Closing the filter panel preserves your selections. Clear All resets the search and filters.",
    ],
  },
  {
    title: "Export Inventory",
    tab: "registry",
    permission: "inventory.export",
    description:
      "This menu contains CSV, Excel and PDF exports for the current authorized scope and filters.",
    items: [
      "Exports do not grant access to another subsidiary. Avoid concurrent updates when preparing reconciled paginated exports.",
    ],
  },
  {
    title: "Print Device Labels",
    tab: "registry",
    permission: "inventory.print_qr",
    description:
      "Select eligible asset rows to enable Labels, or open a device and choose QR Label.",
    items: [
      "Preview A4 or thermal labels before printing. The tour does not select records or print anything.",
    ],
  },
  {
    title: "Import Historical Stock",
    tab: "registry",
    permission: "inventory.import",
    description: "Open Import here for CSV/Excel Legacy or Draft records.",
    items: [
      "Preview and correct row errors and duplicate identities; obtain the required approval before committing. New serial issuance uses Generate Serials.",
    ],
  },
  {
    title: "Create an Unissued Draft",
    tab: "registry",
    permission: "inventory.register",
    description:
      "Create Draft starts a record without issuing a Marezi serial.",
    items: [
      "Do not confuse a draft with verified available equipment or an unknown historical serial.",
    ],
  },
];

export function HardwareTour({
  user,
  tab,
  onTabChange,
}: {
  user: User;
  tab: string;
  onTabChange: (tab: string) => void;
}) {
  const instance = useRef<Driver>();
  const mounted = useRef(true);
  const [starting, setStarting] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      instance.current?.destroy();
    };
  }, []);
  const targets: Record<string, string> = {
    "Hardware & Inventory Tour": '[data-tour="inventory-header"]',
    "Understand the Stock Overview": '[data-tour="inventory-overview"]',
    "Review Official Models": '[data-tour="inventory-models"]',
    "Approve the Serialization Policy": '[data-tour="inventory-policy"]',
    "Generate Serials": '[data-tour="inventory-generate"]',
    "Receive and Verify Physical Stock":
      '[data-tour="inventory-record-actions"]',
    "Allocate Equipment": '[data-tour="inventory-record-actions"]',
    "Confirm Installation": '[data-tour-nav="installations"]',
    "Scan for Device History": '[data-tour="inventory-scan"]',
    "Search and Report": '[data-tour="inventory-report"]',
    "Reconcile Physical Stock": '[data-tour="inventory-stocktake"]',
    "Follow the Asset Lifecycle": '[data-tour="inventory-alerts"]',
    "Inventory Locations": '[data-tour="inventory-locations"]',
    "Advanced Registry Filters": '[data-tour="inventory-filters"]',
    "Export Inventory": '[data-tour="inventory-export"]',
    "Print Device Labels": '[data-tour="inventory-labels"]',
    "Import Historical Stock": '[data-tour="inventory-import"]',
    "Create an Unissued Draft": '[data-tour="inventory-draft"]',
  };
  const start = async () => {
    setStarting(true);
    const original = tab;
    try {
      const { startGuidedTour } = await import("@/components/tours/guidedTour");
      if (!mounted.current) return;
      instance.current = await startGuidedTour(
        steps
          .filter((step) => !step.permission || can(user, step.permission))
          .map((step) => ({
            ...step,
            target: targets[step.title],
            fallback:
              step.title === "Confirm Installation"
                ? '[data-tour="system-mobile-menu"]'
                : '[data-tour="inventory-search"]',
            prepare: () => onTabChange(step.tab),
          })),
        () => {
          if (mounted.current) onTabChange(original);
        },
      );
      if (!mounted.current) instance.current.destroy();
    } catch {
      toast({
        title: "Unable to start tour",
        description: "Reload the page and try again.",
        variant: "destructive",
      });
    } finally {
      if (mounted.current) setStarting(false);
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={starting}
      onClick={() => void start()}
    >
      <HelpCircle className="mr-2 h-4 w-4" />
      Module Tour
    </Button>
  );
}
