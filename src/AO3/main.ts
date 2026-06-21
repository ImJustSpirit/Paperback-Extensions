import {
  BasicRateLimiter,
  type Chapter,
  type ChapterDetails,
  type DiscoverSection,
  type DiscoverSectionItem,
  DiscoverSectionType,
  type Extension,
  type Form,
  type Metadata,
  type PagedResults,
  type SearchQuery,
  type SearchResultItem,
  type SortingOption,
  type SourceManga,
  type ChapterProviding,
  type DiscoverSectionProviding,
  type SearchResultsProviding,
  type SettingsFormProviding,
} from '@paperback/types'
import { AO3Interceptor, fetchHtml, fetchNavigate } from './network'
import { AO3AdvancedSearchForm, AO3SettingsForm } from './forms'
import {
  isGatePage,
  parseAuthorPseudPath,
  parseChapterHtml,
  parseChapterList,
  parseSearchResults,
  parseUserIconUrl,
  parseWorkDetails,
} from './parsers'
import {
  AO3_LOGO,
  DEFAULT_HOME_TAGS,
  SORT_COLUMNS,
  type WorksSearchParams,
} from './models'
import {
  absoluteUrl,
  chapterUrl,
  decodeTagSectionId,
  encodeTagSectionId,
  getHomeTags,
  searchUrl,
  tagWorksUrl,
  TAG_SECTION_PREFIX,
  withViewAdult,
  workUrl,
  worksSearchUrl,
} from './utils'

type SearchMeta = { tag?: string; advanced?: WorksSearchParams }
type PageMeta = { page?: number }

class AO3Extension
  implements
    Extension,
    ChapterProviding,
    SearchResultsProviding,
    DiscoverSectionProviding,
    SettingsFormProviding
{
  // AO3 is a volunteer-run nonprofit, so keep requests gentle (Balanced: 3/s).
  rateLimiter = new BasicRateLimiter('ao3-ratelimiter', {
    numberOfRequests: 3,
    bufferInterval: 1,
    ignoreImages: true,
  })

  interceptor = new AO3Interceptor('ao3-interceptor')

  async initialise(): Promise<void> {
    this.rateLimiter.registerInterceptor()
    this.interceptor.registerInterceptor()
  }

  // --- MangaProviding -------------------------------------------------------
  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    // The work landing page redirects to the first chapter, and AO3's adult
    // gate drops view_adult across that redirect. A direct chapter URL serves
    // the full work metadata inline with view_adult honoured, so resolve the
    // first chapter from the (ungated) navigate page and read metadata there.
    const nav = await fetchNavigate(mangaId)
    const first = parseChapterList(mangaId, nav)[0]
    const url =
      first && first.chapterId !== 'full'
        ? withViewAdult(chapterUrl(mangaId, first.chapterId))
        : withViewAdult(workUrl(mangaId))

    let html = await fetchHtml(url)
    // Fallback: if we still hit the adult gate, view_full_work renders the work
    // inline (no redirect to drop view_adult), so metadata always parses.
    if (isGatePage(html)) {
      html = await fetchHtml(`${workUrl(mangaId)}?view_adult=true&view_full_work=true`)
    }

    const manga = parseWorkDetails(mangaId, html)

    // Use the author's profile icon as the work cover when they've set one.
    // Only on open (one extra request); search/Discover keep the AO3 logo.
    try {
      const pseud = parseAuthorPseudPath(html)
      if (pseud) {
        const icon = parseUserIconUrl(await fetchHtml(absoluteUrl(pseud)))
        if (icon) manga.mangaInfo.thumbnailUrl = icon
      }
    } catch {
      // Keep the default cover on any failure.
    }

    return manga
  }

  // --- ChapterProviding -----------------------------------------------------
  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const html = await fetchNavigate(sourceManga.mangaId)
    const parsed = parseChapterList(sourceManga.mangaId, html)

    return parsed.map((p) => ({
      chapterId: p.chapterId,
      sourceManga,
      langCode: 'en',
      chapNum: p.chapNum,
      // volume 0 keeps the app from showing a "Vol. TBA" label (AO3 has no
      // volumes); the title has its leading "N. " stripped in the parser.
      volume: 0,
      title: p.title,
      publishDate: p.publishDate,
    }))
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const workId = chapter.sourceManga.mangaId
    const url =
      chapter.chapterId === 'full'
        ? workUrl(workId)
        : chapterUrl(workId, chapter.chapterId)

    const html = await fetchHtml(url)

    return {
      id: chapter.chapterId,
      mangaId: workId,
      type: 'html',
      html: parseChapterHtml(html),
    }
  }

  // --- SearchResultsProviding ----------------------------------------------
  async getSearchResults(
    query: SearchQuery<Metadata>,
    metadata: Metadata | undefined,
    sortingOption: SortingOption | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as PageMeta | undefined)?.page ?? 1
    const searchMeta = query.metadata as SearchMeta | undefined
    const sort = sortingOption?.id

    let url: string
    if (searchMeta?.advanced) {
      url = worksSearchUrl(searchMeta.advanced, page)
    } else if (searchMeta?.tag) {
      url = tagWorksUrl(searchMeta.tag, page, sort)
    } else {
      url = searchUrl(query.title, page, sort)
    }

    const html = await fetchHtml(url)
    const { items, hasNext } = parseSearchResults(html)

    const nextMeta: Metadata | undefined = hasNext ? { page: page + 1 } : undefined
    return { items, metadata: nextMeta }
  }

  async getSortingOptions(_query: SearchQuery<Metadata>): Promise<SortingOption[]> {
    return SORT_COLUMNS.map((c) => ({ id: c.id, label: c.label }))
  }

  async getAdvancedSearchForm(query: SearchQuery<Metadata>): Promise<AO3AdvancedSearchForm> {
    return new AO3AdvancedSearchForm(query.title ?? '')
  }

  // --- DiscoverSectionProviding --------------------------------------------
  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const homeTags = getHomeTags()

    // Empty state: prompt the user to pick tags in Settings.
    if (homeTags.length === 0) {
      return [
        {
          id: 'empty',
          title: 'Add tags in Settings → Home to fill your Discover feed',
          type: DiscoverSectionType.genres,
        },
      ]
    }

    // One work carousel per user-chosen tag.
    return homeTags.map((tag) => ({
      id: encodeTagSectionId(tag),
      title: tag,
      type: DiscoverSectionType.simpleCarousel,
    }))
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    _metadata?: Metadata,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    // Empty state: offer default fandoms to browse while nudging to Settings.
    if (section.id === 'empty') {
      const items: DiscoverSectionItem[] = DEFAULT_HOME_TAGS.map((tag) => ({
        type: 'genresCarouselItem',
        name: tag,
        searchQuery: { title: '', metadata: { tag } as Metadata },
      }))
      return { items, metadata: undefined }
    }

    if (!section.id.startsWith(TAG_SECTION_PREFIX)) {
      return { items: [], metadata: undefined }
    }

    // A user tag: show the most recently updated works for it.
    const tag = decodeTagSectionId(section.id) || section.title
    const html = await fetchHtml(tagWorksUrl(tag, 1, 'revised_at'))
    const { items } = parseSearchResults(html)

    const carousel: DiscoverSectionItem[] = items.map((it) => ({
      type: 'simpleCarouselItem',
      mangaId: it.mangaId,
      imageUrl: it.imageUrl || AO3_LOGO,
      title: it.title,
      subtitle: it.subtitle,
    }))
    return { items: carousel, metadata: undefined }
  }

  // --- SettingsFormProviding -----------------------------------------------
  async getSettingsForm(): Promise<Form> {
    return new AO3SettingsForm()
  }
}

export const AO3 = new AO3Extension()
