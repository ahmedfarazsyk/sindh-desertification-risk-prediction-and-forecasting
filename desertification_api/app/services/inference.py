import os
import torch
import numpy as np
import rasterio
from rasterio.windows import Window
from torch.utils.data import Dataset, DataLoader
from huggingface_hub import hf_hub_download

from app.models.unet import SindhUNet
from app.models.convgru import SindhConvGRUUNet
from app.core.config import settings

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

class LiveGeoTIFFDataset(Dataset):
    def __init__(self, tiff_path, patch_size=64):
        self.tiff_path = tiff_path
        self.patch_size = patch_size
        with rasterio.open(tiff_path) as src:
            self.H, self.W = src.height, src.width
        self.rows = int(np.ceil(self.H / patch_size))
        self.cols = int(np.ceil(self.W / patch_size))
        self.total_patches = self.rows * self.cols

    def __len__(self):
        return self.total_patches

    def __getitem__(self, idx):
        r = idx // self.cols
        c = idx % self.cols
        y = r * self.patch_size
        x = c * self.patch_size

        with rasterio.open(self.tiff_path) as src:
            window = Window(x, y, self.patch_size, self.patch_size)
            data = src.read(window=window, boundless=True, fill_value=0.0)

        data = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)
        return torch.tensor(data, dtype=torch.float32), r, c

class LiveGeoTIFFSequenceDataset(Dataset):
    def __init__(self, tiff_path, patch_size=64, stride=32):
        self.tiff_path = tiff_path
        self.patch_size = patch_size
        self.stride = stride
        with rasterio.open(tiff_path) as src:
            self.H, self.W = src.height, src.width
            self.C = src.count

        self.y_starts = list(range(0, self.H, stride))
        self.x_starts = list(range(0, self.W, stride))
        self.coords = [(y, x) for y in self.y_starts for x in self.x_starts]

    def __len__(self):
        return len(self.coords)

    def __getitem__(self, idx):
        y, x = self.coords[idx]
        with rasterio.open(self.tiff_path) as src:
            window = Window(x, y, self.patch_size, self.patch_size)
            data = src.read(window=window, boundless=True, fill_value=0.0)

        data = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)
        tensor_data = torch.tensor(data, dtype=torch.float32).unsqueeze(1)
        return tensor_data, y, x

def run_current_inference(input_tiff: str, output_tiff: str):
    # Download weights if missing
    model_path = os.path.join(settings.CHECKPOINT_DIR, "unet_best.pth")
    if not os.path.exists(model_path):
        hf_hub_download(repo_id=settings.HF_REPO_MODEL_A, filename="unet_best.pth", local_dir=settings.CHECKPOINT_DIR)
        hf_hub_download(repo_id=settings.HF_REPO_MODEL_A, filename="unet_mean.pt", local_dir=settings.CHECKPOINT_DIR)
        hf_hub_download(repo_id=settings.HF_REPO_MODEL_A, filename="unet_std.pt", local_dir=settings.CHECKPOINT_DIR)

    global_mean = torch.load(os.path.join(settings.CHECKPOINT_DIR, "unet_mean.pt"), map_location=device)
    global_std = torch.load(os.path.join(settings.CHECKPOINT_DIR, "unet_std.pt"), map_location=device)

    model = SindhUNet(in_channels=33, base_ch=64).to(device)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()

    patch_size = 64
    dataset = LiveGeoTIFFDataset(input_tiff, patch_size=patch_size)
    dataloader = DataLoader(dataset, batch_size=128, shuffle=False)

    output_dsi = np.zeros((dataset.H, dataset.W), dtype=np.float32)

    with torch.no_grad():
        for X, rows, cols in dataloader:
            X = X.to(device)
            X = torch.clamp(X, -100.0, 100.0)
            X = (X - global_mean) / (global_std + 1e-8)

            preds = model(X).squeeze(1).cpu().numpy()

            for i in range(len(rows)):
                r, c = rows[i].item(), cols[i].item()
                y, x = r * patch_size, c * patch_size
                valid_h = min(patch_size, dataset.H - y)
                valid_w = min(patch_size, dataset.W - x)
                output_dsi[y:y+valid_h, x:x+valid_w] = preds[i, :valid_h, :valid_w]

    with rasterio.open(input_tiff) as src:
        out_meta = src.meta.copy()
    out_meta.update({'count': 1, 'dtype': 'float32', 'compress': 'lzw'})

    with rasterio.open(output_tiff, 'w', **out_meta) as dst:
        dst.write(output_dsi, 1)


def run_forecast_inference(input_tiff: str, output_tiff: str):
    model_path = os.path.join(settings.CHECKPOINT_DIR, "convgru_best.pth")
    if not os.path.exists(model_path):
        hf_hub_download(repo_id=settings.HF_REPO_MODEL_B, filename="convgru_best.pth", local_dir=settings.CHECKPOINT_DIR)

    model = SindhConvGRUUNet(base_ch=32).to(device)
    model.load_state_dict(torch.load(model_path, map_location=device))
    model.eval()

    patch_size, stride, n_passes = 64, 32, 5
    total_future_steps = 4 * n_passes

    dataset = LiveGeoTIFFSequenceDataset(input_tiff, patch_size=patch_size, stride=stride)
    dataloader = DataLoader(dataset, batch_size=64, shuffle=False)

    output_dsi_sum = np.zeros((total_future_steps, dataset.H, dataset.W), dtype=np.float32)
    weight_sum = np.zeros((dataset.H, dataset.W), dtype=np.float32)
    
    window_1d = np.hamming(patch_size)
    window_2d = np.outer(window_1d, window_1d)

    with torch.no_grad():
        for X_seq, ys, xs in dataloader:
            X_seq = X_seq.to(device)
            preds = model.rollout(X_seq, n_passes=n_passes).squeeze(2).cpu().numpy()

            for i in range(len(ys)):
                y, x = ys[i].item(), xs[i].item()
                valid_h = min(patch_size, dataset.H - y)
                valid_w = min(patch_size, dataset.W - x)
                window_crop = window_2d[:valid_h, :valid_w]

                for b in range(total_future_steps):
                    output_dsi_sum[b, y:y+valid_h, x:x+valid_w] += preds[i, b, :valid_h, :valid_w] * window_crop
                weight_sum[y:y+valid_h, x:x+valid_w] += window_crop

    output_dsi = output_dsi_sum / (weight_sum + 1e-8)

    with rasterio.open(input_tiff) as src:
        out_meta = src.meta.copy()
    out_meta.update({'count': total_future_steps, 'dtype': 'float32', 'compress': 'lzw'})

    with rasterio.open(output_tiff, 'w', **out_meta) as dst:
        for b in range(total_future_steps):
            dst.write(output_dsi[b], b + 1)