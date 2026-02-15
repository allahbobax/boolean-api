// Утилита для fetch с таймаутом
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  console.log(`[Fetch] Starting request to ${url} (timeout: ${timeoutMs}ms)`);
  const start = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    console.log(`[Fetch] Response from ${url} received in ${Date.now() - start}ms (status: ${response.status})`);
    return response;
  } catch (error) {
    console.error(`[Fetch] Error fetching ${url} after ${Date.now() - start}ms:`, error);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
