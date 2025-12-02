import { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { animate } from 'animejs';
import FluidSimulation from '../utils/fluidSimulation';
import { classifyDetections as classifyCocoDetections, getOverallThreatLevel, isAerialThreat, estimateHandPositions, TRACKABLE_TYPES } from '../utils/objectClassifier';
import { yolov8Detector } from '../utils/yolov8Detector';
import { demoDetector } from '../utils/demoDetector';
import { initOpenCV, isOpenCVReady, extractContours, drawContour, drawFallbackOutline, drawMinimalLabel } from '../utils/contourDetector';
import audioAlert from '../utils/audioAlert';
import './CameraView.css';

// Model type: 'yolov8' or 'coco-ssd'
const PREFERRED_MODEL = 'yolov8';

// Colors for threat-based highlighting
const THREAT_COLOR = 'rgba(255, 50, 50, 1)'; // Red for threats
const SAFE_COLOR = 'rgba(50, 255, 100, 1)'; // Green for non-threats

// Error handling constants
const MAX_MODEL_ERRORS_BEFORE_FALLBACK = 3;
const RETRY_PAUSE_MS = 1000;

function CameraView({ onDetections, onThreatLevel, onCameraStream, isActive = true }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fluidCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const [model, setModel] = useState(null);
  const [modelType, setModelType] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Initializing...');
  const [error, setError] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('prompt'); // 'prompt', 'granted', 'denied'
  const fluidSimRef = useRef(null);
  const animationRef = useRef(null);
  const lastDetectionsRef = useRef([]);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  
  // Error handling refs for model inference failures
  const consecutiveErrorsRef = useRef(0);
  const lastErrorTimeRef = useRef(0);
  
  // Camera capabilities state
  const [cameraCapabilities, setCameraCapabilities] = useState({
    zoom: { min: 1, max: 1, step: 0.1, supported: false },
    torch: { supported: false, enabled: false },
    focusMode: { supported: false, modes: [] }
  });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [torchEnabled, setTorchEnabled] = useState(false);
  
  // Initialize detection model (YOLOv8 preferred, COCO-SSD fallback, Demo fallback)
  useEffect(() => {
    async function loadModel() {
      try {
        setIsLoading(true);
        
        // Initialize OpenCV for contour detection (start early, await later)
        setLoadingStatus('Initializing contour detection...');
        const openCVPromise = initOpenCV().catch(err => {
          console.warn('OpenCV initialization failed, will use fallback outlines:', err);
        });
        
        if (PREFERRED_MODEL === 'yolov8') {
          // Try loading YOLOv8 via ONNX Runtime Web
          try {
            setLoadingStatus('Loading YOLOv8 model via ONNX Runtime...');
            
            // For demo, we'll use a public YOLOv8n model
            // In production, host your own model in /public/models/
            const modelUrl = import.meta.env.BASE_URL + 'models/yolov8n.onnx';
            
            await yolov8Detector.loadModel(modelUrl);
            setModel(yolov8Detector);
            setModelType('yolov8');
            console.log('YOLOv8 model loaded via ONNX Runtime Web');
            
            // Wait for OpenCV to be ready before completing
            setLoadingStatus('Finalizing contour detection...');
            await openCVPromise;
            
            setIsLoading(false);
            return;
          } catch (yoloError) {
            console.warn('YOLOv8 loading failed, falling back to COCO-SSD:', yoloError);
            setLoadingStatus('YOLOv8 unavailable, loading COCO-SSD...');
          }
        }
        
        // Try COCO-SSD fallback
        try {
          setLoadingStatus('Loading TensorFlow.js COCO-SSD model...');
          await tf.ready();
          console.log('TensorFlow.js ready, backend:', tf.getBackend());
          
          const loadedModel = await cocoSsd.load({
            base: 'lite_mobilenet_v2' // Lighter model for mobile
          });
          
          setModel(loadedModel);
          setModelType('coco-ssd');
          console.log('COCO-SSD model loaded');
          
          // Wait for OpenCV to be ready before completing
          setLoadingStatus('Finalizing contour detection...');
          await openCVPromise;
          
          setIsLoading(false);
          return;
        } catch (cocoError) {
          console.warn('COCO-SSD loading failed, falling back to demo mode:', cocoError);
          setLoadingStatus('Using demo detection mode...');
        }
        
        // Final fallback to demo detector
        console.log('Using demo detector for demonstration purposes');
        await demoDetector.load();
        setModel(demoDetector);
        setModelType('demo');
        
        // Wait for OpenCV to be ready before completing
        setLoadingStatus('Finalizing contour detection...');
        await openCVPromise;
        
        setIsLoading(false);
        
      } catch (err) {
        console.error('Error loading model:', err);
        setError('Failed to load detection model. Please refresh.');
        setIsLoading(false);
      }
    }
    
    loadModel();
  }, []);
  
  // Initialize fluid simulation
  useEffect(() => {
    if (fluidCanvasRef.current) {
      fluidSimRef.current = new FluidSimulation(fluidCanvasRef.current);
    }
    
    return () => {
      if (fluidSimRef.current) {
        fluidSimRef.current.dispose();
      }
    };
  }, []);
  
  // Check camera permission status
  useEffect(() => {
    async function checkPermission() {
      try {
        if (navigator.permissions) {
          const result = await navigator.permissions.query({ name: 'camera' });
          setPermissionStatus(result.state);
          result.addEventListener('change', () => {
            setPermissionStatus(result.state);
          });
        }
      } catch {
        // Permission API not supported, will request on button click
        setPermissionStatus('prompt');
      }
    }
    checkPermission();
  }, []);
  
  // Request camera permission and start tracking
  const requestCameraPermission = useCallback(async () => {
    // Initialize audio on user interaction
    audioAlert.init();
    
    try {
      setError(null);
      
      // Stop any existing stream first to prevent NotReadableError/TrackStartError
      if (streamRef.current) {
        console.log('Stopping existing camera stream before starting new one');
        const tracks = streamRef.current.getTracks();
        tracks.forEach(track => track.stop());
        streamRef.current = null;
        trackRef.current = null;
      }
      
      // Advanced camera constraints for better capabilities
      const constraints = {
        video: {
          facingMode: 'environment', // Rear camera preferred
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // Request advanced features if available
          advanced: [
            { zoom: true },
            { torch: true },
            { focusMode: 'continuous' }
          ]
        },
        audio: false
      };
      
      // This will trigger the permission dialog with retry logic
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // Retry with relaxed constraints on OverconstrainedError
        if (err.name === 'OverconstrainedError') {
          console.warn('Camera constraints failed, retrying with relaxed settings');
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw err;
        }
      }
      
      streamRef.current = stream;
      
      setPermissionStatus('granted');
      
      // Get video track and its capabilities
      const videoTrack = stream.getVideoTracks()[0];
      trackRef.current = videoTrack;
      
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities ? videoTrack.getCapabilities() : {};
        const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
        
        // Check for zoom capability
        const zoomSupported = capabilities.zoom !== undefined;
        const zoomMin = capabilities.zoom?.min || 1;
        const zoomMax = capabilities.zoom?.max || 1;
        const zoomStep = capabilities.zoom?.step || 0.1;
        
        // Check for torch (flashlight) capability for night vision
        const torchSupported = capabilities.torch !== undefined;
        
        // Check for focus modes
        const focusModes = capabilities.focusMode || [];
        
        setCameraCapabilities({
          zoom: { 
            min: zoomMin, 
            max: zoomMax, 
            step: zoomStep, 
            supported: zoomSupported && zoomMax > 1 
          },
          torch: { 
            supported: torchSupported, 
            enabled: settings.torch || false 
          },
          focusMode: { 
            supported: focusModes.length > 0, 
            modes: focusModes 
          }
        });
        
        // Set initial zoom level
        if (settings.zoom) {
          setZoomLevel(settings.zoom);
        }
        
        // Enable continuous focus if supported
        if (focusModes.includes('continuous')) {
          try {
            await videoTrack.applyConstraints({ focusMode: 'continuous' });
          } catch (e) {
            console.warn('Could not set continuous focus:', e);
          }
        }
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        
        // Notify parent of camera stream availability
        onCameraStream?.(stream);
        
        // Animate camera activation
        if (containerRef.current) {
          animate(containerRef.current, {
            opacity: [0, 1],
            scale: [0.95, 1],
            duration: 500,
            ease: 'outQuad'
          });
        }
      }
    } catch (err) {
      console.error('Camera permission error:', err);
      if (err.name === 'NotAllowedError') {
        setPermissionStatus('denied');
        setError('Camera permission denied. Please enable camera access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Camera is in use by another application. Please close other apps and try again.');
      } else if (err.name === 'OverconstrainedError') {
        setError('Camera does not support the requested settings. Please try a different device.');
      } else {
        setError('Unable to access camera. Please try again.');
      }
    }
  }, [onCameraStream]);
  
  // Handle zoom change
  const handleZoomChange = useCallback(async (newZoom) => {
    if (!trackRef.current || !cameraCapabilities.zoom.supported) return;
    
    const clampedZoom = Math.max(
      cameraCapabilities.zoom.min,
      Math.min(cameraCapabilities.zoom.max, newZoom)
    );
    
    try {
      await trackRef.current.applyConstraints({ advanced: [{ zoom: clampedZoom }] });
      setZoomLevel(clampedZoom);
    } catch (err) {
      console.warn('Could not set zoom:', err);
    }
  }, [cameraCapabilities.zoom]);
  
  // Toggle torch (flashlight) for night vision
  const toggleTorch = useCallback(async () => {
    if (!trackRef.current || !cameraCapabilities.torch.supported) return;
    
    const newTorchState = !torchEnabled;
    
    try {
      await trackRef.current.applyConstraints({ advanced: [{ torch: newTorchState }] });
      setTorchEnabled(newTorchState);
    } catch (err) {
      console.warn('Could not toggle torch:', err);
    }
  }, [cameraCapabilities.torch.supported, torchEnabled]);
  
  // Stop camera
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
    
    // Notify parent that camera stream is no longer available
    onCameraStream?.(null);
    
    streamRef.current = null;
    trackRef.current = null;
    setTorchEnabled(false);
    setZoomLevel(1);
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, [onCameraStream]);
  
  // Detection loop
  useEffect(() => {
    if (!model || !cameraActive || !isActive) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    let lastAlertTime = 0;
    const ALERT_COOLDOWN = 3000; // 3 seconds between alerts
    
    async function detect() {
      if (!video || video.paused || video.ended) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }
      
      // Match canvas size to video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        if (fluidCanvasRef.current) {
          fluidCanvasRef.current.width = video.videoWidth;
          fluidCanvasRef.current.height = video.videoHeight;
          fluidSimRef.current?.resize(video.videoWidth, video.videoHeight);
        }
      }
      
      try {
        // Run detection based on model type
        let classifiedDetections;
        
        // Wrap model inference in try-catch with fallback mechanism
        try {
          if (modelType === 'yolov8') {
            // YOLOv8 via ONNX Runtime Web
            const predictions = await model.detect(video);
            classifiedDetections = model.classifyDetections(predictions);
          } else if (modelType === 'demo') {
            // Demo detector for demonstration
            const predictions = model.detect(video);
            classifiedDetections = model.classifyDetections(predictions);
          } else {
            // COCO-SSD via TensorFlow.js
            const predictions = await model.detect(video);
            classifiedDetections = classifyCocoDetections(predictions);
          }
          
          // Reset error counter on successful inference
          consecutiveErrorsRef.current = 0;
          
        } catch (inferenceError) {
          console.error('Model inference error:', inferenceError);
          consecutiveErrorsRef.current++;
          
          // Check if we should fallback to demo detector
          if (consecutiveErrorsRef.current >= MAX_MODEL_ERRORS_BEFORE_FALLBACK && modelType !== 'demo') {
            console.warn(`${MAX_MODEL_ERRORS_BEFORE_FALLBACK} consecutive errors detected, falling back to demo detector`);
            try {
              await demoDetector.load();
              setModel(demoDetector);
              setModelType('demo');
              consecutiveErrorsRef.current = 0;
            } catch (demoError) {
              console.error('Failed to load demo detector:', demoError);
              // Stop camera and show error
              stopCamera();
              setError('Detection model failed. Please refresh the page.');
              return;
            }
          }
          
          // Pause briefly before retrying to avoid tight loops
          await new Promise(resolve => setTimeout(resolve, RETRY_PAUSE_MS));
          animationRef.current = requestAnimationFrame(detect);
          return;
        }
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw contour outlines instead of bounding boxes
        for (const detection of classifiedDetections) {
          const { boundingBox, classification, confidence } = detection;
          
          // Determine if this is a threat (aerial threat types are threats)
          const isThreat = isAerialThreat(detection);
          
          // Choose color based on threat status: red for threats, green for non-threats
          const strokeColor = isThreat ? THREAT_COLOR : SAFE_COLOR;
          
          // Try to extract and draw contour outline using OpenCV
          if (isOpenCVReady()) {
            const contourPoints = extractContours(video, boundingBox, 40);
            if (contourPoints.length > 2) {
              // Draw the actual shape contour
              drawContour(ctx, contourPoints, strokeColor, 3, true);
            } else {
              // Fallback to stylized outline
              drawFallbackOutline(ctx, boundingBox, strokeColor, 3);
            }
          } else {
            // OpenCV not ready, use stylized fallback
            drawFallbackOutline(ctx, boundingBox, strokeColor, 3);
          }
          
          // Draw minimal label (small, non-intrusive)
          const altitudeLabel = detection.altitude ? ` ${detection.altitude.label}` : '';
          const label = `${classification.label} ${Math.round(confidence * 100)}%${isThreat ? altitudeLabel : ''}`;
          drawMinimalLabel(ctx, label, boundingBox.x, boundingBox.y, strokeColor);
          
          // Add fluid trail for trackable detections (motion tracking)
          if (TRACKABLE_TYPES.includes(classification.type)) {
            const normalizedX = boundingBox.centerX / canvas.width;
            const normalizedY = boundingBox.centerY / canvas.height;
            // Create unique object ID for trajectory tracking
            const objectId = `${classification.type}_${Math.round(boundingBox.x)}_${Math.round(boundingBox.y)}`;
            // Pass threat status to fluid simulation for color
            fluidSimRef.current?.addTrailPoint(normalizedX, normalizedY, classification.type, objectId, isThreat);
            
            // For person detections, also track estimated hand positions for movement tracking
            if (classification.type === 'person') {
              const handPositions = estimateHandPositions(boundingBox, canvas.width, canvas.height);
              fluidSimRef.current?.addTrailPoint(handPositions.leftHand.x, handPositions.leftHand.y, 'hand', `${objectId}_left_hand`, isThreat);
              fluidSimRef.current?.addTrailPoint(handPositions.rightHand.x, handPositions.rightHand.y, 'hand', `${objectId}_right_hand`, isThreat);
            }
          }
        }
        
        // Render fluid trails
        fluidSimRef.current?.render();
        
        // Calculate threat level
        const threatLevel = getOverallThreatLevel(classifiedDetections);
        
        // Trigger alerts for threats
        if (threatLevel !== 'none' && threatLevel !== 'info') {
          const now = Date.now();
          if (now - lastAlertTime > ALERT_COOLDOWN) {
            audioAlert.alert(threatLevel);
            lastAlertTime = now;
          }
        }
        
        // Notify parent components
        onDetections?.(classifiedDetections);
        onThreatLevel?.(threatLevel);
        
        lastDetectionsRef.current = classifiedDetections;
        
      } catch (err) {
        console.error('Detection error:', err);
        // On unexpected detection-loop errors, stop camera and set error
        consecutiveErrorsRef.current++;
        if (consecutiveErrorsRef.current >= MAX_MODEL_ERRORS_BEFORE_FALLBACK) {
          console.error('Too many detection errors, stopping camera');
          stopCamera();
          setError('Detection failed. Please refresh the page and try again.');
          return;
        }
        // Pause briefly before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_PAUSE_MS));
      }
      
      animationRef.current = requestAnimationFrame(detect);
    }
    
    detect();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [model, modelType, cameraActive, isActive, onDetections, onThreatLevel]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div 
      className="camera-view" 
      ref={containerRef}
    >
      {isLoading && !cameraActive && (
        <div className="loading-overlay">
          <div className="loader"></div>
          <p>{loadingStatus}</p>
        </div>
      )}
      
      {error && (
        <div className="error-overlay">
          <div className="error-icon">!</div>
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      
      {!cameraActive && !isLoading && !error && (
        <div className="permission-overlay">
          <div className="permission-content">
            <div className="permission-icon">◎</div>
            <h2>Start Threat Detection</h2>
            <p>
              MINOVSKI needs access to your camera to detect and track aerial threats.
              Point your device at the sky to begin scanning.
            </p>
            {permissionStatus === 'denied' && (
              <p className="permission-denied-hint">
                Camera access was denied. Please enable it in your browser settings.
              </p>
            )}
            <button 
              className="btn-start-tracking"
              onClick={requestCameraPermission}
            >
              <span className="btn-icon">▶</span>
              <span className="btn-text">Start Tracking</span>
              <span className="btn-subtitle">Requires Camera Permission</span>
            </button>
          </div>
        </div>
      )}
      
      <div className="video-container">
        <video
          ref={videoRef}
          playsInline
          muted
          className="camera-feed"
        />
        <canvas
          ref={canvasRef}
          className="detection-overlay"
        />
        <canvas
          ref={fluidCanvasRef}
          className="fluid-overlay"
        />
      </div>
      
      {cameraActive && (
        <div className="camera-controls">
          <div className="tracking-status">
            <span className="tracking-indicator"></span>
            <span>Tracking Active</span>
            <span className={`model-badge ${modelType}`}>
              {modelType === 'yolov8' ? 'YOLOv8 ONNX' : modelType === 'demo' ? 'DEMO MODE' : 'COCO-SSD'}
            </span>
          </div>
          
          {/* Camera capability controls */}
          <div className="camera-capabilities">
            {/* Zoom control */}
            {cameraCapabilities.zoom.supported && (
              <div className="zoom-control">
                <span className="control-label">Zoom</span>
                <input
                  type="range"
                  min={cameraCapabilities.zoom.min}
                  max={cameraCapabilities.zoom.max}
                  step={cameraCapabilities.zoom.step}
                  value={zoomLevel}
                  onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                  className="zoom-slider"
                />
                <span className="zoom-value">{zoomLevel.toFixed(1)}x</span>
              </div>
            )}
            
            {/* Torch/Night vision control */}
            {cameraCapabilities.torch.supported && (
              <button 
                className={`btn-torch ${torchEnabled ? 'active' : ''}`}
                onClick={toggleTorch}
                title="Toggle flashlight for low-light conditions"
              >
                <span className="torch-icon">{torchEnabled ? '◉' : '○'}</span>
                <span>Night Vision</span>
              </button>
            )}
          </div>
          
          <button 
            className="btn-stop-camera"
            onClick={stopCamera}
          >
            <span className="icon">⏹</span>
            Stop Tracking
          </button>
        </div>
      )}
    </div>
  );
}

export default CameraView;
