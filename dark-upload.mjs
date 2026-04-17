// One-shot: POST a local image to Dark MCP via image_to_3d with image_data.
// Uses the auth from .mcp.json. Prints the resulting artifact id.
import fs from 'node:fs';
import path from 'node:path';

const mcp = JSON.parse(fs.readFileSync('.mcp.json', 'utf8')).mcpServers.dark;
const url = mcp.url;
const auth = mcp.headers.Authorization;

const imgPath = process.argv[2];
const toolName = process.argv[3] ?? 'image_to_3d';
if (!imgPath) { console.error('usage: node dark-upload.mjs <image> [tool]'); process.exit(1); }

const bytes = fs.readFileSync(imgPath);
const ext = path.extname(imgPath).slice(1).toLowerCase();
const fmt = ext === 'jpg' ? 'jpeg' : ext;
const b64 = bytes.toString('base64');

const baseHeaders = {
  'Authorization': auth,
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream'
};

// 1) initialize — server returns Mcp-Session-Id
const initRes = await fetch(url, {
  method: 'POST', headers: baseHeaders,
  body: JSON.stringify({
    jsonrpc: '2.0', id: 0, method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'dark-upload', version: '1' }
    }
  })
});
const sessionId = initRes.headers.get('mcp-session-id');
console.log('session:', sessionId, 'status:', initRes.status);

// 2) notifications/initialized (required before tools/call)
await fetch(url, {
  method: 'POST',
  headers: { ...baseHeaders, 'Mcp-Session-Id': sessionId },
  body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
});

// 3) tools/call — response is SSE, read until we see the `result`
const callRes = await fetch(url, {
  method: 'POST',
  headers: { ...baseHeaders, 'Mcp-Session-Id': sessionId },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: toolName, arguments: { image_data: b64, format: fmt } }
  })
});
console.log('call status:', callRes.status, 'content-type:', callRes.headers.get('content-type'));

const reader = callRes.body.getReader();
const dec = new TextDecoder();
let buf = '';
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
    if (line.startsWith('data: ')) {
      const payload = line.slice(6).trim();
      if (!payload) continue;
      try {
        const j = JSON.parse(payload);
        if (j.result) {
          console.log('RESULT:', JSON.stringify(j.result, null, 2));
          process.exit(0);
        } else if (j.error) {
          console.log('ERROR:', JSON.stringify(j.error, null, 2));
          process.exit(1);
        } else {
          console.log('event:', JSON.stringify(j));
        }
      } catch { console.log('data(raw):', payload); }
    }
  }
}
