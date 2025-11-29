/**
 * WebGL Fluid Simulation for drone tracking
 * Based on Pavel Dobryakov's WebGL-Fluid-Simulation (MIT License)
 * Simplified to show small colored fluid splats behind tracked objects
 * 
 * Original: https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 * Copyright (c) 2017 Pavel Dobryakov
 */

// Configuration for fluid simulation
const config = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: 512,
  DENSITY_DISSIPATION: 0.97,
  VELOCITY_DISSIPATION: 0.98,
  PRESSURE: 0.8,
  PRESSURE_ITERATIONS: 20,
  CURL: 30,
  SPLAT_RADIUS: 0.15,
  SPLAT_FORCE: 6000,
};

// Trail colors - threat-based
const THREAT_COLOR = { r: 1.0, g: 0.2, b: 0.2 }; // Red for threats
const SAFE_COLOR = { r: 0.2, g: 1.0, b: 0.4 }; // Green for non-threats

class FluidSimulation {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.ext = null;
    this.enabled = false;
    this.use2DFallback = false;
    
    // Track object positions
    this.trackedObjects = new Map();
    this.maxPositionHistory = 30;
    
    this.initWebGL();
  }
  
  initWebGL() {
    const params = { 
      alpha: true, 
      depth: false, 
      stencil: false, 
      antialias: false, 
      preserveDrawingBuffer: false 
    };

    let gl = this.canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2) {
      gl = this.canvas.getContext('webgl', params) || this.canvas.getContext('experimental-webgl', params);
    }
    
    if (!gl) {
      console.warn('WebGL not supported, using 2D fallback');
      this.use2DFallback = true;
      this.ctx = this.canvas.getContext('2d');
      return;
    }
    
    this.gl = gl;
    
    // Get extensions
    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
      gl.getExtension('EXT_color_buffer_float');
      supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
      halfFloat = gl.getExtension('OES_texture_half_float');
      supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : (halfFloat ? halfFloat.HALF_FLOAT_OES : gl.UNSIGNED_BYTE);
    
    // Get supported formats
    let formatRGBA = this.getSupportedFormat(gl, isWebGL2 ? gl.RGBA16F : gl.RGBA, gl.RGBA, halfFloatTexType, isWebGL2);
    let formatRG = this.getSupportedFormat(gl, isWebGL2 ? gl.RG16F : gl.RGBA, isWebGL2 ? gl.RG : gl.RGBA, halfFloatTexType, isWebGL2);
    let formatR = this.getSupportedFormat(gl, isWebGL2 ? gl.R16F : gl.RGBA, isWebGL2 ? gl.RED : gl.RGBA, halfFloatTexType, isWebGL2);

    this.ext = {
      formatRGBA,
      formatRG,
      formatR,
      halfFloatTexType,
      supportLinearFiltering: !!supportLinearFiltering
    };

    if (!formatRGBA) {
      console.warn('Required texture formats not supported, using 2D fallback');
      this.use2DFallback = true;
      this.ctx = this.canvas.getContext('2d');
      return;
    }
    
    this.enabled = true;
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    
    this.initShaders();
    this.initFramebuffers();
    this.initBlit();
  }
  
  getSupportedFormat(gl, internalFormat, format, type, isWebGL2) {
    if (!this.supportRenderTextureFormat(gl, internalFormat, format, type)) {
      if (isWebGL2) {
        switch (internalFormat) {
          case gl.R16F:
            return this.getSupportedFormat(gl, gl.RG16F, gl.RG, type, isWebGL2);
          case gl.RG16F:
            return this.getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type, isWebGL2);
          default:
            return null;
        }
      }
      return null;
    }
    return { internalFormat, format };
  }
  
  supportRenderTextureFormat(gl, internalFormat, format, type) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(fbo);
    return status === gl.FRAMEBUFFER_COMPLETE;
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
  
  createProgram(vertexShader, fragmentShader) {
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }
  
  getUniforms(program) {
    const gl = this.gl;
    const uniforms = {};
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const uniformName = gl.getActiveUniform(program, i).name;
      uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
  }
  
  initShaders() {
    const gl = this.gl;
    
    // Base vertex shader
    const baseVertexSource = `
      precision highp float;
      attribute vec2 aPosition;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform vec2 texelSize;

      void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;
    
    // Splat shader - creates colored spots
    const splatSource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uTarget;
      uniform float aspectRatio;
      uniform vec3 color;
      uniform vec2 point;
      uniform float radius;

      void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
      }
    `;
    
    // Advection shader - moves the fluid
    const advectionSource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uVelocity;
      uniform sampler2D uSource;
      uniform vec2 texelSize;
      uniform float dt;
      uniform float dissipation;

      void main () {
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        vec4 result = texture2D(uSource, coord);
        float decay = 1.0 + dissipation * dt;
        gl_FragColor = result / decay;
      }
    `;
    
    // Clear shader
    const clearSource = `
      precision mediump float;
      precision mediump sampler2D;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform float value;

      void main () {
        gl_FragColor = value * texture2D(uTexture, vUv);
      }
    `;
    
    // Display shader with transparency
    const displaySource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uTexture;

      void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float a = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c, a);
      }
    `;
    
    // Curl shader
    const curlSource = `
      precision mediump float;
      precision mediump sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;

      void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float vorticity = R - L - T + B;
        gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
      }
    `;
    
    // Vorticity shader
    const vorticitySource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;
      uniform sampler2D uCurl;
      uniform float curl;
      uniform float dt;

      void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;

        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;

        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity += force * dt;
        velocity = min(max(velocity, -1000.0), 1000.0);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
    `;
    
    // Divergence shader
    const divergenceSource = `
      precision mediump float;
      precision mediump sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;

      void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;

        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) { L = -C.x; }
        if (vR.x > 1.0) { R = -C.x; }
        if (vT.y > 1.0) { T = -C.y; }
        if (vB.y < 0.0) { B = -C.y; }

        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
      }
    `;
    
    // Pressure shader
    const pressureSource = `
      precision mediump float;
      precision mediump sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uDivergence;

      void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uPressure, vUv).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
      }
    `;
    
    // Gradient subtract shader
    const gradientSubtractSource = `
      precision mediump float;
      precision mediump sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uVelocity;

      void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
    `;
    
    // Copy shader
    const copySource = `
      precision mediump float;
      precision mediump sampler2D;
      varying vec2 vUv;
      uniform sampler2D uTexture;

      void main () {
        gl_FragColor = texture2D(uTexture, vUv);
      }
    `;
    
    // Compile shaders
    const baseVertex = this.compileShader(gl.VERTEX_SHADER, baseVertexSource);
    
    this.splatProgram = this.createProgramObject(baseVertex, splatSource);
    this.advectionProgram = this.createProgramObject(baseVertex, advectionSource);
    this.clearProgram = this.createProgramObject(baseVertex, clearSource);
    this.displayProgram = this.createProgramObject(baseVertex, displaySource);
    this.curlProgram = this.createProgramObject(baseVertex, curlSource);
    this.vorticityProgram = this.createProgramObject(baseVertex, vorticitySource);
    this.divergenceProgram = this.createProgramObject(baseVertex, divergenceSource);
    this.pressureProgram = this.createProgramObject(baseVertex, pressureSource);
    this.gradientSubtractProgram = this.createProgramObject(baseVertex, gradientSubtractSource);
    this.copyProgram = this.createProgramObject(baseVertex, copySource);
  }
  
  createProgramObject(vertexShader, fragmentSource) {
    const gl = this.gl;
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!fragmentShader) return null;
    
    const program = this.createProgram(vertexShader, fragmentShader);
    if (!program) return null;
    
    return {
      program,
      uniforms: this.getUniforms(program),
      bind() { gl.useProgram(this.program); }
    };
  }
  
  initFramebuffers() {
    const gl = this.gl;
    const ext = this.ext;
    
    const simRes = this.getResolution(config.SIM_RESOLUTION);
    const dyeRes = this.getResolution(config.DYE_RESOLUTION);
    
    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA;
    const rg = ext.formatRG || rgba;
    const r = ext.formatR || rgba;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    this.dye = this.createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    this.velocity = this.createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    this.divergence = this.createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    this.curl = this.createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    this.pressure = this.createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
  }
  
  getResolution(resolution) {
    const gl = this.gl;
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;

    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);

    if (gl.drawingBufferWidth > gl.drawingBufferHeight)
      return { width: max, height: min };
    else
      return { width: min, height: max };
  }
  
  createFBO(w, h, internalFormat, format, type, param) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const texelSizeX = 1.0 / w;
    const texelSizeY = 1.0 / h;

    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX,
      texelSizeY,
      attach: (id) => {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      }
    };
  }
  
  createDoubleFBO(w, h, internalFormat, format, type, param) {
    let fbo1 = this.createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = this.createFBO(w, h, internalFormat, format, type, param);

    return {
      width: w,
      height: h,
      texelSizeX: fbo1.texelSizeX,
      texelSizeY: fbo1.texelSizeY,
      get read() { return fbo1; },
      set read(value) { fbo1 = value; },
      get write() { return fbo2; },
      set write(value) { fbo2 = value; },
      swap() { const temp = fbo1; fbo1 = fbo2; fbo2 = temp; }
    };
  }
  
  initBlit() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
  }
  
  blit(target) {
    const gl = this.gl;
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }
  
  /**
   * Add trail point for a detected object
   */
  addTrailPoint(x, y, type = 'unknown', objectId = null, isThreat = false) {
    if (!this.enabled && !this.use2DFallback) return;
    
    const trackId = objectId || `${type}_${Math.round(x * 100)}_${Math.round(y * 100)}`;
    const now = Date.now();
    
    if (!this.trackedObjects.has(trackId)) {
      this.trackedObjects.set(trackId, {
        positions: [],
        lastSeen: now,
        isThreat,
        type
      });
    }
    
    const obj = this.trackedObjects.get(trackId);
    const prevPos = obj.positions.length > 0 ? obj.positions[obj.positions.length - 1] : null;
    
    obj.positions.push({ x, y, timestamp: now });
    obj.lastSeen = now;
    obj.isThreat = isThreat;
    
    // Keep limited history
    if (obj.positions.length > this.maxPositionHistory) {
      obj.positions.shift();
    }
    
    // Create splat if we have previous position (for velocity)
    if (this.enabled && prevPos) {
      const dx = (x - prevPos.x) * config.SPLAT_FORCE;
      const dy = (y - prevPos.y) * config.SPLAT_FORCE;
      const color = isThreat ? THREAT_COLOR : SAFE_COLOR;
      this.splat(x, 1.0 - y, dx, -dy, color);
    }
    
    // Cleanup old objects
    for (const [id, data] of this.trackedObjects.entries()) {
      if (now - data.lastSeen > 3000) {
        this.trackedObjects.delete(id);
      }
    }
  }
  
  splat(x, y, dx, dy, color) {
    if (!this.enabled || !this.splatProgram) return;
    
    const gl = this.gl;
    
    this.splatProgram.bind();
    gl.uniform1i(this.splatProgram.uniforms.uTarget, this.velocity.read.attach(0));
    gl.uniform1f(this.splatProgram.uniforms.aspectRatio, this.canvas.width / this.canvas.height);
    gl.uniform2f(this.splatProgram.uniforms.point, x, y);
    gl.uniform3f(this.splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(this.splatProgram.uniforms.radius, this.correctRadius(config.SPLAT_RADIUS / 100.0));
    this.blit(this.velocity.write);
    this.velocity.swap();

    gl.uniform1i(this.splatProgram.uniforms.uTarget, this.dye.read.attach(0));
    gl.uniform3f(this.splatProgram.uniforms.color, color.r * 0.3, color.g * 0.3, color.b * 0.3);
    this.blit(this.dye.write);
    this.dye.swap();
  }
  
  correctRadius(radius) {
    const aspectRatio = this.canvas.width / this.canvas.height;
    if (aspectRatio > 1) radius *= aspectRatio;
    return radius;
  }
  
  step(dt) {
    if (!this.enabled) return;
    
    const gl = this.gl;
    gl.disable(gl.BLEND);

    // Curl
    this.curlProgram.bind();
    gl.uniform2f(this.curlProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.curlProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    this.blit(this.curl);

    // Vorticity
    this.vorticityProgram.bind();
    gl.uniform2f(this.vorticityProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.vorticityProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(this.vorticityProgram.uniforms.uCurl, this.curl.attach(1));
    gl.uniform1f(this.vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(this.vorticityProgram.uniforms.dt, dt);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // Divergence
    this.divergenceProgram.bind();
    gl.uniform2f(this.divergenceProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.divergenceProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    this.blit(this.divergence);

    // Clear pressure
    this.clearProgram.bind();
    gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
    gl.uniform1f(this.clearProgram.uniforms.value, config.PRESSURE);
    this.blit(this.pressure.write);
    this.pressure.swap();

    // Pressure iterations
    this.pressureProgram.bind();
    gl.uniform2f(this.pressureProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.pressureProgram.uniforms.uDivergence, this.divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(this.pressureProgram.uniforms.uPressure, this.pressure.read.attach(1));
      this.blit(this.pressure.write);
      this.pressure.swap();
    }

    // Gradient subtract
    this.gradientSubtractProgram.bind();
    gl.uniform2f(this.gradientSubtractProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.gradientSubtractProgram.uniforms.uPressure, this.pressure.read.attach(0));
    gl.uniform1i(this.gradientSubtractProgram.uniforms.uVelocity, this.velocity.read.attach(1));
    this.blit(this.velocity.write);
    this.velocity.swap();

    // Advection - velocity
    this.advectionProgram.bind();
    gl.uniform2f(this.advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    const velocityId = this.velocity.read.attach(0);
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(this.advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
    gl.uniform1f(this.advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    this.blit(this.velocity.write);
    this.velocity.swap();

    // Advection - dye
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(this.advectionProgram.uniforms.uSource, this.dye.read.attach(1));
    gl.uniform1f(this.advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    this.blit(this.dye.write);
    this.dye.swap();
  }
  
  render() {
    if (this.use2DFallback) {
      this.render2D();
      return;
    }
    
    if (!this.enabled) return;
    
    const gl = this.gl;
    
    // Step the simulation
    this.step(0.016);
    
    // Render to screen
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    
    this.displayProgram.bind();
    gl.uniform1i(this.displayProgram.uniforms.uTexture, this.dye.read.attach(0));
    this.blit(null);
  }
  
  render2D() {
    if (!this.ctx) return;
    
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw simple trails for 2D fallback
    for (const [, obj] of this.trackedObjects) {
      if (obj.positions.length < 2) continue;
      
      const color = obj.isThreat ? THREAT_COLOR : SAFE_COLOR;
      
      for (let i = 1; i < obj.positions.length; i++) {
        const p1 = obj.positions[i - 1];
        const p2 = obj.positions[i];
        const alpha = i / obj.positions.length;
        
        const x1 = p1.x * this.canvas.width;
        const y1 = p1.y * this.canvas.height;
        const x2 = p2.x * this.canvas.width;
        const y2 = p2.y * this.canvas.height;
        
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, `rgba(${Math.round(color.r*255)}, ${Math.round(color.g*255)}, ${Math.round(color.b*255)}, ${alpha * 0.3})`);
        gradient.addColorStop(1, `rgba(${Math.round(color.r*255)}, ${Math.round(color.g*255)}, ${Math.round(color.b*255)}, ${alpha * 0.6})`);
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4 + alpha * 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  }
  
  resize(width, height) {
    if (width <= 0 || height <= 0) return;
    
    this.canvas.width = width;
    this.canvas.height = height;
    
    if (this.enabled && this.gl) {
      this.initFramebuffers();
    }
  }
  
  clear() {
    this.trackedObjects.clear();
    
    if (this.enabled && this.gl) {
      const gl = this.gl;
      gl.clearColor(0, 0, 0, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } else if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
  
  dispose() {
    this.trackedObjects.clear();
    
    if (this.enabled && this.gl) {
      // Clean up WebGL resources
      const gl = this.gl;
      if (this.dye) {
        gl.deleteTexture(this.dye.read.texture);
        gl.deleteTexture(this.dye.write.texture);
        gl.deleteFramebuffer(this.dye.read.fbo);
        gl.deleteFramebuffer(this.dye.write.fbo);
      }
      if (this.velocity) {
        gl.deleteTexture(this.velocity.read.texture);
        gl.deleteTexture(this.velocity.write.texture);
        gl.deleteFramebuffer(this.velocity.read.fbo);
        gl.deleteFramebuffer(this.velocity.write.fbo);
      }
    }
  }
}

export default FluidSimulation;
