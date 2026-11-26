import { SiteLoaderArtwork } from "./SiteLoaderArtwork";

export function SiteLoader({ isLoading, status }: { isLoading: boolean; status?: string }) {
  return isLoading ? <SiteLoaderArtwork status={status} /> : null;
}
