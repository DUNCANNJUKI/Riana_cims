import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function errorMessage(error: unknown, fallback = 'The operation failed. Please try again.'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
