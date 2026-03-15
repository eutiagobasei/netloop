import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as crypto from 'crypto';

interface CachedSearchResult {
  data: any;
  timestamp: number;
}

/**
 * In-memory cache for contact search results
 *
 * Features:
 * - User-scoped caching (ownerId + query)
 * - Short TTL (5 minutes) to balance freshness vs performance
 * - Automatic invalidation on contact modifications
 * - Memory-efficient with size limits and periodic cleanup
 *
 * Performance impact:
 * - Instant responses for repeated searches
 * - Reduced database load for common queries
 */
@Injectable()
export class SearchCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(SearchCacheService.name);
  private readonly cache = new Map<string, CachedSearchResult>();

  // Short TTL: 5 minutes (search results can change frequently)
  private readonly TTL_MS = 5 * 60 * 1000;

  // Max cache size to prevent memory issues
  private readonly MAX_CACHE_SIZE = 1000;

  // Cleanup interval: every 10 minutes
  private readonly CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Get cached search result or execute search function
   *
   * @param ownerId - User ID for scoping
   * @param query - Search query string
   * @param searchFn - Function to execute if cache miss
   * @returns Search results (from cache or fresh)
   */
  async getOrSearch<T>(ownerId: string, query: string, searchFn: () => Promise<T>): Promise<T> {
    const key = this.generateKey(ownerId, query);
    const cached = this.cache.get(key);

    // Return cached if valid
    if (cached && !this.isExpired(cached)) {
      this.logger.debug(`Search cache hit: ${query.substring(0, 30)}...`);
      return cached.data as T;
    }

    // Execute search
    this.logger.debug(`Search cache miss: ${query.substring(0, 30)}...`);
    const result = await searchFn();

    // Store in cache
    this.set(key, result);

    return result;
  }

  /**
   * Invalidate all cache entries for a specific user
   * Call this when contacts are created, updated, or deleted
   */
  invalidateForUser(ownerId: string): void {
    const prefix = `${ownerId}:`;
    let removed = 0;

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug(`Invalidated ${removed} search cache entries for user ${ownerId}`);
    }
  }

  /**
   * Store result in cache
   */
  private set(key: string, data: any): void {
    // Enforce max cache size
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Generate cache key from ownerId and query
   */
  private generateKey(ownerId: string, query: string): string {
    const normalized = query
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');

    const queryHash = crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
    return `${ownerId}:${queryHash}`;
  }

  /**
   * Check if a cached entry is expired
   */
  private isExpired(entry: CachedSearchResult): boolean {
    return Date.now() - entry.timestamp > this.TTL_MS;
  }

  /**
   * Remove oldest entry from cache
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Remove all expired entries from cache
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.TTL_MS) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.log(`Cleaned up ${removed} expired search cache entries`);
    }
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL_MS);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.logger.log(`Invalidated ${size} search cache entries`);
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      ttlMs: this.TTL_MS,
    };
  }

  /**
   * Clean up timer on module destroy
   */
  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
