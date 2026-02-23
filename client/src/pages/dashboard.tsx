import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import {
  Plus,
  Globe,
  Smartphone,
  MoreHorizontal,
  Folder,
  Clock,
  Trash2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import afroLogo from "@assets/IMG_5719_1771852498362.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useLocation } from "wouter";
import type { Project } from "@shared/schema";

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showNewProject, setShowNewProject] = useState(false);

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; type: string }) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowNewProject(false);
      toast({ title: t("dashboard.projectCreated"), description: t("dashboard.projectCreatedDesc") });
    },
    onError: () => {
      toast({ title: t("dashboard.error"), description: t("dashboard.createError"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: t("dashboard.projectDeleted") });
    },
  });

  const form = useForm({
    defaultValues: { name: "", description: "", type: "website" },
  });

  const onSubmit = (data: { name: string; description: string; type: string }) => {
    createMutation.mutate(data);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "mobile_app": return <Smartphone className="w-4 h-4" />;
      case "website": return <Globe className="w-4 h-4" />;
      default: return <Folder className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published": return "bg-green-500/10 text-green-500";
      case "in_progress": return "bg-primary/10 text-primary";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const handleOpenProject = (project: Project) => {
    navigate(`/chat?projectId=${project.id}&project=${encodeURIComponent(project.name)}&type=${encodeURIComponent(project.type)}&description=${encodeURIComponent(project.description || "")}`);
  };

  const firstName = user?.firstName || "Creator";

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="w-12 h-12">
              <AvatarImage src={user?.profileImageUrl || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {firstName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-welcome">
                {t("dashboard.welcome")} {firstName}
              </h1>
              <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
            </div>
          </div>
          <Button onClick={() => setShowNewProject(true)} data-testid="button-new-project">
            <Plus className="w-4 h-4" />
            {t("dashboard.newProject")}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Folder className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-projects">{projects?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("dashboard.totalProjects")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-md bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-published-projects">
                  {projects?.filter((p) => p.status === "published").length ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">{t("dashboard.published")}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <img src={afroLogo} alt="AI" className="w-7 h-7 object-contain" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-ai-chats">{t("dashboard.unlimited")}</p>
                <p className="text-xs text-muted-foreground">{t("dashboard.aiChats")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4" data-testid="text-projects-heading">{t("dashboard.yourProjects")}</h2>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6 space-y-4">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : projects && projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  className="hover-elevate group cursor-pointer"
                  onClick={() => handleOpenProject(project)}
                  data-testid={`card-project-${project.id}`}
                >
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                          {getTypeIcon(project.type)}
                        </div>
                        <h3 className="font-semibold truncate">{project.name}</h3>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ visibility: "visible" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(project.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t("dashboard.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {project.description || t("dashboard.noDescription")}
                    </p>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Badge variant="secondary" className={getStatusColor(project.status)}>
                        {project.status}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(project.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenProject(project);
                      }}
                      data-testid={`button-build-project-${project.id}`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Open & Build
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <img src={afroLogo} alt="Afro AI" className="w-10 h-10 object-contain" />
                </div>
                <h3 className="text-lg font-semibold">{t("dashboard.noProjects")}</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {t("dashboard.noProjectsDesc")}
                </p>
                <Button onClick={() => setShowNewProject(true)} data-testid="button-create-first">
                  <Plus className="w-4 h-4" />
                  {t("dashboard.createFirst")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.createTitle")}</DialogTitle>
            <DialogDescription>{t("dashboard.createDesc")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dashboard.projectName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("dashboard.projectNamePlaceholder")} {...field} data-testid="input-project-name" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dashboard.description")}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t("dashboard.descPlaceholder")} className="resize-none" {...field} data-testid="input-project-description" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dashboard.type")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-project-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="website">{t("dashboard.website")}</SelectItem>
                        <SelectItem value="mobile_app">{t("dashboard.mobileApp")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-project">
                {createMutation.isPending ? t("dashboard.creating") : t("dashboard.createProject")}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
