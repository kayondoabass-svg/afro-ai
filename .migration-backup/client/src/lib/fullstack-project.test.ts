import { describe, expect, it } from "vitest";
import { isSetupBlocked, projectChatUrl, projectRequestError } from "./fullstack-project";

describe("full-stack project contract", () => {
  it("opens source mode without description autogeneration", () => {
    expect(projectChatUrl({ id: 81, name: "Kampala & Studio", type: "fullstack", description: "Do not generate this" }))
      .toBe("/chat?projectId=81&project=Kampala%20%26%20Studio&projectMode=fullstack");
  });
  it("keeps existing project URLs unchanged", () => {
    expect(projectChatUrl({ id: 82, name: "Studio", type: "website", description: "A portfolio" }))
      .toBe("/chat?projectId=82&project=Studio&type=website&description=A%20portfolio");
  });
  it("extracts backend messages and partial creation from apiRequest errors", () => {
    const project = { id: 81, status: "setup_failed", type: "fullstack" };
    expect(projectRequestError(new Error(`503: ${JSON.stringify({ message: "Could not save starter files.", project })}`)))
      .toEqual({ message: "Could not save starter files.", project });
  });
  it("retains network error details", () => {
    expect(projectRequestError(new Error("Network unavailable"))).toEqual({ message: "Network unavailable" });
  });
  it.each(["initializing", "setup_failed"])("does not treat %s as ready", (status) => {
    expect(isSetupBlocked({ type: "fullstack", status })).toBe(true);
    expect(isSetupBlocked({ type: "website", status })).toBe(false);
  });
});