# MINOVSKI

**Optical Vision Drone Detection System with Minovsky Particle Tracking**

A React-based web application that uses your device's camera to detect and track drones, quadcopters, fixed-wing sUAS, and other aerial vehicles in real-time. Features **YOLOv8 via ONNX Runtime Web** for detection, Gundam-inspired Minovsky particle trail effects, and multi-device sensor network capabilities.

## 🚀 Features

- **YOLOv8 Object Detection**: Uses ONNX Runtime Web to run YOLOv8 models directly in the browser
- **Fallback Support**: Automatic fallback to TensorFlow.js COCO-SSD if YOLOv8 model unavailable
- **Minovsky Particle Trails**: WebGL-powered particle effects inspired by Mobile Suit Gundam
- **Audio/Haptic Alerts**: Buzzer notifications and device vibration for threat detection
- **Multi-Device Network**: Connect multiple devices via WebRTC to create a distributed sensor network
- **Mobile-First Design**: Optimized for smartphone cameras with responsive UI
- **Anime.js Animations**: Smooth, professional UI animations throughout the app

## 🎯 Detected Object Types

- Drones / Quadcopters (via bird/kite proxy detection)
- Fixed-wing aircraft (airplane class)
- Helicopters
- Ground vehicles (cars, trucks, buses)
- Personnel

## 📱 Usage

1. Open the app on your mobile device
2. Grant camera permissions when prompted
3. Click "Start Tracking" to begin detection
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
- **ONNX Runtime Web** - YOLOv8 inference in browser
- **TensorFlow.js + COCO-SSD** - Fallback detection model
- **WebGL** - Minovsky particle effects
- **Anime.js v4** - UI animations
- **PeerJS** - WebRTC for multi-device communication
- **Web Audio API** - Alert sounds

## 🔧 YOLOv8 Model Setup

To use YOLOv8 detection, you need to provide an ONNX model:

```bash
# Install ultralytics
pip install ultralytics

# Export YOLOv8n to ONNX
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='onnx', imgsz=640, simplify=True)"

# Copy to public/models/
cp yolov8n.onnx public/models/
```

See `public/models/README.md` for more details.

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

- Modern web browser with WebGL and WebAssembly support
- Camera access (rear camera preferred)
- HTTPS connection (required for camera access)

## 🔒 Privacy

- All processing happens locally on your device
- No video or images are sent to external servers
- Network features use peer-to-peer connections

## ⚠️ Disclaimer

This is a prototype/demonstration application. For optimal drone detection, train a custom YOLOv8 model on drone datasets.

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

## 📜 License

MIT License
