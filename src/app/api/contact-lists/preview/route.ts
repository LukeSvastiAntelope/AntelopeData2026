import { NextRequest, NextResponse } from 'next/server'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/contact-lists/preview
 *
 * Upload a CSV/Excel file, auto-map columns, optionally apply an AI filter,
 * and return a preview of the resulting contacts.
 *
 * FormData:
 *   file          File    CSV / TSV / .xlsx / .xls
 *   filter?       string  Natural language filter, e.g. "only age 35+, district 4"
 */

const PHONE_ALIASES = ['phone', 'phone_number', 'phonenumber', 'mobile', 'cell', 'telephone',
  'tel', 'phone1', 'res_phone', 'cell_phone', 'voter_phone', 'primary_phone']
const FIRST_ALIASES = ['first', 'first_name', 'firstname', 'fname', 'given_name']
const LAST_ALIASES  = ['last', 'last_name', 'lastname', 'lname', 'surname', 'family_name']
const EMAIL_ALIASES = ['email', 'email_address', 'e_mail']
const AGE_ALIASES   = ['age', 'voter_age', 'age_at_election', 'calculated_age']
const DOB_ALIASES   = ['birthdate', 'dob', 'date_of_birth', 'birth_date', 'date_birth', 'birth']
const DISTRICT_ALIASES = ['district', 'congressional_district', 'cong_dist', 'state_senate',
  'state_house', 'ward', 'precinct', 'county_precinct']
const ZIP_ALIASES   = ['zip', 'zip_code', 'zipcode', 'postal_code', 'zip5']
const CITY_ALIASES  = ['city', 'municipality', 'res_city', 'voter_city']
const STATE_ALIASES = ['state', 'state_code', 'st', 'res_state', 'voter_state']
const PARTY_ALIASES = ['party', 'party_affiliation', 'party_code', 'registration', 'party_registration']

function matchCol(header: string, aliases: string[]): boolean {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '_')
  return aliases.some(a => h === a || h.startsWith(a) || h.endsWith(a))
}

function autoMapHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const h of headers) {
    if (matchCol(h, PHONE_ALIASES))    map[h] = 'phone'
    else if (matchCol(h, FIRST_ALIASES))   map[h] = 'first_name'
    else if (matchCol(h, LAST_ALIASES))    map[h] = 'last_name'
    else if (matchCol(h, EMAIL_ALIASES))   map[h] = 'email'
    else if (matchCol(h, AGE_ALIASES))     map[h] = 'age'
    else if (matchCol(h, DOB_ALIASES))     map[h] = 'birthdate'
    else if (matchCol(h, DISTRICT_ALIASES))map[h] = 'district'
    else if (matchCol(h, ZIP_ALIASES))     map[h] = 'zip'
    else if (matchCol(h, CITY_ALIASES))    map[h] = 'city'
    else if (matchCol(h, STATE_ALIASES))   map[h] = 'state'
    else if (matchCol(h, PARTY_ALIASES))   map[h] = 'party'
  }
  return map
}

function mapRow(row: Record<string, string>, colMap: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [orig, val] of Object.entries(row)) {
    const target = colMap[orig] || orig
    out[target] = val
  }
  return out
}

async function aiFilter(
  rows: Record<string, string>[],
  headers: string[],
  prompt: string
): Promise<Record<string, string>[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return rows

  const client = new OpenAI({ apiKey, maxRetries: 0 })

  const systemMsg = `You are a data filtering assistant. The user has a table with these columns: ${headers.join(', ')}.
They want to filter the rows using the following condition: "${prompt}".
Return ONLY a JSON array of the row indices (0-based) that PASS the filter. No explanation, just the JSON array like [0,2,5,...].
If all rows pass, return all indices. If none pass, return [].`

  const sampleSize = Math.min(rows.length, 500)
  const sample = rows.slice(0, sampleSize)

  const tableText = [
    headers.join('\t'),
    ...sample.map(r => headers.map(h => r[h] ?? '').join('\t'))
  ].join('\n')

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: tableText }
    ],
    max_tokens: 2000,
    temperature: 0,
  })

  const content = response.choices[0]?.message?.content?.trim() || '[]'

  try {
    const jsonMatch = content.match(/\[[\d,\s]*\]/)
    const indices: number[] = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    const validIndices = indices.filter(i => Number.isFinite(i) && i >= 0 && i < sample.length)
    const filtered = validIndices.map(i => sample[i])
    // Append any rows beyond the sample unchanged
    return rows.length > sampleSize
      ? [...filtered, ...rows.slice(sampleSize)]
      : filtered
  } catch {
    return rows
  }
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const filterPrompt = (formData.get('filter') as string | null)?.trim() || ''

    if (!file) return NextResponse.json({ status: false, message: 'No file provided' }, { status: 400 })

    const fileName = file.name.toLowerCase()
    let rows: Record<string, string>[] = []
    let headers: string[] = []

    if (fileName.endsWith('.csv') || fileName.endsWith('.tsv') || fileName.endsWith('.txt')) {
      const text = await file.text()
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: 'greedy' as const,
        delimiter: fileName.endsWith('.tsv') ? '\t' : undefined,
        transformHeader: (h: string, i: number) => h.trim() || `Column_${i}`,
      })
      rows = result.data
      headers = result.meta.fields || []
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false })
      headers = rows.length ? Object.keys(rows[0]) : []
    } else {
      return NextResponse.json({ status: false, message: 'Unsupported format. Use CSV, TSV, or Excel.' }, { status: 400 })
    }

    if (!rows.length) return NextResponse.json({ status: false, message: 'File has no data rows.' }, { status: 400 })

    const colMap = autoMapHeaders(headers)
    const hasPhone = Object.values(colMap).includes('phone')

    // Apply AI filter if requested
    let filteredRows = rows
    let filterApplied = false
    if (filterPrompt) {
      filteredRows = await aiFilter(rows, headers, filterPrompt)
      filterApplied = true
    }

    // Map to target fields
    const mapped = filteredRows.map(r => mapRow(r, colMap))

    return NextResponse.json({
      status: true,
      totalRows: rows.length,
      filteredRows: filteredRows.length,
      filterApplied,
      filterPrompt: filterPrompt || null,
      hasPhone,
      colMap,
      headers,
      preview: mapped.slice(0, 20),
      allContacts: mapped,
    })
  } catch (err) {
    console.error('Contact list preview error:', err)
    return NextResponse.json({ status: false, message: 'Failed to process file' }, { status: 500 })
  }
}
