export interface GameData {
  settings: {
    get(namespace: string, key: string): unknown;
  };
}

export interface CallOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  thinking?: boolean;
}

export type ChunkType = 'content' | 'reasoning';

export interface AiResponse {
  content: string;
  reasoning?: string;
}

export interface AiService {
  call(systemPrompt: string, userPrompt: string, options?: CallOptions): Promise<AiResponse>;
  stream(
    systemPrompt: string,
    userPrompt: string,
    onChunk: (chunk: string, type: ChunkType) => void,
    options?: CallOptions,
  ): Promise<string>;
}
