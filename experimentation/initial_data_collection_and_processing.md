# Initial Data Collection and Processing

1. **Connect to Google Earth Engine Project**
2. **Geometry of Sindh is defined (boundary)**
3. **Stratified Disproportionate Sampling is done based on World cover data.** (1=Agriculture, 2=Arid/Desert, 3=Shrub/Grass, 4=Coastal/Mangrove)
   - 300 points for Agriculture
   - 300 points for Arid/Desert
   - 200 points for Shrub/Grass
   - 200 points for Coastal/Mangrove
   - Total 1000 points.

> **Note**: A pixel has a height of 10 meters and width of 10 meters. A patch has a height of 64 pixels and width of 64 pixels. (OR) A patch has a height of 640 meters and width of 640 meters.

4. **The above stratified 1000 points are converted into patches of 640m x 640m.** 
   - **Goal:**
     - Train Set --> 2016-2023: 400 patches
     - Validation Set --> 2016-2023: 100 patches
     - Test Set --> 2024-2026 (2 months): 500 patches (different from train and validation set)

5. **Data is first fetched from GEE and stored in Google Drive.** 
   - Folder is created for each year from 2016 - 2026. 
   - Each folder contains its relevant 500 patches files for that year. 
   - 1 patch file dimensions = 12 months x 38 channels x 64 height x 64 width (OR) 456 x 64 x 64

6. **These files are further processed and the above time dimension is concatenated to create three folders: train, val and test.**
   - `train` folder contains 500 patches with dimensions = 96 months x 38 channels x 64 height x 64 width
   - `val` folder contains 100 patches with dimension = 96 months x 38 channels x 64 height x 64 width
   - `test` folder contains 500 (excluded from train and val) patches with dimensions = 26 months x 38 channels x 64 height x 64 width
