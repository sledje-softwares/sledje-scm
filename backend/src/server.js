import "dotenv/config";
import http from "http";
import app from "./app.js";
import { initNats } from "./config/nats.js";
import startSocketServer from "./realtime/socket.server.js";

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    // NATS is still used by the realtime layer (Socket.IO fan-out) and by
    // best-effort event publishing. The consumer chain that used to run here
    // (orders.completed -> inventory -> product_bills -> ledger) has been
    // replaced by a single transaction in orders.service.js:completeOrder -
    // see docs/14-simplification.md. That is why NATS init failing here is
    // no longer allowed to take the whole API down with it.
    try {
      await initNats();
    } catch (e) {
      console.warn("NATS unavailable - starting without realtime fan-out:", e.message);
    }

    const server = http.createServer(app);
    startSocketServer(server);

    server.listen(PORT, () => {
      console.log(`🌐 Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
