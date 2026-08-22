# Spatio-Temporal UNet Inference

1. Loading the Hyderabad geometry data for inference for a particular month (February) contains 33 channels
2. Defining Sindh UNet architecture, exactly as it was defined during training
3. Loading the Saved weights of Model A from hugging face.
4. Loading the dataset into memory and predicting DSI (Desertification Sensitivity Index).
5. Visualizing Results
   - 4 panel dashboard
   - 33 Channel Input data
   - Global feature Importance for desertification sensitivity
   - Hexbin plots for top two features w.r.t DSI.
