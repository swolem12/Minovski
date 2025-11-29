# MINOVSKI

**Optical Vision Drone Detection System with Minovsky Particle Tracking**

A React-based web application that uses your device's camera and TensorFlow.js to detect and track drones, quadcopters, fixed-wing sUAS, and other aerial vehicles in real-time. Features Gundam-inspired Minovsky particle trail effects and multi-device sensor network capabilities.

## 🚀 Features

- **Real-time Object Detection**: Uses TensorFlow.js with COCO-SSD model for detecting aerial threats
- **Minovsky Particle Trails**: WebGL-powered particle effects inspired by Mobile Suit Gundam
- **Audio/Haptic Alerts**: Buzzer notifications and device vibration for threat detection
- **Multi-Device Network**: Connect multiple devices via WebRTC to create a distributed sensor network
- **Mobile-First Design**: Optimized for smartphone cameras with responsive UI
- **Anime.js Animations**: Smooth, professional UI animations throughout the app

## 🎯 Detected Object Types

- Drones / Quadcopters
- Fixed-wing aircraft
- Helicopters
- Ground vehicles
- Personnel

## 📱 Usage

1. Open the app on your mobile device
2. Grant camera permissions when prompted
3. Click "Start Camera" to begin detection
4. Point your camera at the sky to detect aerial objects
5. The app will automatically alert you when threats are detected

### Multi-Device Network

1. On the first device, click "Create Sensor Network"
2. Share the Device ID with other devices
3. On other devices, enter the Device ID and click "Join"
4. All connected devices will share detection data

## 🛠️ Technology Stack

- **React 19** - UI Framework
- **Vite** - Build tool
- **TensorFlow.js** - Machine learning in the browser
- **COCO-SSD** - Object detection model
- **WebGL** - Minovsky particle effects
- **Anime.js** - UI animations
- **PeerJS** - WebRTC for multi-device communication
- **Web Audio API** - Alert sounds

## 🚀 Deployment

The app is automatically deployed to GitHub Pages on push to main/master branch.

**Live Demo**: `https://[username].github.io/Minovski/`

## 💻 Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📋 Requirements

- Modern web browser with WebGL support
- Camera access (rear camera preferred)
- HTTPS connection (required for camera access)

## 🔒 Privacy

- All processing happens locally on your device
- No video or images are sent to external servers
- Network features use peer-to-peer connections

## ⚠️ Disclaimer

This is a prototype/demonstration application. The detection model is based on COCO-SSD which was not specifically trained for drone detection. For production use, a custom-trained model would be recommended.

## 📜 License

MIT License
