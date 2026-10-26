import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  ArrowLeft,
  Plus,
  Search,
  Shield,
  Trash2,
  FileText,
  Eye,
  Upload,
  UserPlus,
  Globe,
} from "lucide-react";
import {
  TEAM_ROLES,
  TEAM_TIERS,
  AFRICAN_COUNTRIES,
  getRoleLabel,
  getCountryName,
  getCountryFlag,
} from "@shared/team-constants";

interface TeamMemberRow {
  id: number;
  userId: string;
  country: string;
  role: string;
  tier: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  photoUrl: string | null;
  idDocumentUrl: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface UserSearchResult {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export default function TeamManagementPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const isFounder = !!user && (user as any)?.email === "kayondoabass@gmail.com";

  // Founder gate
  if (!authLoading && !isFounder) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>This area is for the founder only.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} data-testid="button-go-home">Go home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data: members, isLoading } = useQuery<TeamMemberRow[]>({
    queryKey: ["/api/admin/team", selectedCountry],
    queryFn: async () => {
      const url = selectedCountry ? `/api/admin/team?country=${selectedCountry}` : "/api/admin/team";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load team");
      return res.json();
    },
    enabled: !authLoading && isFounder,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/team/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/team"] });
      toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/team/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/team"] });
      toast({ title: "Team member removed" });
      setConfirmDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message, variant: "destructive" }),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, TeamMemberRow[]>();
    (members || []).forEach(m => {
      const list = map.get(m.country) || [];
      list.push(m);
      map.set(m.country, list);
    });
    return map;
  }, [members]);

  const countriesWithMembers = AFRICAN_COUNTRIES.filter(c => grouped.has(c.code));
  const visibleCountries = selectedCountry
    ? AFRICAN_COUNTRIES.filter(c => c.code === selectedCountry)
    : countriesWithMembers;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/40 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/founder")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" /> Founder Dashboard
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Team Management
            </h1>
            <p className="text-xs text-muted-foreground">Promote existing clients into staff roles, country by country.</p>
          </div>
          <Button onClick={() => setAddOpen(true)} data-testid="button-add-team-member">
            <UserPlus className="w-4 h-4 mr-2" /> Add team member
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Country filter */}
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe className="w-4 h-4 text-muted-foreground" /> Filter by country
            </div>
            <Select value={selectedCountry || "all"} onValueChange={v => setSelectedCountry(v === "all" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-72" data-testid="select-country-filter">
                <SelectValue placeholder="All countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {AFRICAN_COUNTRIES.map(c => (
                  <SelectItem key={c.code} value={c.code} data-testid={`option-country-${c.code}`}>
                    {c.flag} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground sm:ml-auto">
              {(members || []).length} total member{(members || []).length === 1 ? "" : "s"}
            </div>
          </CardContent>
        </Card>

        {/* Members grouped by country */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
          </div>
        ) : visibleCountries.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No team members yet</p>
              <p className="text-sm mt-1">Click <em>Add team member</em> above to start building your team.</p>
            </CardContent>
          </Card>
        ) : (
          visibleCountries.map(country => (
            <div key={country.code}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{country.flag}</span>
                <h2 className="text-lg font-semibold">{country.name}</h2>
                <Badge variant="secondary">{(grouped.get(country.code) || []).length}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(grouped.get(country.code) || []).map(m => (
                  <MemberCard
                    key={m.id}
                    member={m}
                    onUpdate={(patch) => updateMut.mutate({ id: m.id, patch })}
                    onDelete={() => setConfirmDeleteId(m.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <AddTeamMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/team"] });
          setAddOpen(false);
        }}
      />

      <AlertDialog open={confirmDeleteId !== null} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this team member?</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose any staff access. Their original client account stays intact. This also deletes their photo and ID document from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => confirmDeleteId && deleteMut.mutate(confirmDeleteId)}
              data-testid="button-confirm-delete"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Member card
// ─────────────────────────────────────────────────────────────────────────
function MemberCard({
  member,
  onUpdate,
  onDelete,
}: {
  member: TeamMemberRow;
  onUpdate: (patch: any) => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const initials = (member.name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  const viewIdDoc = async () => {
    try {
      // The endpoint streams the file directly (PDF/image), gated by founder + HR-same-country.
      const res = await fetch(`/api/admin/team/${member.id}/id-document`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Cannot view document" }));
        throw new Error(err.error || "Cannot view document");
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      // Free memory once the new tab has loaded.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e: any) {
      toast({ title: "Cannot view ID", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card className={member.status !== "active" ? "opacity-60" : ""} data-testid={`card-team-member-${member.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            {member.photoUrl ? <AvatarImage src={member.photoUrl} alt={member.name} /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate" data-testid={`text-name-${member.id}`}>{member.name}</div>
            <div className="text-xs text-muted-foreground truncate">{member.email}</div>
            {member.phone && <div className="text-xs text-muted-foreground truncate">{member.phone}</div>}
          </div>
          {member.status !== "active" && (
            <Badge variant="outline" className="text-xs">{member.status}</Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={member.role} onValueChange={(v) => onUpdate({ role: v })}>
              <SelectTrigger className="h-8 text-xs" data-testid={`select-role-${member.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Access</Label>
            <Select value={member.tier} onValueChange={(v) => onUpdate({ tier: v })}>
              <SelectTrigger className="h-8 text-xs" data-testid={`select-tier-${member.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_TIERS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(member.city || member.address) && (
          <div className="text-xs text-muted-foreground">
            {[member.city, member.address].filter(Boolean).join(" — ")}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {member.idDocumentUrl ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={viewIdDoc} data-testid={`button-view-id-${member.id}`}>
              <FileText className="w-3 h-3 mr-1" /> View ID
            </Button>
          ) : (
            <Badge variant="outline" className="text-[10px] h-6">No ID on file</Badge>
          )}
          <Select
            value={member.status}
            onValueChange={(v) => onUpdate({ status: v })}
          >
            <SelectTrigger className="h-7 text-xs w-28" data-testid={`select-status-${member.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 ml-auto"
            onClick={onDelete}
            data-testid={`button-delete-${member.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Add dialog (country-first flow)
// ─────────────────────────────────────────────────────────────────────────
function AddTeamMemberDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [country, setCountry] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [picked, setPicked] = useState<UserSearchResult | null>(null);
  const [form, setForm] = useState({
    role: "manager",
    tier: "read_only",
    name: "",
    email: "",
    phone: "",
    city: "",
    address: "",
    notes: "",
  });
  const photoRef = useRef<HTMLInputElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep(1);
    setCountry("");
    setSearchQ("");
    setPicked(null);
    setForm({ role: "manager", tier: "read_only", name: "", email: "", phone: "", city: "", address: "", notes: "" });
    if (photoRef.current) photoRef.current.value = "";
    if (idRef.current) idRef.current.value = "";
  };

  const closeAll = (val: boolean) => {
    onOpenChange(val);
    if (!val) setTimeout(reset, 200);
  };

  const { data: searchResults } = useQuery<UserSearchResult[]>({
    queryKey: ["/api/admin/team/search-users", searchQ],
    queryFn: async () => {
      if (searchQ.trim().length < 2) return [];
      const res = await fetch(`/api/admin/team/search-users?q=${encodeURIComponent(searchQ.trim())}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: step === 2 && searchQ.trim().length >= 2,
  });

  const submit = async () => {
    if (!country || !picked || !form.name || !form.email || !form.role || !form.tier) {
      toast({ title: "Please complete all required fields", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("country", country);
      fd.append("userId", picked.id);
      fd.append("role", form.role);
      fd.append("tier", form.tier);
      fd.append("name", form.name);
      fd.append("email", form.email);
      if (form.phone) fd.append("phone", form.phone);
      if (form.city) fd.append("city", form.city);
      if (form.address) fd.append("address", form.address);
      if (form.notes) fd.append("notes", form.notes);
      if (photoRef.current?.files?.[0]) fd.append("photo", photoRef.current.files[0]);
      if (idRef.current?.files?.[0]) fd.append("idDocument", idRef.current.files[0]);

      const res = await fetch("/api/admin/team", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      toast({ title: "Team member added" });
      onSuccess();
      reset();
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={closeAll}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add team member — Step {step} of 3</DialogTitle>
          <DialogDescription>
            {step === 1 && "First, pick the country this person will work in."}
            {step === 2 && "Now pick the existing client to promote into a staff role."}
            {step === 3 && "Finally, set their role, access level, and personal details."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <Label>Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger data-testid="select-add-country">
                <SelectValue placeholder="Choose a country" />
              </SelectTrigger>
              <SelectContent>
                {AFRICAN_COUNTRIES.map(c => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button onClick={() => setStep(2)} disabled={!country} data-testid="button-step1-next">Next</Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>Search existing clients</Label>
              <div className="relative mt-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Type a name or email…"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-users"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
              {(searchResults || []).length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  {searchQ.trim().length < 2 ? "Type at least 2 characters" : "No clients matched"}
                </div>
              ) : (
                searchResults!.map(u => {
                  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        setPicked(u);
                        setForm(f => ({ ...f, name: fullName, email: u.email || "" }));
                      }}
                      className={`w-full text-left p-3 flex items-center gap-3 hover:bg-muted/50 ${picked?.id === u.id ? "bg-primary/10" : ""}`}
                      data-testid={`button-pick-user-${u.id}`}
                    >
                      <Avatar className="h-8 w-8"><AvatarFallback>{(fullName[0] || "?").toUpperCase()}</AvatarFallback></Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{fullName}</div>
                        <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      </div>
                      {picked?.id === u.id && <Badge variant="secondary">Selected</Badge>}
                    </button>
                  );
                })
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)} data-testid="button-step2-back">Back</Button>
              <Button onClick={() => setStep(3)} disabled={!picked} data-testid="button-step2-next">Next</Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger data-testid="select-add-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEAM_ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Access tier</Label>
                <Select value={form.tier} onValueChange={v => setForm(f => ({ ...f, tier: v }))}>
                  <SelectTrigger data-testid="select-add-tier"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEAM_TIERS.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="font-medium">{t.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">{t.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Full name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-add-name" />
              </div>
              <div>
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} data-testid="input-add-email" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} data-testid="input-add-phone" />
              </div>
              <div>
                <Label>City</Label>
                <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} data-testid="input-add-city" />
              </div>
              <div className="col-span-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} data-testid="input-add-address" />
              </div>
              <div>
                <Label>Photo (JPG/PNG/WEBP, ≤5MB)</Label>
                <Input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp" data-testid="input-add-photo" />
              </div>
              <div>
                <Label>ID document (PDF/JPG/PNG, ≤5MB)</Label>
                <Input ref={idRef} type="file" accept="image/png,image/jpeg,application/pdf" data-testid="input-add-id" />
                <p className="text-[11px] text-muted-foreground mt-1">
                  <Shield className="w-3 h-3 inline mr-1" /> Only founders, HR & Compliance can view this.
                </p>
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} data-testid="input-add-notes" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting} data-testid="button-step3-back">Back</Button>
              <Button onClick={submit} disabled={submitting} data-testid="button-submit-team">
                {submitting ? "Saving…" : "Add to team"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
