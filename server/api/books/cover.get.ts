const normalizeText = (value?: string) => (value ?? '').trim().toLowerCase()

const scoreItem = (
  item: {
    author?: string
    cover?: string
    title?: string
  },
  title: string,
  author: string
) => {
  const normalizedTitle = normalizeText(title)
  const normalizedAuthor = normalizeText(author)
  const candidateTitle = normalizeText(item.title)
  const candidateAuthors = (item.author ?? '')
    .split(',')
    .map(normalizeText)
    .filter(Boolean)

  let score = 0

  if (candidateTitle === normalizedTitle) score += 8
  else if (candidateTitle.includes(normalizedTitle) || normalizedTitle.includes(candidateTitle)) score += 5

  if (normalizedAuthor && candidateAuthors.some((candidate) => candidate.includes(normalizedAuthor) || normalizedAuthor.includes(candidate))) {
    score += 4
  }

  if (item.cover) {
    score += 2
  }

  return score
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const title = typeof query.title === 'string' ? query.title.trim() : ''
  const author = typeof query.author === 'string' ? query.author.trim() : ''

  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'title is required' })
  }

  const config = useRuntimeConfig(event)

  if (!config.aladinTtbKey) {
    throw createError({ statusCode: 500, statusMessage: 'ALADIN_TTB_KEY is required' })
  }

  const response = await $fetch<{
    item?: Array<{
      author?: string
      cover?: string
      description?: string
      title?: string
    }>
  }>('https://www.aladin.co.kr/ttb/api/ItemSearch.aspx', {
    query: {
      Cover: 'Big',
      maxResults: 5,
      output: 'js',
      Query: title,
      QueryType: 'Title',
      SearchTarget: 'Book',
      start: 1,
      ttbkey: config.aladinTtbKey,
      Version: '20131101'
    }
  })

  const bestMatch = (response.item ?? [])
    .map((item) => ({ item, score: scoreItem(item, title, author) }))
    .sort((a, b) => b.score - a.score)[0]?.item

  return {
    authors: bestMatch?.author ? bestMatch.author.split(',').map((candidate) => candidate.trim()).filter(Boolean) : [],
    description: bestMatch?.description ?? null,
    image: bestMatch?.cover ? bestMatch.cover.replace(/^http:\/\//, 'https://') : null,
    title: bestMatch?.title ?? null
  }
})
