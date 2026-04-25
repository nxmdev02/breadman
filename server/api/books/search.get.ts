export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const title = typeof query.title === 'string' ? query.title.trim() : ''

  if (!title || title.length < 2) {
    return { items: [] }
  }

  const config = useRuntimeConfig(event)

  if (!config.aladinTtbKey) {
    throw createError({ statusCode: 500, statusMessage: 'ALADIN_TTB_KEY is required' })
  }

  const response = await $fetch<{
    item?: Array<{
      author?: string
      cover?: string
      isbn?: string
      isbn13?: string
      link?: string
      title?: string
    }>
  }>('https://www.aladin.co.kr/ttb/api/ItemSearch.aspx', {
    query: {
      Cover: 'Big',
      maxResults: 8,
      output: 'js',
      Query: title,
      QueryType: 'Title',
      SearchTarget: 'Book',
      start: 1,
      ttbkey: config.aladinTtbKey,
      Version: '20131101'
    }
  })

  return {
    items: (response.item ?? []).map((item) => ({
      authors: item.author ? item.author.split(',').map((author) => author.trim()).filter(Boolean) : [],
      id: item.isbn13 || item.isbn || item.link || item.title || crypto.randomUUID(),
      image: item.cover?.replace(/^http:\/\//, 'https://') ?? null,
      title: item.title ?? '제목 없음'
    }))
  }
})
