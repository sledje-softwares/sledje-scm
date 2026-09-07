import { db } from "../../config/postgres.js";
import { connectionRequests, connections, retailers, distributors, users } from "../../db/schema.js";
import { eq, and, ilike } from "drizzle-orm";

export default {
  // Retailer initiates request
  async createRequest(retailerId, distributorId, message) {
    const rows = await db.insert(connectionRequests).values({
      retailerId,
      distributorId,
      message,
      status: "pending",
    }).returning();
    return rows[0];
  },

  async findExistingRequest(retailerId, distributorId) {
    const rows = await db.select().from(connectionRequests).where(
      and(eq(connectionRequests.retailerId, retailerId),
          eq(connectionRequests.distributorId, distributorId))
    );
    return rows[0] || null;
  },

  async getRetailerRequests(retailerId) {
    try {
      // First, try a simple query without joins to see if that works
      const simpleRows = await db
        .select()
        .from(connectionRequests)
        .where(eq(connectionRequests.retailerId, retailerId));
      // If we have no requests, return empty array
      if (simpleRows.length === 0) {
        return [];
      }

      // Now try with joins
      const rows = await db
        .select({
          requestId: connectionRequests.id,
          retailerId: connectionRequests.retailerId,
          distributorId: connectionRequests.distributorId,
          status: connectionRequests.status,
          message: connectionRequests.message,
          rejectionReason: connectionRequests.rejectionReason,
          createdAt: connectionRequests.createdAt,

          // distributor flat fields - using only fields we know exist
          d_id: distributors.id,
          d_companyName: distributors.companyName,
          d_ownerName: distributors.ownerName,
          d_location: distributors.location,
          d_businessType: distributors.businessType,
        })
        .from(connectionRequests)
        .leftJoin(distributors, eq(connectionRequests.distributorId, distributors.id))
        .where(eq(connectionRequests.retailerId, retailerId));

      // Rebuild nested structure for frontend
      return rows.map(r => ({
        id: r.requestId,
        retailerId: r.retailerId,
        distributorId: r.distributorId,
        status: r.status,
        message: r.message,
        rejectionReason: r.rejectionReason,
        createdAt: r.createdAt,

        distributor: {
          id: r.d_id,
          companyName: r.d_companyName || 'Unknown',
          ownerName: r.d_ownerName || 'Unknown',
          phone: 'N/A', // We'll add this back once we figure out the schema
          location: r.d_location || 'Unknown',
          businessType: r.d_businessType || 'Unknown'
        }
      }));
    } catch (error) {
      console.error("Error in getRetailerRequests:", error);
      console.error("Stack trace:", error.stack);
      throw error;
    }
  },

  async getDistributorRequests(distributorId) {
    try {
      const rows = await db
        .select({
          requestId: connectionRequests.id,
          retailerId: connectionRequests.retailerId,
          distributorId: connectionRequests.distributorId,
          status: connectionRequests.status,
          message: connectionRequests.message,
          rejectionReason: connectionRequests.rejectionReason,
          createdAt: connectionRequests.createdAt,

          // retailer flat fields
          r_id: retailers.id,
          r_userId: retailers.userId,
          r_businessName: retailers.businessName,
          r_ownerName: retailers.ownerName,
          r_location: retailers.location,
          r_businessType: retailers.businessType,
          
          // user fields for phone
          u_phone: users.phone,
        })
        .from(connectionRequests)
        .leftJoin(retailers, eq(connectionRequests.retailerId, retailers.id))
        .leftJoin(users, eq(retailers.userId, users.id))
        .where(eq(connectionRequests.distributorId, distributorId));

      return rows.map(r => ({
        id: r.requestId,
        retailerId: r.retailerId,
        distributorId: r.distributorId,
        status: r.status,
        message: r.message,
        rejectionReason: r.rejectionReason,
        createdAt: r.createdAt,

        retailer: {
          id: r.r_id,
          userId: r.r_userId,
          businessName: r.r_businessName,
          ownerName: r.r_ownerName,
          phone: r.u_phone,
          location: r.r_location,
          businessType: r.r_businessType
        }
      }));
    } catch (error) {
      console.error("Error in getDistributorRequests:", error);
      throw error;
    }
  },

  async approveRequest(txOrDb, requestId) {
    const [row] = await txOrDb
      .update(connectionRequests)
      .set({ status: "approved" })
      .where(eq(connectionRequests.id, requestId))
      .returning();
    return row;
  },

  async rejectRequest(requestId, reason) {
    const [row] = await db
      .update(connectionRequests)
      .set({ status: "rejected", rejectionReason: reason })
      .where(eq(connectionRequests.id, requestId))
      .returning();
    return row;
  },

  async createConnection(txOrDb, retailerId, distributorId) {
    return txOrDb.insert(connections)
      .values({ retailerId, distributorId })
      .returning();
  },

  async getRetailerConnections(retailerId) {
    return db.select().from(connections).where(eq(connections.retailerId, retailerId));
  },

  async getDistributorConnections(distributorId) {
    return db.select().from(connections).where(eq(connections.distributorId, distributorId));
  },

  async removeConnection(retailerId, distributorId) {
    await db
      .delete(connections)
      .where(
        and(eq(connections.retailerId, retailerId), eq(connections.distributorId, distributorId))
      );
  },

  // Search distributors
  async searchDistributors(filters = {}) {
    // NOTE: chaining .where() repeatedly REPLACES the predicate in Drizzle rather than
    // ANDing it, so conditions are collected and applied in a single call.
    const conditions = [];

    if (filters.companyName) {
      conditions.push(ilike(distributors.companyName, `%${filters.companyName}%`));
    }
    if (filters.location) {
      conditions.push(ilike(distributors.location, `%${filters.location}%`));
    }
    if (filters.businessType) {
      conditions.push(eq(distributors.businessType, filters.businessType));
    }
    if (filters.pincode) {
      conditions.push(eq(distributors.pincode, filters.pincode));
    }

    const q = db.select().from(distributors);
    return conditions.length ? q.where(and(...conditions)) : q;
  },

  // Search retailers
  async searchRetailers(filters) {
    let q = db.select().from(retailers);

    if (filters.businessName) {
      q = q.where(ilike(retailers.businessName, `%${filters.businessName}%`));
    }
    if (filters.location) {
      q = q.where(ilike(retailers.location, `%${filters.location}%`));
    }
    if (filters.businessType) {
      q = q.where(eq(retailers.businessType, filters.businessType));
    }
    if (filters.pincode) {
      q = q.where(eq(retailers.pincode, filters.pincode));
    }

    return q;
  }
};
