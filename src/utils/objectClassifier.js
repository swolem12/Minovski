/**
 * Object Classifier for drone/aircraft detection
 * Maps COCO-SSD classes to threat categories
 */

// COCO-SSD classes that may indicate aerial threats or vehicles
const THREAT_MAPPINGS = {
  // Aerial threats (simulated - COCO doesn't have drone class, we use birds/kites as proxy)
  'bird': { type: 'drone', threat: 'medium', label: 'Possible sUAS' },
  'kite': { type: 'drone', threat: 'high', label: 'Aerial Object' },
  'airplane': { type: 'fixed-wing', threat: 'high', label: 'Fixed-Wing Aircraft' },
  'aeroplane': { type: 'fixed-wing', threat: 'high', label: 'Fixed-Wing Aircraft' },
  
  // Vehicles
  'car': { type: 'vehicle', threat: 'low', label: 'Ground Vehicle' },
  'truck': { type: 'vehicle', threat: 'low', label: 'Truck' },
  'bus': { type: 'vehicle', threat: 'low', label: 'Bus' },
  'motorcycle': { type: 'vehicle', threat: 'low', label: 'Motorcycle' },
  
  // People (for context)
  'person': { type: 'person', threat: 'info', label: 'Person Detected' },
  
  // Other objects that could be threats
  'sports ball': { type: 'object', threat: 'low', label: 'Airborne Object' },
  'frisbee': { type: 'object', threat: 'low', label: 'Airborne Object' },
};

// Minimum confidence threshold for detection
const MIN_CONFIDENCE = 0.5;

// Aerial threat types for consistent filtering across the app
export const AERIAL_THREAT_TYPES = ['drone', 'quadcopter', 'fixed-wing', 'helicopter'];

// Simulated drone detection keywords for demo purposes
// In production, you'd use a custom-trained model
const DEMO_KEYWORDS = ['drone', 'quadcopter', 'helicopter', 'aircraft', 'uav', 'suas'];

/**
 * Check if a detection is an aerial threat
 * @param {Object} detection - Detection object with classification
 * @returns {boolean}
 */
export function isAerialThreat(detection) {
  return AERIAL_THREAT_TYPES.includes(detection?.classification?.type);
}

/**
 * Format confidence as percentage string
 * @param {number} confidence - Confidence value between 0 and 1
 * @returns {string} Formatted percentage like "85%"
 */
export function formatConfidence(confidence) {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Classify detected objects and determine threat level
 * @param {Object[]} predictions - COCO-SSD predictions
 * @returns {Object[]} Classified detections with threat info
 */
export function classifyDetections(predictions) {
  return predictions
    .filter(pred => pred.score >= MIN_CONFIDENCE)
    .map(pred => {
      const className = pred.class.toLowerCase();
      const mapping = THREAT_MAPPINGS[className] || {
        type: 'unknown',
        threat: 'info',
        label: pred.class
      };
      
      return {
        ...pred,
        classification: mapping,
        confidence: pred.score,
        boundingBox: {
          x: pred.bbox[0],
          y: pred.bbox[1],
          width: pred.bbox[2],
          height: pred.bbox[3],
          centerX: pred.bbox[0] + pred.bbox[2] / 2,
          centerY: pred.bbox[1] + pred.bbox[3] / 2
        }
      };
    });
}

/**
 * Get overall threat level from detections
 * @param {Object[]} classifiedDetections 
 * @returns {string} 'none', 'low', 'medium', 'high', 'critical'
 */
export function getOverallThreatLevel(classifiedDetections) {
  if (!classifiedDetections || classifiedDetections.length === 0) {
    return 'none';
  }
  
  const threatLevels = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  
  let maxThreat = 'none';
  let threatScore = 0;
  let droneCount = 0;
  
  for (const detection of classifiedDetections) {
    const level = detection.classification.threat;
    const type = detection.classification.type;
    
    if (type === 'drone' || type === 'fixed-wing' || type === 'quadcopter') {
      droneCount++;
    }
    
    if (threatLevels[level] > threatScore) {
      threatScore = threatLevels[level];
      maxThreat = level;
    }
  }
  
  // Multiple drone-like objects = higher threat
  if (droneCount >= 3) {
    return 'critical';
  } else if (droneCount >= 2) {
    return Math.max(threatLevels[maxThreat], threatLevels.high) === threatLevels.high ? 'high' : maxThreat;
  }
  
  return maxThreat;
}

/**
 * Get color for threat level
 * @param {string} level 
 * @returns {string} CSS color
 */
export function getThreatColor(level) {
  const colors = {
    none: '#4ade80',    // Green
    info: '#60a5fa',    // Blue
    low: '#fbbf24',     // Yellow
    medium: '#fb923c',  // Orange
    high: '#ef4444',    // Red
    critical: '#dc2626' // Dark Red
  };
  
  return colors[level] || colors.info;
}

/**
 * Get detection box color based on type
 * @param {string} type 
 * @returns {string} CSS color
 */
export function getTypeColor(type) {
  const colors = {
    drone: '#ef4444',
    quadcopter: '#f97316',
    'fixed-wing': '#3b82f6',
    helicopter: '#a855f7',
    vehicle: '#22c55e',
    person: '#06b6d4',
    object: '#eab308',
    unknown: '#6b7280'
  };
  
  return colors[type] || colors.unknown;
}

export default {
  classifyDetections,
  getOverallThreatLevel,
  getThreatColor,
  getTypeColor,
  isAerialThreat,
  formatConfidence,
  THREAT_MAPPINGS,
  AERIAL_THREAT_TYPES,
  MIN_CONFIDENCE
};
