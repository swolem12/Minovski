/**
 * YOLOv8 Detector using ONNX Runtime Web
 * Provides real-time object detection for drones, aircraft, and vehicles
 */

import * as ort from 'onnxruntime-web';

// YOLOv8 class names (COCO dataset - 80 classes)
const YOLO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
  'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
  'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator',
  'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
];

// Threat mappings for aerial/vehicle detection
const THREAT_MAPPINGS = {
  'airplane': { type: 'fixed-wing', threat: 'high', label: 'Fixed-Wing Aircraft' },
  'bird': { type: 'drone', threat: 'medium', label: 'Possible sUAS/Drone' },
  'kite': { type: 'drone', threat: 'high', label: 'Aerial Object' },
  'frisbee': { type: 'object', threat: 'low', label: 'Airborne Object' },
  'sports ball': { type: 'object', threat: 'low', label: 'Airborne Object' },
  'car': { type: 'vehicle', threat: 'low', label: 'Ground Vehicle' },
  'truck': { type: 'vehicle', threat: 'low', label: 'Truck' },
  'bus': { type: 'vehicle', threat: 'low', label: 'Bus' },
  'motorcycle': { type: 'vehicle', threat: 'low', label: 'Motorcycle' },
  'boat': { type: 'vehicle', threat: 'low', label: 'Watercraft' },
  'train': { type: 'vehicle', threat: 'low', label: 'Train' },
  'person': { type: 'person', threat: 'info', label: 'Person Detected' },
  'bicycle': { type: 'vehicle', threat: 'info', label: 'Bicycle' },
};

class YOLOv8Detector {
  constructor() {
    this.session = null;
    this.modelLoaded = false;
    this.inputSize = 640; // YOLOv8 default input size
    this.confidenceThreshold = 0.25;
    this.iouThreshold = 0.45;
  }

  /**
   * Load the YOLOv8 ONNX model
   * @param {string} modelPath - Path to the ONNX model file
   */
  async loadModel(modelPath = '/models/yolov8n.onnx') {
    try {
      console.log('Loading YOLOv8 model from:', modelPath);
      
      // First, verify the model file exists and is actually an ONNX file
      // This prevents ONNX Runtime from hanging when trying to parse HTML as a model
      const response = await fetch(modelPath, { method: 'HEAD' });
      
      if (!response.ok) {
        throw new Error(`Model file not found at ${modelPath} (status: ${response.status})`);
      }
      
      const contentType = response.headers.get('content-type');
      // Check for invalid content types that indicate the model wasn't found
      // ONNX models should have application/octet-stream or similar binary content-type
      const invalidTypes = ['text/html', 'text/plain', 'application/json', 'text/xml'];
      if (contentType && invalidTypes.some(type => contentType.includes(type))) {
        throw new Error(`Model file not found or invalid type (${contentType}). Expected ONNX model at ${modelPath}`);
      }
      
      // Configure ONNX Runtime Web - use local WASM files bundled with onnxruntime-web
      // The package includes WASM files that Vite will serve from node_modules
      
      // Try WebGL backend first for better performance, fallback to WASM
      const options = {
        executionProviders: ['webgl', 'wasm'],
        graphOptimizationLevel: 'all'
      };

      // For demo purposes, we'll use a small YOLOv8n model
      // In production, host the model file in /public/models/
      this.session = await ort.InferenceSession.create(modelPath, options);
      
      this.modelLoaded = true;
      console.log('YOLOv8 model loaded successfully');
      console.log('Input names:', this.session.inputNames);
      console.log('Output names:', this.session.outputNames);
      
      return true;
    } catch (error) {
      console.error('Error loading YOLOv8 model:', error);
      this.modelLoaded = false;
      throw error;
    }
  }

  /**
   * Preprocess image for YOLOv8 inference
   * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} source
   * @returns {ort.Tensor} Preprocessed image tensor
   */
  preprocessImage(source) {
    // Create canvas for preprocessing
    const canvas = document.createElement('canvas');
    canvas.width = this.inputSize;
    canvas.height = this.inputSize;
    const ctx = canvas.getContext('2d');

    // Get source dimensions
    const srcWidth = source.videoWidth || source.width;
    const srcHeight = source.videoHeight || source.height;

    // Calculate scaling to maintain aspect ratio
    const scale = Math.min(this.inputSize / srcWidth, this.inputSize / srcHeight);
    const scaledWidth = Math.round(srcWidth * scale);
    const scaledHeight = Math.round(srcHeight * scale);
    
    // Calculate padding
    const padX = (this.inputSize - scaledWidth) / 2;
    const padY = (this.inputSize - scaledHeight) / 2;

    // Fill with gray (letterbox)
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, this.inputSize, this.inputSize);

    // Draw scaled image
    ctx.drawImage(source, padX, padY, scaledWidth, scaledHeight);

    // Get image data
    const imageData = ctx.getImageData(0, 0, this.inputSize, this.inputSize);
    const pixels = imageData.data;

    // Convert to float32 tensor [1, 3, 640, 640] - CHW format, normalized to 0-1
    const red = new Float32Array(this.inputSize * this.inputSize);
    const green = new Float32Array(this.inputSize * this.inputSize);
    const blue = new Float32Array(this.inputSize * this.inputSize);

    for (let i = 0; i < pixels.length; i += 4) {
      const idx = i / 4;
      red[idx] = pixels[i] / 255.0;
      green[idx] = pixels[i + 1] / 255.0;
      blue[idx] = pixels[i + 2] / 255.0;
    }

    // Combine channels
    const inputData = new Float32Array([...red, ...green, ...blue]);
    
    // Create tensor
    const tensor = new ort.Tensor('float32', inputData, [1, 3, this.inputSize, this.inputSize]);

    return {
      tensor,
      scale,
      padX,
      padY,
      srcWidth,
      srcHeight
    };
  }

  /**
   * Run inference on an image/video frame
   * @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} source
   * @returns {Object[]} Array of detections
   */
  async detect(source) {
    if (!this.modelLoaded || !this.session) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    // Preprocess
    const { tensor, scale, padX, padY, srcWidth, srcHeight } = this.preprocessImage(source);

    try {
      // Run inference
      const feeds = { [this.session.inputNames[0]]: tensor };
      const results = await this.session.run(feeds);
      
      // Get output tensor
      const output = results[this.session.outputNames[0]];
      
      // Process detections
      const detections = this.postprocess(output, scale, padX, padY, srcWidth, srcHeight);

      return detections;
    } finally {
      // Clean up tensor - always dispose even if error occurs
      tensor.dispose();
    }
  }

  /**
   * Post-process YOLOv8 output
   * YOLOv8 output format: [1, 84, 8400] where 84 = 4 (bbox) + 80 (classes)
   */
  postprocess(output, scale, padX, padY, srcWidth, srcHeight) {
    const data = output.data;
    const [, , numBoxes] = output.dims; // batch and features not used
    
    const detections = [];

    // YOLOv8 output is transposed: [1, 84, 8400]
    // Each column is a detection: [x, y, w, h, class_scores...]
    for (let i = 0; i < numBoxes; i++) {
      // Get box coordinates
      const x = data[i];
      const y = data[numBoxes + i];
      const w = data[2 * numBoxes + i];
      const h = data[3 * numBoxes + i];

      // Find best class
      let maxScore = 0;
      let maxClassIdx = 0;
      for (let c = 0; c < 80; c++) {
        const score = data[(4 + c) * numBoxes + i];
        if (score > maxScore) {
          maxScore = score;
          maxClassIdx = c;
        }
      }

      // Filter by confidence
      if (maxScore < this.confidenceThreshold) continue;

      // Convert from center format to corner format and remove padding
      const x1 = (x - w / 2 - padX) / scale;
      const y1 = (y - h / 2 - padY) / scale;
      const x2 = (x + w / 2 - padX) / scale;
      const y2 = (y + h / 2 - padY) / scale;

      // Properly clamp coordinates to image bounds
      const clampedX1 = Math.max(0, Math.min(x1, srcWidth));
      const clampedY1 = Math.max(0, Math.min(y1, srcHeight));
      const clampedX2 = Math.max(0, Math.min(x2, srcWidth));
      const clampedY2 = Math.max(0, Math.min(y2, srcHeight));
      
      const boxX = clampedX1;
      const boxY = clampedY1;
      const boxW = clampedX2 - clampedX1;
      const boxH = clampedY2 - clampedY1;

      if (boxW <= 0 || boxH <= 0) continue;

      detections.push({
        bbox: [boxX, boxY, boxW, boxH],
        class: YOLO_CLASSES[maxClassIdx],
        score: maxScore,
        classIndex: maxClassIdx
      });
    }

    // Apply NMS
    return this.nms(detections);
  }

  /**
   * Non-Maximum Suppression
   */
  nms(detections) {
    // Sort by score descending
    detections.sort((a, b) => b.score - a.score);

    const selected = [];
    const active = new Array(detections.length).fill(true);

    for (let i = 0; i < detections.length; i++) {
      if (!active[i]) continue;
      
      selected.push(detections[i]);

      for (let j = i + 1; j < detections.length; j++) {
        if (!active[j]) continue;
        if (detections[i].class !== detections[j].class) continue;

        const iou = this.calculateIoU(detections[i].bbox, detections[j].bbox);
        if (iou > this.iouThreshold) {
          active[j] = false;
        }
      }
    }

    return selected;
  }

  /**
   * Calculate Intersection over Union
   */
  calculateIoU(box1, box2) {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;

    const intersectX = Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
    const intersectY = Math.max(0, Math.min(y1 + h1, y2 + h2) - Math.max(y1, y2));
    const intersection = intersectX * intersectY;

    const area1 = w1 * h1;
    const area2 = w2 * h2;
    const union = area1 + area2 - intersection;

    return intersection / union;
  }

  /**
   * Classify detections with threat levels
   * Note: This method is similar to objectClassifier.js but handles YOLOv8's
   * different output format (bbox array vs COCO-SSD's bbox property)
   */
  classifyDetections(detections) {
    return detections.map(det => {
      const className = det.class.toLowerCase();
      const mapping = THREAT_MAPPINGS[className] || {
        type: 'unknown',
        threat: 'info',
        label: det.class
      };

      return {
        ...det,
        classification: mapping,
        confidence: det.score,
        boundingBox: {
          x: det.bbox[0],
          y: det.bbox[1],
          width: det.bbox[2],
          height: det.bbox[3],
          centerX: det.bbox[0] + det.bbox[2] / 2,
          centerY: det.bbox[1] + det.bbox[3] / 2
        }
      };
    });
  }

  /**
   * Check if model is loaded
   */
  isLoaded() {
    return this.modelLoaded;
  }

  /**
   * Set confidence threshold
   */
  setConfidenceThreshold(threshold) {
    this.confidenceThreshold = threshold;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this.session) {
      this.session.release();
      this.session = null;
    }
    this.modelLoaded = false;
  }
}

// Export singleton instance and class
export const yolov8Detector = new YOLOv8Detector();
export { YOLOv8Detector, YOLO_CLASSES, THREAT_MAPPINGS };
export default yolov8Detector;
