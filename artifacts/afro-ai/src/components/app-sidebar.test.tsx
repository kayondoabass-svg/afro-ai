import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppSidebar, ALL_MENU_ITEMS, MENU_GROUPS, getActiveSidebarUrl } from "./app-sidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";
import { translations } from "@/lib/translations";

const mocks = vi.hoisted(() => ({ founder: false, mobile: false, logout: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { firstName: "Amina", email: "amina@example.test", isFounder: mocks.founder }, logout: mocks.logout }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mocks.mobile }));
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    t: (key: string, params?: Record<string, number>) =>
      (translations.en[key] || key).replace("{n}", String(params?.n ?? "")),
  }),
}));

function mount(defaultOpen = true) {
  return render(<SidebarProvider defaultOpen={defaultOpen}><AppSidebar /><SidebarTrigger /></SidebarProvider>);
}
function route(url: string) {
  window.history.pushState(null, "", url);
}

it("keeps Settings, Marketplace and Collaborate directly accessible to ordinary clients", () => {
  mount();
  for (const [name, href] of [["Settings", "/settings"], ["Marketplace", "/marketplace"], ["Collaborate", "/collaborate"]]) {
    expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(href);
  }
  expect(screen.queryByRole("link", { name: "Founder Dashboard" })).toBeNull();
});

beforeEach(() => {
  mocks.founder = false;
  mocks.mobile = false;
  mocks.logout.mockClear();
  sessionStorage.clear();
  route("/overview");
});
afterEach(cleanup);

describe("grouped sidebar", () => {
  it("keeps New Chat primary, searchable and outside the builder group", async () => {
    const user = userEvent.setup();
    route("/chat");
    mount();
    expect(screen.getByRole("link", { name: "New Chat" })).toHaveAttribute("href", "/chat");
    expect(MENU_GROUPS.find(group => group.id === "builder")?.urls).not.toContain("/chat");
    expect(screen.queryByRole("link", { name: "Start Building" })).toBeNull();
    await user.type(screen.getByRole("textbox"), "new chat");
    expect(screen.getByRole("link", { name: "New Chat" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "AI Builder" })).toBeNull();
  });
  it("opens and closes with native Enter and Space buttons and preserves manual closure", async () => {
    route("/dashboard");
    const user = userEvent.setup();
    mount();
    const builder = screen.getByRole("button", { name: "AI Builder" });
    expect(builder).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(builder.getAttribute("aria-controls")!)).toBeVisible();
    act(() => builder.focus());
    await user.keyboard("{Enter}");
    expect(builder).toHaveAttribute("aria-expanded", "false");
    await user.type(screen.getByRole("textbox"), "forms");
    await user.clear(screen.getByRole("textbox"));
    const restoredBuilder = screen.getByRole("button", { name: "AI Builder" });
    expect(restoredBuilder).toHaveAttribute("aria-expanded", "false");
    act(() => restoredBuilder.focus());
    await user.keyboard(" ");
    expect(restoredBuilder).toHaveAttribute("aria-expanded", "true");
  });

  it("selects only the most specific nested link and expands its group", () => {
    route("/dashboard/auth/project-42");
    mount();
    expect(screen.getByRole("link", { name: "Afro Auth" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Developer Tools" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "AI Builder" })).toHaveAttribute("aria-expanded", "false");
    expect(getActiveSidebarUrl("/ussd/apps/12", "", ALL_MENU_ITEMS)).toBe("/ussd/apps");
    expect(getActiveSidebarUrl("/dashboard/authentication", "", ALL_MENU_ITEMS)).toBe("/dashboard");
  });

  it("finds collapsed leaves and restores the groups after clearing search", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole("link", { name: "Files & Storage" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "  files");
    expect(screen.getByRole("link", { name: "Files & Storage" })).toHaveAttribute("href", "/files");
    expect(screen.queryByRole("button", { name: "Developer Tools" })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("textbox"));
    expect(screen.getByRole("button", { name: "Developer Tools" })).toHaveAttribute("aria-expanded", "false");
  });

  it("never exposes founder links to ordinary users, including search", async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole("link", { name: "Founder Dashboard" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox"), "founder");
    expect(screen.getByText("No matches found")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Founder Dashboard" })).not.toBeInTheDocument();
  });

  it("includes authorized founder items in search", async () => {
    mocks.founder = true;
    const user = userEvent.setup();
    mount();
    expect(screen.getByRole("link", { name: "Command Center" })).toHaveAttribute("href", "/admin-command");
    await user.type(screen.getByRole("textbox"), "database");
    expect(screen.getByRole("link", { name: "D1 Database" })).toHaveAttribute("href", "/d1");
  });

  it("preserves every existing tool destination and has no duplicate grouped leaves", async () => {
    const user = userEvent.setup();
    mount();
    for (const group of MENU_GROUPS) {
      await user.click(screen.getByRole("button", { name: group.title }));
    }
    const hrefs = screen.getAllByRole("link").map(link => link.getAttribute("href"));
    for (const item of ALL_MENU_ITEMS) expect(hrefs).toContain(item.url);
    expect(new Set(MENU_GROUPS.flatMap(group => group.urls)).size).toBe(MENU_GROUPS.flatMap(group => group.urls).length);
    expect(screen.getByRole("link", { name: "My Apps" })).toHaveAttribute("href", "/deployments");
    expect(screen.queryByRole("link", { name: "Deployments" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Domain Store" })).toHaveAttribute("href", "/domains?tab=search");
    expect(screen.getByRole("link", { name: "My Domains" })).toHaveAttribute("href", "/domains?tab=mydomains");
    expect(document.querySelector("a a, a button")).toBeNull();
  });

  it("auto-opens a newly active group on navigation after manual closure", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByRole("textbox"), "afro auth");
    await user.click(screen.getByRole("link", { name: "Afro Auth" }));
    await user.clear(screen.getByRole("textbox"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Developer Tools" })).toHaveAttribute("aria-expanded", "true"));
  });

  it("persists expanded groups for the session", async () => {
    const user = userEvent.setup();
    const view = mount();
    await user.click(screen.getByRole("button", { name: "USSD" }));
    view.unmount();
    mount();
    expect(screen.getByRole("button", { name: "USSD" })).toHaveAttribute("aria-expanded", "true");
  });

  it("expands the compact sidebar before revealing group leaves", async () => {
    const user = userEvent.setup();
    mount(false);
    expect(screen.queryByRole("link", { name: "Forms" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "AI Builder" }));
    expect(screen.getByRole("link", { name: "Forms" })).toBeVisible();
    expect(screen.getByRole("button", { name: "AI Builder" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Log Out" }));
    expect(mocks.logout).toHaveBeenCalledOnce();
  });

  it("keeps the mobile sheet open on expansion and closes it on leaf navigation", async () => {
    mocks.mobile = true;
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    await user.click(screen.getByRole("button", { name: "USSD" }));
    expect(screen.getByRole("link", { name: "My USSD Apps" })).toBeVisible();
    await user.click(screen.getByRole("link", { name: "My USSD Apps" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "My USSD Apps" })).not.toBeInTheDocument());
    expect(window.location.pathname).toBe("/ussd/apps");
  });
});