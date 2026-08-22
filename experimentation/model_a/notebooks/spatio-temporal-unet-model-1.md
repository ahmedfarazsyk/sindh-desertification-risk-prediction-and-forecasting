# Spatio-Temporal UNet Model 1

## 1. Model Architecture for UNet
```text
Input  (B, 33, 64, 64)
Enc1   (B, 64,  64, 64)  + skip s1
Enc2   (B, 128, 32, 32)  + skip s2
Enc3   (B, 256, 16, 16)  + skip s3
Enc4   (B, 512,  8,  8)  + skip s4
Bot    (B, 512,  4,  4)
Dec4   (B, 256,  8,  8)  + s4
Dec3   (B, 128, 16, 16)  + s3
Dec2   (B,  64, 32, 32)  + s2
Dec1   (B,  32, 64, 64)  + s1
Head   (B,   1, 64, 64)  sigmoid → DSI in [0,1]
```

## 2. Train and Validation Dataset
Dataset for Model A (UNet DSI estimator).
- **Each `.pt` file shape:** `(96, 38, 64, 64)`
  - 96 months (Jan 2016 – Dec 2023)
  - 38 channels
  - 64×64 spatial
- **For each patch, every month is a separate sample:**
  - Input: channels 0-32 → `(33, 64, 64)` satellite observations
  - Target: channel 37 → `(1, 64, 64)` DSI map
- **Total samples:**
  - Train: 400 patches × 96 months = 38,400
  - Val: 100 patches × 96 months = 9,600

## 3. Test Dataset
Test dataset for Model A.
- **Each `.pt` file shape:** `(26, 38, 64, 64)`
  - 26 months (Jan 2024 – Feb 2026)
  - New spatial locations never seen during training
- **Every month is a separate sample.**
  - Total: 500 patches × 26 months = 13,000 samples

## 4. Normalization Stats and DSI Weighted Loss
- Combined weighted MSE + weighted MAE.
- Higher DSI pixels (severe desertification) get higher weights because they are rare but most important to predict correctly.
- **Weight schedule (mirrors I-ConvGRU rainfall weights):**
  - DSI < 0.2 → weight 1 (low sensitivity, common)
  - DSI < 0.4 → weight 2 (moderate sensitivity)
  - DSI < 0.6 → weight 5 (high sensitivity)
  - DSI >= 0.6 → weight 10 (severe desertification — rare, critical)
- `pred`, `target`: `(B, 1, 64, 64)` or `(B, 64, 64)`

## 5. Hugging Face Integration & Training
We connected with Hugging Face before training the model to store the best models after every epoch (training run) to avoid connection issues. Then we trained the model.

## 6. Testing
We tested out the model on the test set and computed some metrics.

## 7. Advanced Model Tests
- Stratified Error Analysis
- Perturbation Test
- Spatial Residual Mapping
