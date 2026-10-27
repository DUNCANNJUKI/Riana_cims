import {
  startGuidedTour,
  visibleTourTarget,
  type GuidedStep,
} from "./guidedTour";

const moduleDescriptions: Record<string, string> = {
  dashboard: "Review the operational overview and summary metrics.",
  "technician-dashboard": "Open your field-work overview and assigned jobs.",
  "technician-profile":
    "Review your technician profile and accountability records.",
  clients: "Manage authorized client records and branch information.",
  assignments: "Allocate installation work to authorized technicians.",
  calendar: "Review scheduled work and technician workload.",
  installations:
    "Record installation details, equipment and handovers in the existing workflow.",
  inventory:
    "Manage hardware serials, physical verification, stock allocation, QR history and lifecycle reports. Use Module Tour inside this workspace for control-by-control guidance.",
  progress: "Track installation progress and operational updates.",
  users:
    "Administer accounts, subsidiary membership and authorized permission grants.",
  finances: "Review permitted financial operations and records.",
  "announcements-management":
    "Manage organizational announcements where authorized.",
  company: "Manage company branding and system settings where authorized.",
  import: "Import supported business data using existing validation controls.",
  reports: "Open the system reporting workspace and permitted exports.",
  analytics: "Review authorized business analytics.",
  "audit-logs": "Review administrative audit history and recorded actions.",
  "my-activity": "Review your recorded activity.",
  developers:
    "Open the permitted Developers workspace and its request, approval and assignment navigation.",
  optimus:
    "This navigation item opens the external RIANA OPTIMUS system; the tour does not follow the external link.",
  help: "Find system help and support resources.",
};

export async function startSystemTour(
  onPreviewNavigation: (active: boolean) => void,
) {
  onPreviewNavigation(true);
  // Allow the mobile drawer to mount before inspecting authorized navigation.
  await new Promise((resolve) => setTimeout(resolve, 120));
  const steps: GuidedStep[] = [
    {
      title: "RIANA CIMS System Tour",
      target: '[data-tour="system-header"]',
      description:
        "This tour points to the real features available to your signed-in account. Navigation is role-aware and subsidiary access remains enforced. No records, settings or external links are changed.",
    },
  ];
  const keys = new Set(
    Array.from(document.querySelectorAll<HTMLElement>("[data-tour-nav]"))
      .filter((item) => item.getClientRects().length)
      .map((item) => item.dataset.tourNav!),
  );
  for (const key of keys) {
    const target = `[data-tour-nav="${key}"]`;
    const element = visibleTourTarget(target);
    if (!element) continue;
    steps.push({
      title: element.textContent?.trim() || "Workspace",
      target,
      description:
        moduleDescriptions[key] ||
        "Open this authorized workspace from the navigation menu.",
    });
  }
  for (const [name, description] of [
    [
      "system-notifications",
      "Review notifications from this shared header control. Availability follows your account and permissions.",
    ],
    [
      "system-messages",
      "Open messages and calls from this shared header control.",
    ],
    [
      "system-theme",
      "Change light/dark appearance here without changing business data.",
    ],
    [
      "system-profile",
      "Open your profile menu for account settings, this System Tour and sign-out.",
    ],
  ])
    if (visibleTourTarget(`[data-tour="${name}"]`))
      steps.push({
        title:
          name === "system-notifications"
            ? "Notifications"
            : name === "system-messages"
              ? "Messages"
              : name === "system-theme"
                ? "Appearance"
                : "Your Profile",
        target: `[data-tour="${name}"]`,
        description,
      });
  try {
    return await startGuidedTour(steps, () => onPreviewNavigation(false));
  } catch (error) {
    onPreviewNavigation(false);
    throw error;
  }
}
