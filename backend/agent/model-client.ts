export type ModelItem = {
  type: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  [key: string]: unknown;
};
export type ModelRequest = {
  model: string;
  instructions: string;
  input: unknown[];
  tools: unknown[];
  tool_choice: 'required' | 'auto';
  parallel_tool_calls: boolean;
  store: boolean;
  max_output_tokens: number;
  text: { format: Record<string, unknown> };
};
export interface ModelClient {
  create(request: ModelRequest): Promise<{ output: ModelItem[]; output_text: string; status?: string }>;
}

