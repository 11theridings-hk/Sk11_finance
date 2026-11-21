import { cache } from 'react'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, normalizeLocale, type Locale } from './i18n'

/** Dedupes locale cookie reads within a single RSC/request tree. */
export const getCurrentLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies()
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value)
})
