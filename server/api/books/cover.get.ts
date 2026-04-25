const normalizeText = (value?: string) => (value ?? '').trim().toLowerCase()

const scoreVolume = (
  item: {
    volumeInfo?: {
      title?: string
      authors?: string[]
      imageLinks?: Record<string, string>
    }
  },
  title: string,
  author: string
) => {
  const volumeInfo = item.volumeInfo ?? {}
  const normalizedTitle = normalizeText(title)
  const normalizedAuthor = normalizeText(author)
  const candidateTitle = normalizeText(volumeInfo.title)
  const candidateAuthors = (volumeInfo.authors ?? []).map(normalizeText)

  let score = 0

  if (candidateTitle === normalizedTitle) score += 8
  else if (candidateTitle.includes(normalizedTitle) || normalizedTitle.includes(candidateTitle)) score += 5

  if (normalizedAuthor && candidateAuthors.some((candidate) => candidate.includes(normalizedAuthor) || normalizedAuthor.includes(candidate))) {
    score += 4
  }

  if (volumeInfo.imageLinks?.thumbnail || volumeInfo.imageLinks?.smallThumbnail) {
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
  const searchTerms = [`intitle:${title}`]
  if (author) searchTerms.push(`inauthor:${author}`)

  const response = await $fetch<{
    items?: Array<{
      id: string
      volumeInfo?: {
        title?: string
        authors?: string[]
        description?: string
        imageLinks?: {
          smallThumbnail?: string
          thumbnail?: string
        }
      }
    }>
  }>('https://www.googleapis.com/books/v1/volumes', {
    query: {
      q: searchTerms.join('+'),
      maxResults: 5,
      projection: 'lite',
      langRestrict: 'ko',
      printType: 'books',
      key: config.googleBooksApiKey || undefined
    }
  })

  const bestMatch = (response.items ?? [])
    .map((item) => ({ item, score: scoreVolume(item, title, author) }))
    .sort((a, b) => b.score - a.score)[0]?.item

  const image = bestMatch?.volumeInfo?.imageLinks?.thumbnail
    ?? bestMatch?.volumeInfo?.imageLinks?.smallThumbnail
    ?? null

  return {
    authors: bestMatch?.volumeInfo?.authors ?? [],
    description: bestMatch?.volumeInfo?.description ?? null,
    image: image ? image.replace(/^http:\/\//, 'https://') : null,
    title: bestMatch?.volumeInfo?.title ?? null
  }
})
