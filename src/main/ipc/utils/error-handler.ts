/**
 * IPC response helpers
 */

export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export function successResponse<T>(data: T): IPCResponse<T> {
  return { success: true, data };
}

export function errorResponse(error: unknown): IPCResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[IPC Error]', message);
  return { success: false, error: message };
}
