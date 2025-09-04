import React from 'react'
export interface Tokens { text: string; tags: string[]; url?: string; star?: boolean }
export function parseTokens(input: string): Tokens {
  const parts = input.split(/\s+/).filter(Boolean)
  const tokens: Tokens = { text: '', tags: [] }
  for (const p of parts) {
    if (p.startsWith('#')) tokens.tags.push(p.slice(1))
    else if (p.startsWith('tag:')) tokens.tags.push(p.slice(4))
    else if (p.startsWith('url:')) tokens.url = p.slice(4)
    else if (p === 'is:star' || p === 'is:favorite') tokens.star = true
    else tokens.text += (tokens.text ? ' ' : '') + p
  }
  return tokens
}
