import type { Express, Request, Response, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import AdmZip from "adm-zip";
import { ProjectFileError, projectFileBytes } from "../project-file-policy";
import { workbenchState, mutateWorkbench } from "./service";
import { LOCAL_RUNNER } from "./runner-source";
import { assertProjectFileOwnership } from "../project-files";
import { validateProjectFiles } from "../project-file-policy";
import { d1Query } from "../d1";
import { registerEvidenceRoutes } from "./evidence";

export function registerWorkbenchRoutes(app: Express, auth: RequestHandler) {
  registerEvidenceRoutes(app, auth);
  const limit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
  const base = "/api/conversations/:id/workbench";
  const owner = (req: Request) => (req as any).user?.claims?.sub || (req as any).user?.claims?.id;
  const failure = (res: Response, error: unknown) => res.status(error instanceof ProjectFileError ? error.status : 503).json({
    error: error instanceof ProjectFileError ? error.message : "Workspace unavailable; reload before retrying. No operation is automatically replayed.",
  });
  app.get(base, auth, limit, async (req, res) => {
    try { res.json(await workbenchState(owner(req), String(req.params.id))); } catch (e) { failure(res, e); }
  });
  app.post(`${base}/:action`, auth, limit, async (req, res) => {
    try {
      if (!["plan", "input", "operations", "review", "checkpoint", "checkpoint-delete", "restore", "validate", "report", "repair", "legacy"].includes(String(req.params.action))) throw new ProjectFileError(404, "unknown workspace action");
      if (Buffer.byteLength(JSON.stringify(req.body || {})) > 100000) throw new ProjectFileError(413, "workspace request too large");
      res.json(await mutateWorkbench(owner(req), String(req.params.id), String(req.params.action), req.body));
    } catch (e) { failure(res, e); }
  });
  app.get(`${base}/bundle`, auth, limit, async (req, res) => {
    try {
      const state = await workbenchState(owner(req), String(req.params.id));
      if (state.files.some(f => f.path.toLowerCase().startsWith(".afro-checks/"))) throw new ProjectFileError(409, "reserved validation directory exists in source");
      const zip = new AdmZip();
      for (const file of state.files) zip.addFile(file.path, projectFileBytes(file));
      zip.addFile(".afro-checks/run.mjs", Buffer.from(LOCAL_RUNNER));
      zip.addFile(".afro-checks/config.json", Buffer.from(JSON.stringify({
        fingerprint: state.fingerprint,
        manifest: [...state.files].sort((a, b) => a.path.localeCompare(b.path)).map(({ path, language, encoding }) => ({ path, language, encoding })),
        acceptanceChecks: state.plan.checks, previewDirectory: ".", browserActions: [],
      }, null, 2)));
      zip.addFile(".afro-checks/README.txt", Buffer.from(`AFRO AI — CUSTOMER-CONTROLLED VALIDATION

This ZIP contains your project snapshot, not an installed application.
Works with Node.js 22+ on Windows, macOS and Linux.
Extract the whole ZIP. Open a terminal in the extracted project folder.

1. Inspect the source, package.json scripts and .afro-checks/run.mjs.
2. Run: node .afro-checks/run.mjs
   Without permission flags, project commands do not execute.
3. To permit reviewed build/test scripts:
   node .afro-checks/run.mjs --allow-commands
4. To also install dependencies (Internet required, scripts disabled):
   node .afro-checks/run.mjs --allow-commands --allow-install

Browser checks require Playwright on YOUR computer:
   cd .afro-checks
   npm init -y
   npm install --save-exact playwright@1.58.2
   npx playwright install chromium
   cd ..
Run the validator again. No browser is installed on Afro AI's server.

For compiled static apps, edit previewDirectory in config.json to the output
directory (for example dist). Add browserActions to exercise your controls:
  {"kind":"click","selector":"button#start"}
  {"kind":"visible","selector":"#result"}
  {"kind":"text","selector":"#result","value":"Ready"}
  {"kind":"fill","selector":"input#name","value":"Test"}
External browser requests are blocked. Backend startup and test databases
are customer-managed; this runner does not provision them.

Results and screenshots: .afro-checks/results/
Import report.json using Project workbench > Import report.
Reports are customer-reported, not independently attested by Afro AI.
Acceptance requirements remain blocked until manually verified.
Passing checks are not a security certification or a bug-free guarantee.

Use a disposable VM/container of YOUR choice for untrusted code. This runner
is not a sandbox. --allow-commands permits project scripts to execute locally.
Commands can use your filesystem and network. Do not run unknown code.
Each command has a two-minute timeout; Ctrl+C requests cancellation.
No automatic paid operations or deployment take place.
Add /.afro-checks/results/ and /.afro-checks/node_modules/ to your .gitignore.
Do not upload screenshots/logs containing private data.
`));
      zip.addFile(".afro-checks/.gitignore", Buffer.from("results/\nnode_modules/\n"));
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="afro-project-${state.workspaceId}-validation.zip"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(zip.toBuffer());
    } catch (e) { failure(res, e); }
  });
  app.get(`${base}/legacy/:legacyId`, auth, limit, async (req, res) => {
    try {
      const user = owner(req), id = await assertProjectFileOwnership(user, String(req.params.id));
      const legacyId = String(req.params.legacyId);
      if (legacyId === id || await assertProjectFileOwnership(user, legacyId) !== id) throw new ProjectFileError(404, "legacy workspace not found");
      const { results } = await d1Query("SELECT path, name, language, content, encoding FROM project_files WHERE user_id = ? AND conversation_id = ?", [user, legacyId]);
      const files = validateProjectFiles(results.map(f => ({ ...f, encoding: f.encoding || undefined })));
      if (!files.length) throw new ProjectFileError(404, "legacy workspace empty");
      const zip = new AdmZip();
      for (const file of files) zip.addFile(file.path, projectFileBytes(file));
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="afro-legacy-${legacyId}.zip"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(zip.toBuffer());
    } catch (e) { failure(res, e); }
  });
}
