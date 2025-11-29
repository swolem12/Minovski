import { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { animate } from 'animejs';
import FluidSimulation from '../utils/fluidSimulation';
import { classifyDetections, getOverallThreatLevel, getTypeColor } from '../utils/objectClassifier';
import audioAlert from '../utils/audioAlert';
import './CameraView.css';

function CameraView({ onDetections, onThreatLevel, isActive = true }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fluidCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const [model, setModel] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('prompt'); // 'prompt', 'granted', 'denied'
  const fluidSimRef = useRef(null);
  const animationRef = useRef(null);
  const lastDetectionsRef = useRef([]);
  
  // Initialize TensorFlow.js and load model
  useEffect(() => {
    async function loadModel() {
      try {
        setIsLoading(true);
        await tf.ready();
        console.log('TensorFlow.js ready, backend:', tf.getBackend());
        
        const loadedModel = await cocoSsd.load({
          base: 'lite_mobilenet_v2' // Lighter model for mobile
        });
        
        setModel(loadedModel);
        console.log('COCO-SSD model loaded');
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
      
      const constraints = {
        video: {
          facingMode: 'environment', // Rear camera preferred
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      
      // This will trigger the permission dialog
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      setPermissionStatus('granted');
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        
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
      } else {
        setError('Unable to access camera. Please try again.');
      }
    }
  }, []);
  
  // Stop camera
  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, []);
  
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
        // Run detection
        const predictions = await model.detect(video);
        const classifiedDetections = classifyDetections(predictions);
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw detection boxes and update fluid trails
        for (const detection of classifiedDetections) {
          const { boundingBox, classification, confidence } = detection;
          const color = getTypeColor(classification.type);
          
          // Draw bounding box
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(
            boundingBox.x,
            boundingBox.y,
            boundingBox.width,
            boundingBox.height
          );
          
          // Draw label background
          const label = `${classification.label} ${Math.round(confidence * 100)}%`;
          ctx.font = '16px Inter, sans-serif';
          const textWidth = ctx.measureText(label).width;
          
          ctx.fillStyle = color;
          ctx.fillRect(
            boundingBox.x,
            boundingBox.y - 25,
            textWidth + 10,
            25
          );
          
          // Draw label text
          ctx.fillStyle = '#ffffff';
          ctx.fillText(
            label,
            boundingBox.x + 5,
            boundingBox.y - 7
          );
          
          // Add fluid trail for drone-like detections
          if (['drone', 'quadcopter', 'fixed-wing', 'helicopter'].includes(classification.type)) {
            const normalizedX = boundingBox.centerX / canvas.width;
            const normalizedY = boundingBox.centerY / canvas.height;
            fluidSimRef.current?.addTrailPoint(normalizedX, normalizedY, classification.type);
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
      }
      
      animationRef.current = requestAnimationFrame(detect);
    }
    
    detect();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [model, cameraActive, isActive, onDetections, onThreatLevel]);
  
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
          <p>Loading AI Detection Model...</p>
        </div>
      )}
      
      {error && (
        <div className="error-overlay">
          <div className="error-icon">⚠️</div>
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      
      {!cameraActive && !isLoading && !error && (
        <div className="permission-overlay">
          <div className="permission-content">
            <div className="permission-icon">🎯</div>
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
              <span className="btn-icon">📡</span>
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
