# Spatio-Temporal ConvGRU UNet Model 2

## 1. Architecture of ConvGRU-UNet Seq2Seq model
- **Shared CNN Encoder** — spatial compression per timestep
- **ConvGRU Encoder** — temporal state transfer across input steps
- **ConvGRU Decoder** — autoregressive unrolling of future steps
- **CNN Decoder** — spatial recovery via skip connections

## 2. Training Dataset
- **Each `.pt` file shape:** `(96, 38, 64, 64)`
  - 96 months (Jan 2016 - Dec 2023)
  - Channel 37 = DSI
- **Input:** `DSI[t, t+3, t+6, ..., t+33]` (12 samples spanning 34 months)
- **Target:** `DSI[t+36, t+39, ..., t+69]` (12 samples spanning the next 34 months)
- **Window start t:** 0 to 26 (96 - 70 + 1 = 27 windows per patch)
- **Total samples:**
  - Train: 400 patches x 27 windows/patch = 10,800
  - Val: 100 patches x 27 windows/patch = 2,700

## 3. Testing Dataset
- **Each `.pt` file shape:** `(26, 38, 64, 64)`
  - 26 months (Jan 2024 - Feb 2026)
  - DIFFERENT spatial locations than train/val, AND a different time period — this tests spatial and temporal generalization together, not either one alone. There is no valid way to "borrow" months from train/val to extend a test window, since they aren't the same physical locations.
- **Window footprint:** `(2*4 - 1)*3 + 1 = 22` months.
- **Input:** `DSI[t, t+3, t+6, t+9]` (4 samples spanning 10 months)
- **Target:** `DSI[t+12, t+15, t+18, t+21]` (4 samples spanning the next 10 months)
- **Window start t:** 0 to 4 (26 - 22 + 1 = 5 windows per patch)
- **Total:** 500 patches x 5 windows/patch = 2,500 samples

## 4. Training
Model is trained.

## 5. Evaluation
Model is evaluated on test set.

## 6. Advanced Evaluation
- i. Temporal Drift Analysis
- ii. Test Time Augmentation
