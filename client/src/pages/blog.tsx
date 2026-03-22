import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { BlogPost } from "@shared/schema";
import {
  BookOpen, Plus, Pencil, Trash2, Globe, FileText, Eye, EyeOff,
  Calendar, Search, LayoutGrid, List
} from "lucide-react";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export default function BlogPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState({ title: "", content: "", excerpt: "", coverImage: "", status: "draft" });

  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({ queryKey: ["/api/blog"] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) return apiRequest("PUT", `/api/blog/${editing.id}`, form);
      return apiRequest("POST", "/api/blog", form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blog"] });
      setDialogOpen(false);
      setEditing(null);
      setForm({ title: "", content: "", excerpt: "", coverImage: "", status: "draft" });
      toast({ title: editing ? "Post updated!" : "Post created!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/blog/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blog"] });
      setDeleteId(null);
      toast({ title: "Post deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ title: "", content: "", excerpt: "", coverImage: "", status: "draft" });
    setDialogOpen(true);
  };

  const openEdit = (post: BlogPost) => {
    setEditing(post);
    setForm({ title: post.title, content: post.content, excerpt: post.excerpt || "", coverImage: post.coverImage || "", status: post.status });
    setDialogOpen(true);
  };

  const filtered = posts.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || (p.excerpt || "").toLowerCase().includes(search.toLowerCase()));
  const published = posts.filter(p => p.status === "published").length;
  const drafts = posts.filter(p => p.status === "draft").length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b p-4 md:p-6 bg-background">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold">Blog & Content</h1>
            </div>
            <p className="text-sm text-muted-foreground">Write, manage, and publish your blog posts.</p>
          </div>
          <Button onClick={openCreate} className="gap-2" data-testid="button-create-post">
            <Plus className="w-4 h-4" />
            New Post
          </Button>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold">{posts.length}</span>
            <span className="text-muted-foreground">Total</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Globe className="w-4 h-4 text-green-500" />
            <span className="font-semibold">{published}</span>
            <span className="text-muted-foreground">Published</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <EyeOff className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold">{drafts}</span>
            <span className="text-muted-foreground">Drafts</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b bg-background/50">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search posts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-sm" data-testid="input-search-posts" />
        </div>
        <div className="flex gap-1 ml-auto">
          <Button variant={view === "grid" ? "secondary" : "ghost"} size="sm" onClick={() => setView("grid")} className="w-8 h-8 p-0" data-testid="button-view-grid">
            <LayoutGrid className="w-3.5 h-3.5" />
          </Button>
          <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setView("list")} className="w-8 h-8 p-0" data-testid="button-view-list">
            <List className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {isLoading ? (
          <div className={`grid gap-4 ${view === "grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <BookOpen className="w-7 h-7 text-primary/60" />
            </div>
            <h3 className="font-semibold mb-1">{search ? "No posts found" : "No posts yet"}</h3>
            <p className="text-sm text-muted-foreground mb-4">{search ? "Try a different search term." : "Create your first blog post to get started."}</p>
            {!search && <Button onClick={openCreate} size="sm" className="gap-2"><Plus className="w-4 h-4" />Create Post</Button>}
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(post => (
              <Card key={post.id} data-testid={`card-post-${post.id}`} className="overflow-hidden hover:border-primary/40 transition-colors group">
                {post.coverImage && (
                  <div className="h-40 overflow-hidden bg-muted">
                    <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                )}
                {!post.coverImage && (
                  <div className="h-32 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-primary/30" />
                  </div>
                )}
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Badge variant={post.status === "published" ? "default" : "secondary"} className="text-xs capitalize">
                      {post.status === "published" ? <Globe className="w-2.5 h-2.5 mr-1" /> : <EyeOff className="w-2.5 h-2.5 mr-1" />}
                      {post.status}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-sm line-clamp-2 mb-1">{post.title}</h3>
                  {post.excerpt && <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{post.excerpt}</p>}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                    <Calendar className="w-3 h-3" />
                    {formatDate(post.createdAt)}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1" onClick={() => openEdit(post)} data-testid={`button-edit-post-${post.id}`}>
                      <Pencil className="w-3 h-3" />Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(post.id)} data-testid={`button-delete-post-${post.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(post => (
              <Card key={post.id} data-testid={`row-post-${post.id}`} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${post.status === "published" ? "bg-green-500/10" : "bg-muted"}`}>
                    {post.status === "published" ? <Globe className="w-4 h-4 text-green-500" /> : <FileText className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{post.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(post.createdAt)}</p>
                  </div>
                  <Badge variant={post.status === "published" ? "default" : "secondary"} className="capitalize text-xs hidden sm:inline-flex">{post.status}</Badge>
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(post)} data-testid={`button-edit-row-${post.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => setDeleteId(post.id)} data-testid={`button-delete-row-${post.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Post" : "New Blog Post"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Title *</Label>
              <Input placeholder="Your post title..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} data-testid="input-post-title" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Excerpt (short summary)</Label>
              <Input placeholder="A brief description shown in lists..." value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} data-testid="input-post-excerpt" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Cover Image URL</Label>
              <Input placeholder="https://example.com/image.jpg" value={form.coverImage} onChange={e => setForm(f => ({ ...f, coverImage: e.target.value }))} data-testid="input-cover-image" />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Content</Label>
              <Textarea
                placeholder="Write your full blog post content here..."
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                className="min-h-[240px] font-mono text-sm resize-y"
                data-testid="textarea-post-content"
              />
              <p className="text-xs text-muted-foreground mt-1">Tip: You can also use the AI chat to generate your blog content, then paste it here.</p>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger data-testid="select-post-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft"><span className="flex items-center gap-2"><EyeOff className="w-3.5 h-3.5" />Draft</span></SelectItem>
                  <SelectItem value="published"><span className="flex items-center gap-2"><Eye className="w-3.5 h-3.5" />Published</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1" data-testid="button-cancel-post">Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending} className="flex-1" data-testid="button-save-post">
                {saveMutation.isPending ? "Saving..." : editing ? "Update Post" : "Create Post"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Post?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete the post. This cannot be undone.</p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1" data-testid="button-cancel-delete">Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending} className="flex-1" data-testid="button-confirm-delete">
              {deleteMutation.isPending ? "Deleting..." : "Delete Post"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
