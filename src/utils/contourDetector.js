/**
 * Contour Detector using OpenCV.js
 * Provides outline detection for objects instead of bounding boxes
 */

let cv = null;
let cvReady = false;
let cvInitPromise = null;

/**
 * Initialize OpenCV.js
 * @returns {Promise<void>}
 */
export async function initOpenCV() {
  if (cvReady) return;
  
  // Prevent multiple concurrent initialization attempts
  if (cvInitPromise) return cvInitPromise;
  
  cvInitPromise = (async () => {
    try {
      // Dynamic import of OpenCV
      const cvModule = await import('@techstark/opencv-js');
      cv = cvModule.default || cvModule.cv || cvModule;
      
      // Wait for OpenCV to be ready if it has an initialization callback
      // Check if cv.Mat exists as a sign that OpenCV is initialized
      if (typeof cv.Mat !== 'function') {
        // OpenCV not yet ready, wait for initialization
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('OpenCV initialization timeout'));
          }, 15000); // Increased timeout
          
          if (cv.onRuntimeInitialized !== undefined) {
            cv.onRuntimeInitialized = () => {
              clearTimeout(timeout);
              resolve();
            };
          } else {
            // Check periodically if cv.Mat becomes available
            const checkReady = setInterval(() => {
              if (typeof cv.Mat === 'function') {
                clearInterval(checkReady);
                clearTimeout(timeout);
                resolve();
              }
            }, 100);
          }
        });
      }
      
      cvReady = true;
      console.log('OpenCV.js initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OpenCV.js:', error);
      cvInitPromise = null; // Allow retry on failure
      throw error;
    }
  })();
  
  return cvInitPromise;
}

/**
 * Check if OpenCV is ready
 * @returns {boolean}
 */
export function isOpenCVReady() {
  return cvReady && cv !== null;
}

/**
 * Extract contours from a region of interest in a video frame
 * @param {HTMLVideoElement|HTMLCanvasElement} source - Video or canvas element
 * @param {Object} boundingBox - ROI with x, y, width, height
 * @param {number} threshold - Edge detection threshold (0-255)
 * @returns {Array} Array of contour points [{x, y}, ...]
 */
export function extractContours(source, boundingBox, threshold = 50) {
  if (!cvReady || !cv) {
    console.warn('OpenCV not ready, returning empty contours');
    return [];
  }
  
  try {
    // Create canvas to extract ROI
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Get source dimensions
    const srcWidth = source.videoWidth || source.width;
    const srcHeight = source.videoHeight || source.height;
    
    // Add padding around bounding box for better contour detection
    const padding = Math.min(boundingBox.width, boundingBox.height) * 0.15;
    
    // Clamp bounding box to image bounds with padding
    const x = Math.max(0, Math.min(boundingBox.x - padding, srcWidth));
    const y = Math.max(0, Math.min(boundingBox.y - padding, srcHeight));
    const width = Math.min(boundingBox.width + padding * 2, srcWidth - x);
    const height = Math.min(boundingBox.height + padding * 2, srcHeight - y);
    
    if (width <= 0 || height <= 0) return [];
    
    // Set canvas size to ROI
    canvas.width = width;
    canvas.height = height;
    
    // Draw ROI to canvas
    ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, width, height);
    
    // Create OpenCV Mat from image data
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    const dilated = new cv.Mat();
    const hierarchy = new cv.Mat();
    const contours = new cv.MatVector();
    
    // Convert to grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // Apply Gaussian blur to reduce noise
    const ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gray, blurred, ksize, 1.5);
    
    // Use adaptive threshold for better edge detection in varying lighting
    // Lower threshold for better edge detection
    const lowThreshold = Math.max(20, threshold - 20);
    const highThreshold = threshold * 2;
    cv.Canny(blurred, edges, lowThreshold, highThreshold);
    
    // Dilate edges to connect nearby edge fragments
    const dilateKernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, dilated, dilateKernel, new cv.Point(-1, -1), 1);
    dilateKernel.delete();
    
    // Find contours - use RETR_LIST to get all contours
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_TC89_L1);
    
    // Find largest contour by area (main object)
    let largestContourIndex = -1;
    let maxArea = 0;
    const minAreaThreshold = Math.max(50, (width * height) * 0.01); // At least 1% of ROI area
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > maxArea && area > minAreaThreshold) {
        maxArea = area;
        largestContourIndex = i;
      }
    }
    
    // Extract points from largest contour
    const points = [];
    if (largestContourIndex >= 0) {
      const largestContour = contours.get(largestContourIndex);
      
      // Use less aggressive approximation to preserve shape detail
      const perimeter = cv.arcLength(largestContour, true);
      const epsilon = 0.008 * perimeter; // Reduced from 0.02 for more detail
      const approx = new cv.Mat();
      cv.approxPolyDP(largestContour, approx, epsilon, true);
      
      // Ensure we have enough points for a meaningful contour
      if (approx.rows >= 3) {
        for (let i = 0; i < approx.rows; i++) {
          points.push({
            x: approx.intAt(i, 0) + x, // Offset back to original coordinates
            y: approx.intAt(i, 1) + y
          });
        }
      }
      
      approx.delete();
    }
    
    // Cleanup OpenCV objects
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    hierarchy.delete();
    contours.delete();
    
    return points;
  } catch (error) {
    console.error('Error extracting contours:', error);
    return [];
  }
}

/**
 * Draw contour outline on canvas with smooth curves
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} contourPoints - Array of {x, y} points
 * @param {string} color - Stroke color
 * @param {number} lineWidth - Line width
 * @param {boolean} glow - Add glow effect
 */
export function drawContour(ctx, contourPoints, color, lineWidth = 2, glow = true) {
  if (!contourPoints || contourPoints.length < 3) return;
  
  ctx.save();
  
  // Add glow effect for visibility
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
  }
  
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  
  // Draw smooth closed path using cardinal spline for smoother curves
  ctx.beginPath();
  
  const points = contourPoints;
  const n = points.length;
  
  if (n < 4) {
    // Not enough points for smooth curve, use straight lines
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < n; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
  } else {
    // Use smooth curves through points
    // Start from first point
    ctx.moveTo(points[0].x, points[0].y);
    
    // Draw smooth curves through all points
    for (let i = 0; i < n; i++) {
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];
      
      // Calculate control points for smooth curve
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }
  
  ctx.closePath();
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Draw a fallback outline when contours aren't available
 * Uses an organic, elliptical shape that follows the bounding box more naturally
 * @param {CanvasRenderingContext2D} ctx - Canvas context  
 * @param {Object} boundingBox - Bounding box
 * @param {string} color - Stroke color
 * @param {number} lineWidth - Line width
 */
export function drawFallbackOutline(ctx, boundingBox, color, lineWidth = 2) {
  const { x, y, width, height } = boundingBox;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radiusX = width / 2;
  const radiusY = height / 2;
  
  ctx.save();
  
  // Add glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  
  // Draw an organic elliptical shape with slight irregularities
  // This creates a more natural "contour-like" appearance
  ctx.beginPath();
  
  const numPoints = 24; // More points for smoother curve
  const variance = 0.08; // Slight variance for organic feel
  
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    
    // Add slight variation to make it look more organic
    const varX = 1 + (Math.sin(angle * 3) * variance);
    const varY = 1 + (Math.cos(angle * 2) * variance);
    
    const px = centerX + radiusX * Math.cos(angle) * varX;
    const py = centerY + radiusY * Math.sin(angle) * varY;
    
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  
  ctx.closePath();
  ctx.stroke();
  
  ctx.restore();
}

/**
 * Draw a rounded rectangle path (polyfill for older browsers)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Width
 * @param {number} height - Height
 * @param {number} radius - Corner radius
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draw a minimal label above the detection (no box)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} label - Label text
 * @param {number} x - X position
 * @param {number} y - Y position (top of object)
 * @param {string} color - Text/background color
 */
export function drawMinimalLabel(ctx, label, x, y, color) {
  ctx.save();
  
  ctx.font = 'bold 12px Inter, sans-serif';
  const textWidth = ctx.measureText(label).width;
  
  // Small pill-shaped background
  const padding = 6;
  const height = 18;
  const labelY = Math.max(height + 4, y - 8);
  
  // Background pill using cross-browser compatible method
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  const radius = height / 2;
  drawRoundedRect(ctx, x - padding, labelY - height, textWidth + padding * 2, height, radius);
  ctx.fill();
  
  // Text
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, x, labelY - 5);
  
  ctx.restore();
}

export default {
  initOpenCV,
  isOpenCVReady,
  extractContours,
  drawContour,
  drawFallbackOutline,
  drawMinimalLabel
};
