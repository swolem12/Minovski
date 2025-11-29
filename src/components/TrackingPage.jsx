import { useState, useEffect, useRef, useCallback } from 'react';
import { animate, utils } from 'animejs';
import CameraView from './CameraView';
import ThreatDisplay from './ThreatDisplay';
import NetworkPanel from './NetworkPanel';
import ChatPanel from './ChatPanel';
import WalkieTalkie from './WalkieTalkie';
import FullScreenCamera from './FullScreenCamera';
import peerNetwork from '../utils/peerNetwork';
import audioAlert from '../utils/audioAlert';
import { getOverallThreatLevel, isAerialThreat, AERIAL_THREAT_TYPES } from '../utils/objectClassifier';
import './TrackingPage.css';

function TrackingPage({ onBackToHome }) {
  const [detections, setDetections] = useState([]);
  const [threatLevel, setThreatLevel] = useState('none');
  const [remoteDetections, setRemoteDetections] = useState([]);
  const [isActive] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeViewDevice, setActiveViewDevice] = useState(null);
  const [isGridView, setIsGridView] = useState(false);
  const [remoteVideoStream, setRemoteVideoStream] = useState(null);
  const [isLoadingRemoteVideo, setIsLoadingRemoteVideo] = useState(false);
  const [remoteVideoError, setRemoteVideoError] = useState(null);
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localCameraStreamRef = useRef(null);
  
  // Animate page load
  useEffect(() => {
    if (headerRef.current) {
      animate(headerRef.current, {
        opacity: [0, 1],
        translateY: [-30, 0],
        duration: 800,
        ease: 'outQuad'
      });
    }
    
    animate('.tracking-main > *', {
      opacity: [0, 1],
      translateY: [20, 0],
      delay: utils.stagger(100, { start: 300 }),
      duration: 600,
      ease: 'outQuad'
    });
  }, []);
  
  // Handle local detections
  const handleDetections = (newDetections) => {
    setDetections(newDetections);
    
    // Broadcast to network if threat detected
    const threats = newDetections.filter(isAerialThreat);
    
    if (threats.length > 0) {
      peerNetwork.broadcastDetection({
        threats: threats.map(t => ({
          type: t.classification.type,
          label: t.classification.label,
          confidence: t.confidence,
          position: t.boundingBox
        }))
      });
    }
  };
  
  // Handle local camera stream availability
  const handleCameraStream = useCallback((stream) => {
    localCameraStreamRef.current = stream;
  }, []);
  
  // Handle threat level changes
  const handleThreatLevel = (level) => {
    if (level !== threatLevel) {
      setThreatLevel(level);
      
      // Broadcast alert for high threats
      if (['high', 'critical'].includes(level)) {
        peerNetwork.broadcastAlert({
          level,
          message: `${level.toUpperCase()} threat detected`,
          timestamp: Date.now()
        });
      }
    }
  };
  
  // Handle remote detections from network
  const handleRemoteDetection = ({ peerId, detection }) => {
    setRemoteDetections(prev => {
      const updated = prev.filter(d => d.peerId !== peerId);
      return [...updated, { peerId, detection, timestamp: Date.now() }];
    });
    
    // Play alert for remote threats
    if (detection.threats?.length > 0) {
      const remoteLevel = getOverallThreatLevel(
        detection.threats.map(t => ({ classification: { type: t.type, threat: 'medium' } }))
      );
      
      if (['medium', 'high', 'critical'].includes(remoteLevel)) {
        audioAlert.playAlert('low'); // Softer alert for remote detections
      }
    }
  };
  
  // Combined threat count
  const totalThreats = detections.filter(isAerialThreat).length + 
    remoteDetections.reduce((acc, rd) => acc + (rd.detection.threats?.length || 0), 0);
  
  // Handle view switch from host - request video from target device
  const handleViewSwitch = useCallback(({ targetDevice }) => {
    setActiveViewDevice(targetDevice);
    setIsGridView(false); // Disable grid view when switching to specific device
    setRemoteVideoStream(null); // Clear any existing stream
    
    if (targetDevice) {
      setIsLoadingRemoteVideo(true);
      // Request video stream from the target device
      peerNetwork.requestVideoFromPeer(targetDevice);
      console.log(`Requesting video from device: ${targetDevice}`);
    }
  }, []);
  
  // Handle receiving remote video stream
  useEffect(() => {
    const unsubRemoteVideo = peerNetwork.on('remote-video', ({ peerId, stream }) => {
      console.log('Received remote video from:', peerId);
      if (peerId === activeViewDevice) {
        setRemoteVideoError(null); // Clear any previous errors
        setRemoteVideoStream(stream);
        setIsLoadingRemoteVideo(false);
      }
    });
    
    const unsubVideoEnded = peerNetwork.on('video-ended', ({ peerId }) => {
      if (peerId === activeViewDevice) {
        setRemoteVideoStream(null);
        setIsLoadingRemoteVideo(false);
      }
    });
    
    const unsubVideoError = peerNetwork.on('video-error', ({ peerId, error }) => {
      console.error('Video error from', peerId, error);
      if (peerId === activeViewDevice) {
        setIsLoadingRemoteVideo(false);
        setRemoteVideoError('Failed to connect to remote camera');
      }
    });
    
    // Handle video request from host (when we are not the host)
    const unsubVideoRequest = peerNetwork.on('video-request', async ({ peerId }) => {
      console.log('Video requested by:', peerId);
      // Start streaming our video to the requester
      try {
        // Use the stored camera stream ref if available
        if (localCameraStreamRef.current) {
          await peerNetwork.startVideoStream(localCameraStreamRef.current);
        } else {
          // Start new video stream
          await peerNetwork.startVideoStream();
        }
      } catch (err) {
        console.error('Failed to start video stream:', err);
      }
    });
    
    return () => {
      unsubRemoteVideo();
      unsubVideoEnded();
      unsubVideoError();
      unsubVideoRequest();
    };
  }, [activeViewDevice]);
  
  // Attach remote video stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteVideoStream) {
      remoteVideoRef.current.srcObject = remoteVideoStream;
      remoteVideoRef.current.play().catch(err => {
        console.error('Failed to play remote video:', err);
        setRemoteVideoError('Unable to play remote video. Please try again.');
      });
    }
  }, [remoteVideoStream]);
  
  // Handle grid view toggle
  const handleGridViewToggle = (enabled) => {
    setIsGridView(enabled);
    if (enabled) {
      setActiveViewDevice(null); // Clear specific device when enabling grid
      setRemoteVideoStream(null); // Clear remote video when switching to grid
    }
    console.log(`Grid view: ${enabled ? 'enabled' : 'disabled'}`);
  };
  
  // Clear remote video when switching back to local view
  const handleClearRemoteView = useCallback(() => {
    setActiveViewDevice(null);
    setRemoteVideoStream(null);
    setIsLoadingRemoteVideo(false);
  }, []);
  
  const handleBackClick = () => {
    // Exit animation with null check
    if (containerRef.current) {
      animate(containerRef.current, {
        opacity: [1, 0],
        translateY: [0, 20],
        duration: 300,
        ease: 'inQuad'
      }).then(() => {
        onBackToHome();
      });
    } else {
      onBackToHome();
    }
  };
  
  const openFullScreen = () => {
    setIsFullScreen(true);
  };
  
  const closeFullScreen = () => {
    setIsFullScreen(false);
  };
  
  // Render full screen camera if active
  if (isFullScreen) {
    return (
      <FullScreenCamera 
        onClose={closeFullScreen}
        onDetections={handleDetections}
        onThreatLevel={handleThreatLevel}
      />
    );
  }

  return (
    <div className="tracking-page" ref={containerRef}>
      <header className="tracking-header" ref={headerRef}>
        <div className="header-left">
          <button className="btn-back" onClick={handleBackClick}>
            <span className="back-icon">←</span>
            <span className="back-text">Back</span>
          </button>
          <div className="logo-section-small">
            <span className="logo-icon-small">◆</span>
            <span className="logo-text-small">MINOVSKI</span>
          </div>
        </div>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-value">{totalThreats}</span>
            <span className="stat-label">Active Threats</span>
          </div>
        </div>
      </header>
      
      <main className="tracking-main">
        <section className="camera-section">
          <div className="camera-section-header">
            <h2 className="camera-section-title">
              <span className="camera-title-icon">◉</span>
              {activeViewDevice ? 'REMOTE FEED' : 'OPTICAL FEED'}
              {activeViewDevice && (
                <span className="remote-view-badge">
                  📡 Viewing: {activeViewDevice.slice(0, 10)}...
                </span>
              )}
              {isGridView && (
                <span className="grid-view-badge">
                  ⊞ Grid View Active
                </span>
              )}
            </h2>
            <div className="camera-section-actions">
              {activeViewDevice && (
                <button className="btn-back-to-local" onClick={handleClearRemoteView}>
                  <span>← Back to Local</span>
                </button>
              )}
              <button className="btn-fullscreen" onClick={openFullScreen}>
                <span className="fullscreen-icon">⛶</span>
                <span>FULL SCAN</span>
              </button>
            </div>
          </div>
          
          {/* Show remote video when viewing another device */}
          {activeViewDevice ? (
            <div className="remote-video-container">
              {isLoadingRemoteVideo && (
                <div className="remote-video-loading">
                  <div className="loading-spinner"></div>
                  <p>Connecting to remote camera...</p>
                </div>
              )}
              {remoteVideoError && (
                <div className="remote-video-error">
                  <div className="error-icon">⚠</div>
                  <p>{remoteVideoError}</p>
                  <button onClick={() => {
                    setRemoteVideoError(null);
                    setIsLoadingRemoteVideo(true);
                    peerNetwork.requestVideoFromPeer(activeViewDevice);
                  }}>Retry Connection</button>
                </div>
              )}
              {remoteVideoStream && !remoteVideoError ? (
                <video
                  ref={remoteVideoRef}
                  className="remote-video-feed"
                  autoPlay
                  playsInline
                  muted
                />
              ) : !isLoadingRemoteVideo && !remoteVideoError && (
                <div className="remote-video-waiting">
                  <div className="waiting-icon">📡</div>
                  <p>Waiting for remote feed...</p>
                  <p className="hint">The remote device needs to have their camera active</p>
                </div>
              )}
            </div>
          ) : (
            <CameraView 
              onDetections={handleDetections}
              onThreatLevel={handleThreatLevel}
              onCameraStream={handleCameraStream}
              isActive={isActive}
            />
          )}
        </section>
        
        <aside className="sidebar">
          <ThreatDisplay 
            threatLevel={threatLevel}
            detections={detections}
          />
          
          <NetworkPanel 
            onRemoteDetection={handleRemoteDetection}
            onViewSwitch={handleViewSwitch}
            onGridViewToggle={handleGridViewToggle}
          />
          
          <WalkieTalkie />
          
          <ChatPanel />
          
          {remoteDetections.length > 0 && (
            <div className="remote-detections">
              <h3>Network Detections</h3>
              <ul>
                {remoteDetections.slice(-5).map((rd, index) => (
                  <li key={index} className="remote-detection-item">
                    <span className="device-id">{rd.peerId.slice(0, 8)}...</span>
                    <span className="threat-count">
                      {rd.detection.threats?.length || 0} threats
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </main>
      
      <footer className="tracking-footer">
        <p>Point camera at sky to detect aerial threats • Minovsky Particle Tracking Active</p>
      </footer>
    </div>
  );
}

export default TrackingPage;
