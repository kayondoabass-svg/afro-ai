import { pool } from "../server/db";
import { INTEGRATION_PROJECT_SCHEMA } from "../server/integration-project-schema";

try {
  await pool.query(INTEGRATION_PROJECT_SCHEMA);
  console.log("Email projects and private chatbot credentials ready; existing integrations preserved.");
} catch {
  console.error("Integration migration failed; deployment must not continue.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
