import { Server } from "socket.io";
import { initNats } from "../config/nats.js";
import { StringCodec, consumerOpts } from "nats";
import { ensureEventsStream } from "../config/nats-streams.js";
import { verifyToken } from "../utils/jwt.js";
import { db } from "../config/postgres.js";
import { retailers, distributors } from "../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * Resolve the profile id (retailers.id / distributors.id) for a logged-in
 * user. Event payloads carry these profile ids (order.retailerId,
 * order.distributorId, ...), not users.id - joining only a `user:<usersId>`
 * room, as this used to, meant targeted delivery could never match, and
 * every event fell through to a full broadcast (P1-6).
 */
async function resolveEntityId(userId, role) {
  if (role === "retailer") {
    const [row] = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.userId, userId));
    return row?.id || null;
  }
  if (role === "distributor") {
    const [row] = await db.select({ id: distributors.id }).from(distributors).where(eq(distributors.userId, userId));
    return row?.id || null;
  }
  return null;
}

export default function startSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
    path: "/socket.io",
  });

  /** SOCKET AUTH */
  io.use((socket, next) => {
    const token = socket.handshake.query?.token || socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication error: missing token"));

    const payload = verifyToken(token);
    if (!payload) return next(new Error("Authentication error: invalid token"));

    socket.user = payload;
    next();
  });

  io.on("connection", (socket) => {
    const uid = socket.user.id;

    console.log(`🔌 Socket connected → user:${uid}, socket:${socket.id}`);

    socket.join(`user:${uid}`);
    if (socket.user.role) socket.join(`role:${socket.user.role}`);

    // Join the profile-id room too, so targeted events (which carry
    // retailerId/distributorId, not users.id) actually reach this socket.
    resolveEntityId(uid, socket.user.role)
      .then((entityId) => {
        if (entityId) socket.join(`entity:${entityId}`);
      })
      .catch((e) => console.warn("resolveEntityId failed:", e.message));

    socket.on("disconnect", () => {
      console.log(`❌ Socket disconnected ${socket.id}`);
    });
  });

  /**
   * NATS + JetStream setup. Best-effort: if NATS is unreachable, Socket.IO
   * still serves direct connections/rooms, it just has no event fan-out
   * until NATS comes back. No consumer chain depends on this anymore (see
   * docs/14-simplification.md) - it is purely realtime notification.
   */
  (async () => {
    const nc = await initNats();

    await ensureEventsStream(nc);

    const js = nc.jetstream();
    const sc = StringCodec();

    const subjects = [
      "orders.created",
      "orders.modified",
      "orders.accepted",
      "orders.status.updated",
      "orders.completed",
      "connections.requested",
      "connections.approved",
      "connections.rejected",
      "inventory.variant_added",
      "inventory.updated_after_order",
      "notifications.>"
    ];

    for (const subject of subjects) {
      try {
        const durableName = `socket_${subject.replace(/\W/g, "_")}`;

        const opts = consumerOpts();
        opts.durable(durableName);
        opts.manualAck();
        opts.deliverTo(`inbox_${durableName}_${Date.now()}`);
        opts.ackExplicit();   // IMPORTANT — FIXES ackPolicy error
        opts.deliverAll();    // deliver_policy: "all"
        opts.filterSubject(subject);

        const sub = await js.subscribe(subject, opts);

        console.log(`🔗 Subscribed → ${subject}`);

        (async () => {
          for await (const msg of sub) {
            try {
              const payload = JSON.parse(sc.decode(msg.data));
              const envelope = { subject, payload };

              let targets = [];

              // retailerId/distributorId are profile ids -> entity:<id> rooms.
              if (payload.order) {
                if (payload.order.retailerId)
                  targets.push(`entity:${payload.order.retailerId}`);
                if (payload.order.distributorId)
                  targets.push(`entity:${payload.order.distributorId}`);
              }

              if (payload.retailerId)
                targets.push(`entity:${payload.retailerId}`);
              if (payload.distributorId)
                targets.push(`entity:${payload.distributorId}`);

              // userId is a users.id -> the user:<id> room.
              if (payload.userId)
                targets.push(`user:${payload.userId}`);

              if (payload.role)
                targets.push(`role:${payload.role}`);

              targets = [...new Set(targets)];

              if (targets.length === 0)
                io.emit("event", envelope);
              else
                targets.forEach(room => io.to(room).emit("event", envelope));

              msg.ack();
            } catch (e) {
              console.error("Socket message error:", e);
            }
          }
        })();

      } catch (err) {
        console.error(`❌ Failed to subscribe ${subject}:`, err);
      }
    }
  })().catch((e) => {
    console.warn("Realtime NATS fan-out unavailable:", e.message);
  });
}
