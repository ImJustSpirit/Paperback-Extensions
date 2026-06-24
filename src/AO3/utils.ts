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

// Splits a "<column>:<direction>" sort id into its parts, with sane defaults.
export function parseSort(id?: string): { column: string; direction: string } {
  const [column, direction] = (id ?? '').split(':')
  return { column: column || DEFAULT_SORT_COLUMN, direction: direction || 'desc' }
}

function sortParams(column: string, direction: string): string {
  return (
    `&work_search%5Bsort_column%5D=${encodeURIComponent(column)}` +
    `&work_search%5Bsort_direction%5D=${encodeURIComponent(direction)}`
  )
}

// Basic query search. AO3 paginates with ?page=N (1-indexed).
export function searchUrl(
  query: string,
  page: number,
  column = DEFAULT_SORT_COLUMN,
  direction = 'desc',
): string {
  const q = encodeURIComponent(query)
  return (
    `${AO3_DOMAIN}/works/search?work_search%5Bquery%5D=${q}&page=${page}` +
    sortParams(column, direction)
  )
}

function field(name: string, value: string): string {
  return `work_search%5B${name}%5D=${encodeURIComponent(value)}`
}

function arrayField(name: string, values: string[]): string[] {
  return values.map((v) => `work_search%5B${name}%5D%5B%5D=${encodeURIComponent(v)}`)
}

export function worksSearchUrl(
  p: WorksSearchParams,
  page: number,
  column = DEFAULT_SORT_COLUMN,
  direction = 'desc',
): string {
  const parts: string[] = []
  if (p.query) parts.push(field('query', p.query))
  if (p.creators) parts.push(field('creators', p.creators))
  if (p.fandoms.length) parts.push(field('fandom_names', p.fandoms.join(',')))
  if (p.characters.length) parts.push(field('character_names', p.characters.join(',')))
  if (p.relationships.length)
    parts.push(field('relationship_names', p.relationships.join(',')))
  if (p.freeforms.length) parts.push(field('freeform_names', p.freeforms.join(',')))
  // AO3's search only excludes by tag name (any tag type); rating/warning/
  // category exclusion is a tag-browse feature it ignores here.
  const excluded = [
    ...p.excludedFandoms,
    ...p.excludedCharacters,
    ...p.excludedRelationships,
    ...p.excludedFreeforms,
  ]
  if (excluded.length) parts.push(field('excluded_tag_names', excluded.join(',')))
  if (p.rating) parts.push(field('rating_ids', p.rating))
  parts.push(...arrayField('archive_warning_ids', p.warnings))
  parts.push(...arrayField('category_ids', p.categories))
  if (p.crossover) parts.push(field('crossover', p.crossover))
  if (p.complete) parts.push(field('complete', p.complete))
  if (p.singleChapter) parts.push(field('single_chapter', '1'))
  if (p.wordCount) parts.push(field('word_count', p.wordCount))
  if (p.language) parts.push(field('language_id', p.language))
  parts.push(field('sort_column', column))
  parts.push(field('sort_direction', direction))
  parts.push(`page=${page}`)
  return `${AO3_DOMAIN}/works/search?${parts.join('&')}`
}

// The first included tag (any type), used as the primary tag_id that AO3's
// filter endpoint requires for rating/warning/category exclusion to work.
export function firstIncludeTag(p: WorksSearchParams): string | undefined {
  return p.fandoms[0] ?? p.relationships[0] ?? p.characters[0] ?? p.freeforms[0]
}

function escapeTagPath(tag: string): string {
  return encodeURIComponent(tag.replace(/\//g, '*s*'))
}

// AO3's filter endpoint splits word count into words_from/words_to. Accepts
// "1000-5000", ">10000", "<5000", or a single number.
function wordCountRange(s: string): { from?: string; to?: string } {
  const t = s.trim()
  let m
  if ((m = t.match(/^>\s*(\d+)/))) return { from: m[1] }
  if ((m = t.match(/^<\s*(\d+)/))) return { to: m[1] }
  if ((m = t.match(/^(\d+)\s*-\s*(\d+)/))) return { from: m[1], to: m[2] }
  if ((m = t.match(/^(\d+)/))) return { from: m[1] }
  return {}
}

// Tag-scoped works filter (/works?tag_id=...). Unlike /works/search, this honors
// rating/warning/category exclusion via include_/exclude_work_search. Requires a
// primary tag (caller checks firstIncludeTag first).
export function worksFilterUrl(
  p: WorksSearchParams,
  page: number,
  column = DEFAULT_SORT_COLUMN,
  direction = 'desc',
): string {
  const primary = firstIncludeTag(p) ?? ''
  const inc = (name: string, value: string) =>
    `include_work_search%5B${name}%5D%5B%5D=${encodeURIComponent(value)}`
  const exc = (name: string, value: string) =>
    `exclude_work_search%5B${name}%5D%5B%5D=${encodeURIComponent(value)}`

  const parts: string[] = ['commit=Sort+and+Filter']
  parts.push(field('sort_column', column))
  parts.push(field('sort_direction', direction))

  // Includes.
  if (p.rating) parts.push(inc('rating_ids', p.rating))
  for (const w of p.warnings) parts.push(inc('archive_warning_ids', w))
  for (const c of p.categories) parts.push(inc('category_ids', c))
  const otherTags = [...p.fandoms, ...p.relationships, ...p.characters, ...p.freeforms].filter(
    (t) => t !== primary,
  )
  if (otherTags.length) parts.push(field('other_tag_names', otherTags.join(',')))

  // Excludes.
  for (const r of p.excludedRatings) parts.push(exc('rating_ids', r))
  for (const w of p.excludedWarnings) parts.push(exc('archive_warning_ids', w))
  for (const c of p.excludedCategories) parts.push(exc('category_ids', c))
  const excludedTags = [
    ...p.excludedFandoms,
    ...p.excludedCharacters,
    ...p.excludedRelationships,
    ...p.excludedFreeforms,
  ]
  if (excludedTags.length) parts.push(field('excluded_tag_names', excludedTags.join(',')))

  // Other filters.
  if (p.crossover) parts.push(field('crossover', p.crossover))
  if (p.complete) parts.push(field('complete', p.complete))
  const wc = wordCountRange(p.wordCount)
  if (wc.from) parts.push(field('words_from', wc.from))
  if (wc.to) parts.push(field('words_to', wc.to))
  if (p.query) parts.push(field('query', p.query))
  if (p.language) parts.push(field('language_id', p.language))

  parts.push(`tag_id=${escapeTagPath(primary)}`)
  parts.push(`page=${page}`)
  return `${AO3_DOMAIN}/works?${parts.join('&')}`
}

// Tag autocomplete. Returns a JSON array of { id, name }.
export function autocompleteUrl(type: string, term: string): string {
  return `${AO3_DOMAIN}/autocomplete/${type}?term=${encodeURIComponent(term)}`
}

// Works tagged with a given tag. AO3 escapes '/' as '*s*' in tag paths.
export function tagWorksUrl(
  tag: string,
  page: number,
  column = DEFAULT_SORT_COLUMN,
  direction = 'desc',
  language?: string,
): string {
  const escaped = encodeURIComponent(tag.replace(/\//g, '*s*'))
  let url = `${AO3_DOMAIN}/tags/${escaped}/works?page=${page}` + sortParams(column, direction)
  if (language) url += `&work_search%5Blanguage_id%5D=${encodeURIComponent(language)}`
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
const HOME_LANG_KEY = 'ao3_home_language'
const PINNED_TAGS_KEY = 'ao3_pinned_tags'

export function getAdultEnabled(): boolean {
  return (Application.getState(ADULT_KEY) as boolean | undefined) ?? false
}

export function setAdultEnabled(value: boolean): void {
  Application.setState(value, ADULT_KEY)
}

// Preferred language (AO3 language code, '' = any) for home carousels, and the
// default language filter in advanced search.
export function getHomeLanguage(): string {
  return (Application.getState(HOME_LANG_KEY) as string | undefined) ?? ''
}

export function setHomeLanguage(value: string): void {
  Application.setState(value, HOME_LANG_KEY)
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
    excludedFandoms: [],
    excludedCharacters: [],
    excludedRelationships: [],
    excludedFreeforms: [],
    excludedRatings: [],
    excludedWarnings: [],
    excludedCategories: [],
    rating: '',
    warnings: [],
    categories: [],
    crossover: '',
    complete: '',
    singleChapter: false,
    wordCount: '',
    // Pre-fill with the home language preference (Settings → Home).
    language: getHomeLanguage(),
  }
}
