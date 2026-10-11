import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { readableApiError } from "@shared/customer-api-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CircleAlert, Database, MailCheck, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";

interface TenantUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  email_verified: number | boolean;
  created_at: number;
}
interface UserResult { users: TenantUser[]; total: number; limit: number; offset: number; store: "D1"; folder: string }
type VerificationFilter = "all" | "verified" | "unverified";
const PAGE_SIZE = 25;

export function UserDirectory({ tenantId, active }: { tenantId: string; active: boolean }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VerificationFilter>("all");
  const [offset, setOffset] = useState(0);
  const [feedback, setFeedback] = useState("");
  const path = `/cf-auth/v1/admin/tenants/${tenantId}/users`;
  const queryPath = `${path}?limit=${PAGE_SIZE}&offset=${offset}&q=${encodeURIComponent(search)}&status=${status}`;
  const queryKey = [path, { limit: PAGE_SIZE, offset, q: search, status }];
  const { data, isLoading, isFetching, error, refetch } = useQuery<UserResult>({
    queryKey,
    queryFn: async () => (await apiRequest("GET", queryPath)).json() as Promise<UserResult>,
    enabled: !!tenantId && active,
    refetchInterval: active ? 30_000 : false,
  });
  const sendVerification = useMutation({
    mutationFn: async (userId: string) => (await apiRequest("POST", `${path}/${encodeURIComponent(userId)}/send-verification`)).json() as Promise<{ ok: boolean; message: string }>,
    onSuccess: async (result) => { setFeedback(result.message || "Verification email sent."); await queryClient.invalidateQueries({ queryKey: [path] }); },
    onError: (e) => setFeedback(readableApiError(e, "Could not send the verification email. Check the connection and try again.")),
  });
  const total = data?.total ?? 0;
  const end = Math.min(offset + (data?.users.length ?? 0), total);

  return <Card>
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Owner-only user directory</CardTitle>
          <CardDescription className="mt-1">Project users live in a private D1 store. Email confirmation status is refreshed while this view is open.</CardDescription></div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-4">
      {data && <div className="rounded-lg border bg-muted/40 p-3">
        <div className="flex items-center gap-2 text-sm font-medium"><Database className="h-4 w-4 text-primary" />Private project data · {data.store}</div>
        <code className="mt-1 block break-all text-xs text-muted-foreground">{data.folder}</code>
        <p className="mt-1 text-xs text-muted-foreground">Only this project's owner can view these records. They are not a shared or public user list.</p>
      </div>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setOffset(0); }}>
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search email or name" aria-label="Search users" /></div>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
        <Select value={status} onValueChange={(value) => { setStatus(value as VerificationFilter); setOffset(0); }}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by email verification"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="verified">Email verified</SelectItem><SelectItem value="unverified">Not verified</SelectItem></SelectContent>
        </Select>
      </div>
      {feedback && <Alert role="status" variant={sendVerification.isError ? "destructive" : "default"}><AlertDescription>{feedback}</AlertDescription></Alert>}
      {isLoading ? <div className="space-y-3" aria-label="Loading users">{[1, 2, 3].map((n) => <div key={n} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
        : error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert">
          <p className="flex items-center gap-2 font-medium"><CircleAlert className="h-4 w-4" />Directory unavailable</p><p className="mt-1 text-muted-foreground">{readableApiError(error, "User records could not be loaded.")}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
        : !data?.users.length ? <div className="rounded-lg border border-dashed px-4 py-10 text-center">
          <Users className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">{search || status !== "all" ? "No users match these filters" : "No signups yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{search || status !== "all" ? "Clear or change your search to see other project users." : "New accounts created through your integration will appear here."}</p>
          {(search || status !== "all") && <Button className="mt-3" variant="outline" size="sm" onClick={() => { setSearch(""); setSearchInput(""); setStatus("all"); setOffset(0); }}>Clear filters</Button>}
        </div>
        : <div className="divide-y rounded-lg border">
          {data.users.map((user) => {
            const verified = user.email_verified === true || user.email_verified === 1;
            return <div key={user.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-user-${user.id}`}>
              <div className="min-w-0">
                <p className="truncate font-medium" data-testid={`text-user-email-${user.id}`}>{user.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">{[user.first_name, user.last_name].filter(Boolean).join(" ") || "Name not provided"}<span aria-hidden="true"> · </span>Joined {new Date(user.created_at * 1000).toLocaleDateString()}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {verified ? <Badge variant="secondary" className="gap-1"><ShieldCheck className="h-3 w-3" />Email verified</Badge> : <>
                  <Badge variant="outline">Needs confirmation</Badge>
                  <Button size="sm" variant="outline" onClick={() => sendVerification.mutate(user.id)} disabled={sendVerification.isPending}>
                    <MailCheck className="mr-2 h-4 w-4" />{sendVerification.isPending ? "Sending…" : "Resend confirmation"}
                  </Button>
                </>}
              </div>
            </div>;
          })}
        </div>}
      {data && total > 0 && <div className="flex flex-col items-center justify-between gap-3 border-t pt-4 text-sm sm:flex-row">
        <p className="text-muted-foreground">Showing {offset + 1}–{end} of {total}</p>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</Button><Button variant="outline" size="sm" disabled={end >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</Button></div>
      </div>}
      <p className="text-xs text-muted-foreground">Resending sends an actual confirmation email to that unverified user. Cooldown or transport limits are reported as actionable errors. Email confirmation is not the same as proving website DNS ownership.</p>
    </CardContent>
  </Card>;
}
