import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'

/**
 * Minimal markdown -> docx converter for AI-generated report text. Not a
 * full CommonMark parser — just handles the subset our reports actually
 * produce: #/##/### headings, -/* bullets, **bold** inline runs, and plain
 * paragraphs. Good enough for a legible Word doc, not a markdown renderer.
 */

function parseInlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = []
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }))
    } else {
      runs.push(new TextRun(part))
    }
  }
  return runs.length ? runs : [new TextRun(text)]
}

function markdownToParagraphs(markdown: string): Paragraph[] {
  const lines = markdown.split('\n')
  const paragraphs: Paragraph[] = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ text: '' }))
      continue
    }
    if (line.trim() === '---') {
      continue
    }

    const h3 = line.match(/^###\s+(.*)/)
    const h2 = line.match(/^##\s+(.*)/)
    const h1 = line.match(/^#\s+(.*)/)
    const bullet = line.match(/^\s*[-*]\s+(.*)/)
    const numbered = line.match(/^\s*\d+\.\s+(.*)/)

    if (h1) {
      paragraphs.push(new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } }))
    } else if (h2) {
      paragraphs.push(new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }))
    } else if (h3) {
      paragraphs.push(new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 } }))
    } else if (bullet) {
      paragraphs.push(new Paragraph({ children: parseInlineRuns(bullet[1]), bullet: { level: 0 }, spacing: { after: 60 } }))
    } else if (numbered) {
      paragraphs.push(new Paragraph({ children: parseInlineRuns(numbered[1]), numbering: { reference: 'report-numbering', level: 0 }, spacing: { after: 60 } }))
    } else {
      paragraphs.push(new Paragraph({ children: parseInlineRuns(line), spacing: { after: 120 } }))
    }
  }

  return paragraphs
}

export async function markdownReportToDocxBlob(opts: {
  title: string
  subtitle?: string
  meta?: string[]
  markdown: string
  footer?: string
}): Promise<Blob> {
  const { title, subtitle, meta = [], markdown, footer } = opts

  const headerParagraphs: Paragraph[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 120 } }),
  ]
  if (subtitle) {
    headerParagraphs.push(new Paragraph({ children: [new TextRun({ text: subtitle, italics: true })], spacing: { after: 120 } }))
  }
  for (const line of meta) {
    headerParagraphs.push(new Paragraph({ children: [new TextRun({ text: line, size: 20, color: '666666' })], spacing: { after: 40 } }))
  }
  headerParagraphs.push(new Paragraph({ text: '', spacing: { after: 160 } }))

  const bodyParagraphs = markdownToParagraphs(markdown)

  const footerParagraphs: Paragraph[] = footer
    ? [
        new Paragraph({ text: '', spacing: { before: 200 } }),
        new Paragraph({
          children: [new TextRun({ text: footer, size: 18, color: '999999', italics: true })],
          alignment: AlignmentType.CENTER,
        }),
      ]
    : []

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'report-numbering',
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
        },
      ],
    },
    sections: [
      {
        children: [...headerParagraphs, ...bodyParagraphs, ...footerParagraphs],
      },
    ],
  })

  return Packer.toBlob(doc)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
