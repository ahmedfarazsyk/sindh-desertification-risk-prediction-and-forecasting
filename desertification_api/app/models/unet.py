import torch
import torch.nn as nn
import torch.nn.functional as F


# ============================================================
# ARCHITECTURE — UNet
# ============================================================
class DoubleConv(nn.Module):
    '''
    Two consecutive Conv2d → GroupNorm → SiLU blocks.
    Standard UNet building block.
    '''
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.GroupNorm(num_groups=max(1, out_ch // 8), num_channels=out_ch),
            nn.SiLU(),
            nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1, bias=False),
            nn.GroupNorm(num_groups=max(1, out_ch // 8), num_channels=out_ch),
            nn.SiLU(),
        )
    def forward(self, x):
        return self.block(x)


class DownBlock(nn.Module):
    '''DoubleConv → MaxPool2d. Returns both pre-pool (skip) and pooled.'''
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.conv = DoubleConv(in_ch, out_ch)
        self.pool = nn.MaxPool2d(2)

    def forward(self, x):
        skip = self.conv(x)   # full resolution — saved for skip connection
        down = self.pool(skip)
        return skip, down



class UpBlock(nn.Module):
    '''
    ConvTranspose2d upsampling → concat skip → DoubleConv.
    Recovers spatial detail lost during downsampling.
    '''
    def __init__(self, in_ch, skip_ch, out_ch):
        super().__init__()
        self.up   = nn.ConvTranspose2d(in_ch, in_ch // 2, kernel_size=2, stride=2)
        self.conv = DoubleConv(in_ch // 2 + skip_ch, out_ch)

    def forward(self, x, skip):
        x = self.up(x)
        # Handle any size mismatch from odd spatial dims
        if x.shape != skip.shape:
            x = F.interpolate(x, size=skip.shape[2:], mode='bilinear', align_corners=False)
        x = torch.cat([x, skip], dim=1)
        return self.conv(x)



class SindhUNet(nn.Module):
    '''
    UNet for DSI estimation from 33 satellite channels.

    Architecture:
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

    Parameters: ~7.7M (well within T4 memory budget)
    '''

    def __init__(self, in_channels=33, base_ch=64):
        super().__init__()

        # --- Encoder ---
        self.enc1 = DownBlock(in_channels, base_ch)        # 64  → 32
        self.enc2 = DownBlock(base_ch,     base_ch * 2)    # 32  → 16
        self.enc3 = DownBlock(base_ch * 2, base_ch * 4)    # 16  →  8
        self.enc4 = DownBlock(base_ch * 4, base_ch * 8)    #  8  →  4

        # --- Bottleneck ---
        self.bottleneck = DoubleConv(base_ch * 8, base_ch * 8)

        # --- Decoder ---
        self.dec4 = UpBlock(base_ch * 8, base_ch * 8, base_ch * 4)
        self.dec3 = UpBlock(base_ch * 4, base_ch * 4, base_ch * 2)
        self.dec2 = UpBlock(base_ch * 2, base_ch * 2, base_ch)
        self.dec1 = UpBlock(base_ch,     base_ch,     base_ch // 2)

        # --- Output head ---
        self.head = nn.Sequential(
            nn.Conv2d(base_ch // 2, 1, kernel_size=1),
            nn.Sigmoid()   # DSI is in [0, 1] by construction
        )

    def forward(self, x):
        '''
        x: (B, 33, 64, 64)
        Returns: (B, 1, 64, 64)  DSI prediction in [0, 1]
        '''
        # Encoder
        s1, x = self.enc1(x)   # s1: (B, 64, 64, 64),  x: (B, 64, 32, 32)
        s2, x = self.enc2(x)   # s2: (B,128, 32, 32),  x: (B,128, 16, 16)
        s3, x = self.enc3(x)   # s3: (B,256, 16, 16),  x: (B,256,  8,  8)
        s4, x = self.enc4(x)   # s4: (B,512,  8,  8),  x: (B,512,  4,  4)

        # Bottleneck
        x = self.bottleneck(x)  # (B, 512, 4, 4)

        # Decoder
        x = self.dec4(x, s4)   # (B, 256,  8,  8)
        x = self.dec3(x, s3)   # (B, 128, 16, 16)
        x = self.dec2(x, s2)   # (B,  64, 32, 32)
        x = self.dec1(x, s1)   # (B,  32, 64, 64)

        # Head
        return self.head(x)    # (B, 1, 64, 64)

