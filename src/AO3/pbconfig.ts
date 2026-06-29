import { ContentRating, type ExtensionInfo, SourceIntents } from '@paperback/types'

export default {
  name: 'Archive of Our Own',
  description: 'Extension that pulls content from archiveofourown.org.',
  version: '1.0.0',
  icon: 'icon.png',
  language: 'en',
  contentRating: ContentRating.ADULT,
  developers: [
    {
      name: 'JustSpirit',
    },
  ],
  badges: [
    { label: 'Novel', textColor: '#FFFFFF', backgroundColor: '#990000' },
  ],
  capabilities: [
    SourceIntents.CHAPTER_PROVIDING,
    SourceIntents.SEARCH_RESULT_PROVIDING,
    SourceIntents.DISCOVER_SECTION_PROVIDING,
    SourceIntents.SETTINGS_FORM_PROVIDING,
  ],
} satisfies ExtensionInfo
