import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Users, Share2, Mail, Plus, Trash2, Link2, Copy, CheckCircle2, Shield, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface Project {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
}

interface Collaborator {
  id: number;
  projectId: number;
  inviteEmail: string;
  role: string;
  status: string;
  invitedAt: string;
}

interface SharedProject {
  project: Project;
  collaborator: Collaborator;
}

function ShareLinkCard({ project }: { project: Project }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const link = `${window.location.origin}/dashboard`;

  const copy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast({ title: "Link copied!" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-white/5 rounded-lg border border-white/10 mt-3">
      <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <span className="text-xs text-muted-foreground flex-1 truncate font-mono">{link}</span>
      <Button variant="ghost" size="icon" className="w-7 h-7 flex-shrink-0" onClick={copy} data-testid={`button-copy-link-${project.id}`}>
        {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

export default function CollaborationPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [expandedProject, setExpandedProject] = useState<number | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: sharedProjects } = useQuery<SharedProject[]>({
    queryKey: ["/api/collaborate/shared"],
  });

  const { data: collaborators } = useQuery<Collaborator[]>({
    queryKey: ["/api/collaborate/project", expandedProject],
    queryFn: () => expandedProject ? fetch(`/api/collaborate/project/${expandedProject}`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!expandedProject,
  });

  const inviteMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/collaborate/invite", {
      projectId: parseInt(selectedProjectId),
      inviteEmail,
      role: inviteRole,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaborate/project", parseInt(selectedProjectId)] });
      setInviteOpen(false);
      setInviteEmail("");
      toast({ title: "Invite sent!", description: `${inviteEmail} has been invited as ${inviteRole}` });
    },
    onError: () => toast({ title: "Error", description: "Failed to send invite", variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/collaborate/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collaborate/project", expandedProject] });
      toast({ title: "Collaborator removed" });
    },
  });

  const openInvite = (projectId: number) => {
    setSelectedProjectId(String(projectId));
    setExpandedProject(projectId);
    setInviteOpen(true);
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Users className="w-8 h-8 text-yellow-400" />
            Collaboration
          </h1>
          <p className="text-muted-foreground mt-1">Invite team members to your projects and manage shared access</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-white/10 bg-white/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-400/10 flex items-center justify-center">
                  <Share2 className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{projects?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Your Projects</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-white/5">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-400/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{sharedProjects?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Shared with You</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="myprojects">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="myprojects" data-testid="tab-my-projects">My Projects</TabsTrigger>
            <TabsTrigger value="shared" data-testid="tab-shared">Shared with Me</TabsTrigger>
          </TabsList>

          <TabsContent value="myprojects" className="mt-6 space-y-4">
            {projects && projects.length > 0 ? projects.map(project => (
              <Card
                key={project.id}
                data-testid={`card-project-${project.id}`}
                className={`border transition-all duration-200 ${expandedProject === project.id ? "border-yellow-400/30 bg-yellow-400/5" : "border-white/10 bg-white/5"}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-yellow-400/20 to-orange-400/20 border border-yellow-400/20 flex items-center justify-center">
                        <Share2 className="w-4 h-4 text-yellow-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{project.name}</CardTitle>
                        {project.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{project.description}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`button-manage-${project.id}`}
                        onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
                        className="border-white/10 bg-white/5 text-xs gap-1"
                      >
                        <Users className="w-3.5 h-3.5" />
                        Team
                      </Button>
                      <Button
                        size="sm"
                        data-testid={`button-invite-${project.id}`}
                        onClick={() => openInvite(project.id)}
                        className="bg-yellow-500 hover:bg-yellow-400 text-black text-xs gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Invite
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {expandedProject === project.id && (
                  <CardContent className="border-t border-white/10 pt-4">
                    <ShareLinkCard project={project} />
                    <div className="mt-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Team Members</h4>
                      {collaborators && collaborators.length > 0 ? (
                        <div className="space-y-2">
                          {collaborators.map(c => (
                            <div key={c.id} data-testid={`row-collaborator-${c.id}`} className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/10">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                  <Mail className="w-4 h-4 text-muted-foreground" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{c.inviteEmail}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className={`text-xs ${c.role === "editor" ? "border-yellow-500/30 text-yellow-400" : "border-blue-500/30 text-blue-400"}`}>
                                      {c.role === "editor" ? <Shield className="w-2.5 h-2.5 mr-1" /> : <Eye className="w-2.5 h-2.5 mr-1" />}
                                      {c.role}
                                    </Badge>
                                    <Badge variant="outline" className={`text-xs ${c.status === "accepted" ? "border-green-500/30 text-green-400" : "border-orange-500/30 text-orange-400"}`}>
                                      {c.status}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8 text-red-400 hover:text-red-300"
                                data-testid={`button-remove-collaborator-${c.id}`}
                                onClick={() => removeMutation.mutate(c.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground py-3 text-center">No team members yet. Invite someone to collaborate!</p>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            )) : (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="py-12 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-1">No projects yet</h3>
                  <p className="text-muted-foreground text-sm mb-4">Create a project first to invite collaborators.</p>
                  <Button onClick={() => setLocation("/dashboard")} className="bg-yellow-500 hover:bg-yellow-400 text-black gap-2">
                    Go to Dashboard
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="shared" className="mt-6 space-y-4">
            {sharedProjects && sharedProjects.length > 0 ? sharedProjects.map(({ project, collaborator }) => (
              <Card key={project.id} data-testid={`card-shared-${project.id}`} className="border-white/10 bg-white/5">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-400/10 border border-blue-400/20 flex items-center justify-center">
                        <Share2 className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <p className="font-semibold">{project.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={`text-xs ${collaborator.role === "editor" ? "border-yellow-500/30 text-yellow-400" : "border-blue-500/30 text-blue-400"}`}>
                            {collaborator.role}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${collaborator.status === "accepted" ? "border-green-500/30 text-green-400" : "border-orange-500/30 text-orange-400"}`}>
                            {collaborator.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/chat`)}
                      className="border-white/10 bg-white/5 text-xs gap-1"
                      data-testid={`button-open-shared-${project.id}`}
                    >
                      Open Project
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )) : (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="py-12 text-center">
                  <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold mb-1">No shared projects</h3>
                  <p className="text-muted-foreground text-sm">When someone invites you to their project, it will appear here.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="border-white/10 bg-zinc-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email Address</Label>
              <Input
                data-testid="input-invite-email"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="bg-white/5 border-white/10 mt-1"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger data-testid="select-role" className="bg-white/5 border-white/10 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4" /> Viewer — can view conversations
                    </div>
                  </SelectItem>
                  <SelectItem value="editor">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" /> Editor — can view and contribute
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Card className="border-yellow-500/20 bg-yellow-500/5">
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">
                  The invited person can access this project by logging into Afro AI with <span className="text-yellow-400">{inviteEmail || "their email"}</span>. They'll see the project under "Shared with Me".
                </p>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              data-testid="button-send-invite"
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending || !inviteEmail.trim()}
              className="bg-yellow-500 hover:bg-yellow-400 text-black gap-2"
            >
              <Mail className="w-4 h-4" />
              {inviteMutation.isPending ? "Sending..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
