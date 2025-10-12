/**
 * In-memory transcript cache for LLM test prompt history.
 * Stores up to three exchanges (6 messages) per profile with timestamps and truncation metadata.
 * 
 * @module test-transcript.store
 */

import type { TestTranscript, TranscriptMessage } from '@metaverse-systems/llm-tutor-shared/llm';

interface TranscriptEntry {
  profileId: string;
  transcript: TestTranscript;
  updatedAt: number;
}

/**
 * In-memory store for test prompt transcripts.
 * Maintains rolling history of up to 3 exchanges per profile.
 */
export class TestTranscriptStore {
  private cache: Map<string, TranscriptEntry> = new Map();
  private readonly maxExchanges: number = 3;
  private readonly maxMessages: number = 6; // 3 exchanges = 6 messages

  /**
   * Get the current transcript for a profile
   */
  get(profileId: string): TestTranscript | null {
    const entry = this.cache.get(profileId);
    return entry ? entry.transcript : null;
  }

  /**
   * Update transcript with new messages, maintaining rolling history
   */
  update(profileId: string, messages: TranscriptMessage[], status: 'success' | 'error' | 'timeout', latencyMs: number | null, errorCode: string | null = null, remediation: string | null = null): void {
    const existing = this.cache.get(profileId);
    let allMessages: TranscriptMessage[] = [];

    if (existing && status === 'success') {
      // Prepend new messages to existing history
      allMessages = [...messages, ...existing.transcript.messages];
      
      // Keep only the most recent messages (up to maxMessages)
      if (allMessages.length > this.maxMessages) {
        allMessages = allMessages.slice(0, this.maxMessages);
      }
    } else if (status === 'success') {
      // First transcript for this profile
      allMessages = messages;
    }
    // For error/timeout, allMessages stays empty

    const transcript: TestTranscript = {
      messages: allMessages,
      status,
      latencyMs,
      errorCode,
      remediation,
    };

    this.cache.set(profileId, {
      profileId,
      transcript,
      updatedAt: Date.now(),
    });
  }

  /**
   * Clear transcript history for a profile (e.g., on failure)
   */
  clear(profileId: string): void {
    this.cache.delete(profileId);
  }

  /**
   * Clear all transcripts (useful for testing)
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Get number of exchanges in current transcript for a profile
   */
  getHistoryDepth(profileId: string): number {
    const transcript = this.get(profileId);
    if (!transcript) {
      return 0;
    }
    // Each exchange is 2 messages (user + assistant)
    return Math.floor(transcript.messages.length / 2);
  }
}

// Singleton instance
let instance: TestTranscriptStore | null = null;

/**
 * Get the singleton transcript store instance
 */
export function getTranscriptStore(): TestTranscriptStore {
  if (!instance) {
    instance = new TestTranscriptStore();
  }
  return instance;
}

/**
 * Create a new transcript store instance (for testing)
 */
export function createTranscriptStore(): TestTranscriptStore {
  return new TestTranscriptStore();
}
