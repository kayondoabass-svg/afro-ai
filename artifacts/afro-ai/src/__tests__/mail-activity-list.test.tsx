import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MailActivityList, type AuthMailActivity } from "../components/auth-setup/mail-activity-list";
afterEach(cleanup);
const record = (created_at: AuthMailActivity["created_at"]): AuthMailActivity => ({
  purpose: "verify", outcome: "accepted", message_id: "owned-message", reason: null, created_at,
});
const iso = "2026-10-27T03:00:00.000Z";
it.each([Date.parse(iso)/1000, Date.parse(iso), iso])("renders the actual event time from %s in the browser timezone", value => {
  render(<MailActivityList events={[record(value)]} />);
  expect(screen.getByTestId("mail-event-time")).toHaveTextContent(new Date(iso).toLocaleString());
  expect(screen.getByTestId("mail-event-time")).not.toHaveTextContent("1970");
});
it.each([null,"not a time",0])("renders Time unavailable for %s, with no invented fallback", value => {
  render(<MailActivityList events={[record(value)]} />);
  expect(screen.getByTestId("mail-event-time")).toHaveTextContent(/^Time unavailable$/);
});
it("shows safe delivery errors while keeping the original acceptance status", () => {
  render(<MailActivityList events={[{...record(iso),delivery:{status:null,error:"Provider lookup unavailable. No email was resent.",checkedAt:null}}]} />);
  expect(screen.getByText("verify · accepted")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Provider lookup unavailable");
  expect(screen.queryByText(/Provider result: delivered/)).toBeNull();
});
it("distinguishes a queued message from provider-confirmed delivery", () => {
  const event = {...record(iso),delivery:{status:"queued",error:null,checkedAt:iso}};
  const view=render(<MailActivityList events={[event]} />);
  expect(screen.getByRole("status")).toHaveTextContent("Provider result: queued");
  expect(screen.getByRole("status")).not.toHaveTextContent("delivered");
  view.rerender(<MailActivityList events={[{...event,delivery:{...event.delivery,status:"delivered"}}]} />);
  expect(screen.getByRole("status")).toHaveTextContent("Provider result: delivered (not proof of inbox placement)");
});
it("keeps the last confirmed result visible alongside a failed refresh", () => {
  render(<MailActivityList events={[{...record(iso),delivery:{status:"delivered",error:"The latest lookup was unavailable.",checkedAt:iso}}]} />);
  expect(screen.getByRole("status")).toHaveTextContent("Provider result: delivered");
  expect(screen.getByRole("status")).toHaveTextContent("The latest lookup was unavailable.");
});
