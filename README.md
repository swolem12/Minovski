# MINOVSKI

<div align="center">

![Minovski Logo](https://img.shields.io/badge/MINOVSKI-Optical%20Threat%20Detection-00d4ff?style=for-the-badge&logo=radar&logoColor=white)

**Real-Time Aerial Threat Detection & Multi-Device Sensor Network**

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![YOLOv8](https://img.shields.io/badge/YOLOv8-ONNX-purple?style=flat-square)](https://docs.ultralytics.com/)
[![OpenCV](https://img.shields.io/badge/OpenCV.js-Contours-green?style=flat-square&logo=opencv)](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P-orange?style=flat-square)](https://webrtc.org/)

</div>

---

## 🎯 What is MINOVSKI?

**MINOVSKI** is a browser-based optical detection system designed to identify, track, and monitor aerial threats (drones, aircraft, UAVs) using your device's camera. Inspired by the Minovsky particle tracking systems from Mobile Suit Gundam, this application provides:

- **Real-time object detection** using YOLOv8 AI running directly in your browser
- **Contour-based outline tracking** (not bounding boxes) for clean, non-intrusive visuals
- **Multi-device sensor networks** for collaborative threat monitoring
- **Motion trail visualization** showing object movement patterns
- **Cross-network connectivity** for remote camera viewing between devices

### The Problem It Solves

Traditional drone detection systems are expensive, require specialized hardware, and can't easily be deployed across multiple locations. MINOVSKI turns any smartphone or laptop with a camera into a threat detection node that can:

1. **Detect aerial objects** in real-time using AI
2. **Track movement patterns** with fluid particle trails
3. **Network with other devices** to share detection data
4. **View remote cameras** from connected devices
5. **Alert users** with audio and visual notifications

---

## ✨ Key Features

### 🔍 OpenCV Contour Tracking (NEW)
Instead of cluttered bounding boxes, MINOVSKI uses **OpenCV.js contour detection** to draw precise outlines around detected objects. This provides:
- Clean, shape-following outlines
- Minimal UI with small pill-shaped labels
- Better visual clarity for tracking moving objects

### 🌐 Multi-Device Sensor Network
Connect multiple devices via WebRTC to create a distributed detection network:
- **Create a network** on one device (host)
- **Join from other devices** using the host's Device ID
- **Share detection data** in real-time across all connected devices
- **View remote cameras** - switch to see what other devices are seeing
- **Walkie-talkie** communication between devices
- **Chat messaging** for coordination

### 🔄 Reliable Cross-Network Connections
- **TURN server redundancy** with multiple providers
- **Automatic retry** with exponential backoff (3 attempts)
- **45-second timeout** for slower relay connections
- **Real-time connection progress** feedback
- **Detailed troubleshooting** when connection fails

### 🎨 Minovsky Particle Trails
WebGL-powered fluid simulation creates glowing particle trails that follow detected objects, showing:
- Movement direction and speed
- Threat vs non-threat color coding (red/green)
- Object trajectory over time

### 📱 Mobile-First Design
- Optimized for smartphone cameras
- Responsive UI works on any screen size
- Touch-friendly controls
- Night vision mode (torch toggle) when available
- Digital zoom support

---

## 🚀 Quick Start

### Online Demo
Visit the live demo: **https://swolem12.github.io/Minovski/**

### Local Development

```bash
# Clone the repository
git clone https://github.com/swolem12/Minovski.git
cd Minovski

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Basic Usage

1. **Open the app** on your device
2. **Grant camera permissions** when prompted
3. **Click "Start Tracking"** to begin detection
4. **Point your camera at the sky** to detect aerial objects
5. **View detected threats** with outline tracking and motion trails

### Multi-Device Network Setup

1. **Device A (Host)**: Click "Create Sensor Network"
2. **Copy the Device ID** displayed
3. **Device B**: Enter the Device ID and click "Join"
4. **All devices** now share detection data in real-time
5. **Host can view** remote cameras by clicking "View" on connected devices

---

## 🎯 Detection Capabilities

| Object Type | Detection Source | Threat Level |
|-------------|------------------|--------------|
| Drones / Quadcopters | Bird/Kite proxy | Medium-High |
| Fixed-wing Aircraft | Airplane class | High |
| Helicopters | Airplane class | High |
| Ground Vehicles | Car/Truck/Bus | Low |
| Personnel | Person class | Info |
| Airborne Objects | Ball/Frisbee | Low |

> **Note**: For optimal drone detection, train a custom YOLOv8 model on drone datasets. See [Training Resources](#-drone-detection-training-resources) below.

---

## 🛠️ Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| UI Framework | React 19 | Component-based interface |
| Build Tool | Vite 7 | Fast development & bundling |
| AI Detection | YOLOv8 via ONNX Runtime | Real-time object detection |
| Fallback AI | TensorFlow.js + COCO-SSD | Backup detection model |
| Contour Detection | OpenCV.js | Shape outline extraction |
| Particle Effects | WebGL | Minovsky fluid trails |
| Animations | Anime.js v4 | Smooth UI transitions |
| Networking | PeerJS (WebRTC) | P2P multi-device communication |
| Audio | Web Audio API | Threat alert sounds |

---

## 🔧 YOLOv8 Model Setup

To use YOLOv8 detection, provide an ONNX model:

```bash
# Install ultralytics
pip install ultralytics

# Export YOLOv8n to ONNX
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='onnx', imgsz=640, simplify=True)"

# Copy to public/models/
cp yolov8n.onnx public/models/
```

See `public/models/README.md` for more details.

---

## 🎓 Drone Detection Training Resources

For better drone detection accuracy, you can train a custom YOLO model using these forked datasets:

### Your Forked Datasets (Ready to Use!)

| Dataset | Description | Size | Your Fork |
|---------|-------------|------|-----------|
| **Seraphim Drone Detection** | 83,000+ drone images in YOLO format from 23 sources | 83,483 images | [swolem12/seraphim-drone-detection-dataset](https://github.com/swolem12/seraphim-drone-detection-dataset) |
| **Drone-Detection-YOLOv8x** | YOLOv8 model + dataset for real-time drone detection | 1,359 images | [swolem12/Drone-Detection-YOLOv8x](https://github.com/swolem12/Drone-Detection-YOLOv8x) |
| **drone-net** | YOLOv3 drone detection with pre-trained weights | Dataset + weights | [swolem12/drone-net](https://github.com/swolem12/drone-net) |

### Quick Start: Training Your Own Model

```bash
# 1. Clone your forked dataset
git clone https://github.com/swolem12/seraphim-drone-detection-dataset.git
cd seraphim-drone-detection-dataset

# 2. Install Ultralytics YOLO
pip install ultralytics

# 3. Train YOLOv8 on the drone dataset
yolo detect train data=data.yaml model=yolov8n.pt epochs=100 imgsz=640

# 4. Export to ONNX for browser use
yolo export model=runs/detect/train/weights/best.pt format=onnx imgsz=640 simplify=True

# 5. Copy to Minovski public folder
cp runs/detect/train/weights/best.onnx /path/to/Minovski/public/models/yolov8n.onnx
```

### Using Pre-trained Weights from drone-net

```bash
# Clone your forked drone-net repo (has pre-trained YOLOv3 weights)
git clone https://github.com/swolem12/drone-net.git
cd drone-net

# The repo includes pre-trained weights - convert to ONNX
# See the repo README for detailed instructions
```

### Using YOLOv8x Pre-trained Model

```bash
# Clone your forked YOLOv8x repo
git clone https://github.com/swolem12/Drone-Detection-YOLOv8x.git
cd Drone-Detection-YOLOv8x

# The repo includes trained weights - export to ONNX
yolo export model=best.pt format=onnx imgsz=640 simplify=True

# Copy to Minovski
cp best.onnx /path/to/Minovski/public/models/yolov8n.onnx
```

### Additional Resources

| Dataset | Description | Link |
|---------|-------------|------|
| **Drone Detection YOLOv11x** | Latest YOLOv11 with 90.5% mAP@50 | [GitHub](https://github.com/doguilmak/Drone-Detection-YOLOv11x) |
| **Military Drone Detection** | Shahed-136, Lancet, Orlan-10 with 94.8% mAP50 | [GitHub](https://github.com/takzen/yolo-military-drone-detection) |
| **VisDrone Dataset** | Large-scale drone detection benchmark | [GitHub](https://github.com/VisDrone/VisDrone-Dataset) |

---

## 📋 System Requirements

- **Browser**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Features Required**: WebGL, WebAssembly, WebRTC
- **Camera**: Any device camera (rear camera preferred for outdoor use)
- **Connection**: HTTPS required for camera access
- **Network**: Internet required for multi-device features (TURN relay)

---

## 🔒 Privacy & Security

| Aspect | Implementation |
|--------|---------------|
| **Processing** | All AI inference runs locally in your browser |
| **Video Data** | Never sent to external servers |
| **Network Traffic** | P2P connections with end-to-end encryption |
| **Storage** | Only Device ID stored in localStorage |
| **TURN Servers** | Public relay servers used only for NAT traversal |

---

## 🗺️ Roadmap

- [ ] Custom YOLOv8 model trained on drone datasets
- [ ] Instance segmentation for pixel-perfect outlines
- [ ] Object tracking with ID persistence across frames
- [ ] GPS integration for threat mapping
- [ ] Recording & playback of detection sessions
- [ ] Push notifications for background detection
- [ ] Desktop Electron app

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## ⚠️ Disclaimer

This is a **prototype/demonstration application** for educational purposes. It is NOT intended for:
- Military or defense applications
- Law enforcement surveillance
- Any illegal monitoring activities

For production drone detection systems, please use certified commercial solutions.

---

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ for the open-source community**

[Report Bug](https://github.com/swolem12/Minovski/issues) · [Request Feature](https://github.com/swolem12/Minovski/issues) · [Join Discussion](https://github.com/swolem12/Minovski/discussions)

</div>
