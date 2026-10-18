import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import type { Express } from 'express';

// Exercise Express routing and serialization without binding a socket.
export function request(app: Express, path: string, body?: unknown): Promise<{ status: number; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const req = new IncomingMessage(new Socket());
    req.method = body === undefined ? 'GET' : 'POST';
    req.url = path;
    if (body !== undefined) {
      const payload = JSON.stringify(body);
      req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) };
      req.push(payload);
      req.push(null);
    }
    const res = new ServerResponse(req);
    res.end = ((chunk: unknown) => {
      try {
        const body = JSON.parse(String(chunk));
        resolve({ status: res.statusCode, json: async () => body });
      } catch (error) { reject(error); }
      return res;
    }) as typeof res.end;
    app(req, res);
  });
}
