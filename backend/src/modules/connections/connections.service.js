import ConnectionsRepo from "./connections.repository.js";
import { publishEvent } from "../../config/nats-streams.js";
import { db } from "../../config/postgres.js";
import { connectionRequests, connections, retailers, distributors, users } from "../../db/schema.js";
import { eq, inArray } from "drizzle-orm"; // ✅ Import inArray

export default {
  async sendRequest(retailerUserId, distributorId, message) {
    // Map user → retailer
    const [retailer] = await db.select().from(retailers).where(eq(retailers.userId, retailerUserId));
    if (!retailer) throw new Error("Retailer profile not found");

    // prevent duplicates
    const existing = await ConnectionsRepo.findExistingRequest(retailer.id, distributorId);
    if (existing && ["pending", "approved"].includes(existing.status)) {
      return existing;
    }

    const request = await ConnectionsRepo.createRequest(retailer.id, distributorId, message);

    publishEvent("connections.requested", request);

    return { message: "Connection request sent", request };
  },

  async getRetailerRequests(retailerUserId) {
    const [retailer] = await db.select().from(retailers).where(eq(retailers.userId, retailerUserId));
    if (!retailer) throw new Error("Retailer profile not found");
    return ConnectionsRepo.getRetailerRequests(retailer.id);
  },

  async getConnectedDistributors(retailerUserId) {
    const [retailer] = await db.select().from(retailers).where(eq(retailers.userId, retailerUserId));

    const cons = await ConnectionsRepo.getRetailerConnections(retailer.id);
    const distributorIds = cons.map((c) => c.distributorId);

    if (!distributorIds.length) return [];

    // ✅ Use inArray instead of eq for array of IDs
    return db.select().from(distributors).where(inArray(distributors.id, distributorIds));
  },

  async getDistributorRequests(distributorUserId) {
    const [dist] = await db.select().from(distributors).where(eq(distributors.userId, distributorUserId));
    return ConnectionsRepo.getDistributorRequests(dist.id);
  },

  async getConnectedRetailers(distributorUserId) {
    // ✅ Use eq() for single value lookup
    const [dist] = await db.select().from(distributors).where(eq(distributors.userId, distributorUserId));
    
    if (!dist) throw new Error("Distributor not found");

    const cons = await ConnectionsRepo.getDistributorConnections(dist.id);
    const retailerIds = cons.map((c) => c.retailerId);

    if (!retailerIds.length) return [];

    // Join with users table to get phone and email
    const rows = await db
      .select({
        r_id: retailers.id,
        r_userId: retailers.userId,
        r_businessName: retailers.businessName,
        r_ownerName: retailers.ownerName,
        r_gstNumber: retailers.gstNumber,
        r_businessType: retailers.businessType,
        r_pincode: retailers.pincode,
        r_state: retailers.state,
        r_location: retailers.location,
        r_address: retailers.address,
        r_createdAt: retailers.createdAt,
        
        u_phone: users.phone,
        u_email: users.email,
      })
      .from(retailers)
      .leftJoin(users, eq(retailers.userId, users.id))
      .where(inArray(retailers.id, retailerIds));

    return rows.map(r => ({
      id: r.r_id,
      userId: r.r_userId,
      businessName: r.r_businessName,
      ownerName: r.r_ownerName,
      gstNumber: r.r_gstNumber,
      businessType: r.r_businessType,
      pincode: r.r_pincode,
      state: r.r_state,
      location: r.r_location,
      address: r.r_address,
      phone: r.u_phone,
      email: r.u_email,
      createdAt: r.r_createdAt,
    }));
  },

  async respondToRequest(distributorUserId, requestId, action, rejectionReason) {
    const [dist] = await db.select().from(distributors).where(eq(distributors.userId, distributorUserId));
    const requests = await ConnectionsRepo.getDistributorRequests(dist.id);
    const req = requests.find((r) => r.id === requestId);
    if (!req) throw new Error("Request not found");

    if (action === "approve") {
      // Both writes in one transaction - previously two separate statements,
      // so a failure between them could leave an approved request with no
      // connections row (P1-16).
      const approved = await db.transaction(async (tx) => {
        const row = await ConnectionsRepo.approveRequest(tx, requestId);
        await ConnectionsRepo.createConnection(tx, req.retailerId, req.distributorId);
        return row;
      });

      publishEvent("connections.approved", approved);
      return { message: "Request approved" };
    }

    if (action === "reject") {
      const rejected = await ConnectionsRepo.rejectRequest(requestId, rejectionReason);
      publishEvent("connections.rejected", rejected);
      return { message: "Request rejected" };
    }

    throw new Error("Invalid action");
  },

  async removeConnection(userId, distributorId) {
    const [retailer] = await db.select().from(retailers).where(eq(retailers.userId, userId));
    await ConnectionsRepo.removeConnection(retailer.id, distributorId);
    publishEvent("connections.deleted", { retailerId: retailer.id, distributorId });
    return { message: "Connection removed" };
  },

  async searchDistributors(retailerUserId, filters) {
    return ConnectionsRepo.searchDistributors(filters);
  },

  async suggestedDistributors(retailerUserId) {
    const [retailer] = await db
      .select()
      .from(retailers)
      .where(eq(retailers.userId, retailerUserId));

    if (!retailer) throw new Error("Retailer not found");

    // 1️⃣ Get basic suggestions by pincode
    const suggested = await db
      .select()
      .from(distributors)
      .where(eq(distributors.pincode, retailer.pincode));

    // 2️⃣ Get all requests made by this retailer
    const allRequests = await ConnectionsRepo.getRetailerRequests(retailer.id);

    // 3️⃣ Get all connected distributors
    const connections = await ConnectionsRepo.getRetailerConnections(retailer.id);
    const connectedDistributorIds = new Set(connections.map((c) => c.distributorId));

    // 4️⃣ Inject requestStatus + connectionStatus for each distributor
    const finalList = suggested.map((dist) => {
      const req = allRequests.find((r) => r.distributorId === dist.id);

      return {
        ...dist,
        requestStatus: req ? req.status : null,
        connectionStatus: connectedDistributorIds.has(dist.id),
      };
    });

    return finalList;
  },

  async searchRetailers(distributorUserId, filters) {
    return ConnectionsRepo.searchRetailers(filters);
  },

  async suggestedRetailers(distributorUserId) {
    const [dist] = await db.select().from(distributors).where(eq(distributors.userId, distributorUserId));
    
    if (!dist) throw new Error("Distributor not found");
    
    // Get suggested retailers with user data
    const rows = await db
      .select({
        r_id: retailers.id,
        r_userId: retailers.userId,
        r_businessName: retailers.businessName,
        r_ownerName: retailers.ownerName,
        r_gstNumber: retailers.gstNumber,
        r_businessType: retailers.businessType,
        r_pincode: retailers.pincode,
        r_state: retailers.state,
        r_location: retailers.location,
        r_address: retailers.address,
        r_createdAt: retailers.createdAt,
        
        u_phone: users.phone,
        u_email: users.email,
      })
      .from(retailers)
      .leftJoin(users, eq(retailers.userId, users.id))
      .where(eq(retailers.pincode, dist.pincode));
    
    return rows.map(r => ({
      id: r.r_id,
      userId: r.r_userId,
      businessName: r.r_businessName,
      ownerName: r.r_ownerName,
      gstNumber: r.r_gstNumber,
      businessType: r.r_businessType,
      pincode: r.r_pincode,
      state: r.r_state,
      location: r.r_location,
      address: r.r_address,
      phone: r.u_phone,
      email: r.u_email,
      createdAt: r.r_createdAt,
    }));
  }
};