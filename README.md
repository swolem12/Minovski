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

For better drone detection accuracy, you can train a custom YOLO model using these open-source datasets:

### Recommended Datasets

| Dataset | Description | Size | Link |
|---------|-------------|------|------|
| **Seraphim Drone Detection Dataset** | Curated collection of 83,000+ drone images in YOLO format from 23 open-source datasets. Ideal for training robust detection models. | 83,483 images | [HuggingFace](https://huggingface.co/datasets/lgrzybowski/seraphim-drone-detection-dataset) / [GitHub](https://github.com/Seraphim-Defence-Systems/seraphim-drone-detection-dataset) |
| **Drone Detection YOLOv11x** | Pre-trained YOLOv11x weights for drone detection with 90.5% mAP@50. Includes heatmap visualization. | 1,359 images | [GitHub](https://github.com/doguilmak/Drone-Detection-YOLOv11x) / [HuggingFace Weights](https://huggingface.co/doguilmak/Drone-Detection-YOLOv11x) |
| **Military Drone Detection** | Detects Shahed-136, Lancet, Orlan-10, and other military UAVs with 94.8% mAP50. | Synthetic data | [GitHub](https://github.com/takzen/yolo-military-drone-detection) |
| **Drone Detection Dataset** | Labeled drone images from Kaggle and Mendeley sources for diverse training. | Various | [GitHub](https://github.com/tarlanahad/drone-detection-dataset) |

### Training Your Own Model

```bash
# Install Ultralytics YOLO
pip install ultralytics

# Download a drone dataset (example using Seraphim dataset)
# wget https://huggingface.co/datasets/lgrzybowski/seraphim-drone-detection-dataset/resolve/main/data.zip

# Train YOLOv8 on drone dataset
yolo detect train data=drone_dataset/data.yaml model=yolov8n.pt epochs=100 imgsz=640

# Export to ONNX for browser use
yolo export model=runs/detect/train/weights/best.pt format=onnx imgsz=640 simplify=True

# Copy to Minovski public folder
cp runs/detect/train/weights/best.onnx public/models/yolov8n.onnx
```

### Using Pre-trained Drone Weights

You can download pre-trained drone detection weights from:
- [Drone-Detection-YOLOv11x](https://huggingface.co/doguilmak/Drone-Detection-YOLOv11x/tree/main/weight)
- Convert to ONNX format and place in `public/models/` directory

## 📜 License

MIT License
