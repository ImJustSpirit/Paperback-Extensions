import {
  AO3_DOMAIN,
  DEFAULT_SORT_COLUMN,
  type WorksSearchParams,
} from './models'

// --- URL builders -----------------------------------------------------------

export function workUrl(workId: string): string {
  return `${AO3_DOMAIN}/works/${workId}`
}

// Chapter index for a work; lists every chapter and its id.
export function workNavigateUrl(workId: string): string {
  return `${AO3_DOMAIN}/works/${workId}/navigate`
}

export function chapterUrl(workId: string, chapterId: string): string {
  return `${AO3_DOMAIN}/works/${workId}/chapters/${chapterId}`
}

// Basic query search. AO3 paginates with ?page=N (1-indexed).
export function searchUrl(query: string, page: number, sortColumn?: string): string {
  const q = encodeURIComponent(query)
  let url = `${AO3_DOMAIN}/works/search?work_search%5Bquery%5D=${q}&page=${page}`
  if (sortColumn) url += `&work_search%5Bsort_column%5D=${encodeURIComponent(sortColumn)}`
  return url
}

function field(name: string, value: string): string {
  return `work_search%5B${name}%5D=${encodeURIComponent(value)}`
}

function arrayField(name: string, values: string[]): string[] {
  return values.map((v) => `work_search%5B${name}%5D%5B%5D=${encodeURIComponent(v)}`)
}

export function worksSearchUrl(p: WorksSearchParams, page: number): string {
  const parts: string[] = []
  if (p.query) parts.push(field('query', p.query))
  if (p.creators) parts.push(field('creators', p.creators))
  if (p.fandoms.length) parts.push(field('fandom_names', p.fandoms.join(',')))
  if (p.characters.length) parts.push(field('character_names', p.characters.join(',')))
  if (p.relationships.length)
    parts.push(field('relationship_names', p.relationships.join(',')))
  if (p.freeforms.length) parts.push(field('freeform_names', p.freeforms.join(',')))
  if (p.rating) parts.push(field('rating_ids', p.rating))
  parts.push(...arrayField('archive_warning_ids', p.warnings))
  parts.push(...arrayField('category_ids', p.categories))
  if (p.crossover) parts.push(field('crossover', p.crossover))
  if (p.complete) parts.push(field('complete', p.complete))
  if (p.singleChapter) parts.push(field('single_chapter', '1'))
  if (p.wordCount) parts.push(field('word_count', p.wordCount))
  if (p.language) parts.push(field('language_id', p.language))
  parts.push(field('sort_column', p.sort || DEFAULT_SORT_COLUMN))
  parts.push(field('sort_direction', p.direction || 'desc'))
  parts.push(`page=${page}`)
  return `${AO3_DOMAIN}/works/search?${parts.join('&')}`
}

// Tag autocomplete. Returns a JSON array of { id, name }.
export function autocompleteUrl(type: string, term: string): string {
  return `${AO3_DOMAIN}/autocomplete/${type}?term=${encodeURIComponent(term)}`
}

// Works tagged with a given tag. AO3 escapes '/' as '*s*' in tag paths.
export function tagWorksUrl(tag: string, page: number, sortColumn?: string): string {
  const escaped = encodeURIComponent(tag.replace(/\//g, '*s*'))
  let url = `${AO3_DOMAIN}/tags/${escaped}/works?page=${page}`
  if (sortColumn) url += `&work_search%5Bsort_column%5D=${encodeURIComponent(sortColumn)}`
  return url
}

export function withViewAdult(url: string): string {
  if (url.includes('view_adult=')) return url
  return url + (url.includes('?') ? '&' : '?') + 'view_adult=true'
}

// Resolves a possibly-relative AO3 path to an absolute URL.
export function absoluteUrl(path: string): string {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return AO3_DOMAIN + (path.startsWith('/') ? path : `/${path}`)
}

// --- Tag ids ----------------------------------------------------------------

// Paperback restricts ids to alphanumerics and `._-@()[]%?#+=/&:`, so
// percent-encode tag text into that set. encodeURIComponent leaves !~*' which
// aren't allowed, so encode those too.
function encodeTag(value: string): string {
  return encodeURIComponent(value).replace(
    /[!~*']/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

// Id for a manga-details tag group entry (the display title keeps the raw text).
export function tagGroupId(prefix: string, value: string): string {
  return `${prefix}:${encodeTag(value)}`
}

export const TAG_SECTION_PREFIX = 'tag:'

export function encodeTagSectionId(tag: string): string {
  return `${TAG_SECTION_PREFIX}${encodeTag(tag)}`
}

export function decodeTagSectionId(id: string): string {
  try {
    return decodeURIComponent(id.slice(TAG_SECTION_PREFIX.length))
  } catch {
    return ''
  }
}

// --- Persisted state --------------------------------------------------------

const ADULT_KEY = 'ao3_adult_enabled'
const HOME_TAGS_KEY = 'ao3_home_tags'
const PINNED_TAGS_KEY = 'ao3_pinned_tags'

export function getAdultEnabled(): boolean {
  return (Application.getState(ADULT_KEY) as boolean | undefined) ?? false
}

export function setAdultEnabled(value: boolean): void {
  Application.setState(value, ADULT_KEY)
}

export function getHomeTags(): string[] {
  const raw = Application.getState(HOME_TAGS_KEY) as string | undefined
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

export function setHomeTags(tags: string[]): void {
  Application.setState(JSON.stringify(tags), HOME_TAGS_KEY)
}

// Tags pinned for quick reuse in the advanced search picker, kept per type.
type PinnedTags = Record<string, string[]>

function readPinnedTags(): PinnedTags {
  const raw = Application.getState(PINNED_TAGS_KEY) as string | undefined
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as PinnedTags) : {}
  } catch {
    return {}
  }
}

export function getPinnedTags(type: string): string[] {
  return readPinnedTags()[type] ?? []
}

export function addPinnedTag(type: string, tag: string): void {
  const pins = readPinnedTags()
  const list = pins[type] ?? []
  if (list.includes(tag)) return
  pins[type] = [...list, tag]
  Application.setState(JSON.stringify(pins), PINNED_TAGS_KEY)
}

export function removePinnedTag(type: string, tag: string): void {
  const pins = readPinnedTags()
  if (!pins[type]) return
  pins[type] = pins[type].filter((t) => t !== tag)
  Application.setState(JSON.stringify(pins), PINNED_TAGS_KEY)
}

// --- Search params ----------------------------------------------------------

export function defaultSearchParams(query = ''): WorksSearchParams {
  return {
    query,
    creators: '',
    fandoms: [],
    characters: [],
    relationships: [],
    freeforms: [],
    rating: '',
    warnings: [],
    categories: [],
    crossover: '',
    complete: '',
    singleChapter: false,
    wordCount: '',
    language: '',
    sort: DEFAULT_SORT_COLUMN,
    direction: 'desc',
  }
}
