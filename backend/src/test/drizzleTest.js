import { db } from "../config/postgres.js";
import { users } from "../db/schema.js";

async function test() {
  const result = await db.select().from(users);
  console.log("Users:", result);
}

test();
