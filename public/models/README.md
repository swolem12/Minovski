# YOLOv8 Model Setup

This directory should contain the YOLOv8 ONNX model for browser-based inference.

## How to Get the Model

1. **Install ultralytics**:
   ```bash
   pip install ultralytics
   ```

2. **Export YOLOv8n to ONNX**:
   ```python
   from ultralytics import YOLO
   
   # Load YOLOv8 nano model (smallest, fastest)
   model = YOLO('yolov8n.pt')
   
   # Export to ONNX format
   model.export(format='onnx', imgsz=640, simplify=True)
   ```

3. **Copy the model**:
   ```bash
   cp yolov8n.onnx /path/to/Minovski/public/models/
   ```

## Model Options

| Model | Size | mAP | Speed |
|-------|------|-----|-------|
| yolov8n.onnx | ~6MB | 37.3 | Fastest |
| yolov8s.onnx | ~22MB | 44.9 | Fast |
| yolov8m.onnx | ~52MB | 50.2 | Medium |

For browser performance, **yolov8n** (nano) is recommended.

## Fallback

If no YOLOv8 model is found, the app automatically falls back to TensorFlow.js COCO-SSD model.
