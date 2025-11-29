import { useEffect, useRef, useMemo } from 'react';
import { animate, utils } from 'animejs';
import './LandingPage.css';

function LandingPage({ onStartTracking }) {
  const containerRef = useRef(null);
  const logoRef = useRef(null);
  const featuresRef = useRef(null);
  
  // Pre-generate stable particle positions
  const particles = useMemo(() => {
    return [...Array(20)].map((_, i) => ({
      id: i,
      left: ((i * 17) % 100), // deterministic pseudo-random positions
      top: ((i * 23) % 100),
      delay: (i * 0.1) % 2
    }));
  }, []);
  
  // Animate page load
  useEffect(() => {
    // Logo animation
    if (logoRef.current) {
      animate(logoRef.current, {
        opacity: [0, 1],
        translateY: [-40, 0],
        duration: 800,
        ease: 'outQuad'
      });
    }
    
    // Features animation with stagger
    animate('.feature-card', {
      opacity: [0, 1],
      translateY: [30, 0],
      delay: utils.stagger(100, { start: 400 }),
      duration: 600,
      ease: 'outQuad'
    });
    
    // Button animation
    animate('.btn-start-tracking-main', {
      opacity: [0, 1],
      scale: [0.9, 1],
      delay: 800,
      duration: 500,
      ease: 'outBack'
    });
    
    // Particle background animation
    animate('.particle', {
      translateY: [0, -20],
      opacity: [0.3, 0.8, 0.3],
      delay: utils.stagger(200),
      duration: 3000,
      loop: true,
      ease: 'inOutSine'
    });
  }, []);
  
  const handleStartClick = () => {
    // Exit animation
    animate(containerRef.current, {
      opacity: [1, 0],
      translateY: [0, -20],
      duration: 400,
      ease: 'inQuad'
    }).then(() => {
      onStartTracking();
    });
  };

  return (
    <div className="landing-page" ref={containerRef}>
      {/* Animated background particles */}
      <div className="particles-bg">
        {particles.map((particle) => (
          <div 
            key={particle.id} 
            className="particle"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              animationDelay: `${particle.delay}s`
            }}
          />
        ))}
      </div>
      
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content" ref={logoRef}>
          <div className="logo-large">
            <span className="logo-icon-large">◆</span>
            <h1 className="logo-title">MINOVSKI</h1>
          </div>
          <p className="hero-tagline">Optical Threat Detection System</p>
          <p className="hero-description">
            Advanced AI-powered drone detection using your device&apos;s camera. 
            Identify aerial threats in real-time with Minovsky particle tracking technology.
          </p>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="features-section" ref={featuresRef}>
        <div className="feature-card">
          <span className="feature-icon">🎯</span>
          <h3>Real-Time Detection</h3>
          <p>YOLOv8 AI detects drones, aircraft, and aerial objects instantly</p>
        </div>
        
        <div className="feature-card">
          <span className="feature-icon">🌐</span>
          <h3>Sensor Network</h3>
          <p>Connect multiple devices to create a distributed detection network</p>
        </div>
        
        <div className="feature-card">
          <span className="feature-icon">🔔</span>
          <h3>Threat Alerts</h3>
          <p>Audio and haptic notifications when threats are detected</p>
        </div>
        
        <div className="feature-card">
          <span className="feature-icon">✨</span>
          <h3>Particle Trails</h3>
          <p>Visual tracking with Minovsky particle effect technology</p>
        </div>
      </section>
      
      {/* Start Tracking CTA */}
      <section className="cta-section">
        <button 
          className="btn-start-tracking-main"
          onClick={handleStartClick}
        >
          <span className="btn-icon-main">📡</span>
          <span className="btn-text-main">Start Tracking</span>
          <span className="btn-subtitle-main">Begin Aerial Threat Detection</span>
        </button>
        
        <p className="privacy-notice">
          🔒 All processing happens locally on your device. No data is sent externally.
        </p>
      </section>
      
      {/* Footer Info */}
      <footer className="landing-footer">
        <p>Point your camera at the sky to detect aerial threats</p>
        <p className="version-info">Minovsky Particle Tracking v1.0</p>
      </footer>
    </div>
  );
}

export default LandingPage;
