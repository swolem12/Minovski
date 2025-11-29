/**
 * PeerNetwork - Multi-device communication for shared detection
 * Uses PeerJS for WebRTC connections
 */

import Peer from 'peerjs';
import { v4 as uuidv4 } from 'uuid';

// Connection timeout in milliseconds - increased to allow for NAT traversal via TURN servers
// TURN relay connections across different networks can take longer to establish
const CONNECTION_TIMEOUT_MS = 45000;

// Maximum number of connection retry attempts
const MAX_RETRY_ATTEMPTS = 3;

// Base delay for exponential backoff (ms)
const RETRY_BASE_DELAY_MS = 2000;

class PeerNetwork {
  constructor() {
    this.peer = null;
    this.connections = new Map();
    this.deviceId = this.getOrCreateDeviceId();
    this.listeners = new Map();
    this.isHost = false;
    this.roomId = null;
    // Audio/media call support
    this.mediaConnections = new Map();
    this.localAudioStream = null;
    // Video streaming support
    this.videoConnections = new Map();
    this.localVideoStream = null;
    this.isStreamingVideo = false;
  }
  
  /**
   * Get or create a unique device ID
   */
  getOrCreateDeviceId() {
    let deviceId = localStorage.getItem('drone-tracker-device-id');
    if (!deviceId) {
      deviceId = `device-${uuidv4().slice(0, 8)}`;
      localStorage.setItem('drone-tracker-device-id', deviceId);
    }
    return deviceId;
  }
  
  /**
   * Get ICE servers configuration with multiple TURN providers for redundancy
   */
  getIceServers() {
    return [
      // === STUN Servers (for discovering public IP) ===
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // OpenRelay STUN
      { urls: 'stun:openrelay.metered.ca:80' },
      // Additional STUN for redundancy
      { urls: 'stun:stun.stunprotocol.org:3478' },
      
      // === TURN Servers (for NAT traversal across different networks) ===
      // Free public TURN servers from OpenRelay (metered.ca)
      // These are intentionally public credentials provided for open-source projects
      // TURN credentials must be client-accessible for WebRTC - the service has rate limiting
      
      // OpenRelay TURN - UDP on port 80 (commonly allowed through firewalls)
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      // OpenRelay TURN - UDP on port 443
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      // OpenRelay TURN - TCP on port 443 (for restrictive firewalls that block UDP)
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      // OpenRelay TURNS (TLS) for most restrictive networks - appears as normal HTTPS traffic
      {
        urls: 'turns:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      
      // Additional backup TURN servers for redundancy
      // Relay server on standard ports for broader compatibility
      {
        urls: 'turn:relay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:relay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:relay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ];
  }
  
  /**
   * Initialize peer connection
   */
  async init() {
    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer(this.deviceId, {
          debug: 1,
          config: {
            iceServers: this.getIceServers(),
            // Pre-gather ICE candidates for faster connection establishment
            iceCandidatePoolSize: 10,
            // Enable aggressive ICE for better connectivity
            iceTransportPolicy: 'all'
          }
        });
        
        this.peer.on('open', (id) => {
          console.log('Peer connected with ID:', id);
          this.emit('connected', { deviceId: id });
          resolve(id);
        });
        
        this.peer.on('connection', (conn) => {
          this.handleConnection(conn);
        });
        
        this.peer.on('error', (err) => {
          console.error('Peer error:', err);
          this.emit('error', err);
          // If ID taken, generate new one
          if (err.type === 'unavailable-id') {
            this.deviceId = `device-${uuidv4().slice(0, 8)}`;
            localStorage.setItem('drone-tracker-device-id', this.deviceId);
            this.init().then(resolve).catch(reject);
          } else {
            reject(err);
          }
        });
        
        this.peer.on('disconnected', () => {
          console.log('Peer disconnected, reconnecting...');
          this.emit('disconnected');
          this.peer.reconnect();
        });
        
        // Handle incoming audio/media calls
        this.peer.on('call', (call) => {
          this.handleIncomingCall(call);
        });
        
      } catch (e) {
        reject(e);
      }
    });
  }
  
  /**
   * Create a new room (host)
   */
  createRoom() {
    this.isHost = true;
    this.roomId = `room-${uuidv4().slice(0, 6)}`;
    this.emit('room-created', { roomId: this.roomId, deviceId: this.deviceId });
    return this.roomId;
  }
  
  /**
   * Join an existing room with automatic retry on failure
   * @param {string} hostId - Host's device ID
   * @param {number} attempt - Current attempt number (used internally for retries)
   */
  async joinRoom(hostId, attempt = 1) {
    return new Promise((resolve, reject) => {
      // Check if peer is initialized
      if (!this.peer || this.peer.destroyed) {
        reject(new Error('Peer not initialized. Please wait for connection.'));
        return;
      }
      
      // Check if peer is open/ready
      if (this.peer.disconnected) {
        reject(new Error('Peer is disconnected. Please refresh and try again.'));
        return;
      }
      
      // Emit connection progress event
      this.emit('connection-progress', { 
        status: 'connecting', 
        attempt, 
        maxAttempts: MAX_RETRY_ATTEMPTS,
        message: attempt > 1 ? `Retrying connection (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})...` : 'Establishing connection...'
      });
      
      const conn = this.peer.connect(hostId, {
        reliable: true,
        metadata: { deviceId: this.deviceId }
      });
      
      // Check if connection was created
      if (!conn) {
        reject(new Error('Failed to create connection. Please try again.'));
        return;
      }
      
      // Set a timeout for connection attempt
      // Note: Cross-network connections via TURN may take longer to establish
      const connectionTimeout = setTimeout(() => {
        // If we haven't exhausted retries, try again
        if (attempt < MAX_RETRY_ATTEMPTS) {
          this.emit('connection-progress', { 
            status: 'retrying', 
            attempt: attempt + 1, 
            maxAttempts: MAX_RETRY_ATTEMPTS,
            message: `Connection timed out. Retrying (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})...`
          });
          
          // Exponential backoff: 2s, 4s, 8s...
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          setTimeout(() => {
            this.joinRoom(hostId, attempt + 1).then(resolve).catch(reject);
          }, delay);
        } else {
          // All retries exhausted
          const errorMessage = this.getDetailedConnectionError();
          reject(new Error(errorMessage));
        }
      }, CONNECTION_TIMEOUT_MS);
      
      conn.on('open', () => {
        clearTimeout(connectionTimeout);
        this.emit('connection-progress', { 
          status: 'connected', 
          attempt,
          message: 'Successfully connected!'
        });
        this.handleConnection(conn);
        this.roomId = hostId;
        resolve(conn);
      });
      
      conn.on('error', (err) => {
        clearTimeout(connectionTimeout);
        reject(err);
      });
    });
  }
  
  /**
   * Generate a detailed error message with troubleshooting tips
   */
  getDetailedConnectionError() {
    return `Connection failed after ${MAX_RETRY_ATTEMPTS} attempts.

Troubleshooting tips:
• Verify the Device ID is correct (copy-paste recommended)
• Ensure the host device is still online and has the app open
• Check that both devices have internet access
• If on different networks (e.g., home WiFi vs mobile data), the connection requires TURN relay servers
• Try disabling VPN if connected through one
• Some corporate/school networks may block peer-to-peer connections

If problems persist, try:
1. Both devices refresh the page
2. Host creates a new network
3. Connect while both on the same WiFi (for testing)`;
  }

  /**
   * Handle incoming connection
   */
  handleConnection(conn) {
    const peerId = conn.peer;
    let isSetupComplete = false;
    
    // Helper to set up the connection once it's open
    const setupConnection = () => {
      // Prevent duplicate setup due to race condition
      if (isSetupComplete) return;
      isSetupComplete = true;
      
      this.connections.set(peerId, conn);
      console.log('Connection established with:', peerId);
      this.emit('peer-connected', { peerId, connection: conn });
      
      // Send current device info
      conn.send({
        type: 'device-info',
        data: {
          deviceId: this.deviceId,
          timestamp: Date.now()
        }
      });
    };
    
    // Always register the 'open' event listener first to avoid race conditions
    conn.on('open', setupConnection);
    
    // If connection is already open, set it up immediately
    // The flag prevents duplicate setup if the event also fires
    if (conn.open) {
      setupConnection();
    }
    
    conn.on('data', (data) => {
      this.handleData(peerId, data);
    });
    
    conn.on('close', () => {
      this.connections.delete(peerId);
      this.emit('peer-disconnected', { peerId });
    });
    
    conn.on('error', (err) => {
      console.error('Connection error with', peerId, err);
      this.emit('peer-error', { peerId, error: err });
    });
  }
  
  /**
   * Handle incoming data
   */
  handleData(peerId, message) {
    const { type, data } = message;
    
    switch (type) {
      case 'detection':
        this.emit('remote-detection', { peerId, detection: data });
        break;
      case 'threat-alert':
        this.emit('remote-alert', { peerId, alert: data });
        break;
      case 'device-info':
        this.emit('device-info', { peerId, info: data });
        break;
      case 'heartbeat':
        // Keep-alive
        break;
      case 'view-switch':
        // Host commanding to switch view to a specific device's feed
        this.emit('view-switch', { peerId, targetDevice: data.targetDevice });
        break;
      case 'chat-message':
        // Chat message from a peer
        this.emit('chat-message', { peerId, message: data.message, timestamp: data.timestamp });
        break;
      case 'walkie-status':
        // Walkie-talkie push-to-talk status
        this.emit('walkie-status', { peerId, isActive: data.isActive, timestamp: data.timestamp });
        break;
      case 'video-request':
        // Another peer is requesting our video stream
        this.emit('video-request', { peerId, requesterId: data.requesterId, timestamp: data.timestamp });
        break;
      default:
        this.emit('message', { peerId, type, data });
    }
  }
  
  /**
   * Broadcast detection to all connected peers
   * @param {Object} detection - Detection data
   */
  broadcastDetection(detection) {
    this.broadcast({
      type: 'detection',
      data: {
        ...detection,
        sourceDevice: this.deviceId,
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * Broadcast threat alert to all connected peers
   * @param {Object} alert - Alert data
   */
  broadcastAlert(alert) {
    this.broadcast({
      type: 'threat-alert',
      data: {
        ...alert,
        sourceDevice: this.deviceId,
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * Send view switch command to all peers (host only)
   * @param {string} targetDevice - Device ID to switch view to
   */
  broadcastViewSwitch(targetDevice) {
    if (!this.isHost) {
      console.warn('Only host can switch views');
      return;
    }
    this.broadcast({
      type: 'view-switch',
      data: {
        targetDevice,
        sourceDevice: this.deviceId,
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * Send chat message to all connected peers
   * @param {string} message - Chat message text
   */
  broadcastChatMessage(message) {
    const timestamp = Date.now();
    const chatData = {
      type: 'chat-message',
      data: {
        message,
        sourceDevice: this.deviceId,
        timestamp
      }
    };
    this.broadcast(chatData);
    // Also emit locally so sender sees their own message
    this.emit('chat-message', { 
      peerId: this.deviceId, 
      message, 
      timestamp,
      isLocal: true 
    });
  }
  
  /**
   * Handle incoming audio/video call
   */
  handleIncomingCall(call) {
    const peerId = call.peer;
    const callMetadata = call.metadata || {};
    const isVideoCall = callMetadata.type === 'video';
    
    console.log(`Incoming ${isVideoCall ? 'video' : 'audio'} call from:`, peerId);
    
    if (isVideoCall) {
      // This is a video call - answer with our local video stream if we're streaming
      if (this.localVideoStream) {
        call.answer(this.localVideoStream);
      } else {
        // Answer without stream - we'll get their stream anyway
        call.answer();
      }
      
      call.on('stream', (remoteStream) => {
        console.log('Received remote video stream from:', peerId);
        this.emit('remote-video', { peerId, stream: remoteStream });
      });
      
      call.on('close', () => {
        console.log('Video call closed with:', peerId);
        this.videoConnections.delete(peerId);
        this.emit('video-ended', { peerId });
      });
      
      call.on('error', (err) => {
        console.error('Video call error with', peerId, err);
        this.emit('video-error', { peerId, error: err });
      });
      
      this.videoConnections.set(peerId, call);
    } else {
      // This is an audio call
      if (this.localAudioStream) {
        call.answer(this.localAudioStream);
      } else {
        call.answer();
      }
      
      call.on('stream', (remoteStream) => {
        console.log('Received remote audio stream from:', peerId);
        this.emit('remote-audio', { peerId, stream: remoteStream });
      });
      
      call.on('close', () => {
        console.log('Audio call closed with:', peerId);
        this.mediaConnections.delete(peerId);
        this.emit('audio-ended', { peerId });
      });
      
      call.on('error', (err) => {
        console.error('Audio call error with', peerId, err);
        this.emit('audio-error', { peerId, error: err });
      });
      
      this.mediaConnections.set(peerId, call);
    }
  }
  
  /**
   * Start push-to-talk audio broadcast
   * @returns {Promise<MediaStream>} The local audio stream
   */
  async startAudioBroadcast() {
    try {
      // Get audio stream from microphone with quality constraints
      this.localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        },
        video: false
      });
      
      // Call all connected peers with the audio stream
      for (const peerId of this.connections.keys()) {
        this.callPeerWithAudio(peerId);
      }
      
      this.emit('audio-started', { deviceId: this.deviceId });
      return this.localAudioStream;
    } catch (err) {
      console.error('Failed to get audio stream:', err);
      this.emit('audio-error', { error: err });
      throw err;
    }
  }
  
  /**
   * Call a specific peer with audio
   */
  callPeerWithAudio(peerId) {
    if (!this.peer || !this.localAudioStream) return;
    
    const call = this.peer.call(peerId, this.localAudioStream);
    if (!call) return;
    
    call.on('stream', (remoteStream) => {
      this.emit('remote-audio', { peerId, stream: remoteStream });
    });
    
    call.on('close', () => {
      this.mediaConnections.delete(peerId);
      this.emit('audio-ended', { peerId });
    });
    
    call.on('error', (err) => {
      console.error('Call error:', err);
    });
    
    this.mediaConnections.set(peerId, call);
  }
  
  /**
   * Stop audio broadcast (release microphone)
   */
  stopAudioBroadcast() {
    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach(track => track.stop());
      this.localAudioStream = null;
    }
    
    // Close all media connections
    for (const call of this.mediaConnections.values()) {
      call.close();
    }
    this.mediaConnections.clear();
    
    this.emit('audio-stopped', { deviceId: this.deviceId });
  }
  
  /**
   * Start video streaming (share camera with peers)
   * @param {MediaStream} existingStream - Optional existing video stream to use
   * @returns {Promise<MediaStream>} The local video stream
   */
  async startVideoStream(existingStream = null) {
    try {
      if (existingStream) {
        this.localVideoStream = existingStream;
      } else {
        // Get video stream from camera
        this.localVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      }
      
      this.isStreamingVideo = true;
      
      // Call all connected peers with the video stream
      for (const peerId of this.connections.keys()) {
        this.callPeerWithVideo(peerId);
      }
      
      this.emit('video-started', { deviceId: this.deviceId });
      return this.localVideoStream;
    } catch (err) {
      console.error('Failed to get video stream:', err);
      this.emit('video-error', { error: err });
      throw err;
    }
  }
  
  /**
   * Call a specific peer with video
   */
  callPeerWithVideo(peerId) {
    if (!this.peer || !this.localVideoStream) return;
    
    // Use metadata to indicate this is a video call
    const call = this.peer.call(peerId, this.localVideoStream, {
      metadata: { type: 'video' }
    });
    if (!call) return;
    
    call.on('stream', (remoteStream) => {
      this.emit('remote-video', { peerId, stream: remoteStream });
    });
    
    call.on('close', () => {
      this.videoConnections.delete(peerId);
      this.emit('video-ended', { peerId });
    });
    
    call.on('error', (err) => {
      console.error('Video call error:', err);
      this.emit('video-error', { peerId, error: err });
    });
    
    this.videoConnections.set(peerId, call);
  }
  
  /**
   * Request video from a specific peer (used when host wants to view a device's camera)
   * @param {string} peerId - The peer to request video from
   */
  requestVideoFromPeer(peerId) {
    // Send a request to the peer to start streaming their video
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send({
        type: 'video-request',
        data: {
          requesterId: this.deviceId,
          timestamp: Date.now()
        }
      });
      this.emit('video-requested', { peerId });
    }
  }
  
  /**
   * Stop video streaming (release camera for video calls)
   */
  stopVideoStream() {
    if (this.localVideoStream) {
      this.localVideoStream.getTracks().forEach(track => track.stop());
      this.localVideoStream = null;
    }
    
    this.isStreamingVideo = false;
    
    // Close all video connections
    for (const call of this.videoConnections.values()) {
      call.close();
    }
    this.videoConnections.clear();
    
    this.emit('video-stopped', { deviceId: this.deviceId });
  }
  
  /**
   * Notify peers that walkie-talkie is active (push-to-talk started)
   */
  broadcastWalkieStatus(isActive) {
    this.broadcast({
      type: 'walkie-status',
      data: {
        isActive,
        sourceDevice: this.deviceId,
        timestamp: Date.now()
      }
    });
  }
  
  /**
   * Broadcast message to all connections
   */
  broadcast(message) {
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(message);
      }
    }
  }
  
  /**
   * Send to specific peer
   */
  sendToPeer(peerId, message) {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(message);
    }
  }
  
  /**
   * Get list of connected peers
   */
  getConnectedPeers() {
    return Array.from(this.connections.keys());
  }
  
  /**
   * Event listener management
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }
  
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }
  
  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)) {
        callback(data);
      }
    }
  }
  
  /**
   * Disconnect and cleanup
   */
  disconnect() {
    // Stop video streaming
    this.stopVideoStream();
    
    // Stop audio streaming
    this.stopAudioBroadcast();
    
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    
    if (this.peer) {
      this.peer.destroy();
    }
  }
}

// Export singleton instance
const peerNetwork = new PeerNetwork();
export default peerNetwork;
