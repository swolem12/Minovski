/**
 * Object Classifier for drone/aircraft detection
 * Maps COCO-SSD classes to threat categories
 * Enhanced with altitude estimation and size-based classification
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
  
  // Additional aerial objects
  'umbrella': { type: 'object', threat: 'low', label: 'Aerial Object' },
};

// Minimum confidence threshold for detection
const MIN_CONFIDENCE = 0.5;

// Aerial threat types for consistent filtering across the app
export const AERIAL_THREAT_TYPES = ['drone', 'quadcopter', 'fixed-wing', 'helicopter'];

// All trackable types that should have Minovsky particle trails
export const TRACKABLE_TYPES = ['drone', 'quadcopter', 'fixed-wing', 'helicopter', 'person', 'hand', 'vehicle', 'object'];

// Hand position estimation constants (proportional positions within person bounding box)
const HAND_POSITION_LEFT_X = 0.15;
const HAND_POSITION_RIGHT_X = 0.85;
const HAND_POSITION_Y = 0.6;

// Size thresholds for altitude estimation (as percentage of screen)
const SIZE_THRESHOLDS = {
  veryClose: 0.3,   // > 30% of screen = very close
  close: 0.15,      // > 15% = close
  medium: 0.05,     // > 5% = medium distance
  far: 0.02,        // > 2% = far
  veryFar: 0        // < 2% = very far
};

/**
 * Estimate relative altitude/distance based on object size
 * @param {Object} boundingBox - Object bounding box
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @returns {Object} Altitude estimation {level, label, screenPercentage}
 */
export function estimateAltitude(boundingBox, canvasWidth, canvasHeight) {
  const screenArea = canvasWidth * canvasHeight;
  const objectArea = boundingBox.width * boundingBox.height;
  const screenPercentage = objectArea / screenArea;
  
  let level, label;
  
  if (screenPercentage > SIZE_THRESHOLDS.veryClose) {
    level = 'very-close';
    label = 'VERY CLOSE';
  } else if (screenPercentage > SIZE_THRESHOLDS.close) {
    level = 'close';
    label = 'CLOSE';
  } else if (screenPercentage > SIZE_THRESHOLDS.medium) {
    level = 'medium';
    label = 'MEDIUM';
  } else if (screenPercentage > SIZE_THRESHOLDS.far) {
    level = 'far';
    label = 'FAR';
  } else {
    level = 'very-far';
    label = 'VERY FAR';
  }
  
  return { level, label, screenPercentage };
}

/**
 * Estimate hand positions within a person's bounding box
 * @param {Object} boundingBox - Bounding box with x, y, width, height
 * @param {number} canvasWidth - Canvas width for normalization
 * @param {number} canvasHeight - Canvas height for normalization
 * @returns {Object} Object with leftHand and rightHand positions {x, y}
 */
export function estimateHandPositions(boundingBox, canvasWidth, canvasHeight) {
  return {
    leftHand: {
      x: (boundingBox.x + boundingBox.width * HAND_POSITION_LEFT_X) / canvasWidth,
      y: (boundingBox.y + boundingBox.height * HAND_POSITION_Y) / canvasHeight
    },
    rightHand: {
      x: (boundingBox.x + boundingBox.width * HAND_POSITION_RIGHT_X) / canvasWidth,
      y: (boundingBox.y + boundingBox.height * HAND_POSITION_Y) / canvasHeight
    }
  };
}

/**
 * Estimate position in frame (for tracking direction of approach)
 * @param {Object} boundingBox - Object bounding box
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @returns {Object} Position info {horizontal, vertical, quadrant}
 */
export function estimateFramePosition(boundingBox, canvasWidth, canvasHeight) {
  const centerX = boundingBox.centerX / canvasWidth;
  const centerY = boundingBox.centerY / canvasHeight;
  
  let horizontal, vertical;
  
  if (centerX < 0.33) horizontal = 'left';
  else if (centerX > 0.67) horizontal = 'right';
  else horizontal = 'center';
  
  if (centerY < 0.33) vertical = 'top';
  else if (centerY > 0.67) vertical = 'bottom';
  else vertical = 'center';
  
  const quadrant = `${vertical}-${horizontal}`;
  
  return { horizontal, vertical, quadrant, normalizedX: centerX, normalizedY: centerY };
}

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
 * Format velocity for display
 * @param {Object} velocity - Velocity object with magnitude
 * @returns {string} Formatted velocity string
 */
export function formatVelocity(velocity) {
  if (!velocity || velocity.magnitude === 0) return 'STATIONARY';
  
  const speed = velocity.magnitude * 100; // Convert to more readable units
  
  if (speed < 1) return 'SLOW';
  if (speed < 5) return 'MOVING';
  if (speed < 15) return 'FAST';
  return 'VERY FAST';
}

/**
 * Classify detected objects and determine threat level
 * @param {Object[]} predictions - COCO-SSD predictions
 * @param {number} canvasWidth - Optional canvas width for altitude estimation
 * @param {number} canvasHeight - Optional canvas height for altitude estimation
 * @returns {Object[]} Classified detections with threat info
 */
export function classifyDetections(predictions, canvasWidth = 1920, canvasHeight = 1080) {
  return predictions
    .filter(pred => pred.score >= MIN_CONFIDENCE)
    .map(pred => {
      const className = pred.class.toLowerCase();
      const mapping = THREAT_MAPPINGS[className] || {
        type: 'unknown',
        threat: 'info',
        label: pred.class
      };
      
      const boundingBox = {
        x: pred.bbox[0],
        y: pred.bbox[1],
        width: pred.bbox[2],
        height: pred.bbox[3],
        centerX: pred.bbox[0] + pred.bbox[2] / 2,
        centerY: pred.bbox[1] + pred.bbox[3] / 2
      };
      
      // Estimate altitude based on size
      const altitude = estimateAltitude(boundingBox, canvasWidth, canvasHeight);
      
      // Estimate frame position
      const framePosition = estimateFramePosition(boundingBox, canvasWidth, canvasHeight);
      
      return {
        ...pred,
        classification: mapping,
        confidence: pred.score,
        boundingBox,
        altitude,
        framePosition,
        timestamp: Date.now()
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
  let closeThreats = 0;
  
  for (const detection of classifiedDetections) {
    const level = detection.classification.threat;
    const type = detection.classification.type;
    
    if (type === 'drone' || type === 'fixed-wing' || type === 'quadcopter' || type === 'helicopter') {
      droneCount++;
      
      // Close aerial threats are more dangerous
      if (detection.altitude && ['very-close', 'close'].includes(detection.altitude.level)) {
        closeThreats++;
      }
    }
    
    if (threatLevels[level] > threatScore) {
      threatScore = threatLevels[level];
      maxThreat = level;
    }
  }
  
  // Close threats escalate threat level
  if (closeThreats > 0 && threatScore < threatLevels.high) {
    return 'high';
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
 * Get color for altitude/distance level
 * @param {string} level 
 * @returns {string} CSS color
 */
export function getAltitudeColor(level) {
  const colors = {
    'very-close': '#ef4444',  // Red - immediate attention
    'close': '#f97316',       // Orange
    'medium': '#fbbf24',      // Yellow
    'far': '#22c55e',         // Green
    'very-far': '#60a5fa'     // Blue - distant
  };
  
  return colors[level] || colors.medium;
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
    hand: '#10b981',
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
  getAltitudeColor,
  isAerialThreat,
  formatConfidence,
  formatVelocity,
  estimateHandPositions,
  estimateAltitude,
  estimateFramePosition,
  THREAT_MAPPINGS,
  AERIAL_THREAT_TYPES,
  TRACKABLE_TYPES,
  MIN_CONFIDENCE
};
