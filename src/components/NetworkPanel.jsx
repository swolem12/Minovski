import { useState, useEffect, useRef, useCallback } from 'react';
import { animate } from 'animejs';
import peerNetwork from '../utils/peerNetwork';
import './NetworkPanel.css';

function NetworkPanel({ onRemoteDetection, onViewSwitch, onGridViewToggle }) {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [peers, setPeers] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [remoteAlerts, setRemoteAlerts] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [activeViewDevice, setActiveViewDevice] = useState(null);
  const [isGridView, setIsGridView] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [connectionProgress, setConnectionProgress] = useState(null);
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
    
    const unsubViewSwitch = peerNetwork.on('view-switch', ({ peerId, targetDevice }) => {
      setActiveViewDevice(targetDevice);
      onViewSwitch?.({ targetDevice, fromHost: peerId });
    });
    
    // Listen for connection progress events (for retry feedback)
    const unsubConnectionProgress = peerNetwork.on('connection-progress', (progress) => {
      setConnectionProgress(progress);
      if (progress.status === 'connected') {
        // Clear progress message after successful connection
        setTimeout(() => setConnectionProgress(null), 2000);
      }
    });
    
    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubRemoteDetection();
      unsubRemoteAlert();
      unsubViewSwitch();
      unsubConnectionProgress();
      peerNetwork.disconnect();
    };
  }, [onRemoteDetection, onViewSwitch, animateNewPeer, animateAlert]);
  
  const handleCreateRoom = () => {
    const room = peerNetwork.createRoom();
    setRoomId(room);
    setIsHost(true);
    
    animate('.room-id', {
      scale: [0.8, 1.1, 1],
      duration: 500,
      ease: 'outElastic(1, .5)'
    });
  };
  
  const handleJoinRoom = async () => {
    if (!joinRoomId.trim()) return;
    
    // Check if network is connected first
    if (!isConnected) {
      setJoinError('Network not ready. Please wait...');
      return;
    }
    
    setIsJoining(true);
    setJoinError('');
    setConnectionProgress(null);
    
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
      setConnectionProgress(null);
      setJoinError(err.message || 'Failed to connect. Check the Device ID and try again.');
      if (panelRef.current) {
        animate(panelRef.current, {
          backgroundColor: ['rgba(239, 68, 68, 0.2)', 'rgba(15, 15, 15, 0.95)'],
          duration: 1000,
          ease: 'outQuad'
        });
      }
    } finally {
      setIsJoining(false);
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
  
  const handleViewSwitch = (targetDeviceId) => {
    if (!isHost) return;
    
    // Disable grid view when switching to a specific device
    if (isGridView) {
      setIsGridView(false);
      onGridViewToggle?.(false);
    }
    
    peerNetwork.broadcastViewSwitch(targetDeviceId);
    setActiveViewDevice(targetDeviceId);
    onViewSwitch?.({ targetDevice: targetDeviceId, fromHost: deviceId });
    
    // Animate the selected device
    animate(`.peer-item[data-peer="${targetDeviceId}"]`, {
      backgroundColor: ['rgba(0, 212, 255, 0.3)', 'rgba(255, 255, 255, 0.02)'],
      duration: 500,
      ease: 'outQuad'
    });
  };
  
  const handleGridViewToggle = () => {
    if (!isHost) return;
    
    const newGridState = !isGridView;
    setIsGridView(newGridState);
    
    // Clear individual device view when switching to grid
    if (newGridState) {
      setActiveViewDevice(null);
    }
    
    onGridViewToggle?.(newGridState);
    
    // Animate the grid button
    animate('.btn-grid-view', {
      scale: [1, 1.1, 1],
      duration: 300
    });
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
                  disabled={!isConnected}
                >
                  Create Sensor Network
                </button>
                
                <div className="divider">or</div>
                
                <div className="join-room">
                  <input
                    type="text"
                    placeholder="Enter Device ID to connect"
                    value={joinRoomId}
                    onChange={(e) => {
                      setJoinRoomId(e.target.value);
                      setJoinError(''); // Clear error when typing
                    }}
                    disabled={isJoining}
                  />
                  <button 
                    className="btn-join"
                    onClick={handleJoinRoom}
                    disabled={!isConnected || isJoining || !joinRoomId.trim()}
                  >
                    {isJoining ? 'Joining...' : 'Join'}
                  </button>
                </div>
                {connectionProgress && isJoining && (
                  <p className={`connection-progress ${connectionProgress.status}`}>
                    {connectionProgress.message}
                  </p>
                )}
                {joinError && (
                  <p className="join-error">{joinError}</p>
                )}
              </>
            ) : (
              <div className="room-active">
                <label>Network ID (share to connect):</label>
                <div className="room-id">
                  {/* Hosts display their Device ID (PeerJS peer ID) for others to connect to.
                      Non-hosts display the roomId which is the host's device ID they connected to. */}
                  <code>{isHost ? deviceId : roomId}</code>
                  <button 
                    className="copy-btn"
                    onClick={() => copyToClipboard(isHost ? deviceId : roomId)}
                  >
                    📋
                  </button>
                </div>
                <p className="share-hint">
                  {isHost 
                    ? 'Share your Device ID with other devices to join your network' 
                    : `Connected to: ${roomId}`}
                </p>
              </div>
            )}
          </div>
          
          {peers.length > 0 && (
            <div className="peers-list">
              <div className="peers-header">
                <h4>Connected Devices:</h4>
                {isHost && peers.length > 0 && (
                  <button 
                    className={`btn-grid-view ${isGridView ? 'active' : ''}`}
                    onClick={handleGridViewToggle}
                    title="Show all device feeds in grid view"
                  >
                    <span className="grid-icon">⊞</span>
                    <span>{isGridView ? 'Grid ON' : 'Grid View'}</span>
                  </button>
                )}
              </div>
              {isHost && (
                <p className="host-hint">
                  {isGridView 
                    ? 'Grid view active - showing all device feeds' 
                    : 'Click "View" to switch to a device\'s camera feed'}
                </p>
              )}
              <ul>
                {peers.map((peer) => (
                  <li 
                    key={peer} 
                    className={`peer-item ${activeViewDevice === peer ? 'active-view' : ''} ${isGridView ? 'grid-active' : ''}`}
                    data-peer={peer}
                  >
                    <span className="peer-icon">📱</span>
                    <span className="peer-id">{peer}</span>
                    <span className="peer-status">Active</span>
                    {isHost && !isGridView && (
                      <button 
                        className={`btn-view-switch ${activeViewDevice === peer ? 'viewing' : ''}`}
                        onClick={() => handleViewSwitch(peer)}
                        title="Switch to this device's view"
                      >
                        {activeViewDevice === peer ? '👁 Viewing' : '👁 View'}
                      </button>
                    )}
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
