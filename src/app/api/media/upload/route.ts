import { NextRequest, NextResponse } from 'next/server'
import { requireUserId } from '@/app/utils/auth/require-user'
import {
  buildMediaKey,
  getStorageProvider,
  mediaMonthFolder,
  mediaObjectUrl,
  SITE_PUBLIC_FOLDER,
} from '@/app/utils/services/storage'

/**
 * POST /api/media/upload — authenticated authors upload images/videos.
 *
 * Form fields:
 * - file (required)
 * - purpose = "site" → public site asset (Blob CDN URL / public proxy)
 * - access = "public" → same as purpose=site
 * - siteId (optional) — folded into the key folder for site assets
 *
 * Default: private → url is `/api/media/...` (ownership-proxied). Never returns
 * a raw private Blob URL to the client.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = requireUserId(req)
    if (typeof auth !== 'string') return auth
    const safeUserId = auth

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ status: false, message: 'Expected multipart/form-data' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as unknown as File
    if (!file) {
      return NextResponse.json({ status: false, message: 'Missing file' }, { status: 400 })
    }

    const purpose = String(formData.get('purpose') || '').trim().toLowerCase()
    const accessField = String(formData.get('access') || '').trim().toLowerCase()
    const isPublicSiteAsset =
      purpose === 'site' || accessField === 'public'

    const allowed = isPublicSiteAsset
      ? ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
      : [
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/gif',
          'video/mp4',
          'video/webm',
          'video/quicktime',
        ]
    const mime = file.type || ''
    if (!allowed.includes(mime)) {
      return NextResponse.json({ status: false, message: 'Unsupported file type' }, { status: 415 })
    }

    const size = file.size || 0
    const maxImageBytes = 10 * 1024 * 1024 // 10MB images
    const maxVideoBytes = 80 * 1024 * 1024 // 80MB reference clips for i2v/v2v
    if (mime.startsWith('image/') && size > maxImageBytes) {
      return NextResponse.json({ status: false, message: 'Image too large (max 10MB)' }, { status: 413 })
    }
    if (mime.startsWith('video/') && size > maxVideoBytes) {
      return NextResponse.json({ status: false, message: 'Video too large (max 80MB)' }, { status: 413 })
    }

    const original = file.name || 'upload'
    const pathExt = original.includes('.') ? `.${original.split('.').pop()}` : ''
    const ext =
      pathExt ||
      (mime === 'image/png'
        ? '.png'
        : mime === 'image/jpeg'
          ? '.jpg'
          : mime === 'image/webp'
            ? '.webp'
            : mime === 'image/gif'
              ? '.gif'
              : mime === 'video/mp4'
                ? '.mp4'
                : mime === 'video/webm'
                  ? '.webm'
                  : mime === 'video/quicktime'
                    ? '.mov'
                    : '')
    const base = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const filename = `${base}${ext}`

    let folder = mediaMonthFolder()
    if (isPublicSiteAsset) {
      const siteIdRaw = String(formData.get('siteId') || '').trim()
      const siteSeg = siteIdRaw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)
      folder = siteSeg
        ? `${SITE_PUBLIC_FOLDER}/${siteSeg}`
        : SITE_PUBLIC_FOLDER
    }

    const key = buildMediaKey({ userId: safeUserId, folder, filename })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const stored = await getStorageProvider().put(key, buffer, mime, {
      access: isPublicSiteAsset ? 'public' : 'private',
    })

    // Private: always the ownership-proxied /api/media URL (never raw Blob URL).
    // Public site: Blob CDN URL (or local /api/public/site-media proxy).
    const url = isPublicSiteAsset
      ? stored.url || `/api/public/site-media/${stored.key}`
      : mediaObjectUrl(stored.key)

    return NextResponse.json({
      status: true,
      url,
      key: stored.key,
      type: mime,
      access: isPublicSiteAsset ? 'public' : 'private',
    })
  } catch (err) {
    console.error('Upload error', err)
    return NextResponse.json({ status: false, message: 'Upload failed' }, { status: 500 })
  }
}
