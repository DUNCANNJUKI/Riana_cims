// Notification sound utility for RIANA CIMS
// Uses Web Audio API for cross-browser compatibility

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

  // Play a pleasant notification chime
  playNotificationSound(type: 'default' | 'success' | 'announcement' | 'assignment' | 'completion' = 'default') {
    if (!this.isEnabled || !this.isUnlocked || this.audioContext?.state !== 'running') return;

    try {
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const frequencies = {
        default: [440, 554, 659],
        success: [523, 659, 784],
        announcement: [392, 494, 587],
        assignment: [349, 440, 523],
        completion: [523, 659, 784, 1047],
      };
      const notes = frequencies[type];
      const duration = type === 'completion' ? 0.15 : 0.12;
      notes.forEach((freq, index) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        const startTime = now + (index * duration);
        const endTime = startTime + duration * 1.5;
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
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
export const playNotificationSound = (type?: 'default' | 'success' | 'announcement' | 'assignment' | 'completion') => {
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
