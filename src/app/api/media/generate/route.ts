import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createWriteStream, mkdirSync, existsSync } from 'fs'
import path from 'path'

// POST /api/media/generate - generate an image via LLM image API and save to uploads
// Body: { prompt: string, size?: '512x512'|'1024x1024'|'256x256', format?: 'png'|'jpeg'|'webp' }
export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id')
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ status: false, message: 'OpenAI API key not configured' }, { status: 503 })
    }

    const { prompt, size = '1024x1024', format = 'png' } = await req.json()
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ status: false, message: 'Missing prompt' }, { status: 400 })
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 240000, maxRetries: 0 })

    // Generate image
    const img = await client.images.generate({
      model: 'gpt-image-1',
      prompt,
      size,
    } as any)

    // Prefer b64 if present, else fetch URL
    const b64 = img?.data?.[0]?.b64_json as string | undefined
    let buffer: Buffer
    let mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
    let ext = format === 'jpeg' ? '.jpg' : format === 'webp' ? '.webp' : '.png'
    if (b64 && typeof b64 === 'string') {
      buffer = Buffer.from(b64, 'base64')
    } else if (img?.data?.[0]?.url) {
      const u = img.data[0].url as string
      const resp = await fetch(u)
      const ab = await resp.arrayBuffer()
      buffer = Buffer.from(ab)
      const ct = resp.headers.get('content-type') || ''
      if (ct.includes('image/jpeg')) { mime = 'image/jpeg'; ext = '.jpg' }
      else if (ct.includes('image/webp')) { mime = 'image/webp'; ext = '.webp' }
      else if (ct.includes('image/png')) { mime = 'image/png'; ext = '.png' }
    } else {
      return NextResponse.json({ status: false, message: 'Image generation failed' }, { status: 502 })
    }

    // Save to public/uploads like the normal upload route
    const userId = userIdHeader
    const now = new Date()
    const folder = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
    const uploadsRoot = path.join(process.cwd(), 'public', 'uploads', userId, folder)
    if (!existsSync(uploadsRoot)) {
      mkdirSync(uploadsRoot, { recursive: true })
    }

    const filename = `${Date.now()}_gen${ext}`
    const filepath = path.join(uploadsRoot, filename)

    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(filepath)
      stream.on('error', reject)
      stream.on('finish', () => resolve())
      stream.write(buffer)
      stream.end()
    })

    const publicUrl = `/uploads/${userId}/${folder}/${filename}`
    return NextResponse.json({ status: true, url: publicUrl, type: mime })
  } catch (err:any) {
    console.error('Generate image error', err?.status || '', err?.message || err)
    return NextResponse.json({ status: false, message: 'Generate failed' }, { status: 500 })
  }
}


