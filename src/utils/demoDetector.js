/**
 * Demo Detector - Simulates drone detection for demonstration purposes
 * Used when real detection models (YOLOv8, COCO-SSD) are unavailable
 */

// Demo detection classes with drone-specific detections
// Note: In demo mode, we simulate various aerial threat detections
// 'bird' is mapped to 'drone' because COCO models use birds as proxy for drones
const DEMO_CLASSES = [
  { class: 'drone', type: 'drone', threat: 'high', label: 'Quadcopter Drone' },
  { class: 'drone', type: 'drone', threat: 'medium', label: 'Small sUAS' },
  { class: 'fixed-wing', type: 'fixed-wing', threat: 'high', label: 'Fixed-Wing UAV' },
  { class: 'helicopter', type: 'helicopter', threat: 'high', label: 'Helicopter' },
  { class: 'bird', type: 'drone', threat: 'medium', label: 'Possible sUAS' }, // Birds used as drone proxy
  { class: 'person', type: 'person', threat: 'info', label: 'Person Detected' },
  { class: 'car', type: 'vehicle', threat: 'low', label: 'Ground Vehicle' },
];

class DemoDetector {
  constructor() {
    this.isReady = false;
    this.detectionInterval = null;
    this.lastDetectionTime = 0;
    this.minDetectionInterval = 2000; // Min 2 seconds between detection changes
    this.currentDetections = [];
  }

  /**
   * Initialize the demo detector
   */
  async load() {
    // Simulate loading time
    await new Promise(resolve => setTimeout(resolve, 500));
    this.isReady = true;
    console.log('Demo detector initialized - simulating drone detections');
    return this;
  }

  /**
   * Generate random detections for demonstration
   * @param {HTMLVideoElement} video - Video element for dimensions
   * @returns {Object[]} Array of simulated detections
   */
  detect(video) {
    if (!this.isReady) return [];

    const now = Date.now();
    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;

    // Only update detections periodically to simulate real detection behavior
    if (now - this.lastDetectionTime < this.minDetectionInterval) {
      return this.currentDetections;
    }

    this.lastDetectionTime = now;

    // Random chance to detect something (60% chance)
    if (Math.random() > 0.6) {
      this.currentDetections = [];
      return [];
    }

    // Generate 1-3 random detections
    const numDetections = Math.floor(Math.random() * 3) + 1;
    const detections = [];

    for (let i = 0; i < numDetections; i++) {
      // Pick a random detection class (bias towards drones for demo)
      const classIndex = Math.random() < 0.7 
        ? Math.floor(Math.random() * 4) // 70% chance of aerial threat
        : Math.floor(Math.random() * DEMO_CLASSES.length);
      
      const demoClass = DEMO_CLASSES[classIndex];
      
      // Generate random bounding box
      const boxWidth = 80 + Math.random() * 120;
      const boxHeight = 60 + Math.random() * 100;
      const x = Math.random() * (videoWidth - boxWidth);
      const y = Math.random() * (videoHeight - boxHeight);
      
      // Random confidence between 0.6 and 0.95
      const confidence = 0.6 + Math.random() * 0.35;

      detections.push({
        class: demoClass.class,
        score: confidence,
        bbox: [x, y, boxWidth, boxHeight],
        classification: {
          type: demoClass.type,
          threat: demoClass.threat,
          label: demoClass.label
        }
      });
    }

    this.currentDetections = detections;
    return detections;
  }

  /**
   * Classify detections (already classified in detect method)
   */
  classifyDetections(detections) {
    return detections.map(det => ({
      ...det,
      confidence: det.score,
      boundingBox: {
        x: det.bbox[0],
        y: det.bbox[1],
        width: det.bbox[2],
        height: det.bbox[3],
        centerX: det.bbox[0] + det.bbox[2] / 2,
        centerY: det.bbox[1] + det.bbox[3] / 2
      }
    }));
  }

  /**
   * Check if detector is ready
   */
  isLoaded() {
    return this.isReady;
  }
}

// Export singleton instance
export const demoDetector = new DemoDetector();
export default demoDetector;
