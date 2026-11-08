import type { ImageSegmenter, ImageSegmenterResult, MPMask } from "@mediapipe/tasks-vision";

export const CALL_VIDEO_BACKGROUND_OPTIONS = [
  { value: "riana-office", label: "RIANA Office - Branded Vector", fileName: "riana-office.svg" },
  { value: "riana-innovation-workspace", label: "RIANA Innovation Workspace", fileName: "riana-innovation-workspace.jpg" },
  { value: "riana-welcome-lobby", label: "RIANA Welcome Lobby", fileName: "riana-welcome-lobby.jpg" },
  { value: "sunlit-shelf-nook", label: "Sunlit Shelf Nook", fileName: "sunlit-shelf-nook.avif" },
  { value: "bright-open-plan", label: "Bright Open Plan", fileName: "bright-open-plan.webp" },
  { value: "walnut-executive-suite", label: "Walnut Executive Suite", fileName: "walnut-executive-suite.jpg" },
  { value: "attic-focus-room", label: "Attic Focus Room", fileName: "attic-focus-room.webp" },
  { value: "glass-garden-office", label: "Glass Garden Office", fileName: "glass-garden-office.png" },
  { value: "serene-private-office", label: "Serene Private Office", fileName: "serene-private-office.jpg" },
] as const;

export type CallVideoBackgroundPreset = typeof CALL_VIDEO_BACKGROUND_OPTIONS[number]["value"];
export type CallVideoBackground = CallVideoBackgroundPreset | "blur" | `data:image/${string}` | `blob:${string}` | `http://${string}` | `https://${string}`;

type BackgroundPipeline = { track: MediaStreamTrack; stop: () => void };

const drawCover = (
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
) => {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sx = (sourceWidth - cropWidth) / 2;
  const sy = (sourceHeight - cropHeight) / 2;
  context.drawImage(source, sx, sy, cropWidth, cropHeight, 0, 0, width, height);
};

const drawExactMirrored = (
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
) => {
  context.save();
  context.translate(width, 0);
  context.scale(-1, 1);
  context.drawImage(source, 0, 0, width, height);
  context.restore();
};

const waitForVideo = async (video: HTMLVideoElement) => {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("Unable to initialize camera video for background effects.")); };
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
};

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("The selected call background could not be loaded."));
  image.src = url;
});

const extractFloatMask = (mask: MPMask | undefined, expectedLength: number): Float32Array | null => {
  if (!mask) return null;
  try {
    const floats = mask.getAsFloat32Array();
    if (floats && floats.length === expectedLength) return floats;
  } catch {
    // Fall back to uint8 conversion if float extraction is unsupported on the active backend.
  }
  try {
    const bytes = mask.getAsUint8Array();
    if (bytes && bytes.length === expectedLength) {
      const converted = new Float32Array(expectedLength);
      for (let i = 0; i < expectedLength; i += 1) {
        converted[i] = bytes[i] / 255;
      }
      return converted;
    }
  } catch {
    // Ignore and return null.
  }
  return null;
};

const extractCategoryMask = (mask: MPMask | undefined, expectedLength: number): Uint8Array | null => {
  if (!mask) return null;
  try {
    const bytes = mask.getAsUint8Array();
    if (bytes && bytes.length === expectedLength) return bytes;
  } catch {
    // Ignore and return null.
  }
  return null;
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Builds dual person segmentation masks (`fullMaskCanvas` and `coreMaskCanvas`) with natural contours:
 *
 * 1. Verifies foreground/background polarity against `categoryMask` so the participant is always
 *    in the foreground and the virtual background is always rendered behind them.
 * 2. Applies a 5-tap cross closing + 3x3 Gaussian smoothing pass so forehead highlights and hair
 *    remain solid opaque without bloating or distorting body edges.
 * 3. Outputs:
 *    - `fullMaskCanvas`: accurate participant silhouette (`0.42..0.58` ramp).
 *    - `coreMaskCanvas`: strict interior participant core (`0.56..0.72` ramp) free of room-wall bleed.
 */
const buildDualPersonMasks = (
  result: ImageSegmenterResult,
  fullMaskCanvas: HTMLCanvasElement,
  fullMaskContext: CanvasRenderingContext2D,
  coreMaskCanvas: HTMLCanvasElement,
  coreMaskContext: CanvasRenderingContext2D,
  prevAlphaBufferRef: { current: Float32Array | null },
) => {
  const hasSecondChannel = Boolean(result.confidenceMasks?.[1]);
  const primaryConfMask = result.confidenceMasks?.[1] || result.confidenceMasks?.[0];
  const catMask = result.categoryMask;
  const referenceMask = primaryConfMask || catMask;
  if (!referenceMask) return false;

  const maskWidth = referenceMask.width;
  const maskHeight = referenceMask.height;
  const pixels = maskWidth * maskHeight;
  if (pixels <= 0) return false;

  const confidence = extractFloatMask(primaryConfMask, pixels);
  const category = extractCategoryMask(catMask, pixels);

  let invertConfidence = false;
  if (confidence && category) {
    let fgSum = 0;
    let fgCount = 0;
    let bgSum = 0;
    let bgCount = 0;
    const step = Math.max(1, Math.floor(pixels / 512));
    for (let i = 0; i < pixels; i += step) {
      const isPersonCat = hasSecondChannel ? category[i] === 1 : category[i] === 0;
      if (isPersonCat) {
        fgSum += confidence[i];
        fgCount += 1;
      } else {
        bgSum += confidence[i];
        bgCount += 1;
      }
    }
    if (fgCount > 0 && bgCount > 0 && (fgSum / fgCount) < (bgSum / bgCount)) {
      invertConfidence = true;
    }
  }

  const rawProb = new Float32Array(pixels);
  for (let i = 0; i < pixels; i += 1) {
    if (confidence) {
      const raw = confidence[i] || 0;
      rawProb[i] = invertConfidence ? 1 - raw : raw;
    } else if (category) {
      rawProb[i] = (hasSecondChannel ? category[i] === 1 : category[i] === 0) ? 1 : 0;
    } else {
      rawProb[i] = 1;
    }
  }

  // Step 1: Light 5-tap cross dilation followed by 3x3 Gaussian-weighted erosion
  // Fills small interior specular dips on foreheads/glasses while keeping outer body edges natural.
  const dilated = new Float32Array(pixels);
  for (let y = 0; y < maskHeight; y += 1) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(maskHeight - 1, y + 1);
    const r0 = y0 * maskWidth;
    const rC = y * maskWidth;
    const r1 = y1 * maskWidth;
    for (let x = 0; x < maskWidth; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(maskWidth - 1, x + 1);
      const c = rawProb[rC + x];
      const maxCross = Math.max(c, rawProb[r0 + x], rawProb[r1 + x], rawProb[rC + x0], rawProb[rC + x1]);
      dilated[rC + x] = c * 0.45 + maxCross * 0.55;
    }
  }

  const refined = new Float32Array(pixels);
  for (let y = 0; y < maskHeight; y += 1) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(maskHeight - 1, y + 1);
    const r0 = y0 * maskWidth;
    const rC = y * maskWidth;
    const r1 = y1 * maskWidth;
    for (let x = 0; x < maskWidth; x += 1) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(maskWidth - 1, x + 1);
      const c = dilated[rC + x];
      const n = dilated[r0 + x];
      const s = dilated[r1 + x];
      const w = dilated[rC + x0];
      const e = dilated[rC + x1];
      const nw = dilated[r0 + x0];
      const ne = dilated[r0 + x1];
      const sw = dilated[r1 + x0];
      const se = dilated[r1 + x1];
      const minCross = Math.min(c, n, s, w, e);
      const gauss = (c * 4 + (n + s + w + e) * 2 + nw + ne + sw + se) / 16;
      refined[rC + x] = minCross * 0.35 + gauss * 0.65;
    }
  }

  if (!prevAlphaBufferRef.current || prevAlphaBufferRef.current.length !== pixels) {
    prevAlphaBufferRef.current = new Float32Array(refined);
  }
  const prevAlpha = prevAlphaBufferRef.current;
  const fullImage = fullMaskContext.createImageData(maskWidth, maskHeight);
  const coreImage = coreMaskContext.createImageData(maskWidth, maskHeight);

  for (let i = 0; i < pixels; i += 1) {
    const current = refined[i];
    const previous = prevAlpha[i];
    const delta = Math.abs(current - previous);
    const smoothed = delta > 0.14 ? current : previous * 0.28 + current * 0.72;
    prevAlpha[i] = smoothed;

    const fullAlpha = smoothstep(0.42, 0.58, smoothed);
    const coreAlpha = smoothstep(0.56, 0.72, smoothed);

    const offset = i * 4;
    fullImage.data[offset] = 255;
    fullImage.data[offset + 1] = 255;
    fullImage.data[offset + 2] = 255;
    fullImage.data[offset + 3] = Math.round(fullAlpha * 255);

    coreImage.data[offset] = 255;
    coreImage.data[offset + 1] = 255;
    coreImage.data[offset + 2] = 255;
    coreImage.data[offset + 3] = Math.round(coreAlpha * 255);
  }

  if (fullMaskCanvas.width !== maskWidth || fullMaskCanvas.height !== maskHeight) {
    fullMaskCanvas.width = maskWidth;
    fullMaskCanvas.height = maskHeight;
  }
  if (coreMaskCanvas.width !== maskWidth || coreMaskCanvas.height !== maskHeight) {
    coreMaskCanvas.width = maskWidth;
    coreMaskCanvas.height = maskHeight;
  }
  fullMaskContext.putImageData(fullImage, 0, 0);
  coreMaskContext.putImageData(coreImage, 0, 0);
  return true;
};

export function isWebAssemblySupported(): boolean {
  try {
    if (typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function") {
      const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
      return Boolean(module);
    }
  } catch {
    return false;
  }
  return false;
}

export async function createCallVideoBackground(track: MediaStreamTrack, effect: CallVideoBackground): Promise<BackgroundPipeline> {
  if (!isWebAssemblySupported()) {
    throw new Error("Virtual background requires WebAssembly execution, which is restricted in this browser session. Please refresh the page.");
  }
  const selectedPreset = CALL_VIDEO_BACKGROUND_OPTIONS.find(background => background.value === effect);
  const customImageUrl = !selectedPreset && effect !== "blur" ? String(effect) : null;
  const backgroundUrl = selectedPreset
    ? `${import.meta.env.BASE_URL}call-backgrounds/${selectedPreset.fileName}`
    : customImageUrl;

  const [{ FilesetResolver, ImageSegmenter }, videoBackground] = await Promise.all([
    import("@mediapipe/tasks-vision"),
    backgroundUrl ? loadImage(backgroundUrl) : Promise.resolve(null),
  ]);
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`);
  const cpuOptions = {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/selfie_segmenter_landscape.tflite`, delegate: "CPU" },
    runningMode: "VIDEO",
    outputCategoryMask: true,
    outputConfidenceMasks: true,
  } as const;
  let segmenter: ImageSegmenter;
  try {
    segmenter = await ImageSegmenter.createFromOptions(vision, cpuOptions);
  } catch {
    segmenter = await ImageSegmenter.createFromOptions(vision, {
      ...cpuOptions,
      baseOptions: { ...cpuOptions.baseOptions, delegate: "GPU" },
    });
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  try {
    await video.play();
    await waitForVideo(video);
  } catch (error) {
    segmenter.close();
    video.srcObject = null;
    throw error;
  }

  // Preserve the camera's exact native aspect ratio so the participant is never zoomed, stretched, or cropped.
  const sourceWidth = video.videoWidth || track.getSettings().width || 960;
  const sourceHeight = video.videoHeight || track.getSettings().height || 540;
  const resolutionScale = Math.min(1, 960 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * resolutionScale));
  const height = Math.max(1, Math.round(sourceHeight * resolutionScale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });

  const fullMaskCanvas = document.createElement("canvas");
  const fullMaskContext = fullMaskCanvas.getContext("2d", { willReadFrequently: true });
  const coreMaskCanvas = document.createElement("canvas");
  const coreMaskContext = coreMaskCanvas.getContext("2d", { willReadFrequently: true });

  const coreCanvas = document.createElement("canvas");
  coreCanvas.width = width;
  coreCanvas.height = height;
  const coreContext = coreCanvas.getContext("2d");

  const foregroundCanvas = document.createElement("canvas");
  foregroundCanvas.width = width;
  foregroundCanvas.height = height;
  const foregroundContext = foregroundCanvas.getContext("2d");

  const backgroundCanvas = document.createElement("canvas");
  backgroundCanvas.width = width;
  backgroundCanvas.height = height;
  const backgroundContext = backgroundCanvas.getContext("2d");

  if (!context || !fullMaskContext || !coreMaskContext || !coreContext || !foregroundContext || !backgroundContext || typeof canvas.captureStream !== "function") {
    segmenter.close();
    video.srcObject = null;
    throw new Error("This browser does not support real-time call background effects.");
  }

  for (const ctx of [context, coreContext, foregroundContext, backgroundContext]) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }

  if (videoBackground) {
    backgroundContext.save();
    backgroundContext.filter = "blur(0.4px) brightness(0.96)";
    drawCover(backgroundContext, videoBackground, videoBackground.naturalWidth || 1280, videoBackground.naturalHeight || 720, width, height);
    backgroundContext.restore();
  }

  const prevAlphaBufferRef: { current: Float32Array | null } = { current: null };
  drawExactMirrored(context, video, width, height);
  const captured = canvas.captureStream(30);
  const outputTrack = captured.getVideoTracks()[0];
  let frameId = 0;
  let previousFrameAt = 0;
  let lastVideoTime = -1;
  let stopped = false;

  const renderFrame = (now: number) => {
    if (stopped) return;
    frameId = requestAnimationFrame(renderFrame);
    if (now - previousFrameAt < 30 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === lastVideoTime) return;
    previousFrameAt = now;
    lastVideoTime = video.currentTime;
    try {
      segmenter.segmentForVideo(video, now, result => {
        try {
          if (stopped || !buildDualPersonMasks(result, fullMaskCanvas, fullMaskContext, coreMaskCanvas, coreMaskContext, prevAlphaBufferRef)) return;

          // Layer 1 (Back): Virtual background image or blurred camera feed
          if (videoBackground) {
            context.drawImage(backgroundCanvas, 0, 0);
          } else {
            context.save();
            context.filter = "blur(18px)";
            drawExactMirrored(context, video, width, height);
            context.restore();
          }

          // Layer 2A: Extract pure interior person pixels onto coreCanvas (exact 1:1 camera framing, zero crop)
          coreContext.globalCompositeOperation = "source-over";
          coreContext.clearRect(0, 0, width, height);
          drawExactMirrored(coreContext, video, width, height);
          coreContext.globalCompositeOperation = "destination-in";
          drawExactMirrored(coreContext, coreMaskCanvas, width, height);
          coreContext.globalCompositeOperation = "source-over";

          // Layer 2B: Radially smooth 1.5px color extension from pure core followed by sharp core
          // and anti-aliased silhouette mask clipping
          foregroundContext.globalCompositeOperation = "source-over";
          foregroundContext.clearRect(0, 0, width, height);
          foregroundContext.filter = "blur(1.5px)";
          foregroundContext.drawImage(coreCanvas, 0, 0);
          foregroundContext.drawImage(coreCanvas, 0, 0);
          foregroundContext.filter = "none";
          foregroundContext.drawImage(coreCanvas, 0, 0);

          foregroundContext.globalCompositeOperation = "destination-in";
          foregroundContext.filter = "blur(0.65px)";
          drawExactMirrored(foregroundContext, fullMaskCanvas, width, height);
          foregroundContext.filter = "none";
          foregroundContext.globalCompositeOperation = "source-over";

          // Layer 3 (Final Output): Composite clean participant foreground over virtual background
          context.drawImage(foregroundCanvas, 0, 0);
        } finally {
          result.close();
        }
      });
    } catch {
      // Keep the last valid frame visible during a transient inference hiccup.
    }
  };
  frameId = requestAnimationFrame(renderFrame);

  return {
    track: outputTrack,
    stop: () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frameId);
      captured.getTracks().forEach(capturedTrack => capturedTrack.stop());
      segmenter.close();
      video.pause();
      video.srcObject = null;
    },
  };
}
