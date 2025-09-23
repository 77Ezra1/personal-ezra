import { useEffect, useMemo, useRef, useState } from 'react'
import { decryptString } from '../lib/crypto'
import { estimatePasswordStrength, type PasswordStrengthResult } from '../lib/password-utils'
import type { PasswordRecord } from '../stores/database'

const STALE_THRESHOLD_MS = 180 * 24 * 60 * 60 * 1000

export type PasswordHealthCategory = 'weak' | 'reused' | 'stale'
export type PasswordHealthFilter = 'all' | PasswordHealthCategory

type CacheEntry = {
  signature: string
  strength: PasswordStrengthResult | null
  plainHash: string | null
  updatedAt?: number
  lastCheckedAt: number
}

type PasswordHealthState = {
  entries: Map<string, CacheEntry>
  categories: Record<PasswordHealthCategory, Set<string>>
  stats: {
    total: number
    weak: number
    reused: number
    stale: number
    healthy: number
  }
  lastCheckedAt: number | null
  isAnalyzing: boolean
}

const EMPTY_STATE: PasswordHealthState = {
  entries: new Map(),
  categories: {
    weak: new Set(),
    reused: new Set(),
    stale: new Set(),
  },
  stats: {
    total: 0,
    weak: 0,
    reused: 0,
    stale: 0,
    healthy: 0,
  },
  lastCheckedAt: null,
  isAnalyzing: false,
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function hashPlainText(input: string) {
  try {
    const cryptoSource = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
    if (!cryptoSource?.subtle) {
      return null
    }
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const digest = await cryptoSource.subtle.digest('SHA-256', data)
    return toHex(digest)
  } catch (error) {
    console.warn('Failed to hash password plaintext', error)
    return null
  }
}

export function getPasswordHealthKey(record: PasswordRecord) {
  if (typeof record.id === 'number') {
    return `id:${record.id}`
  }
  if (record.passwordCipher) {
    return `cipher:${record.passwordCipher}`
  }
  return `temp:${record.title}-${record.createdAt}`
}

export function usePasswordHealth(
  items: PasswordRecord[],
  encryptionKey: Uint8Array | null | undefined,
) {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map())
  const [state, setState] = useState<PasswordHealthState>(EMPTY_STATE)

  const targets = useMemo(
    () =>
      items.map(item => {
        const key = getPasswordHealthKey(item)
        const timestamp = item.updatedAt ?? item.createdAt ?? 0
        return {
          key,
          item,
          signature: `${item.passwordCipher}:${timestamp}`,
          timestamp,
        }
      }),
    [items],
  )

  useEffect(() => {
    cacheRef.current.clear()
  }, [encryptionKey])

  useEffect(() => {
    if (!encryptionKey) {
      setState({
        entries: new Map(),
        categories: {
          weak: new Set(),
          reused: new Set(),
          stale: new Set(),
        },
        stats: {
          total: items.length,
          weak: 0,
          reused: 0,
          stale: 0,
          healthy: 0,
        },
        lastCheckedAt: null,
        isAnalyzing: false,
      })
      return
    }

    const currentKey = encryptionKey

    if (targets.length === 0) {
      cacheRef.current.clear()
      const now = Date.now()
      setState({
        entries: new Map(),
        categories: {
          weak: new Set(),
          reused: new Set(),
          stale: new Set(),
        },
        stats: {
          total: 0,
          weak: 0,
          reused: 0,
          stale: 0,
          healthy: 0,
        },
        lastCheckedAt: now,
        isAnalyzing: false,
      })
      return
    }

    let cancelled = false
    const relevantKeys = new Set(targets.map(target => target.key))
    cacheRef.current.forEach((_, key) => {
      if (!relevantKeys.has(key)) {
        cacheRef.current.delete(key)
      }
    })

    async function analyze() {
      setState(prev => ({ ...prev, isAnalyzing: true }))
      const now = Date.now()
      const staleThreshold = now - STALE_THRESHOLD_MS

      try {
        const results = await Promise.all(
          targets.map(async target => {
            const cached = cacheRef.current.get(target.key)
            if (cached && cached.signature === target.signature) {
              return {
                target,
                entry: {
                  ...cached,
                  lastCheckedAt: now,
                  updatedAt: target.item.updatedAt,
                },
              }
            }

            try {
              const plain = await decryptString(currentKey, target.item.passwordCipher)
              const strength = estimatePasswordStrength(plain)
              const plainHash = await hashPlainText(plain)
              const entry: CacheEntry = {
                signature: target.signature,
                strength,
                plainHash,
                updatedAt: target.item.updatedAt,
                lastCheckedAt: now,
              }
              return { target, entry }
            } catch (error) {
              console.error('Failed to analyze password record', error)
              const entry: CacheEntry = {
                signature: target.signature,
                strength: null,
                plainHash: null,
                updatedAt: target.item.updatedAt,
                lastCheckedAt: now,
              }
              return { target, entry }
            }
          }),
        )

        if (cancelled) return

        const entries = new Map<string, CacheEntry>()
        const categories: Record<PasswordHealthCategory, Set<string>> = {
          weak: new Set(),
          reused: new Set(),
          stale: new Set(),
        }
        const hashGroups = new Map<string, string[]>()

        for (const { target, entry } of results) {
          cacheRef.current.set(target.key, entry)
          entries.set(target.key, entry)

          if (entry.plainHash) {
            const bucket = hashGroups.get(entry.plainHash) ?? []
            bucket.push(target.key)
            hashGroups.set(entry.plainHash, bucket)
          }

          const updatedAt = target.item.updatedAt ?? target.item.createdAt ?? 0
          if (updatedAt && updatedAt < staleThreshold) {
            categories.stale.add(target.key)
          }

          if (!entry.strength || !entry.strength.meetsRequirement) {
            categories.weak.add(target.key)
          }
        }

        hashGroups.forEach(keys => {
          if (keys.length > 1) {
            keys.forEach(key => categories.reused.add(key))
          }
        })

        const flagged = new Set<string>()
        categories.weak.forEach(key => flagged.add(key))
        categories.reused.forEach(key => flagged.add(key))
        categories.stale.forEach(key => flagged.add(key))

        const total = targets.length
        const healthy = Math.max(0, total - flagged.size)

        setState({
          entries,
          categories,
          stats: {
            total,
            weak: categories.weak.size,
            reused: categories.reused.size,
            stale: categories.stale.size,
            healthy,
          },
          lastCheckedAt: now,
          isAnalyzing: false,
        })
      } catch (error) {
        console.error('Failed to analyze password health', error)
        if (cancelled) return
        setState(prev => ({ ...prev, lastCheckedAt: now, isAnalyzing: false }))
      }
    }

    void analyze()

    return () => {
      cancelled = true
    }
  }, [encryptionKey, items.length, targets])

  return state
}
