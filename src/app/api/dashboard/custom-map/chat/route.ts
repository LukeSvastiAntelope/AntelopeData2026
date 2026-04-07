import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import OpenAI from 'openai'
import type { CustomLayerGeoType, CustomLayerStyle, MapAssistantModelResult } from '@/lib/custom-map-assistant'

export const maxDuration = 60

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return new OpenAI({ apiKey })
}

function normalizeResult(raw: Record<string, unknown>): MapAssistantModelResult {
  const style = raw.style as string | null | undefined
  const geoType = raw.geoType as string | null | undefined
  const validStyles = new Set(['color', 'saturation', 'heatmap'])
  const validGeo = new Set(['state', 'district'])
  return {
    reply: typeof raw.reply === 'string' ? raw.reply : 'Updated the map based on your request.',
    filterKeywords: Array.isArray(raw.filterKeywords)
      ? (raw.filterKeywords as unknown[]).map((x) => String(x))
      : null,
    districtText: raw.districtText != null ? String(raw.districtText) : null,
    showPins: Boolean(raw.showPins),
    applyChoropleth: raw.applyChoropleth !== false,
    valueColumn: raw.valueColumn != null ? String(raw.valueColumn) : null,
    style: style && validStyles.has(style) ? (style as CustomLayerStyle) : null,
    geoType: geoType && validGeo.has(geoType) ? (geoType as CustomLayerGeoType) : null,
    pinLabelColumn: raw.pinLabelColumn != null ? String(raw.pinLabelColumn) : null,
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const message = String(body?.message ?? '').trim()
    const columns = Array.isArray(body?.columns) ? (body.columns as string[]).map(String) : []
    const rowsSample = Array.isArray(body?.rowsSample) ? body.rowsSample : []
    const rowCount = Number(body?.rowCount) || 0
    const context = (body?.context ?? {}) as Record<string, unknown>
    const hasUploadedData =
      Boolean(body?.hasUploadedData) && columns.length > 0 && rowCount > 0

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    const client = getOpenAIClient()
    if (!client) {
      const fallback: MapAssistantModelResult = {
        reply: hasUploadedData
          ? 'Add OPENAI_API_KEY to enable the map assistant. Until then, use the dropdowns under “Upload data set” and Apply to map.'
          : 'Add OPENAI_API_KEY for AI answers. You can still use the map layers from the right panel (Political, Districts, Responses, etc.). Upload a CSV under “Upload data set to map” when you want custom choropleth or pins.',
        filterKeywords: null,
        districtText: null,
        showPins: false,
        applyChoropleth: hasUploadedData,
        valueColumn: null,
        style: null,
        geoType: null,
        pinLabelColumn: null,
      }
      return NextResponse.json({ status: true, result: fallback, llmEnabled: false })
    }

    const prompt = hasUploadedData
      ? `You help US campaign staff work with an uploaded CSV shown on a choropleth map (state or congressional district) and optionally as point pins when latitude/longitude columns exist.

Dataset:
- Total rows (approx): ${rowCount}
- Columns: ${columns.join(', ')}
- Current geo column: ${String(context.geoColumn ?? '')}
- Current geo level: ${String(context.geoType ?? '')}
- Current numeric/value column: ${String(context.valueColumn ?? '')}
- Current style: ${String(context.style ?? '')}
- Lat/lng detected: ${String(context.latLngSummary ?? 'none')}

Sample rows (JSON, up to 18):
${JSON.stringify(rowsSample.slice(0, 18), null, 0)}

User request:
${message}

Return ONLY valid JSON (no markdown) with this shape:
{
  "reply": "1-3 sentences: what you did or suggest",
  "filterKeywords": null | string[],
  "districtText": null | string,
  "showPins": boolean,
  "applyChoropleth": boolean,
  "valueColumn": null | string,
  "style": null | "color" | "saturation" | "heatmap",
  "geoType": null | "state" | "district",
  "pinLabelColumn": null | string
}

Rules:
- If the user asks to show schools, hospitals, clinics, etc., set filterKeywords to relevant terms (e.g. ["school"] or ["hospital"]) that would appear in text columns, OR set districtText if they name a district (e.g. "5" or "NJ-05").
- showPins: true only if the user wants point markers AND lat/lng columns exist in the dataset (see lat/lng summary).
- applyChoropleth: false if they only want pins; true if they want colored states/districts or both.
- pinLabelColumn: pick a column from the dataset for map labels (name, school_name, facility, etc.) or null.
- valueColumn/geoType/style: only set when the user wants to change the choropleth; use null to keep current.`
      : `You are a concise helper for Antelope's campaign dashboard map. No CSV dataset is loaded yet.

Layers the user can toggle (right-hand panel):
- Political — state-level lean / PVI-style coloring
- Districts — congressional district boundaries; click a district for intel
- Responses — survey response counts by area
- Voters — response density (heatmap / points at zoom)
- Fundraising — optional org overlays when configured
- Customizable — choropleth from THEIR uploaded CSV (state or district id + numeric column); optional lat/lng columns for facility pins
- Geofencing — draw include/exclude polygons; optional canvass address CSV

User message:
${message}

Return ONLY valid JSON (no markdown) with this exact shape:
{
  "reply": "2-5 sentences. Answer their question. If they want custom metrics, filtered schools/hospitals, or their own pins, explain they should upload a CSV via the sidebar section “Upload data set to map” (geo column + numeric value; add latitude/longitude for point pins).",
  "filterKeywords": null,
  "districtText": null,
  "showPins": false,
  "applyChoropleth": false,
  "valueColumn": null,
  "style": null,
  "geoType": null,
  "pinLabelColumn": null
}

Always set showPins and applyChoropleth to false (no dataset). Other fields null.`

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: hasUploadedData ? 0.2 : 0.35,
      messages: [
        { role: 'system', content: 'You output only compact JSON. No markdown fences.' },
        { role: 'user', content: prompt },
      ],
    })

    const text = completion.choices?.[0]?.message?.content?.trim() ?? '{}'
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''))
    } catch {
      parsed = {
        reply: 'Could not parse model output. Try rephrasing or use manual filters.',
        filterKeywords: null,
        districtText: null,
        showPins: false,
        applyChoropleth: true,
        valueColumn: null,
        style: null,
        geoType: null,
        pinLabelColumn: null,
      }
    }

    let result = normalizeResult(parsed)
    if (!hasUploadedData) {
      result = {
        ...result,
        filterKeywords: null,
        districtText: null,
        showPins: false,
        applyChoropleth: false,
        valueColumn: null,
        style: null,
        geoType: null,
        pinLabelColumn: null,
      }
    }
    return NextResponse.json({ status: true, result, llmEnabled: true })
  } catch (e) {
    console.error('custom-map chat error:', e)
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 })
  }
}
