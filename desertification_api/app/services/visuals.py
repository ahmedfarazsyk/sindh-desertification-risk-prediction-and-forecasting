import io
import base64
import numpy as np
import rasterio
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import Normalize
from mpl_toolkits.axes_grid1 import make_axes_locatable
from scipy.stats import pearsonr
import imageio

def _to_base64(fig) -> str:
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')

def _create_master_mask(input_tiff: str):
    with rasterio.open(input_tiff) as src:
        base_data = src.read(1)
        nodata_val = src.nodata if src.nodata is not None else 0.0
        if np.isnan(nodata_val):
            return np.isnan(base_data) | (base_data == 0.0)
        else:
            return (base_data == nodata_val) | np.isnan(base_data) | (base_data == 0.0)

# ==========================================
# CURRENT ANALYSIS VISUALS (MODEL A)
# ==========================================

def generate_current_dashboard(input_tiff: str, dsi_tiff: str) -> str:
    def stretch_rgb(bands_array):
        out = np.zeros_like(bands_array, dtype=np.float32)
        for i in range(3):
            band = np.nan_to_num(bands_array[i])
            valid_pixels = band[band > 0]
            if len(valid_pixels) > 0:
                vmin, vmax = np.percentile(valid_pixels, (5, 95))
                if vmax > vmin:
                    out[i] = np.clip((band - vmin) / (vmax - vmin), 0, 1)
        return np.transpose(out, (1, 2, 0))

    with rasterio.open(input_tiff) as src:
        nir, red, blue = src.read(6), src.read(5), src.read(4)
        ndvi_band, lst_band = src.read(8), src.read(14)
        mask = (nir == 0) & (red == 0)
        fcc_stack = np.stack([nir, red, blue])
        fcc_image = stretch_rgb(fcc_stack)

    with rasterio.open(dsi_tiff) as src:
        dsi_map = src.read(1)
        dsi_masked = np.ma.masked_where(mask, dsi_map)

    fig, axes = plt.subplots(2, 2, figsize=(16, 16), facecolor='white')
    
    fcc_image[mask] = [1.0, 1.0, 1.0]
    axes[0, 0].imshow(fcc_image)
    axes[0, 0].set_title("1. False Color Composite", fontsize=14, fontweight='bold')
    axes[0, 0].axis('off')

    ndvi_masked = np.ma.masked_where(mask, ndvi_band)
    im_ndvi = axes[0, 1].imshow(ndvi_masked, cmap='RdYlGn', vmin=-0.1, vmax=0.7)
    axes[0, 1].set_title("2. NDVI (Vegetation Health)", fontsize=14, fontweight='bold')
    axes[0, 1].axis('off')
    fig.colorbar(im_ndvi, ax=axes[0, 1], fraction=0.046, pad=0.04)

    lst_masked = np.ma.masked_where(mask, lst_band)
    im_lst = axes[1, 0].imshow(lst_masked, cmap='hot', vmin=15, vmax=35)
    axes[1, 0].set_title("3. Land Surface Temperature (°C)", fontsize=14, fontweight='bold')
    axes[1, 0].axis('off')
    fig.colorbar(im_lst, ax=axes[1, 0], fraction=0.046, pad=0.04)

    high_contrast_cmap = plt.get_cmap('RdYlGn_r', 20)
    im_dsi = axes[1, 1].imshow(dsi_masked, cmap=high_contrast_cmap, vmin=0.0, vmax=1.0)
    axes[1, 1].set_title("4. UNet Predicted DSI", fontsize=14, fontweight='bold')
    axes[1, 1].axis('off')
    fig.colorbar(im_dsi, ax=axes[1, 1], fraction=0.046, pad=0.04)

    plt.tight_layout()
    return _to_base64(fig)

def generate_feature_importance_and_hexbins(input_tiff: str, dsi_tiff: str) -> dict:
    band_names = [
        "S1_VV", "S1_VH", "S1_Ratio", "S2 Blue", "S2 Red", "S2 NIR", "S2 SWIR",
        "NDVI", "NDWI", "MSI", "NDDI", "SAVI", "EVI", "MODIS LST", "MODIS ET", "MODIS LAI",
        "CHIRPS Rainfall", "TC Precip", "TC PET", "TC Tmax", "TC Tmin", "TC VPD", "TC PDSI",
        "Soil SOC", "Soil Texture", "Soil Bulk Density", "Topo Elevation", "Topo Slope", 
        "Topo Aspect", "Topo Hillshade", "VIIRS Night Lights", "Population Density", "Land Cover"
    ]

    with rasterio.open(input_tiff) as src:
        blue, red = np.nan_to_num(src.read(4), nan=0.0), np.nan_to_num(src.read(5), nan=0.0)
        global_mask = (blue == 0) & (red == 0)

    with rasterio.open(dsi_tiff) as src:
        dsi_valid = src.read(1)[~global_mask]

    importances = []
    with rasterio.open(input_tiff) as src:
        for i in range(33):
            band_valid = np.nan_to_num(src.read(i + 1), nan=0.0, posinf=0.0, neginf=0.0)[~global_mask]
            corr = 0.0 if np.std(band_valid) == 0 else np.corrcoef(band_valid, dsi_valid)[0, 1]
            importances.append((band_names[i], corr, i + 1))

    importances.sort(key=lambda x: abs(x[1]), reverse=True)
    top_2 = importances[:2]
    
    importances_ascending = sorted(importances, key=lambda x: abs(x[1]), reverse=False)
    sorted_names = [x[0] for x in importances_ascending]
    sorted_corrs = [x[1] for x in importances_ascending]
    abs_corrs = [abs(x) for x in sorted_corrs]
    bar_colors = ['firebrick' if c > 0 else 'royalblue' for c in sorted_corrs]

    # 1. Feature Importance Bar Chart
    fig1, ax1 = plt.subplots(figsize=(12, 14), facecolor='white')
    ax1.set_facecolor('#f8f9fa')
    bars = ax1.barh(sorted_names, abs_corrs, color=bar_colors, edgecolor='white', height=0.8)
    
    for i, bar in enumerate(bars):
        width = bar.get_width()
        sign = "+" if sorted_corrs[i] > 0 else ""
        ax1.text(width + 0.01, bar.get_y() + bar.get_height()/2, f"{sign}{sorted_corrs[i]:.3f}",
                 va='center', ha='left', fontsize=10, fontweight='bold', color=bar_colors[i])

    ax1.set_xlabel("Absolute Pearson Correlation", fontsize=14, fontweight='bold', labelpad=15)
    ax1.set_title("Feature Importance for Desertification Severity", fontsize=16, fontweight='bold')
    ax1.grid(axis='x', linestyle='--', alpha=0.6)
    plt.tight_layout()
    bar_b64 = _to_base64(fig1)

    # 2. Hexbin Plot (Side-by-side for Top 2 features)
    fig2, axes2 = plt.subplots(1, 2, figsize=(20, 8), facecolor='white')
    for rank, (feature_name, corr_value, band_idx) in enumerate(top_2):
        ax = axes2[rank]
        ax.set_facecolor('#f8f9fa')
        with rasterio.open(input_tiff) as src:
            x_valid = np.nan_to_num(src.read(band_idx), nan=0.0)[~global_mask]
        
        corr, _ = pearsonr(x_valid, dsi_valid)
        hb = ax.hexbin(x_valid, dsi_valid, gridsize=75, cmap='inferno', mincnt=1, bins='log', edgecolors='none')
        
        z = np.polyfit(x_valid, dsi_valid, 1)
        p = np.poly1d(z)
        x_line = np.linspace(x_valid.min(), x_valid.max(), 100)
        ax.plot(x_line, p(x_line), "w--", linewidth=3, label=f"Slope: {z[0]:.3f}")
        
        direction = "Positive Driver" if corr_value > 0 else "Protective Factor"
        ax.set_xlabel(feature_name, fontsize=14, fontweight='bold')
        ax.set_ylabel("DSI", fontsize=14, fontweight='bold')
        ax.set_title(f"Top {rank+1}: {feature_name} vs DSI\n(r = {corr:.3f}, {direction})", fontsize=16, fontweight='bold')
        fig2.colorbar(hb, ax=ax, fraction=0.046, pad=0.04).set_label('Pixel Count (Log)', rotation=270, labelpad=20)
        ax.set_ylim(0, 1.0)
        ax.legend()
    
    plt.tight_layout()
    hex_b64 = _to_base64(fig2)

    return {"feature_importance": bar_b64, "hexbins": hex_b64}


# ==========================================
# FORECAST VISUALS (MODEL B)
# ==========================================

def generate_forecast_gif(input_tiff: str, output_tiff: str) -> str:
    master_mask = _create_master_mask(input_tiff)
    years, quarters = [2025, 2026, 2027, 2028, 2029, 2030], ['Q1', 'Q2', 'Q3', 'Q4']
    frames = []
    cmap = plt.get_cmap('RdYlGn_r').copy()
    cmap.set_bad(color='white')

    for year in years:
        for j in range(4):
            band_idx = j + 1 if year == 2025 else (year - 2026) * 4 + j + 1
            tiff_src = input_tiff if year == 2025 else output_tiff
            with rasterio.open(tiff_src) as src:
                band_data = src.read(band_idx)
            
            masked_map = np.ma.masked_where(master_mask, band_data)
            
            fig, ax = plt.subplots(figsize=(8, 8), facecolor='white')
            im = ax.imshow(masked_map, cmap=cmap, vmin=0.1, vmax=1.0)
            ax.axis('off')
            phase = "(Baseline)" if year == 2025 else "(Forecast)"
            ax.set_title(f"Sensitivity: {year} {quarters[j]} {phase}", fontsize=18, fontweight='bold', pad=15)
            
            buf = io.BytesIO()
            plt.savefig(buf, format='png', dpi=100, bbox_inches='tight', facecolor='white')
            plt.close(fig)
            buf.seek(0)
            frames.append(imageio.imread(buf))

    gif_buf = io.BytesIO()
    imageio.mimsave(gif_buf, frames, format='GIF', duration=800)
    gif_buf.seek(0)
    return base64.b64encode(gif_buf.read()).decode('utf-8')

def generate_forecast_metrics(input_tiff: str, output_tiff: str) -> dict:
    master_mask = _create_master_mask(input_tiff)
    years, quarters = [2025, 2026, 2027, 2028, 2029, 2030], ['Q1', 'Q2', 'Q3', 'Q4']
    
    annual_dsi, seasonal_means, std_devs, class_percentages = {}, {y: [] for y in years}, [], []
    classes = [("Healthy", 0.0, 0.25, "forestgreen"), ("Mild", 0.25, 0.50, "gold"), 
               ("Moderate", 0.50, 0.75, "darkorange"), ("Severe", 0.75, 1.01, "firebrick")]
    class_data = {c[0]: [] for c in classes}
    x_labels, means, p10s, p90s = [], [], [], []

    for year in years:
        year_pixels = []
        for j in range(4):
            x_labels.append(f"{year} Q{j+1}")
            band_idx = j + 1 if year == 2025 else (year - 2026) * 4 + j + 1
            tiff_src = input_tiff if year == 2025 else output_tiff
            with rasterio.open(tiff_src) as src:
                valid_pixels = np.ma.masked_where(master_mask, src.read(band_idx)).compressed()
            
            year_pixels.append(valid_pixels)
            seasonal_means[year].append(np.mean(valid_pixels))
            std_devs.append(np.std(valid_pixels))
            means.append(np.mean(valid_pixels))
            p10s.append(np.percentile(valid_pixels, 10))
            p90s.append(np.percentile(valid_pixels, 90))
            
            total = len(valid_pixels)
            for name, low, high, color in classes:
                class_data[name].append((np.sum((valid_pixels >= low) & (valid_pixels < high)) / total) * 100)
                
        annual_dsi[year] = np.concatenate(year_pixels)

    x = np.arange(len(x_labels))

    # 1. Stacked Bar Chart
    fig1, ax1 = plt.subplots(figsize=(16, 8), facecolor='white')
    bottoms = np.zeros(len(x_labels))
    for name, low, high, color in classes:
        ax1.bar(x, class_data[name], bottom=bottoms, color=color, width=0.85, label=name)
        bottoms += np.array(class_data[name])
    ax1.set_xticks(x); ax1.set_xticklabels(x_labels, rotation=45, ha='right')
    ax1.set_title("Forecasted Shift in Desertification Severity", fontsize=18, fontweight='bold')
    ax1.legend(loc='center left', bbox_to_anchor=(1.02, 0.5))
    bar_b64 = _to_base64(fig1)

    # 2. Continuous Trend
    fig2, ax2 = plt.subplots(figsize=(15, 7), facecolor='white')
    ax2.fill_between(x, p10s, p90s, color='firebrick', alpha=0.15)
    ax2.plot(x, means, color='firebrick', linewidth=3, marker='o')
    ax2.set_xticks(x); ax2.set_xticklabels(x_labels, rotation=45, ha='right')
    ax2.set_title("Continuous Macro-Trend: DSI Progression", fontsize=18, fontweight='bold')
    trend_b64 = _to_base64(fig2)

    # 3. Standard Deviation
    fig3, ax3 = plt.subplots(figsize=(14, 6), facecolor='white')
    ax3.plot(x, std_devs, color='teal', linewidth=3, marker='D')
    z = np.polyfit(x, std_devs, 1); p = np.poly1d(z)
    ax3.plot(x, p(x), color='coral', linestyle='--')
    ax3.set_xticks(x); ax3.set_xticklabels(x_labels, rotation=45, ha='right')
    ax3.set_title("Increasing Spatial Heterogeneity", fontsize=18, fontweight='bold')
    std_b64 = _to_base64(fig3)
    
    # 4. Seasonal Fluctuations
    fig4, ax4 = plt.subplots(figsize=(12, 7), facecolor='white')
    colors = plt.cm.plasma(np.linspace(0, 0.85, len(years)))
    for i, year in enumerate(years):
        ax4.plot(quarters, seasonal_means[year], color=colors[i], marker='o', 
                 linestyle='--' if year==2025 else '-', linewidth=3 if year==2025 else 2.5, label=str(year))
    ax4.set_title("Seasonal DSI Fluctuations", fontsize=18, fontweight='bold')
    ax4.legend(loc='center left', bbox_to_anchor=(1.02, 0.5))
    season_b64 = _to_base64(fig4)

    return {"stacked_bar": bar_b64, "trend": trend_b64, "std_dev": std_b64, "seasonal": season_b64}

def generate_anomaly_map(input_tiff: str, output_tiff: str) -> str:
    master_mask = _create_master_mask(input_tiff)
    with rasterio.open(input_tiff) as src:
        data_2025 = np.mean([src.read(i) for i in range(1, 5)], axis=0)
    with rasterio.open(output_tiff) as src:
        data_2030 = np.mean([src.read(i) for i in range(17, 21)], axis=0)

    dsi_change = data_2030 - data_2025
    masked_change = np.ma.masked_where(master_mask, dsi_change)

    fig, ax = plt.subplots(figsize=(10, 10), facecolor='white')
    cmap = plt.get_cmap('RdBu_r').copy()
    cmap.set_bad(color='white')
    
    valid_changes = masked_change.compressed()
    limit = np.percentile(np.abs(valid_changes), 99) if len(valid_changes) > 0 else 1.0

    im = ax.imshow(masked_change, cmap=cmap, vmin=-limit, vmax=limit, interpolation='bilinear')
    ax.axis('off')
    
    divider = make_axes_locatable(ax)
    cax = divider.append_axes("right", size="4%", pad=0.3)
    fig.colorbar(im, cax=cax).set_label('Change in Severity Index', rotation=270, labelpad=25)
    ax.set_title("Forecasted Spatial Change in DSI", fontsize=18, fontweight='bold')
    return _to_base64(fig)