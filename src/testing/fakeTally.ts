import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeTallyRule {
  when: string | RegExp | ((xml: string) => boolean);
  reply: string | ((xml: string) => string);
  delayMs?: number;
  hang?: boolean;
  once?: boolean;
}

export interface FakeTally {
  url: string;
  port: number;
  requests: string[];
  addRule(rule: FakeTallyRule): void;
  close(): Promise<void>;
}

const matches = (when: FakeTallyRule["when"], xml: string): boolean =>
  typeof when === "string" ? xml.includes(when) : when instanceof RegExp ? when.test(xml) : when(xml);

/**
 * In-process stand-in for the TallyPrime XML server. Like the real one it answers `GET /` with a banner and
 * handles XML POSTs; unmatched requests get Tally's "DESC not found" error body.
 */
export async function startFakeTally(initial: FakeTallyRule[] = []): Promise<FakeTally> {
  const rules = [...initial];
  const requests: string[] = [];
  const sockets = new Set<import("node:net").Socket>();

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET") {
      res.end("<RESPONSE>TallyPrime Server is Running</RESPONSE>");
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const xml = Buffer.concat(chunks).toString("utf8");
      requests.push(xml);
      const index = rules.findIndex((r) => matches(r.when, xml));
      const rule = index >= 0 ? rules[index] : undefined;
      if (rule?.once) rules.splice(index, 1);
      if (rule?.hang) return; // leave the socket open and silent
      const body = rule
        ? typeof rule.reply === "function" ? rule.reply(xml) : rule.reply
        : "<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>0</STATUS></HEADER><BODY><DATA>DESC not found</DATA></BODY></ENVELOPE>";
      setTimeout(() => res.end(body), rule?.delayMs ?? 0);
    });
  });
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    addRule: (rule) => { rules.push(rule); },
    close: () => new Promise<void>((resolve) => {
      for (const s of sockets) s.destroy();
      server.close(() => resolve());
    }),
  };
}
