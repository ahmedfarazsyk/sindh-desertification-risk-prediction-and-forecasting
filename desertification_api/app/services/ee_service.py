import ee
import geemap
import os

def initialize_ee():
    try:
        ee.Initialize(project="desertification-risk")
    except Exception:
        ee.Authenticate()
        ee.Initialize(project="desertification-risk")

def get_roi_geometry(coords: list) -> ee.Geometry:
    return ee.Geometry.Polygon(coords)


def fetch_current_data(roi_coords: list, output_path: str):
    roi = get_roi_geometry(roi_coords)
    m_start = ee.Date('2026-03-01')
    m_end = ee.Date('2026-04-01')

    print("[*] Compositing 33-band satellite features...")

    # --- 1. Sentinel-1 ---
    dummy_s1 = ee.Image.constant([0, 0]).rename(['VV', 'VH']).updateMask(0)
    s1_col = ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(roi).filterDate(m_start, m_end) \
                .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV')) \
                .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH')) \
                .filter(ee.Filter.eq('instrumentMode', 'IW')).select(['VV', 'VH'])
    s1 = s1_col.merge(ee.ImageCollection([dummy_s1])).median()
    s1_vv = s1.select('VV').unmask(-30).rename('S1_VV')
    s1_vh = s1.select('VH').unmask(-30).rename('S1_VH')
    s1_ratio = s1_vh.subtract(s1_vv).rename('S1_Ratio')

    # --- 2. Sentinel-2 ---
    def mask_s2_clouds(image):
        scl = image.select('SCL')
        mask = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10))
        return image.updateMask(mask).divide(10000)

    dummy_s2 = ee.Image.constant([0, 0, 0, 0]).rename(['B2', 'B4', 'B8', 'B11']).updateMask(0)
    s2_col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(roi).filterDate(m_start, m_end) \
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
    s2_mapped = s2_col.map(mask_s2_clouds).select(['B2', 'B4', 'B8', 'B11'])
    s2 = s2_mapped.merge(ee.ImageCollection([dummy_s2])).median().unmask(0)
    s2_bands = s2.rename(['Blue', 'Red', 'NIR', 'SWIR'])

    ndvi = s2_bands.normalizedDifference(['NIR', 'Red']).rename('NDVI')
    ndwi = s2_bands.normalizedDifference(['NIR', 'SWIR']).rename('NDWI')
    msi = s2_bands.select('SWIR').divide(s2_bands.select('NIR').add(1e-6)).rename('MSI')
    nddi = ndvi.subtract(ndwi).divide(ndvi.add(ndwi).add(1e-6)).rename('NDDI')
    savi = s2_bands.expression('((NIR - RED) / (NIR + RED + 0.5)) * 1.5', {'NIR': s2_bands.select('NIR'), 'RED': s2_bands.select('Red')}).rename('SAVI')
    evi = s2_bands.expression('2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {'NIR': s2_bands.select('NIR'), 'RED': s2_bands.select('Red'), 'BLUE': s2_bands.select('Blue')}).rename('EVI')

    # --- 3. MODIS ---
    dummy_lst = ee.Image.constant(0).rename('LST_Day_1km').updateMask(0)
    lst = ee.ImageCollection("MODIS/061/MOD11A2").filterBounds(roi).filterDate(m_start, m_end).select('LST_Day_1km')
    lst_celsius = lst.merge(ee.ImageCollection([dummy_lst])).median().multiply(0.02).subtract(273.15).unmask(0).rename('MODIS_LST')

    dummy_et = ee.Image.constant(0).rename('ET').updateMask(0)
    et = ee.ImageCollection("MODIS/061/MOD16A2").filterBounds(roi).filterDate(m_start, m_end).select('ET')
    et_modis = et.merge(ee.ImageCollection([dummy_et])).sum().unmask(0).rename('MODIS_ET')

    dummy_lai = ee.Image.constant(0).rename('Lai').updateMask(0)
    lai = ee.ImageCollection("MODIS/061/MCD15A3H").filterBounds(roi).filterDate(m_start, m_end).select('Lai')
    lai_modis = lai.merge(ee.ImageCollection([dummy_lai])).mean().multiply(0.1).unmask(0).rename('MODIS_LAI')

    # --- 4. CHIRPS & TerraClimate ---
    dummy_rain = ee.Image.constant(0).rename('precipitation').updateMask(0)
    rain = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterBounds(roi).filterDate(m_start, m_end).select('precipitation')
    rain_total = rain.merge(ee.ImageCollection([dummy_rain])).sum().unmask(0).rename('CHIRPS_Rainfall')

    dummy_tc = ee.Image.constant([0,0,0,0,0,0]).rename(['pr', 'pet', 'tmmx', 'tmmn', 'vpd', 'pdsi']).updateMask(0)
    tc_col = ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE").filterBounds(roi).filterDate(m_start, m_end).select(['pr', 'pet', 'tmmx', 'tmmn', 'vpd', 'pdsi'])
    tc = tc_col.merge(ee.ImageCollection([dummy_tc])).median().unmask(0)

    tc_pr = tc.select('pr').rename('TC_Pr')
    tc_pet = tc.select('pet').multiply(0.1).rename('TC_PET')
    tc_tmax = tc.select('tmmx').multiply(0.1).rename('TC_Tmax')
    tc_tmin = tc.select('tmmn').multiply(0.1).rename('TC_Tmin')
    tc_vpd = tc.select('vpd').multiply(0.01).rename('TC_VPD')
    tc_pdsi = tc.select('pdsi').multiply(0.01).rename('TC_PDSI')

    # --- 5. Static (Soil, Topo, Pop, LC) ---
    soc = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select('b0').unmask(0).rename('Soil_SOC')
    texture = ee.Image("OpenLandMap/SOL/SOL_TEXTURE-CLASS_USDA-TT_M/v02").select('b0').unmask(0).rename('Soil_Texture')
    bulk_density = ee.Image("projects/soilgrids-isric/bdod_mean").select('bdod_0-5cm_mean').unmask(0).rename('Soil_BulkDensity')

    srtm = ee.Image("USGS/SRTMGL1_003").clip(roi)
    elevation = srtm.rename("Topo_Elevation")
    slope = ee.Terrain.slope(srtm).rename("Topo_Slope")
    aspect = ee.Terrain.aspect(srtm).rename("Topo_Aspect")
    hillshade = ee.Terrain.products(srtm).select('hillshade').rename("Topo_Hillshade")

    dummy_viirs = ee.Image.constant(0).rename('avg_rad').updateMask(0)
    viirs = ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMCFG").filterBounds(roi).filterDate(m_start, m_end).select('avg_rad')
    night_lights = viirs.merge(ee.ImageCollection([dummy_viirs])).median().unmask(0).rename('VIIRS_NightLights')

    pop_dens = ee.ImageCollection("CIESIN/GPWv411/GPW_Population_Density").filterDate('2020-01-01', '2020-12-31').first().select('population_density').unmask(0).rename('Pop_Density')

    dummy_lc = ee.Image.constant(7).rename('label').updateMask(0)
    dw_col = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(roi).filterDate(m_start, m_end).select('label')
    lc = dw_col.merge(ee.ImageCollection([dummy_lc])).mode().unmask(7).rename('Land_Cover')

    # --- 6. Final Stack (33 Channels) ---
    input_stack = ee.Image.cat([
        s1_vv, s1_vh, s1_ratio, s2_bands, ndvi, ndwi, msi, nddi, savi, evi,
        lst_celsius, et_modis, lai_modis, rain_total, tc_pr, tc_pet, tc_tmax, tc_tmin, tc_vpd, tc_pdsi,
        soc, texture, bulk_density, elevation, slope, aspect, hillshade, night_lights, pop_dens, lc
    ]).clip(roi).toFloat()


    geemap.download_ee_image(
        image=input_stack,
        filename=output_path,
        scale=30,
        region=roi,
        crs="EPSG:4326"
    )
    return output_path



def fetch_forecast_data(roi_coords: list, output_path: str):
    roi = get_roi_geometry(roi_coords)

    target_year = 2025
    target_months = [1, 4, 7, 10] # Jan, Apr, Jul, Oct

    def get_monthly_dsi(year, month):
        """Fetches robust 33-band data and calculates MEDALUS DSI for a specific month."""
        m_start = ee.Date.fromYMD(year, month, 1)
        m_end = m_start.advance(1, 'month')

        # --- 1. Sentinel-1 ---
        dummy_s1 = ee.Image.constant([0, 0]).rename(['VV', 'VH']).updateMask(0)
        s1_col = ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(roi).filterDate(m_start, m_end) \
                    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV')) \
                    .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH')) \
                    .filter(ee.Filter.eq('instrumentMode', 'IW')).select(['VV', 'VH'])
        s1 = s1_col.merge(ee.ImageCollection([dummy_s1])).median()
        s1_vv = s1.select('VV').unmask(-30).rename('S1_VV')
        s1_vh = s1.select('VH').unmask(-30).rename('S1_VH')
        s1_ratio = s1_vh.subtract(s1_vv).rename('S1_Ratio')

        # --- 2. Sentinel-2 ---
        def mask_s2_clouds(image):
            scl = image.select('SCL')
            mask = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10))
            return image.updateMask(mask).divide(10000)

        dummy_s2 = ee.Image.constant([0, 0, 0, 0]).rename(['B2', 'B4', 'B8', 'B11']).updateMask(0)
        s2_col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(roi).filterDate(m_start, m_end) \
                    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
        s2_mapped = s2_col.map(mask_s2_clouds).select(['B2', 'B4', 'B8', 'B11'])
        s2 = s2_mapped.merge(ee.ImageCollection([dummy_s2])).median().unmask(0)
        s2_bands = s2.rename(['Blue', 'Red', 'NIR', 'SWIR'])

        ndvi = s2_bands.normalizedDifference(['NIR', 'Red']).rename('NDVI')
        ndwi = s2_bands.normalizedDifference(['NIR', 'SWIR']).rename('NDWI')
        msi = s2_bands.select('SWIR').divide(s2_bands.select('NIR').add(1e-6)).rename('MSI')
        nddi = ndvi.subtract(ndwi).divide(ndvi.add(ndwi).add(1e-6)).rename('NDDI')
        savi = s2_bands.expression('((NIR - RED) / (NIR + RED + 0.5)) * 1.5', {'NIR': s2_bands.select('NIR'), 'RED': s2_bands.select('Red')}).rename('SAVI')
        evi = s2_bands.expression('2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {'NIR': s2_bands.select('NIR'), 'RED': s2_bands.select('Red'), 'BLUE': s2_bands.select('Blue')}).rename('EVI')

        # --- 3. MODIS ---
        dummy_lst = ee.Image.constant(0).rename('LST_Day_1km').updateMask(0)
        lst = ee.ImageCollection("MODIS/061/MOD11A2").filterBounds(roi).filterDate(m_start, m_end).select('LST_Day_1km')
        lst_celsius = lst.merge(ee.ImageCollection([dummy_lst])).median().multiply(0.02).subtract(273.15).unmask(0).rename('MODIS_LST')

        dummy_et = ee.Image.constant(0).rename('ET').updateMask(0)
        et = ee.ImageCollection("MODIS/061/MOD16A2").filterBounds(roi).filterDate(m_start, m_end).select('ET')
        et_modis = et.merge(ee.ImageCollection([dummy_et])).sum().unmask(0).rename('MODIS_ET')

        dummy_lai = ee.Image.constant(0).rename('Lai').updateMask(0)
        lai = ee.ImageCollection("MODIS/061/MCD15A3H").filterBounds(roi).filterDate(m_start, m_end).select('Lai')
        lai_modis = lai.merge(ee.ImageCollection([dummy_lai])).mean().multiply(0.1).unmask(0).rename('MODIS_LAI')

        # --- 4. CHIRPS & TerraClimate ---
        dummy_rain = ee.Image.constant(0).rename('precipitation').updateMask(0)
        rain = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterBounds(roi).filterDate(m_start, m_end).select('precipitation')
        rain_total = rain.merge(ee.ImageCollection([dummy_rain])).sum().unmask(0).rename('CHIRPS_Rainfall')

        dummy_tc = ee.Image.constant([0,0,0,0,0,0]).rename(['pr', 'pet', 'tmmx', 'tmmn', 'vpd', 'pdsi']).updateMask(0)
        tc_col = ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE").filterBounds(roi).filterDate(m_start, m_end).select(['pr', 'pet', 'tmmx', 'tmmn', 'vpd', 'pdsi'])
        tc = tc_col.merge(ee.ImageCollection([dummy_tc])).median().unmask(0)

        tc_pr = tc.select('pr').rename('TC_Pr')
        tc_pet = tc.select('pet').multiply(0.1).rename('TC_PET')
        tc_tmax = tc.select('tmmx').multiply(0.1).rename('TC_Tmax')
        tc_tmin = tc.select('tmmn').multiply(0.1).rename('TC_Tmin')
        tc_vpd = tc.select('vpd').multiply(0.01).rename('TC_VPD')
        tc_pdsi = tc.select('pdsi').multiply(0.01).rename('TC_PDSI')

        # --- 5. Static (Soil, Topo, Pop, LC) ---
        soc = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select('b0').unmask(0).rename('Soil_SOC')
        texture = ee.Image("OpenLandMap/SOL/SOL_TEXTURE-CLASS_USDA-TT_M/v02").select('b0').unmask(0).rename('Soil_Texture')
        bulk_density = ee.Image("projects/soilgrids-isric/bdod_mean").select('bdod_0-5cm_mean').unmask(0).rename('Soil_BulkDensity')

        srtm = ee.Image("USGS/SRTMGL1_003").clip(roi)
        elevation = srtm.rename("Topo_Elevation")
        slope = ee.Terrain.slope(srtm).rename("Topo_Slope")
        aspect = ee.Terrain.aspect(srtm).rename("Topo_Aspect")
        hillshade = ee.Terrain.products(srtm).select('hillshade').rename("Topo_Hillshade")

        dummy_viirs = ee.Image.constant(0).rename('avg_rad').updateMask(0)
        viirs = ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMCFG").filterBounds(roi).filterDate(m_start, m_end).select('avg_rad')
        night_lights = viirs.merge(ee.ImageCollection([dummy_viirs])).median().unmask(0).rename('VIIRS_NightLights')

        pop_dens = ee.ImageCollection("CIESIN/GPWv411/GPW_Population_Density").filterDate('2020-01-01', '2020-12-31').first().select('population_density').unmask(0).rename('Pop_Density')

        dummy_lc = ee.Image.constant(7).rename('label').updateMask(0)
        dw_col = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1").filterBounds(roi).filterDate(m_start, m_end).select('label')
        lc = dw_col.merge(ee.ImageCollection([dummy_lc])).mode().unmask(7).rename('Land_Cover')

        # === CALCULATE MEDALUS INDICES ===

        # 1. Climate Quality Index (CQI)
        f_rain = ee.Image(1).subtract(rain_total.unitScale(0, 300).clamp(0.01, 1))
        f_pdsi = ee.Image(1).subtract(tc_pdsi.unitScale(-4, 4).clamp(0.01, 1))
        f_temp = lst_celsius.unitScale(10, 50).clamp(0.01, 1)
        f_vpd = tc_vpd.unitScale(0, 5).clamp(0.01, 1)
        cqi = f_rain.multiply(f_pdsi).multiply(f_temp).multiply(f_vpd).pow(0.25)

        # 2. Vegetation Quality Index (VQI)
        f_ndvi = ee.Image(1).subtract(ndvi.unitScale(-0.2, 0.8).clamp(0.01, 1))
        f_savi = ee.Image(1).subtract(savi.unitScale(-0.2, 0.8).clamp(0.01, 1))
        f_evi = ee.Image(1).subtract(evi.unitScale(-0.2, 0.8).clamp(0.01, 1))
        f_nddi = nddi.unitScale(-1, 1).clamp(0.01, 1)
        vqi = f_ndvi.multiply(f_savi).multiply(f_evi).multiply(f_nddi).pow(0.25)

        # 3. Soil Quality Index (SQI)
        f_soc = ee.Image(1).subtract(soc.unitScale(0, 50).clamp(0.01, 1))
        f_bulk = bulk_density.unitScale(100, 180).clamp(0.01, 1)
        f_ndwi = ee.Image(1).subtract(ndwi.unitScale(-0.5, 0.5).clamp(0.01, 1))
        f_slope = slope.unitScale(0, 30).clamp(0.01, 1)
        sqi = f_soc.multiply(f_bulk).multiply(f_ndwi).multiply(f_slope).pow(0.25)

        # 4. Land Quality Index (LQI)
        from_classes = [0, 1, 2, 3, 4, 5, 6, 7, 8]
        to_scores = [0.01, 0.1, 0.5, 0.2, 0.4, 0.6, 0.9, 1.0, 0.01]
        f_lc_sens = lc.remap(from_classes, to_scores, 0.5)
        f_pop = pop_dens.unitScale(0, 500).clamp(0.01, 1)
        f_lights = night_lights.unitScale(0, 50).clamp(0.01, 1)
        lqi = f_lc_sens.multiply(f_pop).multiply(f_lights).pow(1/3)

        # 5. Final DSI
        dsi = cqi.multiply(vqi).multiply(sqi).multiply(lqi).pow(0.25)

        return dsi.rename(f'DSI_M{month:02d}').toFloat()


    print("[*] Compositing DSI for 4 Quarters of 2025...")
    dsi_images = []
    for m in target_months:
        print(f"    -> Processing Month {m:02d}...")
        dsi_images.append(get_monthly_dsi(target_year, m))

    # Stack the 4 DSI maps into a single 4-band image
    dsi_stack = ee.Image.cat(dsi_images).clip(roi)


    geemap.download_ee_image(
        image=dsi_stack,
        filename=output_path,
        scale=30,
        region=roi,
        crs="EPSG:4326"
    )
    return output_path
