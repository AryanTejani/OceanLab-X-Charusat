declare class AssemblyAIWebSocketService {
  static getInstance(): AssemblyAIWebSocketService;
  createLiveTranscription(
    config: { sample_rate: number },
    onTranscript: (result: { text?: string; confidence?: number; start?: number; end?: number; isFinal?: boolean; speakerLabel?: string | null; turnOrder?: number | null }) => void,
    onError: (error: Error) => void
  ): Promise<{
    ws?: { readyState: number };
    _socket?: { readyState: number };
    readyState?: number;
    sendAudio: (buf: Buffer) => void;
    closeConnection?: () => void;
    close: () => void;
    on: (event: string, cb: () => void) => void;
  }>;
}

export default AssemblyAIWebSocketService;
