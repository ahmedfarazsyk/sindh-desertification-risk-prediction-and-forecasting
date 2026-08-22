# Spatio-Temporal ConvGRU UNet Inference

1. Loading the Hyderabad geometry data for inference for 2025 year (Jan, Apr, Jul, Oct) only DSI Channel.
2. Defining Sindh ConvGRU UNet architecture, exactly as it was defined during training
3. Loading the Saved weights of Model B from hugging face.
4. Loading the dataset into memory and forecasting DSI (Desertification Sensitivity Index) for the next 5 years
5. Visualizing Results
   - Quarterly forecast from 2026 to 2030
   - Quarterly forecast from 2026 to 2030 gif.
   - Quarterly distribution histograms.
   - Annual distribution histograms
   - Forecasted shift in desertification sensitivity
   - Forecasting spatial change in DSI (2030 annual mean vs 2025 baseline)
   - Seasonal DSI fluctuations 2025 baseline vs all forecasted years
   - Continuous Macro Trend: DSI progression from 2025 to 2030
   - Increasing Spatial Heterogeneity: DSI polarization 2025 to 2030
