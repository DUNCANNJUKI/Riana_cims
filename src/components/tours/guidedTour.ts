import type { Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./guidedTour.css";

export type GuidedStep = {
  title: string;
  description: string;
  items?: string[];
  target: string;
  fallback?: string;
  prepare?: () => void;
};

export const visibleTourTarget = (selector: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
    (element) =>
      element.getClientRects().length &&
      element.getBoundingClientRect().width > 0,
  );
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

export async function startGuidedTour(
  steps: GuidedStep[],
  onEnd: () => void,
): Promise<Driver> {
  const { driver } = await import("driver.js");
  let ended = false;
  let moving = false;
  const go = async (index: number) => {
    if (moving || ended) return;
    if (index < 0 || index >= steps.length) {
      tour.destroy();
      return;
    }
    moving = true;
    const popover = tour.getState().popover;
    if (popover) {
      popover.nextButton.disabled = true;
      popover.previousButton.disabled = true;
    }
    steps[index].prepare?.();
    // Wait for React tab/class updates before Driver attaches its highlight.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    for (
      let attempt = 0;
      attempt < 30 && !visibleTourTarget(steps[index].target) && !ended;
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 30));
    if (!ended) tour.drive(index);
    moving = false;
  };
  const tour = driver({
    animate: false,
    smoothScroll: false,
    disableActiveInteraction: true,
    overlayClickBehavior: "none",
    showProgress: true,
    progressText: "Step {{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Finish Tour",
    closeBtnLabel: "End Tour",
    popoverClass: "cims-guided-tour",
    steps: steps.map((step) => ({
      element: () =>
        visibleTourTarget(step.target) ||
        visibleTourTarget(step.fallback || '[data-tour="inventory-header"]') ||
        visibleTourTarget('[data-tour="inventory-header"], [data-tour="system-header"]') ||
        document.createElement("span"),
      popover: {
        title: step.title,
        description: `<p>${escape(step.description)}</p>${step.items?.length ? `<ul>${step.items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>` : ""}`,
      },
    })),
    onNextClick: (_element, _step, { driver: current }) => {
      void go((current.getActiveIndex() || 0) + 1);
    },
    onPrevClick: (_element, _step, { driver: current }) => {
      void go((current.getActiveIndex() || 0) - 1);
    },
    onPopoverRender: (popover) => {
      popover.wrapper.setAttribute("role", "dialog");
      popover.title.setAttribute("role", "heading");
      popover.title.setAttribute("aria-level", "2");
      popover.wrapper.setAttribute(
        "aria-label",
        popover.title.textContent || "Guided tour",
      );
    },
    onDestroyed: () => {
      ended = true;
      onEnd();
    },
  });
  await go(0);
  return tour;
}
