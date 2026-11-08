/** Server-to-browser updates as Server-Sent Events on GET /-/api/events. */
import type { ServerResponse } from "node:http";
import { createLogger } from "../logger.ts";
import type { ServerEvent } from "../protocol.ts";
import { handled, type Router } from "./http.ts";

const log = createLogger("events");

export class EventHub {
  private clients = new Set<ServerResponse>();
  private pending = new Map<string, ServerEvent>();
  private timer: NodeJS.Timeout | undefined;

  /**
   * Send an event to every open stream. Events with the same key within a short window
   * collapse into the latest one, so streaming text does not flood the browser.
   */
  publish(event: ServerEvent, key: string = event.type) {
    this.pending.set(key, event);
    this.timer ??= setTimeout(() => this.flush(), 50);
  }

  private flush() {
    this.timer = undefined;
    for (const event of this.pending.values()) {
      log.debug(`${event.type} event to ${this.clients.size} streams`);
      const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
      for (const client of this.clients) client.write(frame);
    }
    this.pending.clear();
  }

  /** Mount GET /events. `initial` supplies the snapshot a new subscriber starts from. */
  mount(router: Router, initial: () => ServerEvent[]) {
    router.on("GET", "/events", ({ req, res }) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      res.write("retry: 2000\n\n");
      for (const event of initial())
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      this.clients.add(res);
      log.debug(`stream opened, ${this.clients.size} open`);
      const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 20_000);
      req.on("close", () => {
        clearInterval(keepAlive);
        this.clients.delete(res);
        log.debug(`stream closed, ${this.clients.size} open`);
      });
      return handled;
    });
  }

  close() {
    for (const client of this.clients) client.end();
    this.clients.clear();
  }
}
