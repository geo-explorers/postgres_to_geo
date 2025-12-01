export interface ProcessEpisodesRequest {
  podcast_name: string[];
  limit: number;
  num_episodes: number;
  date_filter: string;
}

export interface WorkflowResult {
  episodes_processed: number;
  ops_created: number;
  duration_ms: number;
}

export interface ProcessEpisodesResponse {
  success: boolean;
  message: string;
  data?: WorkflowResult;
  error?: string;
  code?: string;
  timestamp?: string;
}

export class ValidationError extends Error {
  public field?: string;
  public expected?: string;
  public received?: string;

  constructor(message: string, field?: string, expected?: string, received?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.expected = expected;
    this.received = received;
  }
}
