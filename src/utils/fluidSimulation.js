/**
 * Fluid Trail Simulation for object tracking
 * Creates liquid-like outline trails that flow behind moving objects
 * Features: Smooth flowing trails, threat-based coloring (green/red), object outline highlighting
 */

// Motion detection threshold - minimum velocity magnitude to trigger trailing effect
const MOTION_DETECTION_THRESHOLD = 0.0005;

// Time in milliseconds before a tracked object is removed from tracking (not seen)
const TRACKED_OBJECT_TIMEOUT_MS = 2000;

// Trail segment count for smooth liquid effect
const TRAIL_SEGMENTS = 20;

class FluidSimulation {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { 
      alpha: true, 
      preserveDrawingBuffer: true,
      premultipliedAlpha: false 
    });
    
    if (!this.gl) {
      console.warn('WebGL not supported, fluid trail effects disabled');
      this.enabled = false;
      return;
    }
    
    this.enabled = true;
    this.trailSegments = []; // Smooth line segments for liquid trail
    this.maxSegments = 1000; // Max segments for all trails
    this.time = 0;
    
    // Track object positions for trajectory trail effect
    this.trackedObjects = new Map(); // objectId -> {positions: [{x, y, timestamp, isThreat, boundingBox}], lastSeen, isThreat}
    this.maxPositionHistory = TRAIL_SEGMENTS; // Number of historical positions to track
    
    this.initGL();
  }
  
  initGL() {
    const gl = this.gl;
    
    // Vertex shader for smooth liquid trails
    const vsSource = `
      precision mediump float;
      attribute vec2 a_position;
      attribute vec4 a_color;
      attribute float a_width;
      uniform float u_time;
      varying vec4 v_color;
      
      void main() {
        vec2 pos = a_position;
        
        // Subtle wave motion for liquid effect
        float wave = sin(u_time * 2.0 + pos.x * 10.0) * 0.002;
        pos.y += wave;
        
        gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
        gl_Position.y = -gl_Position.y;
        gl_PointSize = a_width;
        
        v_color = a_color;
      }
    `;
    
    // Fragment shader for smooth glowing liquid trail
    const fsSource = `
      precision mediump float;
      varying vec4 v_color;
      uniform float u_time;
      
      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        
        // Smooth circular falloff for liquid appearance
        float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
        
        // Soft glow effect
        float glow = exp(-dist * 4.0) * 0.5;
        alpha = alpha * 0.8 + glow;
        
        // Apply color with transparency
        alpha *= v_color.a;
        
        gl_FragColor = vec4(v_color.rgb, alpha);
      }
    `;
    
    // Compile shaders
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fsSource);
    
    if (!vertexShader || !fragmentShader) {
      this.enabled = false;
      return;
    }
    
    // Create program
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);
    
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(this.program));
      this.enabled = false;
      return;
    }
    
    // Get attribute and uniform locations
    this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.colorLocation = gl.getAttribLocation(this.program, 'a_color');
    this.widthLocation = gl.getAttribLocation(this.program, 'a_width');
    this.timeLocation = gl.getUniformLocation(this.program, 'u_time');
    
    // Create buffers
    this.positionBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    this.widthBuffer = gl.createBuffer();
    
    // Enable blending for smooth trails
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  
  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
  
  /**
   * Add trail point for a detected object
   * Creates smooth liquid trail that follows the object outline
   * Color based on threat level: green for non-threats, red for threats
   * @param {number} x - X position (0-1)
   * @param {number} y - Y position (0-1)
   * @param {string} type - Object type for determining threat status
   * @param {string} objectId - Unique ID for tracking object trajectory
   * @param {boolean} isThreat - Whether this object is a threat (determines color)
   * @param {Object} boundingBox - Optional bounding box {width, height} normalized
   */
  addTrailPoint(x, y, type = 'unknown', objectId = null, isThreat = false, boundingBox = null) {
    if (!this.enabled) return;
    
    // Generate object ID if not provided
    const trackId = objectId || `${type}_${Math.round(x * 100)}_${Math.round(y * 100)}`;
    
    // Track object position history for trajectory trail effect
    const now = Date.now();
    if (!this.trackedObjects.has(trackId)) {
      this.trackedObjects.set(trackId, { positions: [], lastSeen: now, isThreat });
    }
    
    const objectData = this.trackedObjects.get(trackId);
    objectData.lastSeen = now;
    objectData.isThreat = isThreat;
    objectData.positions.push({ x, y, timestamp: now, isThreat, boundingBox });
    
    // Keep only recent positions for trajectory
    if (objectData.positions.length > this.maxPositionHistory) {
      objectData.positions.shift();
    }
    
    // Clean up old tracked objects that haven't been seen recently
    for (const [id, data] of this.trackedObjects.entries()) {
      if (now - data.lastSeen > TRACKED_OBJECT_TIMEOUT_MS) {
        this.trackedObjects.delete(id);
      }
    }
  }
  
  /**
   * Generate trail segments from tracked object positions
   * Creates smooth liquid-like trail lines
   */
  generateTrailSegments() {
    this.trailSegments = [];
    
    for (const [, objectData] of this.trackedObjects) {
      const positions = objectData.positions;
      if (positions.length < 2) continue;
      
      // Determine color based on threat status
      // Green for non-threats: rgba(0, 255, 100, alpha)
      // Red for threats: rgba(255, 50, 50, alpha)
      const baseColor = objectData.isThreat 
        ? [1.0, 0.2, 0.2] // Red
        : [0.0, 1.0, 0.4]; // Green
      
      // Create trail segments along the position history
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const progress = i / (positions.length - 1); // 0 at start, 1 at end (current position)
        
        // Calculate alpha - fade out towards the tail
        const alpha = progress * 0.9 + 0.1; // Range from 0.1 to 1.0
        
        // Calculate width - thinner at tail, thicker at head
        const width = 4 + progress * 12; // Range from 4 to 16
        
        this.trailSegments.push({
          x: pos.x,
          y: pos.y,
          color: [...baseColor, alpha],
          width
        });
        
        // Add interpolated points between positions for smoother liquid effect
        if (i < positions.length - 1) {
          const nextPos = positions[i + 1];
          const steps = 3; // Interpolation steps between each position
          
          for (let j = 1; j < steps; j++) {
            const t = j / steps;
            const interpProgress = (i + t) / (positions.length - 1);
            const interpAlpha = interpProgress * 0.9 + 0.1;
            const interpWidth = 4 + interpProgress * 12;
            
            this.trailSegments.push({
              x: pos.x + (nextPos.x - pos.x) * t,
              y: pos.y + (nextPos.y - pos.y) * t,
              color: [...baseColor, interpAlpha],
              width: interpWidth
            });
          }
        }
      }
    }
    
    // Limit total segments
    if (this.trailSegments.length > this.maxSegments) {
      this.trailSegments = this.trailSegments.slice(-this.maxSegments);
    }
  }
  
  /**
   * Update and render fluid trail lines
   */
  render() {
    if (!this.enabled) return;
    
    // Generate trail segments from tracked positions
    this.generateTrailSegments();
    
    if (this.trailSegments.length === 0) return;
    
    const gl = this.gl;
    this.time += 0.016; // ~60fps time increment
    
    // Clear canvas
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Use program
    gl.useProgram(this.program);
    
    // Set time uniform
    gl.uniform1f(this.timeLocation, this.time);
    
    // Prepare data arrays
    const positions = new Float32Array(this.trailSegments.flatMap(t => [t.x, t.y]));
    const colors = new Float32Array(this.trailSegments.flatMap(t => t.color));
    const widths = new Float32Array(this.trailSegments.map(t => t.width));
    
    // Upload position data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    // Upload color data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.colorLocation);
    gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 0, 0);
    
    // Upload width data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.widthBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, widths, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.widthLocation);
    gl.vertexAttribPointer(this.widthLocation, 1, gl.FLOAT, false, 0, 0);
    
    // Draw points (liquid trail segments)
    gl.drawArrays(gl.POINTS, 0, this.trailSegments.length);
  }
  
  resize(width, height) {
    if (!this.enabled) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }
  
  clear() {
    this.trailSegments = [];
    this.trackedObjects.clear();
    this.time = 0;
    if (this.enabled) {
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
  }
  
  dispose() {
    if (!this.enabled) return;
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.colorBuffer);
    gl.deleteBuffer(this.widthBuffer);
  }
}

export default FluidSimulation;
