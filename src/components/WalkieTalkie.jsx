import { useState, useEffect, useRef, useCallback } from 'react';
import { animate } from 'animejs';
import peerNetwork from '../utils/peerNetwork';
import './WalkieTalkie.css';

function WalkieTalkie() {
  const [isTalking, setIsTalking] = useState(false);
  const [remoteTalkers, setRemoteTalkers] = useState([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [error, setError] = useState(null);
  const audioElementsRef = useRef(new Map());
  const buttonRef = useRef(null);
  
  // Handle remote audio streams
  useEffect(() => {
    const audioElements = audioElementsRef.current;
    
    const unsubRemoteAudio = peerNetwork.on('remote-audio', ({ peerId, stream }) => {
      // Create or update audio element for this peer
      let audioEl = audioElements.get(peerId);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        audioElements.set(peerId, audioEl);
      }
      audioEl.srcObject = stream;
      audioEl.play().catch(e => console.warn('Audio play failed:', e));
    });
    
    const unsubAudioEnded = peerNetwork.on('audio-ended', ({ peerId }) => {
      const audioEl = audioElements.get(peerId);
      if (audioEl) {
        audioEl.srcObject = null;
        audioElements.delete(peerId);
      }
    });
    
    const unsubWalkieStatus = peerNetwork.on('walkie-status', ({ peerId, isActive }) => {
      setRemoteTalkers(prev => {
        if (isActive) {
          return [...new Set([...prev, peerId])];
        } else {
          return prev.filter(p => p !== peerId);
        }
      });
    });
    
    return () => {
      unsubRemoteAudio();
      unsubAudioEnded();
      unsubWalkieStatus();
      // Clean up audio elements
      for (const audioEl of audioElements.values()) {
        audioEl.srcObject = null;
      }
      audioElements.clear();
    };
  }, []);
  
  const startTalking = useCallback(async () => {
    if (isTalking) return;
    
    try {
      setError(null);
      await peerNetwork.startAudioBroadcast();
      setIsTalking(true);
      setIsEnabled(true);
      peerNetwork.broadcastWalkieStatus(true);
      
      // Animate button
      if (buttonRef.current) {
        animate(buttonRef.current, {
          scale: [1, 1.1],
          duration: 200,
          ease: 'outQuad'
        });
      }
    } catch (err) {
      console.error('Failed to start talking:', err);
      setError('Microphone access denied');
    }
  }, [isTalking]);
  
  const stopTalking = useCallback(() => {
    if (!isTalking) return;
    
    peerNetwork.stopAudioBroadcast();
    setIsTalking(false);
    peerNetwork.broadcastWalkieStatus(false);
    
    // Animate button
    if (buttonRef.current) {
      animate(buttonRef.current, {
        scale: [1.1, 1],
        duration: 200,
        ease: 'outQuad'
      });
    }
  }, [isTalking]);
  
  // Handle mouse/touch events for push-to-talk
  const handleMouseDown = (e) => {
    e.preventDefault();
    startTalking();
  };
  
  const handleMouseUp = (e) => {
    e.preventDefault();
    stopTalking();
  };
  
  const handleTouchStart = (e) => {
    e.preventDefault();
    startTalking();
  };
  
  const handleTouchEnd = (e) => {
    e.preventDefault();
    stopTalking();
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isTalking) {
        peerNetwork.stopAudioBroadcast();
        peerNetwork.broadcastWalkieStatus(false);
      }
    };
  }, [isTalking]);

  return (
    <div className="walkie-talkie">
      <div className="walkie-header">
        <span className="walkie-icon">🎙️</span>
        <span className="walkie-title">Push-to-Talk</span>
        {remoteTalkers.length > 0 && (
          <span className="talkers-badge">
            {remoteTalkers.length} talking
          </span>
        )}
      </div>
      
      <div className="walkie-content">
        <button
          ref={buttonRef}
          className={`btn-talk ${isTalking ? 'talking' : ''}`}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="talk-icon">{isTalking ? '🔊' : '🎤'}</span>
          <span className="talk-text">
            {isTalking ? 'TRANSMITTING...' : 'HOLD TO TALK'}
          </span>
        </button>
        
        {error && (
          <p className="walkie-error">{error}</p>
        )}
        
        {remoteTalkers.length > 0 && (
          <div className="remote-talkers">
            <span className="receiving-label">Receiving from:</span>
            <ul>
              {remoteTalkers.map(peer => (
                <li key={peer} className="talker-item">
                  <span className="talker-indicator"></span>
                  <span className="talker-id">{peer.slice(0, 10)}...</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {isEnabled && !isTalking && remoteTalkers.length === 0 && (
          <p className="walkie-hint">Press and hold to transmit voice</p>
        )}
      </div>
    </div>
  );
}

export default WalkieTalkie;
