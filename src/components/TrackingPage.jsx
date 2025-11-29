import { useState, useEffect, useRef } from 'react';
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
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  
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
  
  // Handle view switch from host
  const handleViewSwitch = ({ targetDevice }) => {
    setActiveViewDevice(targetDevice);
    setIsGridView(false); // Disable grid view when switching to specific device
    // Notify user about view switch
    console.log(`View switched to device: ${targetDevice}`);
  };
  
  // Handle grid view toggle
  const handleGridViewToggle = (enabled) => {
    setIsGridView(enabled);
    if (enabled) {
      setActiveViewDevice(null); // Clear specific device when enabling grid
    }
    console.log(`Grid view: ${enabled ? 'enabled' : 'disabled'}`);
  };
  
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
              OPTICAL FEED
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
            <button className="btn-fullscreen" onClick={openFullScreen}>
              <span className="fullscreen-icon">⛶</span>
              <span>FULL SCAN</span>
            </button>
          </div>
          <CameraView 
            onDetections={handleDetections}
            onThreatLevel={handleThreatLevel}
            isActive={isActive}
          />
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
