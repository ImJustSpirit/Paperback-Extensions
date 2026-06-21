import { load, type CheerioAPI } from 'cheerio'
import { ContentRating, type SearchResultItem, type SourceManga } from '@paperback/types'
import {
  AO3_DEFAULT_USER_ICON,
  AO3_LOGO,
  type ParsedChapter,
  type ParsedSearch,
} from './models'
import { absoluteUrl, tagGroupId, workUrl } from './utils'

// HTML parsers for AO3 pages. Selectors are grouped here so they're easy to
// adjust if AO3's markup changes.

function mapRating(rating: string): ContentRating {
  const r = rating.toLowerCase()
  if (r.includes('explicit')) return ContentRating.ADULT
  if (r.includes('general')) return ContentRating.EVERYONE
  // Mature, Teen And Up, Not Rated
  return ContentRating.MATURE
}

function tagList($: CheerioAPI, selector: string): string[] {
  return $(selector)
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
}

// Flattens a "userstuff" block to plain text for the synopsis field, turning
// <br> and block elements into line breaks.
function userstuffToText($: CheerioAPI, node: ReturnType<CheerioAPI>): string {
  if (!node || node.length === 0) return ''
  const clone = load(`<div>${node.html() ?? ''}</div>`)('div')
  clone.find('br').replaceWith('\n')
  clone.find('p, div, blockquote, li').append('\n\n')
  return clone
    .text()
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// The reader parses chapter HTML as XML, which rejects multiple top-level
// elements and unclosed void tags like <br>. Self-close the void tags.
const VOID_TAGS = 'area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr'
const VOID_RE = new RegExp(`<(${VOID_TAGS})((?:[^>"']|"[^"]*"|'[^']*')*?)\\s*/?>`, 'gi')

function selfCloseVoid(html: string): string {
  return html.replace(VOID_RE, '<$1$2 />')
}

// XML only predefines amp/lt/gt/quot/apos, but AO3 markup (via cheerio) keeps
// named entities like &nbsp;, which the renderer rejects ("Entity 'nbsp' not
// defined"). Convert any other named entity to a numeric reference.
const XML_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos'])
const entityCache = new Map<string, string>()

function toXmlEntities(html: string): string {
  return html.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, name: string) => {
    if (XML_ENTITIES.has(name)) return match
    let numeric = entityCache.get(name)
    if (numeric === undefined) {
      const decoded = load(`<x>&${name};</x>`)('x').text()
      numeric =
        decoded && decoded !== `&${name};`
          ? Array.from(decoded)
              .map((c) => `&#${c.codePointAt(0)};`)
              .join('')
          : match
      entityCache.set(name, numeric)
    }
    return numeric
  })
}

const ADULT_GATE_BODY =
  '<p><strong>Adult content is hidden.</strong></p>' +
  '<p>This work is rated Mature or Explicit. To read it, open this source’s ' +
  '<em>Settings</em> and turn on <em>“Show adult content without prompting”</em>, ' +
  'then reopen the chapter.</p>'

// The reader styles paragraphs and headings only when the `html` is a full
// XHTML document; a bare fragment renders unstyled. Wrap the body accordingly.
function chapterDocument(bodyHtml: string): string {
  return `<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>${bodyHtml}</body></html>`
}

function toTags(prefix: string, titles: string[]) {
  return titles.map((t) => ({ id: tagGroupId(prefix, t), title: t }))
}

// --- Work details -----------------------------------------------------------

export function parseWorkDetails(workId: string, html: string): SourceManga {
  const $ = load(html)

  const meta = 'dl.work.meta.group'
  const primaryTitle = $('h2.title.heading').first().text().trim() || 'Untitled'
  const author =
    $('h3.byline.heading a[rel="author"]')
      .map((_, el) => $(el).text().trim())
      .get()
      .join(', ') || 'Anonymous'

  // The synopsis field is plain text, so flatten the summary HTML to text;
  // returning raw HTML would show the tags literally.
  let summaryNode = $('.preface .summary blockquote.userstuff').first()
  if (!summaryNode.length) summaryNode = $('.summary blockquote.userstuff').first()
  const summary = userstuffToText($, summaryNode)

  const ratingText = $(`${meta} dd.rating.tags a.tag`).first().text().trim()
  const fandoms = tagList($, `${meta} dd.fandom.tags a.tag`)
  const relationships = tagList($, `${meta} dd.relationship.tags a.tag`)
  const characters = tagList($, `${meta} dd.character.tags a.tag`)
  const freeforms = tagList($, `${meta} dd.freeform.tags a.tag`)
  const warnings = tagList($, `${meta} dd.warning.tags a.tag`)

  // "1/1" complete, "3/10" ongoing, "5/?" ongoing-unknown
  const chaptersStat = $(`${meta} dd.stats dd.chapters`).first().text().trim()
  const [postedStr, totalStr] = chaptersStat.split('/')
  const status =
    totalStr && totalStr !== '?' && postedStr === totalStr ? 'Completed' : 'Ongoing'

  const tagGroups = [
    { id: 'fandom', title: 'Fandom', tags: toTags('fandom', fandoms) },
    { id: 'relationship', title: 'Relationships', tags: toTags('rel', relationships) },
    { id: 'character', title: 'Characters', tags: toTags('char', characters) },
    { id: 'freeform', title: 'Tags', tags: toTags('tag', freeforms) },
    { id: 'warning', title: 'Warnings', tags: toTags('warn', warnings) },
  ].filter((g) => g.tags.length > 0)

  return {
    mangaId: workId,
    mangaInfo: {
      primaryTitle,
      secondaryTitles: [],
      author,
      synopsis: summary,
      thumbnailUrl: AO3_LOGO, // AO3 works have no cover art
      status,
      contentType: 'novel',
      contentRating: mapRating(ratingText),
      tagGroups,
      shareUrl: workUrl(workId),
    },
  }
}

// The first author's pseud page path (e.g. /users/foo/pseuds/foo), for fetching
// their profile icon. Undefined for anonymous works.
export function parseAuthorPseudPath(html: string): string | undefined {
  const $ = load(html)
  return $('h3.byline.heading a[rel="author"]').first().attr('href') || undefined
}

// The author's profile icon from their pseud page, as an absolute URL. Returns
// undefined when they use AO3's shared default icon.
export function parseUserIconUrl(html: string): string | undefined {
  const $ = load(html)
  const src =
    $('.primary.header.module p.icon img').first().attr('src') ??
    $('p.icon img').first().attr('src')
  if (!src || src.includes(AO3_DEFAULT_USER_ICON)) return undefined
  return absoluteUrl(src)
}

// True when AO3 served the adult-content interstitial instead of the work
// (caution block present, work metadata absent).
export function isGatePage(html: string): boolean {
  const $ = load(html)
  return $('.caution').length > 0 && $('dl.work.meta.group').length === 0
}

// --- Chapter list (from /works/:id/navigate) --------------------------------

export function parseChapterList(workId: string, html: string): ParsedChapter[] {
  const $ = load(html)
  const out: ParsedChapter[] = []

  $('ol.chapter.index li').each((i, el) => {
    const link = $(el).find('a').first()
    const href = link.attr('href') ?? ''
    const match = href.match(/\/chapters\/(\d+)/)
    if (!match) return

    const dateText = $(el).find('span.datetime').first().text().trim()
    const date = dateText ? new Date(dateText.replace(/[()]/g, '')) : undefined

    // AO3's navigate page prefixes the chapter number ("1. Some Title"). The app
    // already shows "Ch. 1", so strip that prefix; undefined when no real title.
    const title = link.text().trim().replace(/^\d+\.\s*/, '') || undefined

    out.push({
      chapterId: match[1],
      title,
      chapNum: i + 1,
      publishDate: date && !isNaN(date.getTime()) ? date : undefined,
    })
  })

  // Single-chapter works: navigate may not list a chapter id. Fall back to the
  // work itself as one chapter.
  if (out.length === 0) {
    out.push({ chapterId: 'full', chapNum: 1 })
  }
  return out
}

// --- Chapter content --------------------------------------------------------

export function parseChapterHtml(html: string): string {
  const $ = load(html)

  // When adult content isn't enabled, AO3 serves an interstitial (a `.caution`
  // block with a "view_adult" proceed link) instead of the chapter. Show a
  // clear explanation rather than a generic failure.
  if ($('.caution').length > 0 && $('#chapters .userstuff').length === 0) {
    return chapterDocument(ADULT_GATE_BODY)
  }

  // The reading content lives in a .userstuff block flagged role="article".
  let node = $('#chapters .userstuff[role="article"]').first()
  if (!node.length) node = $('#chapters .userstuff').first()
  if (!node.length) node = $('div.userstuff[role="article"]').first()
  if (!node.length) node = $('div.userstuff').first()

  // Drop AO3's "Chapter Text" landmark heading; keep the rest as the body.
  node.find('.landmark').remove()
  const inner = node.html()
  if (!inner) {
    return chapterDocument('<p><em>Could not load chapter content.</em></p>')
  }

  // Make the markup XML-safe (self-closed void tags + numeric entities) and
  // place it directly in the document body so paragraphs render with spacing.
  return chapterDocument(toXmlEntities(selfCloseVoid(inner)))
}

// --- Search / browse results ------------------------------------------------

export function parseSearchResults(html: string): ParsedSearch {
  const $ = load(html)
  const items: SearchResultItem[] = []

  $('li.work.blurb, li.bookmark.blurb').each((_, el) => {
    const titleLink = $(el).find('.header .heading a').first()
    const href = titleLink.attr('href') ?? ''
    const match = href.match(/\/works\/(\d+)/)
    if (!match) return

    const authors = $(el)
      .find('.header .heading a[rel="author"]')
      .map((_i, a) => $(a).text().trim())
      .get()
      .join(', ')

    const fandoms = $(el)
      .find('.header .fandoms a.tag')
      .map((_i, a) => $(a).text().trim())
      .get()
      .join(', ')

    items.push({
      mangaId: match[1],
      title: titleLink.text().trim(),
      subtitle: [authors, fandoms].filter(Boolean).join(' • ') || undefined,
      imageUrl: AO3_LOGO,
    })
  })

  const hasNext =
    $('ol.pagination li.next a, ol.pagination a[rel="next"]').length > 0

  return { items, hasNext }
}
