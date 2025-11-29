import { useEffect, useRef } from 'react';
import { animate } from 'animejs';
import { getThreatColor } from '../utils/objectClassifier';
import './ThreatDisplay.css';

function ThreatDisplay({ threatLevel, detections = [] }) {
  const containerRef = useRef(null);
  const levelRef = useRef(null);
  const prevLevelRef = useRef('none');
  
  // Animate threat level changes
  useEffect(() => {
    if (threatLevel !== prevLevelRef.current && levelRef.current) {
      // Pulse animation for threat level change
      animate(levelRef.current, {
        scale: [1, 1.2, 1],
        duration: 500,
        ease: 'outElastic(1, .5)'
      });
      
      // Container glow effect for high threats
      if (['high', 'critical'].includes(threatLevel) && containerRef.current) {
        animate(containerRef.current, {
          boxShadow: [
            '0 0 0px rgba(239, 68, 68, 0)',
            `0 0 30px ${getThreatColor(threatLevel)}`,
            '0 0 10px rgba(239, 68, 68, 0.3)'
          ],
          duration: 1000,
          ease: 'inOutQuad'
        });
      }
      
      prevLevelRef.current = threatLevel;
    }
  }, [threatLevel]);
  
  // Continuous pulse for critical threat
  useEffect(() => {
    let animation;
    
    if (threatLevel === 'critical' && containerRef.current) {
      animation = animate(containerRef.current, {
        backgroundColor: ['rgba(220, 38, 38, 0.1)', 'rgba(220, 38, 38, 0.3)'],
        duration: 500,
        alternate: true,
        loop: true,
        ease: 'inOutSine'
      });
    }
    
    return () => {
      if (animation) {
        animation.pause();
      }
    };
  }, [threatLevel]);
  
  const getThreatLabel = (level) => {
    const labels = {
      none: 'ALL CLEAR',
      info: 'MONITORING',
      low: 'LOW THREAT',
      medium: 'MEDIUM THREAT',
      high: 'HIGH THREAT',
      critical: 'CRITICAL THREAT'
    };
    return labels[level] || 'UNKNOWN';
  };
  
  const threatColor = getThreatColor(threatLevel);
  const activeDetections = detections.filter(d => 
    ['drone', 'quadcopter', 'fixed-wing', 'helicopter'].includes(d.classification?.type)
  );

  return (
    <div 
      className={`threat-display threat-${threatLevel}`}
      ref={containerRef}
      style={{ borderColor: threatColor }}
    >
      <div className="threat-header">
        <div 
          className="threat-indicator"
          style={{ backgroundColor: threatColor }}
        />
        <span 
          className="threat-level" 
          ref={levelRef}
          style={{ color: threatColor }}
        >
          {getThreatLabel(threatLevel)}
        </span>
      </div>
      
      <div className="threat-stats">
        <div className="stat">
          <span className="stat-value">{detections.length}</span>
          <span className="stat-label">Objects</span>
        </div>
        <div className="stat">
          <span className="stat-value">{activeDetections.length}</span>
          <span className="stat-label">Threats</span>
        </div>
      </div>
      
      {activeDetections.length > 0 && (
        <div className="active-threats">
          <h4>Active Threats:</h4>
          <ul>
            {activeDetections.slice(0, 5).map((detection, index) => (
              <li key={index} className="threat-item">
                <span 
                  className="threat-dot"
                  style={{ backgroundColor: getThreatColor(detection.classification.threat) }}
                />
                <span className="threat-name">{detection.classification.label}</span>
                <span className="threat-confidence">
                  {Math.round(detection.confidence * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ThreatDisplay;
