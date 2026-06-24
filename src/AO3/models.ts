import type { SearchResultItem } from '@paperback/types'

export const AO3_DOMAIN = 'https://archiveofourown.org'
export const AO3_HOST = 'archiveofourown.org'

// Default cover. AO3 works have no art and the app rejects empty thumbnail URLs.
// Use AO3's square app icon (white mark on the dark-red square) rather than the
// tiny 61x42 site logo.
export const AO3_LOGO = `${AO3_DOMAIN}/apple-touch-icon.png`

// AO3 serves this icon for users who haven't uploaded one; we treat it as "no
// custom icon" so the work cover falls back to the logo instead.
export const AO3_DEFAULT_USER_ICON = '/images/skins/iconsets/default/icon_user.png'

export const DEFAULT_SORT_COLUMN = 'revised_at'

// Options for the search bar's sort selector. The id is "<column>:<direction>";
// direction is baked in so each entry reads naturally.
export const SORT_OPTIONS = [
  { id: 'revised_at:desc', label: 'Date Updated' },
  { id: 'created_at:desc', label: 'Date Posted (newest)' },
  { id: 'created_at:asc', label: 'Date Posted (oldest)' },
  { id: 'kudos_count:desc', label: 'Kudos' },
  { id: 'hits:desc', label: 'Hits' },
  { id: 'comments_count:desc', label: 'Comments' },
  { id: 'bookmarks_count:desc', label: 'Bookmarks' },
  { id: 'word_count:desc', label: 'Word Count (most)' },
  { id: 'word_count:asc', label: 'Word Count (fewest)' },
  { id: 'title_to_sort_on:asc', label: 'Title (A–Z)' },
  { id: 'authors_to_sort_on:asc', label: 'Author (A–Z)' },
  { id: '_score:desc', label: 'Best Match' },
] as const

// Filter option ids taken from the /works/search form. '' means "any".
export const RATINGS = [
  { id: '', label: 'Any rating' },
  { id: '10', label: 'General Audiences' },
  { id: '11', label: 'Teen And Up Audiences' },
  { id: '12', label: 'Mature' },
  { id: '13', label: 'Explicit' },
  { id: '9', label: 'Not Rated' },
] as const

export const ARCHIVE_WARNINGS = [
  { id: '14', label: 'Creator Chose Not To Use Archive Warnings' },
  { id: '16', label: 'No Archive Warnings Apply' },
  { id: '17', label: 'Graphic Depictions Of Violence' },
  { id: '18', label: 'Major Character Death' },
  { id: '19', label: 'Rape/Non-Con' },
  { id: '20', label: 'Underage Sex' },
] as const

export const CATEGORIES = [
  { id: '116', label: 'F/F' },
  { id: '22', label: 'F/M' },
  { id: '21', label: 'Gen' },
  { id: '23', label: 'M/M' },
  { id: '2246', label: 'Multi' },
  { id: '24', label: 'Other' },
] as const

export const CROSSOVERS = [
  { id: '', label: 'Include crossovers' },
  { id: 'F', label: 'Exclude crossovers' },
  { id: 'T', label: 'Only crossovers' },
] as const

export const COMPLETION = [
  { id: '', label: 'All works' },
  { id: 'T', label: 'Complete only' },
  { id: 'F', label: 'Work in progress' },
] as const

// Common languages (a subset of AO3's full list). The id is AO3's language code.
export const LANGUAGES = [
  { id: '', label: 'Any language' },
  { id: 'en', label: 'English' },
  { id: 'zh', label: '中文-普通话 國語' },
  { id: 'es', label: 'Español' },
  { id: 'ru', label: 'Русский' },
  { id: 'fr', label: 'Français' },
  { id: 'ptBR', label: 'Português brasileiro' },
  { id: 'de', label: 'Deutsch' },
  { id: 'it', label: 'Italiano' },
  { id: 'pl', label: 'Polski' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
  { id: 'id', label: 'Bahasa Indonesia' },
  { id: 'ar', label: 'العربية' },
  { id: 'tr', label: 'Türkçe' },
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'th', label: 'ไทย' },
  { id: 'nl', label: 'Nederlands' },
  { id: 'fi', label: 'suomi' },
  { id: 'sv', label: 'Svenska' },
  { id: 'cs', label: 'Čeština' },
  { id: 'uk', label: 'Українська' },
  { id: 'hu', label: 'Magyar' },
  { id: 'el', label: 'Ελληνικά' },
  { id: 'he', label: 'עברית' },
  { id: 'fa', label: 'فارسی' },
  { id: 'hi', label: 'हिन्दी' },
] as const

// Default fandoms shown on Discover until the user picks their own tags.
export const DEFAULT_HOME_TAGS = [
  'Harry Potter - J. K. Rowling',
  'Marvel Cinematic Universe',
  'Genshin Impact (Video Game)',
  'Boku no Hero Academia | My Hero Academia',
  'Haikyuu!!',
  'Supernatural',
]

// Autocomplete endpoint segment. 'tag' matches any tag type.
export type AutocompleteType =
  | 'tag'
  | 'fandom'
  | 'character'
  | 'relationship'
  | 'freeform'

export type Option = { id: string; label: string }

// Fields the advanced search form can set. A `type` (not `interface`) so it
// satisfies Metadata's JSON index signature when stored on a SearchQuery.
export type WorksSearchParams = {
  query: string
  creators: string
  fandoms: string[]
  characters: string[]
  relationships: string[]
  freeforms: string[]
  excludedFandoms: string[]
  excludedCharacters: string[]
  excludedRelationships: string[]
  excludedFreeforms: string[]
  excludedRatings: string[]
  excludedWarnings: string[]
  excludedCategories: string[]
  rating: string
  warnings: string[]
  categories: string[]
  crossover: string
  complete: string
  singleChapter: boolean
  wordCount: string
  language: string
}

export interface ParsedChapter {
  chapterId: string
  title?: string
  chapNum: number
  publishDate?: Date
}

export interface ParsedSearch {
  items: SearchResultItem[]
  hasNext: boolean
}
