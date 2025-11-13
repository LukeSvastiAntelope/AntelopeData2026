export interface BlogPost {
  id: string
  title: string
  excerpt: string
  content: string
  coverImage: string
  date: string
  readTime: string
  tags: string[]
  author?: {
    name: string
    avatar?: string
  }
}

export interface BlogCategory {
  id: string
  name: string
  slug: string
}
