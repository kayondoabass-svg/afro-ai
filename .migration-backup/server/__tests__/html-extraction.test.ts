import { describe, expect, it } from "vitest";
import { extractWebsiteHtml } from "../../shared/html-extraction";

const page = `<!DOCTYPE html>
<html lang="fr"><head><title>Client</title>
<style>body::before { content: "[BUILD PLAN] is legitimate copy"; }</style></head>
<body><main>Voici le site. \`\`\`html is legitimate copy.</main>
<script>const literal = "</html>"; console.log(literal);</script></body></html>`;

describe("website HTML extraction for previews, saved versions and publishing", () => {
  it.each([
    `[BUILD PLAN]\nBuilding a website\n[/BUILD PLAN]\nHere is your site:\n\`\`\`html\n${page}\n\`\`\`\nDone!`,
    `[REQUIREMENTS CHECK]\nCredentials needed\n[/REQUIREMENTS CHECK]\nVoici votre site :\n\`\`\`html\n${page}\n\`\`\`\nC'est prêt.`,
    `Voici la page demandée:\n${page}\nC'est prêt !`,
    `Here's your page:\n${page}\nI hope it helps.`,
    `[BUILD PLAN] Building: a page\n\`\`\`html\n${page}\n\`\`\``,
    `[BUILD PLAN] here's a plan [/BUILD PLAN]\n\`\`\`\n${page}\n\`\`\``,
  ])("extracts the exact complete document without assistant metadata", response => {
    expect(extractWebsiteHtml(response)).toBe(page);
  });

  it("keeps valid HTML intact, including scripts, styles and real website copy", () => {
    expect(extractWebsiteHtml(page)).toBe(page);
  });

  it("repairs previously polluted saved documents on reading without modifying storage", () => {
    const saved = `[BUILD PLAN]\nOld plan\n[/BUILD PLAN]\nVoici le site\n\`\`\`html\n${page}\n\`\`\`\nThanks`;
    expect(extractWebsiteHtml(saved)).toBe(page);
    expect(saved).toContain("Old plan");
  });

  it("supports HTML fragments and their scripts or styles", () => {
    const fragment = `<style>main{color:red}</style><main>Bonjour</main><script>window.ready=true</script>`;
    expect(extractWebsiteHtml(`Voici le code:\n\`\`\`html\n${fragment}\n\`\`\`\nTerminé`)).toBe(fragment);
    expect(extractWebsiteHtml(`<div>Hi</div>`)).toBe("<div>Hi</div>");
    expect(extractWebsiteHtml(`<main>Hi</main><footer>Bye</footer>`)).toBe("<main>Hi</main><footer>Bye</footer>");
  });

  it("does not mistake plans or mentions of HTML tags for websites", () => {
    expect(extractWebsiteHtml("[BUILD PLAN]\nWrite <html> and </html> tags someday.\n[/BUILD PLAN]")).toBeNull();
    expect(extractWebsiteHtml("Here's a plan. No website generated yet.")).toBeNull();
  });
});