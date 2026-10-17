const ENDPOINT = 'https://u.ctrip.com/faas/mcp';

export class TripClient {
  #headers;
  #timeoutMs;
  #id = 0;

  constructor({ token, tokenKey, userIP, timeoutMs = 30_000 } = {}) {
    token = token?.trim();
    tokenKey = tokenKey?.trim();
    if (Boolean(token) === Boolean(tokenKey)) {
      throw new Error('Provide exactly one of token (Bearer) or tokenKey.');
    }
    this.#timeoutMs = timeoutMs;
    this.#headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : { tokenKey }),
      ...(userIP ? { userIP } : {}),
    };
  }

  queryHotel(args) { return this.callTool('query_hotel', args); }
  queryTicket(args) { return this.callTool('query_ticket', args); }
  queryBus(args) { return this.callTool('query_bus', args); }
  queryFlight(args) { return this.callTool('query_flight', args); }
  queryFlightCalendarCtrip(args) { return this.callTool('query_flight_calendar_ctrip', args); }
  queryFlightCalendarTrip(args) { return this.callTool('query_flight_calendar_trip', args); }
  queryTrain(args) { return this.callTool('query_train', args); }
  queryTour(args) { return this.callTool('query_tour', args); }
  carRental(args) { return this.callTool('car_rental', args); }
  queryContent(args) { return this.callTool('query_content', args); }
  queryRank(args) { return this.callTool('query_rank', args); }
  queryRestaurant(args) { return this.callTool('query_restaurant', args); }

  /** Returns the original MCP CallToolResult; business fields are not rewritten. */
  async callTool(name, args = {}) {
    const id = ++this.#id;
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: this.#headers,
      redirect: 'error', // Do not forward channel credentials to redirected endpoints.
      signal: AbortSignal.timeout(this.#timeoutMs),
      body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(new Error(`Trip HTTP request failed (${response.status}).`), { status: response.status });
    }
    const isSSE = response.headers.get('content-type')?.split(';')[0].trim() === 'text/event-stream';
    let message;
    try {
      message = isSSE ? await readSSE(response, id) : await response.json();
    } catch (error) {
      // JSON parser errors can include response content; omit the original error and cause.
      if (error instanceof SyntaxError) throw new Error('Invalid JSON in Trip response.');
      throw error;
    }
    if (!message || message.jsonrpc !== '2.0' || message.id !== id) {
      throw new Error('Invalid JSON-RPC response or mismatched response ID.');
    }
    if (message.error) {
      throw Object.assign(new Error(`Trip JSON-RPC error (${message.error.code}).`), { code: message.error.code });
    }
    if (!message.result || typeof message.result !== 'object') {
      throw new Error('Missing MCP result in response.');
    }
    if (message.result.isError) {
      throw Object.assign(new Error(`Trip tool ${name} failed.`), { result: message.result });
    }
    return message.result;
  }
}

async function readSSE(response, id) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
        const event = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = event.split(/\r\n|\n|\r/)
          .filter(line => line === 'data' || line.startsWith('data:'))
          .map(line => line.slice(5).replace(/^ /, ''))
          .join('\n');
        if (!data) continue;
        const message = JSON.parse(data);
        // Notifications may precede the response; the stream may remain open after it.
        if (message.id === id && ('result' in message || 'error' in message)) return message;
      }
      if (done) throw new Error('SSE ended without a matching JSON-RPC response.');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
