// Notification sound utility for RIANA CIMS
// Uses Web Audio API for cross-browser compatibility

type NotificationSoundType = 'default' | 'success' | 'announcement' | 'assignment' | 'completion' | 'message' | 'call' | 'callRing' | 'callPickup' | 'callHangup';

class NotificationSoundManager {
  private audioContext: AudioContext | null = null;
  private isEnabled: boolean = true;
  private isUnlocked: boolean = false;

  constructor() {
    // Initialize audio context on first user interaction
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('notification_sound_enabled');
      if (stored !== null) this.isEnabled = stored === 'true';
      const unlockAudio = async () => {
        try {
          if (!this.audioContext) {
            const AudioContextConstructor = window.AudioContext
              || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextConstructor) return;
            this.audioContext = new AudioContextConstructor();
          }
          if (this.audioContext.state === 'suspended') await this.audioContext.resume();
          this.isUnlocked = this.audioContext.state === 'running';
        } catch {
          this.isUnlocked = false;
        }

        if (this.isUnlocked) {
          document.removeEventListener('pointerdown', unlockAudio);
          document.removeEventListener('keydown', unlockAudio);
        }
      };
      document.addEventListener('pointerdown', unlockAudio);
      document.addEventListener('keydown', unlockAudio);
    }
  }

  // Play a clear notification chime. Kept local with Web Audio so alerts do not
  // depend on third-party audio files or network availability.
  playNotificationSound(type: NotificationSoundType = 'default') {
    if (!this.isEnabled || !this.isUnlocked || this.audioContext?.state !== 'running') return;

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const patterns: Record<NotificationSoundType, { notes: number[]; duration: number; gain: number; wave: OscillatorType }> = {
        default: { notes: [523, 659, 784], duration: 0.13, gain: 0.34, wave: 'triangle' },
        success: { notes: [523, 659, 784], duration: 0.13, gain: 0.32, wave: 'triangle' },
        announcement: { notes: [392, 494, 587, 784], duration: 0.15, gain: 0.38, wave: 'square' },
        assignment: { notes: [349, 440, 523, 659], duration: 0.14, gain: 0.36, wave: 'triangle' },
        completion: { notes: [523, 659, 784, 1047], duration: 0.13, gain: 0.34, wave: 'triangle' },
        message: { notes: [988, 740, 988], duration: 0.11, gain: 0.42, wave: 'triangle' },
        call: { notes: [880, 880, 1047, 880, 1047], duration: 0.18, gain: 0.44, wave: 'square' },
        callRing: { notes: [659, 784, 988, 784], duration: 0.2, gain: 0.32, wave: 'triangle' },
        callPickup: { notes: [523, 659, 784], duration: 0.12, gain: 0.28, wave: 'triangle' },
        callHangup: { notes: [784, 587, 440], duration: 0.13, gain: 0.26, wave: 'sine' },
      };
      const pattern = patterns[type] || patterns.default;
      pattern.notes.forEach((freq, index) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.value = freq;
        oscillator.type = pattern.wave;
        const startTime = now + (index * pattern.duration);
        const endTime = startTime + pattern.duration * 1.55;
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(pattern.gain, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.01, endTime);
        oscillator.start(startTime);
        oscillator.stop(endTime + 0.1);
      });
    } catch (error) {
      console.log('Audio playback not available');
    }
  }

  // Toggle sound on/off
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    localStorage.setItem('notification_sound_enabled', String(enabled));
  }

  // Get current enabled state
  getEnabled(): boolean {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('notification_sound_enabled');
      if (stored !== null) {
        this.isEnabled = stored === 'true';
      }
    }
    return this.isEnabled;
  }
}

// Singleton instance
export const notificationSound = new NotificationSoundManager();

// Helper functions for easy use
export const playNotificationSound = (type?: NotificationSoundType) => {
  notificationSound.playNotificationSound(type);
};

export const playAnnouncementSound = () => {
  notificationSound.playNotificationSound('announcement');
};

export const playAssignmentSound = () => {
  notificationSound.playNotificationSound('assignment');
};

export const playCompletionSound = () => {
  notificationSound.playNotificationSound('completion');
};

export const playMessageSound = () => {
  notificationSound.playNotificationSound('message');
};

export const playCallSound = () => {
  notificationSound.playNotificationSound('call');
};
export const playCallRingSound = () => {
  notificationSound.playNotificationSound('callRing');
};

export const playCallPickupSound = () => {
  notificationSound.playNotificationSound('callPickup');
};

export const playCallHangupSound = () => {
  notificationSound.playNotificationSound('callHangup');
};
