/**
 * Minovsky Particle Simulation for drone trail effects
 * Inspired by Minovsky particles from Mobile Suit Gundam
 * Features: Pink/magenta ionized particles, interference patterns, energy dispersal
 */

class FluidSimulation {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { 
      alpha: true, 
      preserveDrawingBuffer: true,
      premultipliedAlpha: false 
    });
    
    if (!this.gl) {
      console.warn('WebGL not supported, Minovsky particle effects disabled');
      this.enabled = false;
      return;
    }
    
    this.enabled = true;
    this.particles = [];
    this.trails = [];
    this.maxTrails = 200; // More particles for dense Minovsky field
    this.time = 0;
    this.interferenceWaves = [];
    
    this.initGL();
  }
  
  initGL() {
    const gl = this.gl;
    
    // Vertex shader with time-based animation
    const vsSource = `
      precision mediump float;
      attribute vec2 a_position;
      attribute vec4 a_color;
      attribute float a_size;
      attribute float a_phase;
      uniform float u_time;
      varying vec4 v_color;
      varying float v_phase;
      
      void main() {
        // Add subtle oscillation for Minovsky particle interference
        vec2 pos = a_position;
        float wave = sin(u_time * 3.0 + a_phase * 6.28318) * 0.003;
        pos.x += wave;
        pos.y += cos(u_time * 2.5 + a_phase * 6.28318) * 0.002;
        
        gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
        gl_Position.y = -gl_Position.y;
        
        // Pulsating size for energy effect
        float sizePulse = 1.0 + sin(u_time * 5.0 + a_phase * 6.28318) * 0.2;
        gl_PointSize = a_size * sizePulse;
        
        v_color = a_color;
        v_phase = a_phase;
      }
    `;
    
    // Fragment shader with Minovsky particle glow effect
    const fsSource = `
      precision mediump float;
      varying vec4 v_color;
      varying float v_phase;
      uniform float u_time;
      
      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        
        // Core particle - bright center
        float core = 1.0 - smoothstep(0.0, 0.15, dist);
        
        // Inner glow - characteristic Minovsky pink
        float innerGlow = 1.0 - smoothstep(0.0, 0.3, dist);
        
        // Outer dispersal field
        float outerField = 1.0 - smoothstep(0.2, 0.5, dist);
        
        // Interference pattern rings
        float rings = sin(dist * 30.0 - u_time * 3.0 + v_phase * 6.28318) * 0.5 + 0.5;
        rings *= (1.0 - smoothstep(0.1, 0.4, dist));
        
        // Combine effects
        float alpha = core * 1.0 + innerGlow * 0.6 + outerField * 0.3 + rings * 0.2;
        alpha *= v_color.a;
        
        // Color shift for energy dispersal (pink to magenta to white core)
        vec3 coreColor = vec3(1.0, 1.0, 1.0);
        vec3 glowColor = v_color.rgb;
        vec3 finalColor = mix(glowColor, coreColor, core * 0.7);
        
        // Add slight blue shift at edges for I-field effect
        finalColor = mix(finalColor, vec3(0.6, 0.4, 1.0), outerField * 0.3 * (1.0 - core));
        
        gl_FragColor = vec4(finalColor, alpha * 0.9);
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
    this.sizeLocation = gl.getAttribLocation(this.program, 'a_size');
    this.phaseLocation = gl.getAttribLocation(this.program, 'a_phase');
    this.timeLocation = gl.getUniformLocation(this.program, 'u_time');
    
    // Create buffers
    this.positionBuffer = gl.createBuffer();
    this.colorBuffer = gl.createBuffer();
    this.sizeBuffer = gl.createBuffer();
    this.phaseBuffer = gl.createBuffer();
    
    // Enable additive blending for energy effect
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
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
   * Add Minovsky particle trail for a detected object
   * Creates characteristic pink/magenta ionized particles with interference patterns
   * @param {number} x - X position (0-1)
   * @param {number} y - Y position (0-1)
   * @param {string} type - Object type for color intensity
   */
  addTrailPoint(x, y, type = 'drone') {
    if (!this.enabled) return;
    
    // Minovsky particle colors - characteristic pink/magenta with variations
    const minovskyColors = {
      // Primary Minovsky pink - most common
      primary: [1.0, 0.4, 0.7, 1.0],
      // Hot magenta - high energy
      hot: [1.0, 0.2, 0.6, 1.0],
      // Dispersed violet - interference field
      dispersed: [0.8, 0.3, 1.0, 1.0],
      // White-pink core - mega particle
      core: [1.0, 0.7, 0.9, 1.0],
      // Blue-shifted - I-field interaction
      iField: [0.7, 0.5, 1.0, 1.0]
    };
    
    // Intensity based on threat type
    const intensityMap = {
      drone: 1.0,
      quadcopter: 1.2,
      'fixed-wing': 0.8,
      helicopter: 1.1,
      vehicle: 0.6,
      person: 0.9,
      default: 0.7
    };
    
    // Color variations for different tracked types
    const typeColorShift = {
      drone: [0, 0, 0],         // Default pink
      quadcopter: [0.1, 0, 0],  // Slightly more red
      'fixed-wing': [0, 0, 0.1], // Slightly more violet
      helicopter: [0, 0.1, 0],  // Slightly more magenta
      person: [0, 0.2, 0.3],    // More cyan/blue for persons
      vehicle: [-0.2, 0.2, 0],  // More green for vehicles
      default: [0, 0, 0]
    };
    
    const intensity = intensityMap[type] || intensityMap.default;
    const colorShift = typeColorShift[type] || typeColorShift.default;
    
    // Apply color shift to Minovsky colors for this type
    const shiftColor = (color) => [
      Math.max(0, Math.min(1, color[0] + colorShift[0])),
      Math.max(0, Math.min(1, color[1] + colorShift[1])),
      Math.max(0, Math.min(1, color[2] + colorShift[2])),
      color[3]
    ];
    
    // Add core Minovsky particle (bright center)
    this.trails.push({
      x,
      y,
      color: shiftColor(minovskyColors.core),
      size: 25 * intensity,
      life: 1.0,
      decay: 0.015,
      phase: Math.random(),
      velocityX: (Math.random() - 0.5) * 0.001,
      velocityY: (Math.random() - 0.5) * 0.001
    });
    
    // Add primary Minovsky particles (characteristic pink glow)
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
      const distance = 0.01 + Math.random() * 0.02;
      
      this.trails.push({
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        color: shiftColor(minovskyColors.primary),
        size: (15 + Math.random() * 10) * intensity,
        life: 0.9,
        decay: 0.02 + Math.random() * 0.01,
        phase: Math.random(),
        velocityX: Math.cos(angle) * 0.0005,
        velocityY: Math.sin(angle) * 0.0005
      });
    }
    
    // Add hot magenta particles (energy dispersal)
    for (let i = 0; i < 3; i++) {
      this.trails.push({
        x: x + (Math.random() - 0.5) * 0.03,
        y: y + (Math.random() - 0.5) * 0.03,
        color: shiftColor(minovskyColors.hot),
        size: (10 + Math.random() * 8) * intensity,
        life: 0.7,
        decay: 0.025 + Math.random() * 0.015,
        phase: Math.random(),
        velocityX: (Math.random() - 0.5) * 0.002,
        velocityY: (Math.random() - 0.5) * 0.002
      });
    }
    
    // Add dispersed violet particles (interference field)
    for (let i = 0; i < 4; i++) {
      this.trails.push({
        x: x + (Math.random() - 0.5) * 0.05,
        y: y + (Math.random() - 0.5) * 0.05,
        color: shiftColor(minovskyColors.dispersed),
        size: (8 + Math.random() * 6) * intensity,
        life: 0.6,
        decay: 0.03 + Math.random() * 0.02,
        phase: Math.random(),
        velocityX: (Math.random() - 0.5) * 0.003,
        velocityY: (Math.random() - 0.5) * 0.003
      });
    }
    
    // Add I-field interaction particles (blue-shifted outer ring)
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 0.04 + Math.random() * 0.02;
      
      this.trails.push({
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        color: shiftColor(minovskyColors.iField),
        size: (6 + Math.random() * 4) * intensity,
        life: 0.5,
        decay: 0.035,
        phase: Math.random(),
        velocityX: Math.cos(angle) * 0.001,
        velocityY: Math.sin(angle) * 0.001
      });
    }
    
    // Limit trails
    if (this.trails.length > this.maxTrails) {
      this.trails = this.trails.slice(-this.maxTrails);
    }
  }
  
  /**
   * Update and render Minovsky particle trails
   */
  render() {
    if (!this.enabled || this.trails.length === 0) return;
    
    const gl = this.gl;
    this.time += 0.016; // ~60fps time increment
    
    // Update trails with Minovsky particle physics
    this.trails = this.trails.filter(trail => {
      trail.life -= trail.decay;
      trail.color[3] = trail.life * trail.life; // Quadratic falloff for smoother fade
      trail.size *= 0.985; // Gradual size reduction
      
      // Apply velocity for particle drift
      if (trail.velocityX) {
        trail.x += trail.velocityX;
        trail.y += trail.velocityY;
        // Slow down velocity (particle deceleration in Minovsky field)
        trail.velocityX *= 0.98;
        trail.velocityY *= 0.98;
      }
      
      return trail.life > 0.05;
    });
    
    if (this.trails.length === 0) return;
    
    // Clear canvas with slight persistence for trail effect
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Use program
    gl.useProgram(this.program);
    
    // Set time uniform
    gl.uniform1f(this.timeLocation, this.time);
    
    // Prepare data arrays
    const positions = new Float32Array(this.trails.flatMap(t => [t.x, t.y]));
    const colors = new Float32Array(this.trails.flatMap(t => t.color));
    const sizes = new Float32Array(this.trails.map(t => t.size));
    const phases = new Float32Array(this.trails.map(t => t.phase || 0));
    
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
    
    // Upload size data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.sizeLocation);
    gl.vertexAttribPointer(this.sizeLocation, 1, gl.FLOAT, false, 0, 0);
    
    // Upload phase data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.phaseBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, phases, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.phaseLocation);
    gl.vertexAttribPointer(this.phaseLocation, 1, gl.FLOAT, false, 0, 0);
    
    // Draw points
    gl.drawArrays(gl.POINTS, 0, this.trails.length);
  }
  
  resize(width, height) {
    if (!this.enabled) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }
  
  clear() {
    this.trails = [];
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
    gl.deleteBuffer(this.sizeBuffer);
    gl.deleteBuffer(this.phaseBuffer);
  }
}

export default FluidSimulation;
