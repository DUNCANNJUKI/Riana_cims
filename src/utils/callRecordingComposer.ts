export interface RecordingParticipantSource {
  id: string;
  name: string;
  stream: MediaStream | null;
  videoEnabled: boolean;
  audioEnabled: boolean;
  isScreenSharing?: boolean;
  isActiveSpeaker?: boolean;
  isLocal?: boolean;
}

export interface CompletedCallRecording {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
}

export interface CallRecordingSession {
  stop: () => Promise<CompletedCallRecording>;
  cancel: () => void;
  getDurationSeconds: () => number;
  mimeType: string;
}

const SUPPORTED_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

export function getSupportedRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  for (const candidate of SUPPORTED_MIME_TYPES) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "video/webm";
}

const getInitials = (name: string): string => {
  const parts = String(name || "Participant").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const drawCoverVideo = (
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
  contain: boolean,
) => {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 360;
  if (vw <= 0 || vh <= 0) return;

  if (contain) {
    const scale = Math.min(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
    return;
  }

  const scale = Math.max(w / vw, h / vh);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;
  ctx.drawImage(video, sx, sy, sw, sh, x, y, w, h);
};

const computeGridCells = (count: number, canvasWidth: number, canvasHeight: number, padding = 16) => {
  const safeCount = Math.max(1, Math.min(9, count));
  let cols = 1;
  let rows = 1;
  if (safeCount === 2) {
    cols = 2;
    rows = 1;
  } else if (safeCount <= 4) {
    cols = 2;
    rows = 2;
  } else if (safeCount <= 6) {
    cols = 3;
    rows = 2;
  } else {
    cols = 3;
    rows = 3;
  }

  const totalGapX = padding * (cols + 1);
  const totalGapY = padding * (rows + 1);
  const cellWidth = Math.floor((canvasWidth - totalGapX) / cols);
  const cellHeight = Math.floor((canvasHeight - totalGapY) / rows);

  const cells: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let idx = 0; idx < safeCount; idx += 1) {
    const row = Math.floor(idx / cols);
    const col = idx % cols;
    const itemsInRow = row === rows - 1 ? safeCount - row * cols : cols;
    const rowShiftX = itemsInRow < cols ? Math.floor(((cols - itemsInRow) * (cellWidth + padding)) / 2) : 0;
    const x = padding + rowShiftX + col * (cellWidth + padding);
    const y = padding + row * (cellHeight + padding);
    cells.push({ x, y, w: cellWidth, h: cellHeight });
  }
  return cells;
};

/**
 * Starts a clean, media-pipeline-only meeting recording session.
 *
 * IMPORTANT: This compositor renders ONLY participant video/screen-share streams and participant
 * avatar tiles onto an offscreen canvas and mixes participant audio tracks via Web Audio API.
 * Live UI overlays (REC indicators, recording notification banners, confirmation dialogs, and toolbars)
 * are strictly excluded from the recorded video output.
 */
export function startCallRecordingSession(
  getParticipants: () => RecordingParticipantSource[],
): CallRecordingSession {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  const width = 1280;
  const height = 720;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx || typeof canvas.captureStream !== "function") {
    throw new Error("Canvas stream capture is not supported in this browser.");
  }

  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const audioContext = AudioContextCtor ? new AudioContextCtor() : null;
  const audioDestination = audioContext ? audioContext.createMediaStreamDestination() : null;
  if (audioContext && audioContext.state === "suspended") {
    void audioContext.resume().catch(() => {});
  }

  // Keep a silent oscillator at zero gain so the audio destination stream always produces a continuous clock
  let keepAliveOscillator: OscillatorNode | null = null;
  let keepAliveGain: GainNode | null = null;
  if (audioContext && audioDestination) {
    try {
      keepAliveOscillator = audioContext.createOscillator();
      keepAliveGain = audioContext.createGain();
      keepAliveGain.gain.value = 0.00001;
      keepAliveOscillator.connect(keepAliveGain);
      keepAliveGain.connect(audioDestination);
      keepAliveOscillator.start();
    } catch {
      // Ignore oscillator initialization issues
    }
  }

  const connectedAudioTracks = new Map<string, { track: MediaStreamTrack; sourceNode: MediaStreamAudioSourceNode }>();
  const videoElements = new Map<string, { video: HTMLVideoElement; trackId: string }>();

  const syncMediaSources = (participants: RecordingParticipantSource[]) => {
    const activeIds = new Set<string>();
    const activeAudioKeys = new Set<string>();

    for (const participant of participants) {
      activeIds.add(participant.id);
      const stream = participant.stream;
      const videoTrack = stream?.getVideoTracks().find(t => t.readyState === "live") || null;

      if (videoTrack) {
        const existing = videoElements.get(participant.id);
        if (!existing || existing.trackId !== videoTrack.id) {
          if (existing) {
            existing.video.pause();
            existing.video.srcObject = null;
          }
          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.autoplay = true;
          video.srcObject = new MediaStream([videoTrack]);
          void video.play().catch(() => {});
          videoElements.set(participant.id, { video, trackId: videoTrack.id });
        }
      } else {
        const existing = videoElements.get(participant.id);
        if (existing) {
          existing.video.pause();
          existing.video.srcObject = null;
          videoElements.delete(participant.id);
        }
      }

      if (audioContext && audioDestination && stream) {
        for (const audioTrack of stream.getAudioTracks()) {
          if (audioTrack.readyState !== "live") continue;
          const key = `${participant.id}:${audioTrack.id}`;
          activeAudioKeys.add(key);
          if (!connectedAudioTracks.has(key)) {
            try {
              const sourceNode = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
              sourceNode.connect(audioDestination);
              connectedAudioTracks.set(key, { track: audioTrack, sourceNode });
            } catch {
              // Ignore track connection errors
            }
          }
        }
      }
    }

    for (const [id, entry] of videoElements.entries()) {
      if (!activeIds.has(id)) {
        entry.video.pause();
        entry.video.srcObject = null;
        videoElements.delete(id);
      }
    }

    for (const [key, entry] of connectedAudioTracks.entries()) {
      if (!activeAudioKeys.has(key) || entry.track.readyState !== "live") {
        try {
          entry.sourceNode.disconnect();
        } catch {
          // Ignore disconnect errors
        }
        connectedAudioTracks.delete(key);
      }
    }
  };

  const renderCompositeFrame = () => {
    const participants = getParticipants();
    syncMediaSources(participants);

    // Clean dark enterprise canvas background (no REC indicator or notification overlays)
    ctx.fillStyle = "#090f1a";
    ctx.fillRect(0, 0, width, height);

    const visibleParticipants = participants.slice(0, 9);
    const cells = computeGridCells(visibleParticipants.length, width, height, visibleParticipants.length === 1 ? 12 : 16);

    visibleParticipants.forEach((participant, index) => {
      const cell = cells[index];
      if (!cell) return;

      ctx.save();
      drawRoundedRect(ctx, cell.x, cell.y, cell.w, cell.h, 16);
      ctx.clip();

      ctx.fillStyle = "#0f172a";
      ctx.fillRect(cell.x, cell.y, cell.w, cell.h);

      const videoEntry = videoElements.get(participant.id);
      const hasLiveVideo = Boolean(
        participant.videoEnabled &&
        videoEntry &&
        videoEntry.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        videoEntry.video.videoWidth > 0,
      );

      if (hasLiveVideo && videoEntry) {
        drawCoverVideo(ctx, videoEntry.video, cell.x, cell.y, cell.w, cell.h, Boolean(participant.isScreenSharing));
      } else {
        // Draw clean avatar initials circle when participant camera is off
        const centerX = cell.x + cell.w / 2;
        const centerY = cell.y + cell.h / 2 - 8;
        const avatarRadius = Math.max(28, Math.min(52, Math.floor(Math.min(cell.w, cell.h) * 0.16)));

        ctx.beginPath();
        ctx.arc(centerX, centerY, avatarRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(20, 184, 166, 0.16)";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(45, 212, 191, 0.42)";
        ctx.stroke();

        ctx.fillStyle = "#ccfbf1";
        ctx.font = `600 ${Math.round(avatarRadius * 0.72)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(getInitials(participant.name), centerX, centerY);
      }

      // Participant name label at bottom-left of their video tile
      const labelText = participant.isLocal ? `${participant.name} (You)` : participant.name;
      ctx.font = "600 13px Inter, system-ui, sans-serif";
      const textWidth = Math.min(cell.w - 32, ctx.measureText(labelText).width);
      const pillX = cell.x + 12;
      const pillY = cell.y + cell.h - 38;
      const pillW = textWidth + 24;
      const pillH = 26;

      drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 13);
      ctx.fillStyle = "rgba(8, 13, 24, 0.76)";
      ctx.fill();

      ctx.fillStyle = "#f8fafc";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(labelText, pillX + 12, pillY + pillH / 2);

      ctx.restore();

      // Subtle border (emerald highlight for active speaker, slate border otherwise)
      ctx.save();
      drawRoundedRect(ctx, cell.x, cell.y, cell.w, cell.h, 16);
      ctx.lineWidth = participant.isActiveSpeaker ? 2.5 : 1;
      ctx.strokeStyle = participant.isActiveSpeaker ? "rgba(16, 185, 129, 0.85)" : "rgba(148, 163, 184, 0.22)";
      ctx.stroke();
      ctx.restore();
    });
  };

  renderCompositeFrame();
  const intervalId = window.setInterval(renderCompositeFrame, 33);

  const canvasStream = canvas.captureStream(30);
  const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
  if (audioDestination) {
    combinedTracks.push(...audioDestination.stream.getAudioTracks());
  }
  const combinedStream = new MediaStream(combinedTracks);
  const mimeType = getSupportedRecordingMimeType();
  const chunks: BlobPart[] = [];
  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  let stopped = false;

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 128_000,
  });

  recorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const cleanupResources = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(intervalId);
    for (const entry of videoElements.values()) {
      entry.video.pause();
      entry.video.srcObject = null;
    }
    videoElements.clear();
    for (const entry of connectedAudioTracks.values()) {
      try {
        entry.sourceNode.disconnect();
      } catch {
        // Ignore
      }
    }
    connectedAudioTracks.clear();
    if (keepAliveOscillator) {
      try {
        keepAliveOscillator.stop();
        keepAliveOscillator.disconnect();
      } catch {
        // Ignore
      }
    }
    if (keepAliveGain) {
      try {
        keepAliveGain.disconnect();
      } catch {
        // Ignore
      }
    }
    canvasStream.getTracks().forEach(track => track.stop());
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => {});
    }
  };

  recorder.start(1000);

  return {
    mimeType,
    getDurationSeconds: () => Math.max(1, Math.round((Date.now() - startedAtMs) / 1000)),
    cancel: () => {
      try {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      } catch {
        // Ignore
      }
      cleanupResources();
    },
    stop: () =>
      new Promise<CompletedCallRecording>((resolve, reject) => {
        const finalize = () => {
          const endedAtMs = Date.now();
          const durationSeconds = Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000));
          cleanupResources();
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
          if (blob.size <= 0) {
            reject(new Error("The recorded meeting video was empty."));
            return;
          }
          resolve({
            blob,
            mimeType: blob.type || mimeType || "video/webm",
            durationSeconds,
            startedAt: startedAtIso,
            endedAt: new Date(endedAtMs).toISOString(),
          });
        };

        if (recorder.state === "inactive") {
          finalize();
          return;
        }

        recorder.onstop = finalize;
        recorder.onerror = () => {
          cleanupResources();
          reject(new Error("An error occurred while finalizing the meeting recording."));
        };

        try {
          recorder.requestData();
        } catch {
          // Ignore
        }
        try {
          recorder.stop();
        } catch (err) {
          cleanupResources();
          reject(err instanceof Error ? err : new Error("Unable to stop the meeting recorder."));
        }
      }),
  };
}
