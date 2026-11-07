/** SSE framing for jensen.public.v1. Unknown events are delivered, not dropped. */

export const PROTOCOL = 'jensen.public.v1';

/**
 * Incremental parser. Handles chunks split mid-frame, CRLF, comment lines,
 * multi-line data fields, unknown event names, and malformed JSON.
 */
export function createSseParser(onEvent) {
  let buffer = '';
  const emit = (raw) => {
    if (!raw.trim()) return;
    let event = 'message';
    const data = [];
    for (const line of raw.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length === 0) return;
    const rawData = data.join('\n');
    let parsed;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      onEvent({ event, data: null, malformed: true, raw: rawData });
      return;
    }
    onEvent({ event, data: parsed, malformed: false });
  };
  return {
    push(chunk) {
      buffer += String(chunk).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      let splitAt = buffer.indexOf('\n\n');
      while (splitAt !== -1) {
        emit(buffer.slice(0, splitAt));
        buffer = buffer.slice(splitAt + 2);
        splitAt = buffer.indexOf('\n\n');
      }
    },
    flush() {
      if (buffer.trim()) emit(buffer);
      buffer = '';
    },
  };
}
