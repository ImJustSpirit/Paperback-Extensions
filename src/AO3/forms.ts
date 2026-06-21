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
} from '@paperback/types'
import { fetchTagSuggestions } from './network'
import {
  ARCHIVE_WARNINGS,
  type AutocompleteType,
  CATEGORIES,
  COMPLETION,
  CROSSOVERS,
  DEFAULT_SORT_COLUMN,
  LANGUAGES,
  type Option,
  RATINGS,
  SORT_COLUMNS,
  SORT_DIRECTIONS,
  type WorksSearchParams,
} from './models'
import {
  addPinnedTag,
  defaultSearchParams,
  getAdultEnabled,
  getHomeTags,
  getPinnedTags,
  removePinnedTag,
  setAdultEnabled,
  setHomeTags,
} from './utils'

// A sub-form that resolves a tag field via AO3's autocomplete. The user types a
// term, taps Search, and adds matches; selections accumulate into `selected`
// (passed by reference from the parent form). When `enablePins` is set, tags can
// be pinned for one-tap reuse across future searches.
export class TagPickerForm extends Form {
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

// The in-app advanced filter panel for AO3 works search.
export class AO3AdvancedSearchForm extends AdvancedSearchForm {
  private p: WorksSearchParams

  constructor(initialQuery: string) {
    super()
    this.p = defaultSearchParams(initialQuery)
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
      ]),
      Section({ id: 'filters', header: 'Filters' }, [
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
      ]),
      Section(
        { id: 'sort', header: 'Sort', footer: 'Word count accepts e.g. 1000-5000 or >10000.' },
        [
          this.single('sort_column', 'Sort by', SORT_COLUMNS, p.sort, (v) => {
            p.sort = v || DEFAULT_SORT_COLUMN
          }),
          this.single('sort_direction', 'Direction', SORT_DIRECTIONS, p.direction, (v) => {
            p.direction = v || 'desc'
          }),
        ],
      ),
    ]
  }

  override getSearchQueryMetadata(): Metadata {
    return { advanced: this.p }
  }
}

// Source settings: choose Discover tags and toggle adult content.
export class AO3SettingsForm extends Form {
  override getSections(): FormSectionElement<unknown>[] {
    const homeTags = getHomeTags()

    return [
      Section(
        {
          id: 'home',
          header: 'Home',
          footer:
            'Pick tags (fandoms, characters, ships, anything) to feature on the Discover tab. Each becomes a carousel of recently updated works.',
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
