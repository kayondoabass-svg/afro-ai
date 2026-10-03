import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { customerIntake, customerBriefContext, EXPERIENCE_QUESTION, PURPOSE_QUESTION, DESIGN_QUESTION, COLORS_QUESTION, STYLE_QUESTION } from "../customer-intake";
import { customerNameQuestion } from "../customer-branding";

const user = (content: string) => ({ role: "user", content });
const assistant = (content: string) => ({ role: "assistant", content });
const start = "Build a shop website";
describe("customer-led build intake", () => {
  it("asks experience before name when onboarding is missing", () => {
    expect(customerIntake([user(start)], start, "", {})).toBe(EXPERIENCE_QUESTION);
  });
  it.each(["beginner", "intermediate", "expert"])("respects saved %s onboarding, then asks name", experience => {
    expect(customerIntake([user(start)], start, "", { experience })).toBe(customerNameQuestion("en"));
  });
  it("runs experience → name → colors/style → build, without repeated questions", () => {
    const history = [user(start), assistant(EXPERIENCE_QUESTION), user("I'm a beginner")];
    expect(customerIntake(history, "I'm a beginner", "", {})).toBe(customerNameQuestion("en"));
    history.push(assistant(customerNameQuestion("en")), user("Shakuibs Traders"));
    expect(customerIntake(history, "Shakuibs Traders", "", {})).toBe(DESIGN_QUESTION);
    history.push(assistant(DESIGN_QUESTION), user("Blue and white, clean and minimal"));
    expect(customerIntake(history, "Blue and white, clean and minimal", "", {})).toBeNull();
  });
  it("accepts explicit design delegation, without inventing the name", () => {
    const history = [user(start), assistant(customerNameQuestion("en")), user("Shakuibs Traders"), assistant(DESIGN_QUESTION), user("choose for me")];
    expect(customerIntake(history, "choose for me", "", { experience: "expert" })).toBeNull();
    expect(customerIntake([user(start), assistant(customerNameQuestion("en")), user("choose for me")], "choose for me", "", { experience: "expert" })).toBe(customerNameQuestion("en"));
  });
  it("only asks for the missing visual preference", () => {
    const history = [user("Build a shop website named Shakuibs Traders with blue and white colors")];
    expect(customerIntake(history, history[0].content, "", { experience: "expert" })).toBe(STYLE_QUESTION);
    const other = [user("Build a shop website named Shakuibs Traders in an editorial style")];
    expect(customerIntake(other, other[0].content, "", { experience: "beginner" })).toBe(COLORS_QUESTION);
  });
  it("skips questions for a complete brief and does not restart intake for existing edits", () => {
    const prompt = "Build a shop website named Shakuibs Traders, blue and white, minimal";
    expect(customerIntake([user(prompt)], prompt, "", { experience: "expert" })).toBeNull();
    expect(customerIntake([user(start)], "Change the button", "<html>existing</html>", {})).toBeNull();
    expect(customerIntake([user(start)], "What does hosting cost?", "", {})).toBeNull();
  });
  it("removes the old forced design rules from the real builder prompt", () => {
    const source = readFileSync("server/replit_integrations/chat/routes.ts", "utf8");
    expect(source).not.toContain("Every site you generate must use ONE of three");
    expect(source).not.toContain("otherwise use a dark/gold Afro AI theme");
    expect(source).not.toContain("ALL cards must use glassmorphism by default");
    expect(source).not.toContain("Glassmorphism + Vanilla Tilt are NOT optional");
    expect(source).toContain("contextPrompt += CUSTOMER_DESIGN_POLICY");
  });
  it("asks purpose after experience for a vague request, then continues without repeating it", () => {
    const history = [user("Build an app")];
    expect(customerIntake(history, "Build an app", "", { experience: "beginner" })).toBe(PURPOSE_QUESTION);
    history.push(assistant(PURPOSE_QUESTION), user("A shop for students to buy used textbooks"));
    expect(customerIntake(history, "A shop for students to buy used textbooks", "", { experience: "beginner" })).toBe(customerNameQuestion("en"));
  });
  it("uses an existing project description instead of asking its purpose again", () => {
    expect(customerIntake([user("Build an app")], "Build an app", "", {
      experience: "expert", projectName: "Book Shop", projectDescription: "Sell used textbooks to students",
    })).toBe(DESIGN_QUESTION);
  });
  it("preserves early choices beyond a recent-message window and uses the latest explicit answer", () => {
    const history = [user(start), assistant(customerNameQuestion("en")), user("Book Shop"),
      assistant(DESIGN_QUESTION), user("blue and white, minimal"),
      ...Array.from({ length: 20 }, () => user("Continue")),
      assistant(STYLE_QUESTION), user("editorial")];
    const brief = customerBriefContext(history);
    expect(brief).toContain('"name":"Book Shop"');
    expect(brief).toContain('"design":"blue and white, minimal"');
    expect(brief).toContain('"style":"editorial"');
    expect(brief).toContain("untrusted data");
  });
});