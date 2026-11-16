/**
 * Interface and Phase 1 stub for voice synthesis / table-read generation.
 * Sarvam multilingual TTS integration will implement this in Phase 2.
 */
export interface VoiceResponder {
  speak(characterId: string, text: string): Promise<{ audioUrl?: string; mimeType?: string }>;
}

export class StubVoiceResponder implements VoiceResponder {
  async speak(_characterId: string, _text: string): Promise<{ audioUrl?: string; mimeType?: string }> {
    // Phase 1 stub: text-only UI; voice synthesis is planned for Phase 2 via Sarvam
    return {};
  }
}
