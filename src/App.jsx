import { useState, useEffect, useRef } from 'react';
import { animate, utils } from 'animejs';
import CameraView from './components/CameraView';
import ThreatDisplay from './components/ThreatDisplay';
import NetworkPanel from './components/NetworkPanel';
import peerNetwork from './utils/peerNetwork';
import audioAlert from './utils/audioAlert';
import { getOverallThreatLevel } from './utils/objectClassifier';
import './App.css';

function App() {
  const [detections, setDetections] = useState([]);
  const [threatLevel, setThreatLevel] = useState('none');
  const [remoteDetections, setRemoteDetections] = useState([]);
  const [isActive] = useState(true);
  const appRef = useRef(null);
  const headerRef = useRef(null);
  
  // Animate app load
  useEffect(() => {
    if (headerRef.current) {
      animate(headerRef.current, {
        opacity: [0, 1],
        translateY: [-30, 0],
        duration: 800,
        ease: 'outQuad'
      });
    }
    
    animate('.main-content > *', {
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
    const threats = newDetections.filter(d => 
      ['drone', 'quadcopter', 'fixed-wing', 'helicopter'].includes(d.classification?.type)
    );
    
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
  const totalThreats = detections.filter(d => 
    ['drone', 'quadcopter', 'fixed-wing', 'helicopter'].includes(d.classification?.type)
  ).length + remoteDetections.reduce((acc, rd) => acc + (rd.detection.threats?.length || 0), 0);

  return (
    <div className="app" ref={appRef}>
      <header className="app-header" ref={headerRef}>
        <div className="logo-section">
          <div className="minovsky-logo">
            <span className="logo-icon">◆</span>
            <span className="logo-text">MINOVSKI</span>
          </div>
          <span className="logo-subtitle">Optical Threat Detection System</span>
        </div>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-value">{totalThreats}</span>
            <span className="stat-label">Active Threats</span>
          </div>
        </div>
      </header>
      
      <main className="main-content">
        <section className="camera-section">
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
          />
          
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
      
      <footer className="app-footer">
        <p>Point camera at sky to detect aerial threats • Minovsky Particle Tracking Active</p>
      </footer>
    </div>
  );
}

export default App;
