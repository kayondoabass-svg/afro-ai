// Keep legacy root-relative storage/release paths stable in the managed service.
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
process.env.AFRO_WORKSPACE_API_ONLY = "1";
await import("./src/index.ts");
