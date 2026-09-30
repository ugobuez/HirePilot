import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let memServer = null;

/** Start an in-memory MongoDB for one test file. */
export const startTestDb = async () => {
  memServer = await MongoMemoryServer.create({ instance: { dbName: "hirepilot_test" } });
  await mongoose.connect(memServer.getUri("hirepilot_test"));
  return mongoose.connection;
};

/** Stop it and drop every handle so jest can exit. */
export const stopTestDb = async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (memServer) await memServer.stop();
  memServer = null;
};

export const clearTestDb = async () => {
  const { collections } = mongoose.connection;
  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({});
  }
};
