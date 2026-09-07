// src/api-gateway/middlewares/role.middleware.js
//
// There was no role middleware: every role check was an ad-hoc `if` inside a
// service, throwing a plain Error that (before the error middleware existed)
// surfaced as a 500. With a third actor now in the system, the check belongs
// at the routing boundary where it is visible in the route table.
//
//   router.post("/dispatch", requireAuth, requireRole("distributor"), handler)

export function requireRole(...allowed) {
  return function roleGuard(req, res, next) {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: `This action requires one of: ${allowed.join(", ")}`,
      });
    }
    next();
  };
}
