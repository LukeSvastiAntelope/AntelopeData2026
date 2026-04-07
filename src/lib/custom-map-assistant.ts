export type CustomLayerGeoType = 'state' | 'district'
export type CustomLayerStyle = 'color' | 'saturation' | 'heatmap'

/** Same shape as CustomLayerData in dashboard-map (kept here to avoid circular imports). */
export type ChoroplethPayload = {
  type: CustomLayerGeoType
  values: Record<string, number>
  columnName: string
  style: CustomLayerStyle
  minVal?: number
  maxVal?: number
  aiSummary?: string
}

export type CustomMapPin = { lng: number; lat: number; label: string }

export type MapAssistantModelResult = {
  reply: string
  filterKeywords: string[] | null
  districtText: string | null
  showPins: boolean
  applyChoropleth: boolean
  valueColumn: string | null
  style: CustomLayerStyle | null
  geoType: CustomLayerGeoType | null
  pinLabelColumn: string | null
}

export function detectLatLngColumns(columns: string[]): { lat: string; lng: string } | null {
  const cols = columns.map((c) => c.trim())
  const lat =
    cols.find((c) => /^(lat|latitude|y)$/i.test(c)) ??
    cols.find((c) => /latitude/i.test(c)) ??
    cols.find((c) => /^lat$/i.test(c))
  const lng =
    cols.find((c) => /^(lon|lng|long|longitude|x)$/i.test(c)) ??
    cols.find((c) => /longitude/i.test(c)) ??
    cols.find((c) => /^lng$/i.test(c))
  if (lat && lng && lat !== lng) return { lat, lng }
  return null
}

function rowText(row: Record<string, string>): string {
  return Object.values(row)
    .map((v) => String(v ?? ''))
    .join(' ')
    .toLowerCase()
}

function rowMatchesDistrict(row: Record<string, string>, districtText: string): boolean {
  const hint = districtText.replace(/\s+/g, '').toLowerCase()
  if (!hint) return true
  const relevant = Object.entries(row).filter(
    ([k]) =>
      /district|cd|congress|cong|house|seat|statedistrict|uscd|geoid/i.test(k) ||
      /district|cd|congress/i.test(String(row[k])),
  )
  const blobs = [
    ...relevant.map(([, v]) => String(v).replace(/\s+/g, '').toLowerCase()),
    rowText(row).replace(/\s+/g, ''),
  ]
  return blobs.some((b) => {
    if (!b) return false
    if (b.includes(hint)) return true
    // "5" matches "district 5", "05", "nj-05"
    const onlyNum = hint.replace(/\D/g, '')
    if (onlyNum && onlyNum.length <= 2) {
      return (
        b.includes(`-${onlyNum.padStart(2, '0')}`) ||
        b.includes(`-${onlyNum}`) ||
        b.includes(`district${onlyNum}`) ||
        b.includes(` ${onlyNum} `) ||
        b.endsWith(onlyNum)
      )
    }
    return false
  })
}

export function filterUploadedRows(
  rows: Record<string, string>[],
  filterKeywords: string[] | null,
  districtText: string | null,
): Record<string, string>[] {
  let out = rows
  if (filterKeywords?.length) {
    const kw = filterKeywords.map((k) => k.trim().toLowerCase()).filter(Boolean)
    if (kw.length) {
      out = out.filter((row) => {
        const blob = rowText(row)
        return kw.some((k) => blob.includes(k))
      })
    }
  }
  if (districtText?.trim()) {
    out = out.filter((row) => rowMatchesDistrict(row, districtText.trim()))
  }
  return out
}

export function buildPinsFromRows(
  rows: Record<string, string>[],
  latCol: string,
  lngCol: string,
  labelCol: string | null,
): CustomMapPin[] {
  const pins: CustomMapPin[] = []
  const labelKey = labelCol && rows[0] && labelCol in rows[0] ? labelCol : null
  for (const row of rows) {
    const lat = parseFloat(String(row[latCol] ?? '').replace(/,/g, ''))
    const lng = parseFloat(String(row[lngCol] ?? '').replace(/,/g, ''))
    if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
    const label = labelKey ? String(row[labelKey] ?? '').slice(0, 120) : `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    pins.push({ lat, lng, label: label || 'Point' })
  }
  return pins
}

export function buildChoroplethFromRows(
  rows: Record<string, string>[],
  nameCol: string,
  valueCol: string,
  geoType: CustomLayerGeoType,
  style: CustomLayerStyle,
  abbrevToStateName: Record<string, string>,
): ChoroplethPayload | null {
  const values: Record<string, number> = {}
  let minVal = Infinity
  let maxVal = -Infinity
  for (const row of rows) {
    let key = String(row[nameCol] ?? '').trim()
    if (geoType === 'state' && key.length === 2) {
      key = abbrevToStateName[key.toUpperCase()] ?? key
    }
    const num = parseFloat(String(row[valueCol] ?? '').replace(/[%,$]/g, ''))
    if (key && !Number.isNaN(num)) {
      values[key] = num
      minVal = Math.min(minVal, num)
      maxVal = Math.max(maxVal, num)
    }
  }
  if (Object.keys(values).length === 0) return null
  return {
    type: geoType,
    values,
    columnName: valueCol,
    style,
    minVal: minVal === Infinity ? undefined : minVal,
    maxVal: maxVal === -Infinity ? undefined : maxVal,
  }
}
