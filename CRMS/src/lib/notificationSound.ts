class NotificationSoundManager {
  private context: AudioContext | null = null;
  private unlocked = false;

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = async () => {
      try {
        this.context ||= new (window.AudioContext || (window as any).webkitAudioContext)();
        if (this.context.state === 'suspended') await this.context.resume();
        this.unlocked = true;
        document.removeEventListener('click', unlock);
        document.removeEventListener('keydown', unlock);
      } catch {
        this.unlocked = false;
      }
    };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
  }

  play() {
    if (!this.unlocked || !this.context) return;
    const now = this.context.currentTime;
    [440, 554, 659].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      oscillator.connect(gain);
      gain.connect(this.context!.destination);
      oscillator.frequency.value = frequency;
      const start = now + index * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.18);
      oscillator.start(start);
      oscillator.stop(start + 0.22);
    });
  }
}

export const notificationSound = new NotificationSoundManager();
