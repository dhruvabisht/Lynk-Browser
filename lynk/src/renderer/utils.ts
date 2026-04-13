import type { BookmarkLeafNode, BookmarkNode } from '@shared/types'

export function isLikelyUrl(value: string): boolean {
  return value.includes('.') && !/\s/.test(value)
}

export function normalizeOmniboxInput(value: string): string {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return 'lynk://new-tab'
  }

  if (isLikelyUrl(trimmedValue)) {
    return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`
  }

  return `https://www.google.com/search?q=${encodeURIComponent(trimmedValue)}`
}

export function displayUrl(value: string): string {
  if (!value || value === 'lynk://new-tab') {
    return ''
  }

  return value
}

export function flattenBookmarks(nodes: BookmarkNode[]): BookmarkLeafNode[] {
  return nodes.flatMap((node) => {
    if (node.type === 'bookmark') {
      return [node]
    }

    return flattenBookmarks(node.children)
  })
}
