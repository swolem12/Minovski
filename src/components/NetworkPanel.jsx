import { useState, useEffect, useRef, useCallback } from 'react';
import { animate } from 'animejs';
import peerNetwork from '../utils/peerNetwork';
import './NetworkPanel.css';

function NetworkPanel({ onRemoteDetection }) {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [peers, setPeers] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [remoteAlerts, setRemoteAlerts] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const panelRef = useRef(null);
  const alertsRef = useRef(null);
  
  const animateNewPeer = useCallback(() => {
    animate('.peer-item:last-child', {
      opacity: [0, 1],
      translateX: [-20, 0],
      duration: 400,
      ease: 'outQuad'
    });
  }, []);
  
  const animateAlert = useCallback(() => {
    if (alertsRef.current && alertsRef.current.lastChild) {
      animate(alertsRef.current.lastChild, {
        opacity: [0, 1],
        scale: [0.9, 1],
        duration: 300,
        ease: 'outBack'
      });
    }
  }, []);
  
  // Initialize peer network
  useEffect(() => {
    async function initNetwork() {
      try {
        const id = await peerNetwork.init();
        setDeviceId(id);
        setIsConnected(true);
      } catch (err) {
        console.error('Failed to initialize network:', err);
      }
    }
    
    initNetwork();
    
    // Set up event listeners
    const unsubConnected = peerNetwork.on('peer-connected', ({ peerId }) => {
      setPeers(prev => [...new Set([...prev, peerId])]);
      animateNewPeer();
    });
    
    const unsubDisconnected = peerNetwork.on('peer-disconnected', ({ peerId }) => {
      setPeers(prev => prev.filter(p => p !== peerId));
    });
    
    const unsubRemoteDetection = peerNetwork.on('remote-detection', ({ peerId, detection }) => {
      onRemoteDetection?.({ peerId, detection });
    });
    
    const unsubRemoteAlert = peerNetwork.on('remote-alert', ({ peerId, alert }) => {
      setRemoteAlerts(prev => [...prev.slice(-4), { peerId, alert, timestamp: Date.now() }]);
      animateAlert();
    });
    
    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubRemoteDetection();
      unsubRemoteAlert();
      peerNetwork.disconnect();
    };
  }, [onRemoteDetection, animateNewPeer, animateAlert]);
  
  const handleCreateRoom = () => {
    const room = peerNetwork.createRoom();
    setRoomId(room);
    
    animate('.room-id', {
      scale: [0.8, 1.1, 1],
      duration: 500,
      ease: 'outElastic(1, .5)'
    });
  };
  
  const handleJoinRoom = async () => {
    if (!joinRoomId.trim()) return;
    
    try {
      await peerNetwork.joinRoom(joinRoomId.trim());
      setRoomId(joinRoomId.trim());
      setJoinRoomId('');
      
      if (panelRef.current) {
        animate(panelRef.current, {
          backgroundColor: ['rgba(34, 197, 94, 0.2)', 'rgba(15, 15, 15, 0.95)'],
          duration: 1000,
          ease: 'outQuad'
        });
      }
    } catch (err) {
      console.error('Failed to join room:', err);
      if (panelRef.current) {
        animate(panelRef.current, {
          backgroundColor: ['rgba(239, 68, 68, 0.2)', 'rgba(15, 15, 15, 0.95)'],
          duration: 1000,
          ease: 'outQuad'
        });
      }
    }
  };
  
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    animate('.copy-btn', {
      scale: [1, 1.2, 1],
      duration: 300
    });
  };
  
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
    if (panelRef.current) {
      animate(panelRef.current, {
        height: isExpanded ? '60px' : 'auto',
        duration: 300,
        ease: 'outQuad'
      });
    }
  };

  return (
    <div 
      className={`network-panel ${isExpanded ? 'expanded' : ''}`}
      ref={panelRef}
    >
      <div className="network-header" onClick={toggleExpand}>
        <div className="connection-status">
          <span className={`status-dot ${isConnected ? 'connected' : ''}`} />
          <span className="status-text">
            {isConnected ? 'Network Active' : 'Connecting...'}
          </span>
        </div>
        <div className="peer-count">
          <span className="count">{peers.length}</span>
          <span className="label">Devices</span>
        </div>
        <button className="expand-btn">
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>
      
      {isExpanded && (
        <div className="network-content">
          <div className="device-info">
            <label>Your Device ID:</label>
            <div className="id-display">
              <code>{deviceId}</code>
              <button 
                className="copy-btn"
                onClick={() => copyToClipboard(deviceId)}
              >
                📋
              </button>
            </div>
          </div>
          
          <div className="room-section">
            {!roomId ? (
              <>
                <button 
                  className="btn-create-room"
                  onClick={handleCreateRoom}
                >
                  Create Sensor Network
                </button>
                
                <div className="divider">or</div>
                
                <div className="join-room">
                  <input
                    type="text"
                    placeholder="Enter Device ID to connect"
                    value={joinRoomId}
                    onChange={(e) => setJoinRoomId(e.target.value)}
                  />
                  <button 
                    className="btn-join"
                    onClick={handleJoinRoom}
                  >
                    Join
                  </button>
                </div>
              </>
            ) : (
              <div className="room-active">
                <label>Network ID:</label>
                <div className="room-id">
                  <code>{roomId}</code>
                  <button 
                    className="copy-btn"
                    onClick={() => copyToClipboard(roomId)}
                  >
                    📋
                  </button>
                </div>
                <p className="share-hint">Share this ID with other devices to connect</p>
              </div>
            )}
          </div>
          
          {peers.length > 0 && (
            <div className="peers-list">
              <h4>Connected Devices:</h4>
              <ul>
                {peers.map((peer) => (
                  <li key={peer} className="peer-item">
                    <span className="peer-icon">📱</span>
                    <span className="peer-id">{peer}</span>
                    <span className="peer-status">Active</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {remoteAlerts.length > 0 && (
            <div className="remote-alerts" ref={alertsRef}>
              <h4>Network Alerts:</h4>
              <ul>
                {remoteAlerts.slice(-3).map((item, index) => (
                  <li key={index} className={`alert-item alert-${item.alert.level}`}>
                    <span className="alert-source">{item.peerId.slice(0, 8)}</span>
                    <span className="alert-message">{item.alert.message || 'Threat detected'}</span>
                    <span className="alert-time">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NetworkPanel;
