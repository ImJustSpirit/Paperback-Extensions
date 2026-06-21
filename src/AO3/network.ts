import { PaperbackInterceptor, type Request, type Response } from '@paperback/types'
import { AO3_HOST } from './models'
import { autocompleteUrl, getAdultEnabled, withViewAdult, workNavigateUrl } from './utils'

// Adds the view_adult flag (when opted in) and standard headers to AO3 requests.
export class AO3Interceptor extends PaperbackInterceptor {
  async interceptRequest(request: Request): Promise<Request> {
    if (!request.url.includes(AO3_HOST)) return request

    // Skip the "this work could have adult content" interstitial when the
    // user has opted in. We only add it to work/chapter/search pages.
    if (getAdultEnabled() && /\/works(\/|\?|$)|\/chapters\//.test(request.url)) {
      request.url = withViewAdult(request.url)
    }

    request.headers = {
      'User-Agent': 'Paperback-AO3',
      Referer: 'https://archiveofourown.org/',
      ...(request.headers ?? {}),
    }

    return request
  }

  async interceptResponse(
    _request: Request,
    _response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    return data
  }
}

export async function fetchHtml(url: string, method = 'GET'): Promise<string> {
  const [, buffer] = await Application.scheduleRequest({ url, method })
  return Application.arrayBufferToUTF8String(buffer)
}

// The navigate page is small and never gated. Both getMangaDetails and
// getChapters need it, so cache it briefly to avoid fetching it twice.
const navCache = new Map<string, { html: string; at: number }>()
const NAV_TTL = 120_000

export async function fetchNavigate(mangaId: string): Promise<string> {
  const hit = navCache.get(mangaId)
  if (hit && Date.now() - hit.at < NAV_TTL) return hit.html
  const html = await fetchHtml(workNavigateUrl(mangaId))
  navCache.set(mangaId, { html, at: Date.now() })
  return html
}

// AO3's /autocomplete/<type> returns a JSON array of { id, name }. We return the
// canonical names, which is what the *_names search fields take.
export async function fetchTagSuggestions(type: string, term: string): Promise<string[]> {
  const trimmed = term.trim()
  if (!trimmed) return []
  try {
    const [, buffer] = await Application.scheduleRequest({
      url: autocompleteUrl(type, trimmed),
      method: 'GET',
    })
    const raw = JSON.parse(Application.arrayBufferToUTF8String(buffer)) as Array<{
      id?: string
      name?: string
    }>
    return raw
      .map((e) => e.name ?? e.id ?? '')
      .filter(Boolean)
      .slice(0, 15)
  } catch {
    return []
  }
}
