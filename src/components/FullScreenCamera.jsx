import { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { animate } from 'animejs';
import FluidSimulation from '../utils/fluidSimulation';
import { classifyDetections as classifyCocoDetections, getOverallThreatLevel, getTypeColor, getThreatColor, isAerialThreat, formatConfidence, estimateHandPositions, drawCornerBrackets, TRACKABLE_TYPES } from '../utils/objectClassifier';
import { yolov8Detector } from '../utils/yolov8Detector';
import { demoDetector } from '../utils/demoDetector';
import audioAlert from '../utils/audioAlert';
import ChatPanel from './ChatPanel';
import WalkieTalkie from './WalkieTalkie';
import './FullScreenCamera.css';

const PREFERRED_MODEL = 'yolov8';

// Colors for threat-based highlighting
const THREAT_COLOR = 'rgba(255, 50, 50, 1)'; // Red for threats
const SAFE_COLOR = 'rgba(50, 255, 100, 1)'; // Green for non-threats

function FullScreenCamera({ onClose, onDetections, onThreatLevel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fluidCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const [model, setModel] = useState(null);
  const [modelType, setModelType] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Initializing systems...');
  const [error, setError] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [threatLevel, setThreatLevel] = useState('none');
  const [detections, setDetections] = useState([]);
  const fluidSimRef = useRef(null);
  const animationRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  
  // Communication panel state
  const [showCommPanel, setShowCommPanel] = useState(false);
  
  // Camera capabilities state
  const [cameraCapabilities, setCameraCapabilities] = useState({
    zoom: { min: 1, max: 1, step: 0.1, supported: false },
    torch: { supported: false, enabled: false },
    focusMode: { supported: false, modes: [] }
  });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [torchEnabled, setTorchEnabled] = useState(false);
  
  // Initialize detection model
  useEffect(() => {
    async function loadModel() {
      try {
        setIsLoading(true);
        
        if (PREFERRED_MODEL === 'yolov8') {
          try {
            setLoadingStatus('Loading YOLOv8 neural network...');
            const modelUrl = import.meta.env.BASE_URL + 'models/yolov8n.onnx';
            await yolov8Detector.loadModel(modelUrl);
            setModel(yolov8Detector);
            setModelType('yolov8');
            console.log('YOLOv8 model loaded via ONNX Runtime Web');
            setIsLoading(false);
            return;
          } catch (yoloError) {
            console.warn('YOLOv8 loading failed, falling back to COCO-SSD:', yoloError);
            setLoadingStatus('Switching to COCO-SSD model...');
          }
        }
        
        // Try COCO-SSD
        try {
          setLoadingStatus('Initializing TensorFlow.js...');
          await tf.ready();
          
          const loadedModel = await cocoSsd.load({
            base: 'lite_mobilenet_v2'
          });
          
          setModel(loadedModel);
          setModelType('coco-ssd');
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
        setIsLoading(false);
        
      } catch (err) {
        console.error('Error loading model:', err);
        setError('Failed to load detection model');
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
  
  // Request camera and start tracking immediately
  const startCamera = useCallback(async () => {
    audioAlert.init();
    
    try {
      setError(null);
      
      // Advanced camera constraints for better capabilities
      const constraints = {
        video: {
          facingMode: 'environment',
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
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
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
        
        if (containerRef.current) {
          animate(containerRef.current, {
            opacity: [0, 1],
            duration: 400,
            ease: 'outQuad'
          });
        }
      }
    } catch (err) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Please enable camera permissions.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError('Unable to access camera.');
      }
    }
  }, []);
  
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
  
  // Auto-start camera when model is loaded - use requestAnimationFrame to avoid synchronous setState
  useEffect(() => {
    if (!isLoading && model && !cameraActive && !error) {
      // Defer the state update to avoid calling setState synchronously in effect
      requestAnimationFrame(() => {
        startCamera();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, model, cameraActive, error]);
  
  // Stop camera
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
    
    streamRef.current = null;
    trackRef.current = null;
    setTorchEnabled(false);
    setZoomLevel(1);
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, []);
  
  // Detection loop
  useEffect(() => {
    if (!model || !cameraActive) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    let lastAlertTime = 0;
    const ALERT_COOLDOWN = 3000;
    
    async function detect() {
      if (!video || video.paused || video.ended) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }
      
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
        let classifiedDetections;
        
        if (modelType === 'yolov8') {
          const predictions = await model.detect(video);
          classifiedDetections = model.classifyDetections(predictions);
        } else if (modelType === 'demo') {
          // Demo detector for demonstration
          const predictions = model.detect(video);
          classifiedDetections = model.classifyDetections(predictions);
        } else {
          const predictions = await model.detect(video);
          classifiedDetections = classifyCocoDetections(predictions);
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (const detection of classifiedDetections) {
          const { boundingBox, classification, confidence } = detection;
          
          // Determine if this is a threat (aerial threat types are threats)
          const isThreat = isAerialThreat(detection);
          
          // Choose color based on threat status: red for threats, green for non-threats
          const strokeColor = isThreat ? THREAT_COLOR : SAFE_COLOR;
          
          // Draw only the outline around the object (no fill)
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          ctx.strokeRect(
            boundingBox.x,
            boundingBox.y,
            boundingBox.width,
            boundingBox.height
          );
          
          // Draw tactical corner brackets for better object outline visibility
          drawCornerBrackets(ctx, boundingBox, strokeColor, 4);
          
          // Draw label with altitude info for aerial threats
          const altitudeLabel = detection.altitude ? ` [${detection.altitude.label}]` : '';
          const label = `${classification.label.toUpperCase()} ${formatConfidence(confidence)}${isThreat ? altitudeLabel : ''}`;
          ctx.font = 'bold 12px Inter, sans-serif';
          const textWidth = ctx.measureText(label).width;
          
          ctx.fillStyle = isThreat ? 'rgba(255, 50, 50, 0.9)' : 'rgba(50, 255, 100, 0.9)';
          ctx.fillRect(
            boundingBox.x,
            boundingBox.y - 22,
            textWidth + 12,
            20
          );
          
          ctx.fillStyle = '#ffffff';
          ctx.fillText(
            label,
            boundingBox.x + 6,
            boundingBox.y - 7
          );
          
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
        
        fluidSimRef.current?.render();
        
        const currentThreatLevel = getOverallThreatLevel(classifiedDetections);
        
        if (currentThreatLevel !== 'none' && currentThreatLevel !== 'info') {
          const now = Date.now();
          if (now - lastAlertTime > ALERT_COOLDOWN) {
            audioAlert.alert(currentThreatLevel);
            lastAlertTime = now;
          }
        }
        
        setDetections(classifiedDetections);
        setThreatLevel(currentThreatLevel);
        onDetections?.(classifiedDetections);
        onThreatLevel?.(currentThreatLevel);
        
      } catch (err) {
        console.error('Detection error:', err);
      }
      
      animationRef.current = requestAnimationFrame(detect);
    }
    
    detect();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [model, modelType, cameraActive, onDetections, onThreatLevel]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);
  
  const handleClose = () => {
    stopCamera();
    onClose();
  };
  
  const getThreatLabel = (level) => {
    const labels = {
      none: 'ALL CLEAR',
      info: 'MONITORING',
      low: 'LOW THREAT',
      medium: 'CAUTION',
      high: 'HIGH THREAT',
      critical: 'CRITICAL'
    };
    return labels[level] || 'UNKNOWN';
  };
  
  const activeThreats = detections.filter(isAerialThreat);

  return (
    <div className="fullscreen-camera" ref={containerRef}>
      {/* Header */}
      <header className="fs-header">
        <div className="fs-header-left">
          <div className="fs-logo">
            <span className="fs-logo-icon">◆</span>
            <span className="fs-logo-text">MINOVSKI</span>
          </div>
          <div className="fs-mode-badge">
            <span className="fs-mode-dot"></span>
            <span>FULL SCAN MODE</span>
          </div>
        </div>
        
        <div className="fs-header-center">
          <div className={`fs-threat-indicator threat-${threatLevel}`}>
            <span className="fs-threat-dot"></span>
            <span className="fs-threat-text">{getThreatLabel(threatLevel)}</span>
          </div>
        </div>
        
        <div className="fs-header-right">
          <div className="fs-stats">
            <div className="fs-stat">
              <span className="fs-stat-value">{detections.length}</span>
              <span className="fs-stat-label">OBJECTS</span>
            </div>
            <div className="fs-stat">
              <span className="fs-stat-value">{activeThreats.length}</span>
              <span className="fs-stat-label">THREATS</span>
            </div>
          </div>
          <button className="fs-btn-close" onClick={handleClose}>
            <span>×</span>
            <span>EXIT</span>
          </button>
        </div>
      </header>
      
      {/* Main content */}
      <main className="fs-main">
        {isLoading && (
          <div className="fs-loading">
            <div className="fs-loader"></div>
            <p className="fs-loading-text">{loadingStatus}</p>
            <div className="fs-loading-progress">
              <div className="fs-loading-bar"></div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="fs-error">
            <div className="fs-error-icon">!</div>
            <p>{error}</p>
            <button onClick={() => setError(null)}>DISMISS</button>
          </div>
        )}
        
        <div className="fs-video-container">
          <video
            ref={videoRef}
            playsInline
            muted
            className="fs-video"
          />
          <canvas ref={canvasRef} className="fs-detection-canvas" />
          <canvas ref={fluidCanvasRef} className="fs-fluid-canvas" />
          
          {/* Tactical overlay */}
          <div className="fs-tactical-overlay">
            <div className="fs-corner fs-corner-tl"></div>
            <div className="fs-corner fs-corner-tr"></div>
            <div className="fs-corner fs-corner-bl"></div>
            <div className="fs-corner fs-corner-br"></div>
            <div className="fs-crosshair"></div>
          </div>
          
          {/* HUD elements */}
          <div className="fs-hud">
            <div className="fs-hud-timestamp">
              {new Date().toLocaleTimeString('en-US', { hour12: false })}
            </div>
            <div className="fs-hud-model">
              {modelType === 'yolov8' ? 'YOLOV8 ONNX' : modelType === 'demo' ? 'DEMO MODE' : 'COCO-SSD'} ACTIVE
            </div>
          </div>
          
          {/* Camera controls */}
          {cameraActive && (cameraCapabilities.zoom.supported || cameraCapabilities.torch.supported) && (
            <div className="fs-camera-controls">
              {cameraCapabilities.zoom.supported && (
                <div className="fs-zoom-control">
                  <span className="fs-control-label">ZOOM</span>
                  <input
                    type="range"
                    min={cameraCapabilities.zoom.min}
                    max={cameraCapabilities.zoom.max}
                    step={cameraCapabilities.zoom.step}
                    value={zoomLevel}
                    onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                    className="fs-zoom-slider"
                  />
                  <span className="fs-zoom-value">{zoomLevel.toFixed(1)}x</span>
                </div>
              )}
              
              {cameraCapabilities.torch.supported && (
                <button 
                  className={`fs-btn-torch ${torchEnabled ? 'active' : ''}`}
                  onClick={toggleTorch}
                  title="Toggle flashlight for low-light conditions"
                >
                  <span className="fs-torch-icon">{torchEnabled ? '◉' : '○'}</span>
                  <span>NIGHT VISION</span>
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* Side panel */}
        <aside className="fs-sidebar">
          <div className="fs-panel">
            <h3 className="fs-panel-title">THREAT STATUS</h3>
            <div className={`fs-threat-status threat-${threatLevel}`}>
              <div className="fs-threat-level-display">
                <span className="fs-threat-level-icon"></span>
                <span className="fs-threat-level-text">{getThreatLabel(threatLevel)}</span>
              </div>
            </div>
          </div>
          
          <div className="fs-panel">
            <h3 className="fs-panel-title">ACTIVE DETECTIONS</h3>
            {detections.length === 0 ? (
              <p className="fs-no-detections">No objects detected</p>
            ) : (
              <ul className="fs-detection-list">
                {detections.slice(0, 8).map((detection, index) => (
                  <li key={index} className="fs-detection-item">
                    <span 
                      className="fs-detection-dot"
                      style={{ backgroundColor: getTypeColor(detection.classification.type) }}
                    ></span>
                    <span className="fs-detection-label">{detection.classification.label}</span>
                    <span className="fs-detection-confidence">
                      {formatConfidence(detection.confidence)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          {activeThreats.length > 0 && (
            <div className="fs-panel fs-panel-alert">
              <h3 className="fs-panel-title">! THREAT ALERT</h3>
              <ul className="fs-threat-list">
                {activeThreats.map((threat, index) => (
                  <li key={index} className="fs-threat-item">
                    <span 
                      className="fs-threat-type-dot"
                      style={{ backgroundColor: getThreatColor(threat.classification.threat) }}
                    ></span>
                    <span className="fs-threat-type-label">{threat.classification.label}</span>
                    <span 
                      className="fs-threat-type-level"
                      style={{ color: getThreatColor(threat.classification.threat) }}
                    >
                      {threat.classification.threat.toUpperCase()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </main>
      
      {/* Communication Panel (Chat + Walkie-Talkie) - Slide out from right */}
      <div className={`fs-comm-panel ${showCommPanel ? 'visible' : ''}`}>
        <div className="fs-comm-header">
          <span className="fs-comm-title">📡 COMMS</span>
          <button className="fs-comm-close" onClick={() => setShowCommPanel(false)}>×</button>
        </div>
        <div className="fs-comm-content">
          <WalkieTalkie />
          <ChatPanel />
        </div>
      </div>
      
      {/* Footer */}
      <footer className="fs-footer">
        <div className="fs-footer-left">
          <span className="fs-recording-indicator"></span>
          <span>OPTICAL TRACKING ACTIVE</span>
        </div>
        <div className="fs-footer-center">
          <button 
            className={`fs-btn-comm ${showCommPanel ? 'active' : ''}`}
            onClick={() => setShowCommPanel(!showCommPanel)}
          >
            <span className="fs-comm-icon">💬</span>
            <span>COMMS</span>
          </button>
        </div>
        <div className="fs-footer-right">
          {cameraActive && <span className="fs-camera-active">● CAMERA ONLINE</span>}
        </div>
      </footer>
    </div>
  );
}

export default FullScreenCamera;
