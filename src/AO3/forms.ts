import {
  AdvancedSearchForm,
  ButtonRow,
  closureSelector,
  Form,
  InputRow,
  LabelRow,
  NavigationRow,
  Section,
  SelectRow,
  ToggleRow,
  type FormItemElement,
  type FormSectionElement,
  type Metadata,
  type SearchQuery,
} from '@paperback/types'
import { fetchTagSuggestions } from './network'
import {
  ARCHIVE_WARNINGS,
  type AutocompleteType,
  CATEGORIES,
  COMPLETION,
  CROSSOVERS,
  LANGUAGES,
  type Option,
  RATINGS,
  type WorksSearchParams,
} from './models'
import {
  addPinnedTag,
  defaultSearchParams,
  getAdultEnabled,
  getHomeLanguage,
  getHomeTags,
  getPinnedTags,
  removePinnedTag,
  setAdultEnabled,
  setHomeLanguage,
  setHomeTags,
} from './utils'

// Remembers the last advanced-search filters so reopening the filter panel
// keeps them (instead of resetting). Cleared on app restart.
let lastAdvanced: WorksSearchParams | undefined

// Ratings minus the "Any" entry, for the exclude multi-select.
const EXCLUDABLE_RATINGS: Option[] = RATINGS.filter((r) => r.id !== '')

// A sub-form that resolves a tag field via AO3's autocomplete. The user types a
// term, taps Search, and adds matches; selections accumulate into `selected`
// (passed by reference from the parent form). When `enablePins` is set, tags can
// be pinned for one-tap reuse across future searches.
class TagPickerForm extends Form {
  private term = ''
  private results: string[] = []

  constructor(
    private heading: string,
    private acType: AutocompleteType,
    private selected: string[],
    private onChanged: () => void,
    private enablePins = false,
  ) {
    super()
  }

  private add(tag: string): void {
    if (!this.selected.includes(tag)) this.selected.push(tag)
    this.onChanged()
    this.reloadForm()
  }

  override getSections(): FormSectionElement<unknown>[] {
    const sections: FormSectionElement<unknown>[] = []

    if (this.selected.length) {
      const rows: FormItemElement<unknown>[] = this.selected.map((tag, i) =>
        ButtonRow(`rm-${i}`, {
          title: `✕  ${tag}`,
          onSelect: closureSelector(this, `rm-${i}`, async () => {
            const at = this.selected.indexOf(tag)
            if (at >= 0) this.selected.splice(at, 1)
            this.onChanged()
            this.reloadForm()
          }),
        }),
      )
      if (this.enablePins) {
        rows.push(
          ButtonRow('pin-selected', {
            title: '★  Pin these tags',
            onSelect: closureSelector(this, 'pin-selected', async () => {
              for (const tag of this.selected) addPinnedTag(this.acType, tag)
              this.reloadForm()
            }),
          }),
        )
      }
      sections.push(Section({ id: 'selected', header: `Selected (${this.selected.length})` }, rows))
    }

    if (this.enablePins) {
      const pins = getPinnedTags(this.acType)
      if (pins.length) {
        const rows: FormItemElement<unknown>[] = pins
          .filter((tag) => !this.selected.includes(tag))
          .map((tag, i) =>
            ButtonRow(`pin-${i}`, {
              title: `+  ${tag}`,
              onSelect: closureSelector(this, `pin-${i}`, async () => this.add(tag)),
            }),
          )
        rows.push(
          NavigationRow('edit-pins', {
            title: 'Edit pinned tags',
            form: new PinManagerForm(this.acType),
          }),
        )
        sections.push(Section({ id: 'pinned', header: 'Pinned' }, rows))
      }
    }

    sections.push(
      Section(
        {
          id: 'find',
          header: `Find ${this.heading}`,
          footer: 'Type a few letters, then tap Search AO3.',
        },
        [
          InputRow('term', {
            title: 'Search',
            value: this.term,
            onValueChange: closureSelector(this, 'term', async (v: string) => {
              this.term = v
            }),
          }),
          ButtonRow('search', {
            title: 'Search AO3',
            onSelect: closureSelector(this, 'search', async () => {
              this.results = await fetchTagSuggestions(this.acType, this.term)
              this.reloadForm()
            }),
          }),
        ],
      ),
    )

    const addable = this.results.filter((r) => !this.selected.includes(r))
    if (addable.length) {
      sections.push(
        Section(
          { id: 'results', header: 'Results' },
          addable.map((tag, i) =>
            ButtonRow(`add-${i}`, {
              title: `+  ${tag}`,
              onSelect: closureSelector(this, `add-${i}`, async () => this.add(tag)),
            }),
          ),
        ),
      )
    }

    return sections
  }
}

// Lists pinned tags for one type so they can be removed.
class PinManagerForm extends Form {
  constructor(private acType: AutocompleteType) {
    super()
  }

  override getSections(): FormSectionElement<unknown>[] {
    const pins = getPinnedTags(this.acType)
    if (!pins.length) {
      return [Section({ id: 'none' }, [LabelRow('none', { title: 'No pinned tags' })])]
    }
    return [
      Section(
        { id: 'pins', header: 'Pinned tags', footer: 'Tap to remove.' },
        pins.map((tag, i) =>
          ButtonRow(`unpin-${i}`, {
            title: `✕  ${tag}`,
            onSelect: closureSelector(this, `unpin-${i}`, async () => {
              removePinnedTag(this.acType, tag)
              this.reloadForm()
            }),
          }),
        ),
      ),
    ]
  }
}

// Sub-menu of everything that can be excluded: tag fields (by name) plus
// rating/warning/category multi-selects (which only apply when the search is
// scoped to a tag; see worksFilterUrl).
class ExcludeForm extends Form {
  constructor(private p: WorksSearchParams) {
    super()
  }

  private row(
    id: string,
    title: string,
    type: AutocompleteType,
    arr: string[],
  ): FormItemElement<unknown> {
    return NavigationRow(id, {
      title,
      value: arr.length ? `${arr.length} selected` : 'None',
      form: new TagPickerForm(title, type, arr, () => this.reloadForm(), true),
    })
  }

  private multi(
    id: string,
    title: string,
    options: readonly Option[],
    current: string[],
    set: (v: string[]) => void,
  ): FormItemElement<unknown> {
    return SelectRow(id, {
      title,
      layout: 'list',
      value: current,
      minItemCount: 0,
      maxItemCount: options.length,
      items: options.map((o) => ({ id: o.id, title: o.label })),
      onValueChange: closureSelector(this, id, async (v: string[]) => set(v)),
    })
  }

  override getSections(): FormSectionElement<unknown>[] {
    const p = this.p
    return [
      Section(
        {
          id: 'exclude',
          header: 'Exclude',
          footer:
            'Works matching these are hidden. Rating/Warning/Category exclusion needs at least one included fandom or tag in the search.',
        },
        [
          this.row('x-fandoms', 'Fandoms', 'fandom', p.excludedFandoms),
          this.row('x-characters', 'Characters', 'character', p.excludedCharacters),
          this.row('x-relationships', 'Relationships', 'relationship', p.excludedRelationships),
          this.row('x-freeforms', 'Additional Tags', 'freeform', p.excludedFreeforms),
          this.multi('x-rating', 'Ratings', EXCLUDABLE_RATINGS, p.excludedRatings, (v) => {
            p.excludedRatings = v
          }),
          this.multi('x-warnings', 'Warnings', ARCHIVE_WARNINGS, p.excludedWarnings, (v) => {
            p.excludedWarnings = v
          }),
          this.multi('x-categories', 'Categories', CATEGORIES, p.excludedCategories, (v) => {
            p.excludedCategories = v
          }),
        ],
      ),
    ]
  }
}

// The in-app advanced filter panel for AO3 works search.
export class AO3AdvancedSearchForm extends AdvancedSearchForm {
  private p: WorksSearchParams

  constructor(query: SearchQuery<Metadata>) {
    super()
    // Restore the filters from the active search (so reopening keeps them), then
    // fall back to the last-used filters, then to fresh defaults.
    const carried =
      (query.metadata as { advanced?: WorksSearchParams } | undefined)?.advanced ??
      lastAdvanced
    this.p = carried ? { ...defaultSearchParams(), ...carried } : defaultSearchParams()
    // The search bar is the source of truth for the query, so always sync the
    // "Any field" to it instead of a stale persisted value.
    this.p.query = query.title ?? ''
  }

  private tagRow(
    id: string,
    title: string,
    type: AutocompleteType,
    arr: string[],
  ): FormItemElement<unknown> {
    return NavigationRow(id, {
      title,
      value: arr.length ? `${arr.length} selected` : 'Any',
      form: new TagPickerForm(title, type, arr, () => this.reloadForm(), true),
    })
  }

  private single(
    id: string,
    title: string,
    options: readonly Option[],
    current: string,
    set: (v: string) => void,
  ): FormItemElement<unknown> {
    return SelectRow(id, {
      title,
      layout: 'list',
      value: [current],
      minItemCount: 1,
      maxItemCount: 1,
      items: options.map((o) => ({ id: o.id, title: o.label })),
      onValueChange: closureSelector(this, id, async (v: string[]) => {
        set(v[0] ?? '')
      }),
    })
  }

  private multi(
    id: string,
    title: string,
    options: readonly Option[],
    current: string[],
    set: (v: string[]) => void,
  ): FormItemElement<unknown> {
    return SelectRow(id, {
      title,
      layout: 'list',
      value: current,
      minItemCount: 0,
      maxItemCount: options.length,
      items: options.map((o) => ({ id: o.id, title: o.label })),
      onValueChange: closureSelector(this, id, async (v: string[]) => {
        set(v)
      }),
    })
  }

  override getSections(): FormSectionElement<unknown>[] {
    const p = this.p
    return [
      Section({ id: 'text', header: 'Search' }, [
        InputRow('query', {
          title: 'Any field',
          value: p.query,
          onValueChange: closureSelector(this, 'query', async (v: string) => {
            p.query = v
          }),
        }),
        InputRow('creators', {
          title: 'Author / Creator',
          value: p.creators,
          onValueChange: closureSelector(this, 'creators', async (v: string) => {
            p.creators = v
          }),
        }),
      ]),
      Section({ id: 'tags', header: 'Tags', footer: 'Tap to search AO3 tags.' }, [
        this.tagRow('fandoms', 'Fandoms', 'fandom', p.fandoms),
        this.tagRow('characters', 'Characters', 'character', p.characters),
        this.tagRow('relationships', 'Relationships', 'relationship', p.relationships),
        this.tagRow('freeforms', 'Additional Tags', 'freeform', p.freeforms),
        NavigationRow('exclude', {
          title: 'Exclude',
          value: this.excludedCount() ? `${this.excludedCount()} selected` : 'None',
          form: new ExcludeForm(p),
        }),
      ]),
      Section(
        {
          id: 'filters',
          header: 'Filters',
          footer: 'Word count accepts e.g. 1000-5000 or >10000.',
        },
        [
          this.single('rating', 'Rating', RATINGS, p.rating, (v) => {
            p.rating = v
          }),
          this.multi('warnings', 'Warnings', ARCHIVE_WARNINGS, p.warnings, (v) => {
            p.warnings = v
          }),
          this.multi('categories', 'Categories', CATEGORIES, p.categories, (v) => {
            p.categories = v
          }),
          this.single('crossover', 'Crossovers', CROSSOVERS, p.crossover, (v) => {
            p.crossover = v
          }),
          this.single('complete', 'Completion', COMPLETION, p.complete, (v) => {
            p.complete = v
          }),
          ToggleRow('single_chapter', {
            title: 'Single-chapter works only',
            value: p.singleChapter,
            onValueChange: closureSelector(this, 'single_chapter', async (v: boolean) => {
              p.singleChapter = v
            }),
          }),
          this.single('language', 'Language', LANGUAGES, p.language, (v) => {
            p.language = v
          }),
          InputRow('wordcount', {
            title: 'Word count',
            value: p.wordCount,
            onValueChange: closureSelector(this, 'wordcount', async (v: string) => {
              p.wordCount = v
            }),
          }),
        ],
      ),
      Section({ id: 'reset' }, [
        ButtonRow('reset', {
          title: 'Reset filters',
          onSelect: closureSelector(this, 'reset', async () => {
            lastAdvanced = undefined
            this.p = defaultSearchParams(this.p.query)
            this.reloadForm()
          }),
        }),
      ]),
    ]
  }

  private excludedCount(): number {
    const p = this.p
    return (
      p.excludedFandoms.length +
      p.excludedCharacters.length +
      p.excludedRelationships.length +
      p.excludedFreeforms.length +
      p.excludedRatings.length +
      p.excludedWarnings.length +
      p.excludedCategories.length
    )
  }

  override getSearchQueryMetadata(): Metadata {
    lastAdvanced = this.p
    return { advanced: this.p }
  }
}

// Source settings: choose Discover tags and toggle adult content.
export class AO3SettingsForm extends Form {
  override getSections(): FormSectionElement<unknown>[] {
    const homeTags = getHomeTags()
    const homeLang = getHomeLanguage()

    return [
      Section(
        {
          id: 'home',
          header: 'Home',
          footer:
            'Pick tags (fandoms, characters, ships, anything) to feature on the Discover tab. Each becomes a carousel of recently updated works. The language also pre-fills the search filter.',
        },
        [
          NavigationRow('home-tags', {
            title: 'Tags on Discover',
            value: homeTags.length ? `${homeTags.length} selected` : 'Default fandoms',
            form: new TagPickerForm('tags', 'tag', homeTags, () => {
              setHomeTags(homeTags)
              this.reloadForm()
            }),
          }),
          SelectRow('home-language', {
            title: 'Language',
            layout: 'list',
            value: [homeLang],
            minItemCount: 1,
            maxItemCount: 1,
            items: LANGUAGES.map((l) => ({ id: l.id, title: l.label })),
            onValueChange: closureSelector(this, 'home-language', async (v: string[]) => {
              setHomeLanguage(v[0] ?? '')
            }),
          }),
        ],
      ),
      Section(
        {
          id: 'content',
          header: 'Content',
          footer:
            'When enabled, the extension automatically confirms the adult-content warning so you are not prompted on every work. Only enable this if you are of legal age to view adult content.',
        },
        [
          ToggleRow('adult', {
            title: 'Show adult content without prompting',
            value: getAdultEnabled(),
            onValueChange: closureSelector(this, 'ao3-adult-toggle', async (value: boolean) => {
              setAdultEnabled(value)
            }),
          }),
        ],
      ),
    ]
  }
}
