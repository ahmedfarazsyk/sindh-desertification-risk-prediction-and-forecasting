import torch
import torch.nn as nn
import torch.nn.functional as F


class ConvGRUCell(nn.Module):
    """
    Single ConvGRU cell — replaces all Linear ops with Conv2d.

    Spatial structure is preserved inside the recurrence:
    hidden state h is always (B, hidden_ch, H, W), not a vector.

    Gates:
      z = sigmoid(Conv(x) + Conv(h))          update gate
      r = sigmoid(Conv(x) + Conv(h))          reset gate
      h_tilde = tanh(Conv(x) + Conv(r * h))   candidate
      h_next  = (1-z)*h + z*h_tilde
    """

    def __init__(self, in_ch, hidden_ch, kernel_size=3):
        super().__init__()
        pad = kernel_size // 2

        # Input projections (x → gates)
        self.Wzx = nn.Conv2d(in_ch,     hidden_ch, kernel_size, padding=pad, bias=True)
        nn.init.constant_(self.Wzx.bias, -2.0)
        self.Wrx = nn.Conv2d(in_ch,     hidden_ch, kernel_size, padding=pad, bias=True)
        self.Wnx = nn.Conv2d(in_ch,     hidden_ch, kernel_size, padding=pad, bias=True)

        # Hidden projections (h → gates)
        self.Wzh = nn.Conv2d(hidden_ch, hidden_ch, kernel_size, padding=pad, bias=False)
        self.Wrh = nn.Conv2d(hidden_ch, hidden_ch, kernel_size, padding=pad, bias=False)
        self.Wnh = nn.Conv2d(hidden_ch, hidden_ch, kernel_size, padding=pad, bias=False)

        self.hidden_ch = hidden_ch

    def forward(self, x, h):
        """
        x: (B, in_ch,     H, W)
        h: (B, hidden_ch, H, W)
        Returns h_next: (B, hidden_ch, H, W)
        """
        z = torch.sigmoid(self.Wzx(x) + self.Wzh(h))
        r = torch.sigmoid(self.Wrx(x) + self.Wrh(h))
        n = torch.tanh(   self.Wnx(x) + self.Wnh(r * h))
        return (1 - z) * h + z * n

    def init_hidden(self, batch_size, h, w, device):
        return torch.zeros(batch_size, self.hidden_ch, h, w, device=device)



class CNNEncoder(nn.Module):
    """
    Shared spatial encoder applied independently to each timestep.
    Compresses (B, 1, 64, 64) → (B, 128, 8, 8) with 3 skip levels.

    Shared weights across timesteps — same feature extractor for
    every DSI map, keeps parameter count low.
    """

    def __init__(self, in_ch=1, base_ch=32):
        super().__init__()
        # Level 1: 64x64 → 32x32
        self.conv1 = nn.Sequential(
            nn.Conv2d(in_ch,       base_ch,     3, padding=1, bias=False),
            nn.GroupNorm(max(1, base_ch // 8),  base_ch),
            nn.SiLU(),
            nn.Conv2d(base_ch,     base_ch,     3, padding=1, bias=False),
            nn.GroupNorm(max(1, base_ch // 8),  base_ch),
            nn.SiLU(),
        )
        self.pool1 = nn.MaxPool2d(2)

        # Level 2: 32x32 → 16x16
        self.conv2 = nn.Sequential(
            nn.Conv2d(base_ch,     base_ch * 2, 3, padding=1, bias=False),
            nn.GroupNorm(max(1, base_ch * 2 // 8), base_ch * 2),
            nn.SiLU(),
            nn.Conv2d(base_ch * 2, base_ch * 2, 3, padding=1, bias=False),
            nn.GroupNorm(max(1, base_ch * 2 // 8), base_ch * 2),
            nn.SiLU(),
        )
        self.pool2 = nn.MaxPool2d(2)

        # Level 3: 16x16 → 8x8
        self.conv3 = nn.Sequential(
            nn.Conv2d(base_ch * 2, base_ch * 4, 3, padding=1, bias=False),
            nn.GroupNorm(max(1, base_ch * 4 // 8), base_ch * 4),
            nn.SiLU(),
            nn.Conv2d(base_ch * 4, base_ch * 4, 3, padding=1, bias=False),
            nn.GroupNorm(max(1, base_ch * 4 // 8), base_ch * 4),
            nn.SiLU(),
        )
        self.pool3 = nn.MaxPool2d(2)

        self.out_ch = base_ch * 4   # 128

    def forward(self, x):
        """
        x: (B, in_ch, 64, 64)
        Returns:
          feat:  (B, 128,  8,  8) bottleneck features
          s1:    (B,  32, 64, 64) skip level 1 (captured BEFORE pool1)
          s2:    (B,  64, 32, 32) skip level 2 (captured BEFORE pool2)
          s3:    (B, 128, 16, 16) skip level 3 (captured BEFORE pool3)
        """
        s1   = self.conv1(x)        # (B, 32, 64, 64)
        x    = self.pool1(s1)       # (B, 32, 32, 32)
        s2   = self.conv2(x)        # (B, 64, 32, 32)
        x    = self.pool2(s2)       # (B, 64, 16, 16)
        s3   = self.conv3(x)        # (B, 128, 16, 16)
        feat = self.pool3(s3)       # (B, 128, 8, 8)
        return feat, s1, s2, s3



class CNNDecoder(nn.Module):
    """
    Spatial decoder — recovers (B, 128, 8, 8) → (B, 1, 64, 64).
    Uses skip connection context tensors from the encoder.

    Applied independently at each decoder timestep.
    """

    def __init__(self, base_ch=32):
        super().__init__()
        ch = base_ch * 4   # 128

        # Level 3: 8x8 → 16x16
        self.up3   = nn.ConvTranspose2d(ch,         ch // 2,     2, stride=2)
        self.conv3 = nn.Sequential(
            nn.Conv2d(ch // 2 + ch,     ch // 2, 3, padding=1, bias=False),
            nn.GroupNorm(max(1, ch // 2 // 8), ch // 2),
            nn.SiLU(),
            nn.Conv2d(ch // 2,          ch // 2, 3, padding=1, bias=False),
            nn.GroupNorm(max(1, ch // 2 // 8), ch // 2),
            nn.SiLU(),
        )

        # Level 2: 16x16 → 32x32
        self.up2   = nn.ConvTranspose2d(ch // 2,    ch // 4,     2, stride=2)
        self.conv2 = nn.Sequential(
            nn.Conv2d(ch // 4 + ch // 2, ch // 4, 3, padding=1, bias=False),
            nn.GroupNorm(max(1, ch // 4 // 8), ch // 4),
            nn.SiLU(),
            nn.Conv2d(ch // 4,           ch // 4, 3, padding=1, bias=False),
            nn.GroupNorm(max(1, ch // 4 // 8), ch // 4),
            nn.SiLU(),
        )

        # Level 1: 32x32 → 64x64
        self.up1   = nn.ConvTranspose2d(ch // 4,    ch // 8,     2, stride=2)
        self.conv1 = nn.Sequential(
            nn.Conv2d(ch // 8 + ch // 4, ch // 8, 3, padding=1, bias=False),
            nn.GroupNorm(max(1, ch // 8 // 8), ch // 8),
            nn.SiLU(),
            nn.Conv2d(ch // 8,           ch // 8, 3, padding=1, bias=False),
            nn.GroupNorm(max(1, ch // 8 // 8), ch // 8),
            nn.SiLU(),
        )

        # Linear head — no Sigmoid — outputs unbounded delta
        self.head = nn.Conv2d(ch // 8, 1, kernel_size=1)

        nn.init.normal_(self.head.weight, mean=0.0, std=1e-3)
        nn.init.zeros_(self.head.bias)


    def forward(self, x, s1_ctx, s2_ctx, s3_ctx):
        """
        x:      (B, 128,  8,  8)  ConvGRU hidden state
        s1_ctx: (B,  32, 64, 64)  skip level 1, from the LAST REAL input month
                                   (fixed anchor from encode() -- NOT recomputed
                                   from the current prediction at each step)
        s2_ctx: (B,  64, 32, 32)  skip level 2, same fixed anchor
        s3_ctx: (B, 128, 16, 16)  skip level 3, same fixed anchor

        Returns: (B, 1, 64, 64)
        """
        # Level 3: 8→16
        x = self.up3(x)
        if x.shape[2:] != s3_ctx.shape[2:]:
            x = F.interpolate(x, size=s3_ctx.shape[2:], mode='bilinear', align_corners=False)
        x = self.conv3(torch.cat([x, s3_ctx], dim=1))

        # Level 2: 16→32
        x = self.up2(x)
        if x.shape[2:] != s2_ctx.shape[2:]:
            x = F.interpolate(x, size=s2_ctx.shape[2:], mode='bilinear', align_corners=False)
        x = self.conv2(torch.cat([x, s2_ctx], dim=1))

        # Level 1: 32→64
        x = self.up1(x)
        if x.shape[2:] != s1_ctx.shape[2:]:
            x = F.interpolate(x, size=s1_ctx.shape[2:], mode='bilinear', align_corners=False)
        x = self.conv1(torch.cat([x, s1_ctx], dim=1))

        return self.head(x)   # (B, 1, 64, 64)



class SindhConvGRUUNet(nn.Module):
    """
    Residual ConvGRU-UNet Seq2Seq forecaster.

    Key design changes vs v1:
      - encode() returns spatial anchor skips from the LAST real input month
      - decode() predicts delta DSI using those fixed anchor skips
      - Each prediction = clamp(prev_map + delta, 0, 1)
      - Warm start: decoder begins from last known real DSI map, not zeros
      - Linear decoder head: can output negative deltas (vegetation recovery)

    At random initialization:
      - Linear head outputs ~0 → delta ≈ 0 → pred ≈ last_real_map
      - Model behaves like persistence from the start
      - Gradients only need to learn deviations from persistence
    """

    def __init__(self, base_ch=32):
        super().__init__()

        enc_out_ch = base_ch * 4   # 128

        # Shared spatial encoder (same weights for every timestep)
        self.cnn_encoder = CNNEncoder(in_ch=1, base_ch=base_ch)

        # Encoder ConvGRU — scans over 12 input timesteps
        self.enc_gru = ConvGRUCell(
            in_ch=enc_out_ch, hidden_ch=enc_out_ch, kernel_size=3
        )

        # Decoder ConvGRU — unrolls 12 future steps
        # Input: encoded previous prediction (enc_out_ch)
        # Hidden: carried forward from encoder final state
        self.dec_gru = ConvGRUCell(
            in_ch=enc_out_ch, hidden_ch=enc_out_ch, kernel_size=3
        )

        # Spatial decoder (same weights for every decoder timestep)
        self.cnn_decoder = CNNDecoder(base_ch=base_ch)

        self.enc_out_ch = enc_out_ch

    def encode(self, x_seq):
        """
        Encode the input sequence. Generic over seq_len (T = x_seq.shape[1]):
        12 steps during training, 4 steps during testing/inference.

        Returns:
          h:            (B, 128,  8,  8) final encoder hidden state
          s1_anc:       (B,  32, 64, 64) skip level 1 from LAST real input month
          s2_anc:       (B,  64, 32, 32) skip level 2 from LAST real input month
          s3_anc:       (B, 128, 16, 16) skip level 3 from LAST real input month
          last_real_map:(B,   1, 64, 64) last known DSI map — decoder start token
        """

        B, T, C, H, W = x_seq.shape
        device = x_seq.device

        h = self.enc_gru.init_hidden(B, 8, 8, device)
        s1_anc = s2_anc = s3_anc = None

        for t in range(T):
            feat, s1, s2, s3 = self.cnn_encoder(x_seq[:, t])
            h = self.enc_gru(feat, h)

            # Capture high-resolution skip connections from the last real month
            # These become the permanent spatial anchor for the entire decoder
            if t == T - 1:
                s1_anc, s2_anc, s3_anc = s1, s2, s3

        last_real_map = x_seq[:, -1]   # (B, 1, 64, 64)
        return h, s1_anc, s2_anc, s3_anc, last_real_map

    def decode(self, h_enc, s1_anc, s2_anc, s3_anc, last_real_map,
               out_steps=12, target_seq=None, teacher_forcing_ratio=0.0):
        """
        Decode `out_steps` future steps residually. Generic over out_steps:
        called with 12 during training, 4 during testing/inference.

        The SAME spatial anchor skips (from the last real input month,
        captured once in encode()) are used at every decoder step — they
        never get blurry from accumulated predictions.

        Each step:
          1. Encode prev_map to get temporal features for ConvGRU
          2. ConvGRU updates hidden state
          3. Decoder predicts delta using the fixed anchor skips
          4. pred = prev_map + delta, clamped to [0, 1] at inference only
             (clamp is skipped during training so gradients keep flowing
             even when an intermediate prediction temporarily exceeds [0,1])
          5. Feed pred (or ground truth if teacher forcing) to next step

        Returns: (B, out_steps, 1, 64, 64) absolute DSI predictions
        """
        B = h_enc.shape[0]
        device = h_enc.device

        h = h_enc

        prev_map = last_real_map.clone()

        predictions = []

        for k in range(out_steps):
            # Encode previous prediction spatially
            feat, _, _, _ = self.cnn_encoder(prev_map)

            # ConvGRU step
            h = self.dec_gru(feat, h)

             # Predict delta using FIXED anchor skips from last real month
            # Not from prev_map skips — those would blur over 12 steps
            delta = self.cnn_decoder(h, s1_anc, s2_anc, s3_anc)
            # delta: (B, 1, 64, 64) — unbounded, can be negative

            # Residual connection
            pred = prev_map + delta

            # --- NEW: Only clamp during inference, let gradients flow during training ---
            if not self.training:
                pred = torch.clamp(pred, 0.0, 1.0)

            predictions.append(pred)

            # Teacher forcing: use ground truth or own prediction as next input
            if target_seq is not None and torch.rand(1).item() < teacher_forcing_ratio:
                prev_map = target_seq[:, k].clone()   # (B, 1, 64, 64)
            else:
                prev_map = pred.detach()

        return torch.stack(predictions, dim=1)   # (B, 12, 1, 64, 64)

    def forward(self, x_seq, target_seq=None, teacher_forcing_ratio=0.0):
        """
        Autoregressive rollout for long-horizon forecasting.
        Uses the seq_len=4/step_size=3 config to match how the model is
        actually evaluated (the 26-month test set can't support seq_len=12
        — see module docstring). Each pass produces 4 quarterly predictions
        (12 real months = 1 year of forward advance), then feeds those 4
        predictions back in as the next pass's input.

        x_history: (B, 4, 1, 64, 64)  last 4 known DSI maps, 3 months apart
        n_passes:  int  number of 1-year (4-step) passes to generate

        Returns: (B, n_passes*4, 1, 64, 64) — quarterly snapshots 3 months
                 apart, NOT n_passes*4 individual consecutive months

        Example: n_passes=5 -> 5 years (60 months) ahead, returned as
                 20 quarterly snapshots
        """
        h_enc, s1_anc, s2_anc, s3_anc, last_map = self.encode(x_seq)

        out_steps = x_seq.size(1)
        return self.decode(h_enc, s1_anc, s2_anc, s3_anc, last_map, out_steps, target_seq, teacher_forcing_ratio)

    @torch.no_grad()
    def rollout(self, x_history, n_passes=5):
        """
        Autoregressive rollout for long-horizon forecasting.

        x_history: (B, 12, 1, 64, 64)  last 12 known DSI maps
        n_passes:  int  number of 12-month passes to generate

        Returns: (B, n_passes*12, 1, 64, 64)

        Example: n_passes=5 → 60 months ahead from current date
        """
        self.eval()
        current_input = x_history
        all_preds = []
        out_steps = x_history.size(1)

        for _ in range(n_passes):
            h_enc, s1_anc, s2_anc, s3_anc, last_map = self.encode(current_input)
            preds = self.decode(h_enc, s1_anc, s2_anc, s3_anc, last_map,
                                out_steps, target_seq=None, teacher_forcing_ratio=0.0)
            # preds: (B, 12, 1, 64, 64)
            all_preds.append(preds)
            # Output of this pass becomes input of next pass
            current_input = preds

        return torch.cat(all_preds, dim=1)   # (B, n_passes*12, 1, 64, 64)
    


