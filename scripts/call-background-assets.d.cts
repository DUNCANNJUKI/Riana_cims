export function prepareCallBackgroundAssets(root: string): {
  revision: string;
  assetPath: string;
  files: Array<{ name: string; size: number; sha256: string }>;
};
