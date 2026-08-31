'use client'

import { useState } from 'react'
import { recognizeAttachmentNote } from '@/app/actions/ocr'
import type { ClientAttachment } from '@/lib/image'
import { createTranslator, type Locale } from '@/lib/i18n'
import type { OcrContext } from '@/lib/ocr'

type Props = {
  locale: Locale
  attachment: ClientAttachment | null
  context: OcrContext
  disabled?: boolean
  onResolved: (noteText: string) => void
}

export default function OcrNoteButton({
  locale,
  attachment,
  context,
  disabled,
  onResolved,
}: Props) {
  const t = createTranslator(locale)
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!attachment?.url) {
      alert(t('ocrSelectAttachmentFirst'))
      return
    }

    setLoading(true)
    const result = await recognizeAttachmentNote({
      imageDataUrl: attachment.url,
      context,
    })

    if (result.success) {
      onResolved(result.noteText)
      alert(t('ocrFilledNote'))
    } else {
      alert(`${t('ocrActionLabel')}: ${result.error}`)
    }

    setLoading(false)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className="rounded-xl bg-[#5856D6]/10 px-4 py-2.5 text-sm font-semibold text-[#5856D6] transition-colors hover:bg-[#5856D6]/15 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? t('ocrReading') : t('ocrActionLabel')}
    </button>
  )
}
