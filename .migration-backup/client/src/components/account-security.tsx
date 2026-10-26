import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Device = { id: string; device: string; location: string; current: boolean; created_at: number; last_seen_at: number };
export function AccountSecurity({ email }: { email?: string | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<{ devices: Device[] }>({
    queryKey: ["/api/auth/devices"], enabled: open, retry: false,
    queryFn: async () => {
      const res = await fetch("/api/auth/devices", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Could not load your devices. Please try again.");
      return res.json();
    },
  });
  async function revoke(device: Device) {
    if (!window.confirm(`Log out ${device.current ? "this device" : device.device}?`)) return;
    setBusy(device.id); setMessage("");
    try {
      const res = await fetch(`/api/auth/devices/${encodeURIComponent(device.id)}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Could not log out this device. Please retry.");
      if (device.current) {
        queryClient.clear();
        window.location.replace("/login");
      } else {
        await refetch();
        setMessage("Device logged out. It will need to sign in again.");
      }
    } catch (e: any) { setMessage(e.message); }
    finally { setBusy(""); }
  }
  async function requestReset() {
    setBusy("reset"); setMessage("");
    try {
      const res = await fetch("/cf-auth/forgot-password", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(res.status === 429 ? "Too many requests. Please wait before trying again." : "Could not request a reset link. Please retry.");
      setResetSent(true);
      setMessage("Reset link requested. Check your inbox and spam folder. The link expires in one hour.");
    } catch (e: any) { setMessage(e.message); }
    finally { setBusy(""); }
  }
  return <Card><CardContent className="p-6 space-y-4">
    <h2 className="text-lg font-semibold">Account security</h2>
    <p className="text-sm text-muted-foreground">Resetting your password logs out all previous sessions. Only the device completing the reset stays signed in.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>Logged-in devices</Button>
      <Button variant="outline" onClick={requestReset} disabled={!!busy || resetSent || !email}>
        {busy === "reset" ? "Requesting…" : resetSent ? "Reset link requested" : "Change password by email"}
      </Button>
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
    {open && <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Locations are approximate, based on the connection at sign-in. VPNs may show a different location. Separate browsers appear as separate devices.</p>
      {isLoading && <p>Loading devices…</p>}
      {error && <div role="alert"><p>{error.message}</p><Button variant="ghost" onClick={() => refetch()}>Retry</Button></div>}
      {data?.devices.length === 0 && <p>No active devices found.</p>}
      {data?.devices.map(device => <div key={device.id} className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{device.device}{device.current && " · This device"}</p>
          <p className="text-sm text-muted-foreground">{device.location}</p>
          <p className="text-xs text-muted-foreground">Last active: {new Date(device.last_seen_at * 1000).toLocaleString()}</p>
        </div>
        <Button variant="outline" disabled={!!busy} onClick={() => revoke(device)}>{busy === device.id ? "Logging out…" : "Log out"}</Button>
      </div>)}
    </div>}
  </CardContent></Card>;
}