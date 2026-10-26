import { pool } from "../server/db";
import { CHATBOT_VERIFICATION_SCHEMA } from "../server/chatbot-verification-schema";

try {
  await pool.query(CHATBOT_VERIFICATION_SCHEMA);
  console.log("Chatbot ownership schema ready; existing widgets preserved in legacy mode.");
} catch {
  console.error("Chatbot ownership migration failed; deployment must not continue.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
