import { afterEach,expect,it,vi } from "vitest";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { waitFor } from "@testing-library/react";
import CallbackPage from "../../../../../examples/afro-auth-backend/CallbackPage.jsx";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState({},"","/");});
it("posts once to its own backend under Strict Mode, strips the URL and rejects foreign redirects",async()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
  const token="a".repeat(64),state="b".repeat(43);
  window.history.replaceState({},"",`/auth/confirm?verification_token=${token}&state=${state}`);
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,redirect:"https://untrusted.example/"})});
  vi.stubGlobal("fetch",fetch);
  const container=document.createElement("div");document.body.append(container);
  const root=createRoot(container);
  try{
    act(()=>root.render(<StrictMode><CallbackPage/></StrictMode>));
    await waitFor(()=>expect(container.textContent).toContain("Invalid sign-in destination."));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/auth/confirm",expect.objectContaining({method:"POST",credentials:"same-origin",
      body:JSON.stringify({state,verification_token:token})}));
    expect(window.location.search).toBe("");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/login");
  }finally{act(()=>root.unmount());container.remove();}
});
