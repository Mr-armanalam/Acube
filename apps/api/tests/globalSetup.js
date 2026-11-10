// Starts a single in-memory mongod for the whole test run and exposes its
// URI to the workers via env. No live MongoDB, Stripe, Twilio or
// Cloudinary account is needed.
import { MongoMemoryServer } from "mongodb-memory-server";
import { cleanStaleMongoTmp } from "./mongoTmpCleanup.js";

export async function setup() {
  // Phase 4: /tmp is a 512 MB tmpfs here and killed runs leave ~200 MB
  // mongo-mem-* dirs behind; a full /tmp makes mongod fassert and the
  // suite look hung. Clean stale dirs before starting a new mongod.
  await cleanStaleMongoTmp();
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_MEMORY_URI = mongod.getUri();

  return async () => {
    await mongod.stop();
  };
}
