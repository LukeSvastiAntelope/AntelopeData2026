import { NextRequest, NextResponse } from 'next/server'
import { createWriteStream, mkdirSync, existsSync } from 'fs'
import path from 'path'

// POST /api/media/upload - authenticated authors upload images/videos
export async function POST(req: NextRequest) {
  try {
    const userIdHeader = req.headers.get('x-user-id')
    if (!userIdHeader) {
      return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
    }

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ status: false, message: 'Expected multipart/form-data' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as unknown as File
    if (!file) {
      return NextResponse.json({ status: false, message: 'Missing file' }, { status: 400 })
    }

    const allowed = ['image/png','image/jpeg','image/webp','image/gif','video/mp4']
    const mime = file.type || ''
    if (!allowed.includes(mime)) {
      return NextResponse.json({ status: false, message: 'Unsupported file type' }, { status: 415 })
    }

    const size = file.size || 0
    const maxBytes = 10 * 1024 * 1024 // 10MB images for now
    if (mime.startsWith('image/') && size > maxBytes) {
      return NextResponse.json({ status: false, message: 'Image too large (max 10MB)' }, { status: 413 })
    }

    // Derive target path
    const userId = userIdHeader
    const now = new Date()
    const folder = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
    const uploadsRoot = path.join(process.cwd(), 'public', 'uploads', userId, folder)
    if (!existsSync(uploadsRoot)) {
      mkdirSync(uploadsRoot, { recursive: true })
    }

    const original = file.name || 'upload'
    const ext = path.extname(original) || (mime==='image/png'?'.png': mime==='image/jpeg'?'.jpg': mime==='image/webp'?'.webp': mime==='image/gif'?'.gif': mime==='video/mp4'?'.mp4':'')
    const base = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    const filename = `${base}${ext}`
    const filepath = path.join(uploadsRoot, filename)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(filepath)
      stream.on('error', reject)
      stream.on('finish', () => resolve())
      stream.write(buffer)
      stream.end()
    })

    const publicUrl = `/uploads/${userId}/${folder}/${filename}`
    return NextResponse.json({ status: true, url: publicUrl, type: mime })
  } catch (err) {
    console.error('Upload error', err)
    return NextResponse.json({ status: false, message: 'Upload failed' }, { status: 500 })
  }
}


