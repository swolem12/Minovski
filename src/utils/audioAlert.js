/**
 * Audio Alert System for threat notifications
 * Uses Web Audio API for buzzer/alarm sounds
 */

class AudioAlert {
  constructor() {
    this.audioContext = null;
    this.isPlaying = false;
    this.currentOscillator = null;
    this.gainNode = null;
    this.initialized = false;
  }
  
  /**
   * Initialize audio context (must be called from user interaction)
   */
  init() {
    if (this.initialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = 0.3;
      this.initialized = true;
    } catch (e) {
      console.error('Web Audio API not supported:', e);
    }
  }
  
  /**
   * Play alert sound based on threat level
   * @param {string} level - 'low', 'medium', 'high', 'critical'
   */
  playAlert(level = 'medium') {
    if (!this.initialized || this.isPlaying) return;
    
    this.init();
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    const patterns = {
      low: { frequency: 440, duration: 200, beeps: 1 },
      medium: { frequency: 660, duration: 150, beeps: 2 },
      high: { frequency: 880, duration: 100, beeps: 3 },
      critical: { frequency: 1100, duration: 80, beeps: 5 }
    };
    
    const pattern = patterns[level] || patterns.medium;
    this.playPattern(pattern);
  }
  
  async playPattern({ frequency, duration, beeps }) {
    this.isPlaying = true;
    
    for (let i = 0; i < beeps; i++) {
      await this.playBeep(frequency, duration);
      if (i < beeps - 1) {
        await this.sleep(100);
      }
    }
    
    this.isPlaying = false;
  }
  
  playBeep(frequency, duration) {
    return new Promise((resolve) => {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      
      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + duration / 1000
      );
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration / 1000);
      
      oscillator.onended = resolve;
    });
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Play continuous siren for critical threats
   */
  playSiren() {
    if (!this.initialized || this.isPlaying) return;
    
    this.isPlaying = true;
    
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.type = 'sawtooth';
    gainNode.gain.value = 0.2;
    
    // Siren effect - frequency sweep
    const now = this.audioContext.currentTime;
    oscillator.frequency.setValueAtTime(400, now);
    
    for (let i = 0; i < 5; i++) {
      oscillator.frequency.linearRampToValueAtTime(800, now + i * 0.4 + 0.2);
      oscillator.frequency.linearRampToValueAtTime(400, now + i * 0.4 + 0.4);
    }
    
    oscillator.start(now);
    oscillator.stop(now + 2);
    
    this.currentOscillator = oscillator;
    oscillator.onended = () => {
      this.isPlaying = false;
      this.currentOscillator = null;
    };
  }
  
  /**
   * Stop any playing sound
   */
  stop() {
    if (this.currentOscillator) {
      try {
        this.currentOscillator.stop();
      } catch {
        // Already stopped
      }
      this.currentOscillator = null;
    }
    this.isPlaying = false;
  }
  
  /**
   * Trigger device vibration if supported
   * @param {number[]} pattern - Vibration pattern in ms
   */
  vibrate(pattern = [200, 100, 200]) {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }
  
  /**
   * Combined alert with sound and vibration
   * @param {string} level - Alert level
   */
  alert(level = 'medium') {
    this.playAlert(level);
    
    const vibrationPatterns = {
      low: [100],
      medium: [100, 50, 100],
      high: [200, 100, 200, 100, 200],
      critical: [300, 100, 300, 100, 300, 100, 300]
    };
    
    this.vibrate(vibrationPatterns[level] || vibrationPatterns.medium);
  }
}

// Singleton instance
const audioAlert = new AudioAlert();
export default audioAlert;
