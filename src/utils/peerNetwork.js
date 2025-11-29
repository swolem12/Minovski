/**
 * PeerNetwork - Multi-device communication for shared detection
 * Uses PeerJS for WebRTC connections
 */

import Peer from 'peerjs';
import { v4 as uuidv4 } from 'uuid';

// Connection timeout in milliseconds
const CONNECTION_TIMEOUT_MS = 10000;

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
   * Initialize peer connection
   */
  async init() {
    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer(this.deviceId, {
          debug: 1,
          config: {
            iceServers: [
              // STUN servers for discovering public IP
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' },
              // Free TURN servers from OpenRelay for NAT traversal across different networks
              {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
              },
              {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
              },
              {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
              }
            ]
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
   * Join an existing room
   * @param {string} hostId - Host's device ID
   */
  async joinRoom(hostId) {
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
      const connectionTimeout = setTimeout(() => {
        reject(new Error('Connection timeout. Host may be offline or unreachable.'));
      }, CONNECTION_TIMEOUT_MS);
      
      conn.on('open', () => {
        clearTimeout(connectionTimeout);
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
    console.log('Incoming call from:', peerId);
    
    // Answer the call - if we have a local stream, share it; otherwise answer without stream
    // PeerJS handles the case where answer() is called without a stream
    if (this.localAudioStream) {
      call.answer(this.localAudioStream);
    } else {
      // Answer without stream - we'll add our stream later when user starts talking
      call.answer();
    }
    
    call.on('stream', (remoteStream) => {
      console.log('Received remote audio stream from:', peerId);
      this.emit('remote-audio', { peerId, stream: remoteStream });
    });
    
    call.on('close', () => {
      console.log('Call closed with:', peerId);
      this.mediaConnections.delete(peerId);
      this.emit('audio-ended', { peerId });
    });
    
    call.on('error', (err) => {
      console.error('Call error with', peerId, err);
      this.emit('audio-error', { peerId, error: err });
    });
    
    this.mediaConnections.set(peerId, call);
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
