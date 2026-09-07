#!/usr/bin/env python3
"""
Download the 2024 Cartographic Boundary Shapefile for 119th Congressional
Districts (1:500k scale) from the US Census Bureau, convert to GeoJSON,
simplify coordinates, and write to public/data/cd-119.geojson.

The output includes a `district_code` property (e.g. "CA-12") on each feature
which matches the political_data_districts.district_code column.
"""

import io
import json
import os
import urllib.request
import zipfile

import shapefile  # pyshp

# Census cartographic boundary file URL (500k scale — much smaller than TIGER/Line)
URL = "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip"

# FIPS code → state abbreviation
FIPS_TO_STATE = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
    "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
    "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
    "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
    "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
    "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
    "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
    "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
    "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR",
    "78": "VI",
}

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")
OUT_FILE = os.path.join(OUT_DIR, "cd-119.geojson")


SKIP_TERRITORIES = {"AS", "GU", "MP", "VI"}  # Keep PR, skip others


def simplify_coords(coords, precision=3):
    """Round coordinates to `precision` decimal places to reduce file size.
    3 decimal places ≈ 111m accuracy, fine for district overviews at zoom 5-8."""
    if isinstance(coords[0], (list, tuple)):
        return [simplify_coords(c, precision) for c in coords]
    return [round(coords[0], precision), round(coords[1], precision)]


def dedupe_coords(coords):
    """Remove consecutive duplicate coordinates after rounding."""
    if not coords:
        return coords
    if isinstance(coords[0], (list, tuple)) and isinstance(coords[0][0], (list, tuple)):
        return [dedupe_coords(c) for c in coords]
    result = [coords[0]]
    for c in coords[1:]:
        if c != result[-1]:
            result.append(c)
    # GeoJSON rings must be closed
    if len(result) > 1 and result[0] != result[-1]:
        result.append(result[0])
    return result


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    local_zip = "/tmp/cb_2024_us_cd119_500k.zip"
    if os.path.exists(local_zip):
        print(f"Reading from {local_zip} ...")
        with open(local_zip, "rb") as f:
            data = f.read()
    else:
        print(f"Downloading {URL} ...")
        resp = urllib.request.urlopen(URL)
        data = resp.read()
    print(f"  Data size: {len(data) / 1024 / 1024:.1f} MB")

    # Extract shapefile components from zip
    zf = zipfile.ZipFile(io.BytesIO(data))
    # Find the .shp file inside
    shp_name = [n for n in zf.namelist() if n.endswith(".shp")][0]
    base = shp_name.rsplit(".", 1)[0]

    # pyshp can read from file-like objects
    sf = shapefile.Reader(
        shp=io.BytesIO(zf.read(f"{base}.shp")),
        shx=io.BytesIO(zf.read(f"{base}.shx")),
        dbf=io.BytesIO(zf.read(f"{base}.dbf")),
    )

    features = []
    for sr in sf.shapeRecords():
        rec = sr.record.as_dict()
        statefp = rec.get("STATEFP", "")
        cd119fp = rec.get("CD119FP", "")

        state_abbrev = FIPS_TO_STATE.get(statefp, "")
        if not state_abbrev or state_abbrev in SKIP_TERRITORIES:
            continue

        # Build district_code matching our DB: "CA-12", "TX-01", etc.
        # At-large districts have cd119fp "00" → use "AL" (at-large)
        if cd119fp == "00":
            district_code = f"{state_abbrev}-AL"
            district_number = 0
        elif cd119fp == "98":
            # Non-voting delegate
            district_code = f"{state_abbrev}-AL"
            district_number = 0
        else:
            district_number = int(cd119fp)
            district_code = f"{state_abbrev}-{district_number:02d}"

        # Convert shape to GeoJSON geometry
        geom = sr.shape.__geo_interface__
        geom["coordinates"] = dedupe_coords(simplify_coords(geom["coordinates"]))

        features.append({
            "type": "Feature",
            "properties": {
                "district_code": district_code,
                "state": state_abbrev,
                "district_number": district_number,
                "STATEFP": statefp,
                "CD119FP": cd119fp,
                "NAMELSAD": rec.get("NAMELSAD", ""),
            },
            "geometry": geom,
        })

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    with open(OUT_FILE, "w") as f:
        json.dump(geojson, f, separators=(",", ":"))

    size_mb = os.path.getsize(OUT_FILE) / 1024 / 1024
    print(f"Wrote {len(features)} features to {OUT_FILE} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
