import { expect, it } from "vitest";
import { currentBuildTurn, invalidBuildAnswer } from "./build-response-policy";
const html = "<!doctype html><html><body><h1>Example</h1></body></html>";
it("builds on current approval, but respects Plan on this turn", () => {
  expect(currentBuildTurn("build now", true)).toEqual({ plan: false, requireHtml: true });
  expect(currentBuildTurn("okay", true).requireHtml).toBe(true);
  expect(currentBuildTurn("[PLAN MODE] build. whats wrong", true)).toEqual({ plan: true, requireHtml: false });
  expect(currentBuildTurn("build now", false).requireHtml).toBe(false);
  expect(currentBuildTurn("can I preview it?", true).requireHtml).toBe(false);
});
it("rejects the screenshots' fake readiness and background claims", () => {
  for (const text of [
    "Your website is ready for review! [Link to your website]",
    "I'll let you know once it's ready for your review.",
    "Could you confirm if you'd like me to proceed?",
  ]) expect(invalidBuildAnswer(text, true, false)).toBe(true);
  expect(invalidBuildAnswer("[Link to your website]", false, false)).toBe(true);
});
it("requires complete code for builds but permits ordinary discussion", () => {
  expect(invalidBuildAnswer(html, true, false)).toBe(false);
  expect(invalidBuildAnswer(html.replace("</html>", ""), true, false)).toBe(true);
  expect(invalidBuildAnswer("What name should your website use?", false, false)).toBe(false);
  expect(invalidBuildAnswer(html, false, true)).toBe(true);
});