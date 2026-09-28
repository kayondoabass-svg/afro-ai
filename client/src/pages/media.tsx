import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Download, Image as ImageIcon, Loader2, RefreshCw, Sparkles, Video } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type MediaKind = "image" | "video";
type MediaStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
interface MediaJob {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  prompt: string;
  createdAt: string;
  error?: string | null;
  assetUrl?: string | null;
}

const JOBS_URL = "/api/media/jobs";
const PROMPT_LIMIT = 1000;

function isActive(status: MediaStatus) {
  return status === "queued" || status === "running";
}

function isMediaJob(value: unknown): value is MediaJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<MediaJob>;
  return typeof job.id === "string" && (job.kind === "image" || job.kind === "video") &&
    ["queued", "running", "succeeded", "failed", "cancelled"].includes(job.status || "") &&
    typeof job.prompt === "string" && typeof job.createdAt === "string";
}

async function readJob(response: Response): Promise<MediaJob> {
  const data: unknown = await response.json();
  if (!isMediaJob(data)) throw new Error("Invalid media job response");
  return data;
}

async function getJobs(): Promise<MediaJob[]> {
  const response = await apiRequest("GET", JOBS_URL);
  const data: unknown = await response.json();
  // Support both a bare list and the paginated-list envelope used by workers.
  const jobs = Array.isArray(data) ? data : (data && typeof data === "object" ? (data as { jobs?: unknown }).jobs : undefined);
  if (!Array.isArray(jobs) || !jobs.every(isMediaJob)) throw new Error("Invalid media jobs response");
  return jobs;
}

function messageFromError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const raw = error.message.replace(/^\d{3}:\s*/, "");
  if (/^\s*<!doctype html/i.test(raw) || /^\s*<html/i.test(raw) || /^(404|501):/.test(error.message)) return fallback;
  try {
    const body = JSON.parse(raw);
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  } catch { /* Plain-text API error */ }
  return raw || fallback;
}

function JobAsset({ job }: { job: MediaJob }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (job.status !== "succeeded") return;
    let disposed = false;
    let objectUrl: string | null = null;
    setError("");
    setUrl(null);
    // Fetch through the authenticated own-job endpoint rather than trusting an
    // arbitrary assetUrl from the job payload (which may be private/expiring).
    apiRequest("GET", `${JOBS_URL}/${encodeURIComponent(job.id)}/asset`)
      .then((res) => res.blob())
      .then((blob) => {
        if (!blob.type.startsWith(job.kind === "image" ? "image/" : "video/")) {
          throw new Error(t("media.assetError"));
        }
        if (!disposed) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch((reason) => {
        if (!disposed) setError(messageFromError(reason, t("media.assetError")));
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [job.id, job.kind, job.status, t]);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!url) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("media.loading")}</div>;

  return (
    <div className="space-y-3">
      {job.kind === "image"
        ? <img src={url} alt={job.prompt} className="w-full max-h-96 object-contain rounded-lg bg-muted" />
        : <video src={url} controls preload="metadata" className="w-full max-h-96 rounded-lg bg-muted" aria-label={job.prompt} />}
      <Button variant="outline" size="sm" asChild>
        <a href={url} download={`afro-ai-${job.id}.${job.kind === "image" ? "png" : "mp4"}`}>
          <Download className="h-4 w-4 mr-2" />{t("media.download")}
        </a>
      </Button>
    </div>
  );
}

function JobCard({ listedJob }: { listedJob: MediaJob }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const active = isActive(listedJob.status);
  const { data: latestJob, error: statusError } = useQuery({
    queryKey: [JOBS_URL, listedJob.id],
    queryFn: async () => readJob(await apiRequest("GET", `${JOBS_URL}/${encodeURIComponent(listedJob.id)}`)),
    enabled: active,
    refetchInterval: (query) => isActive((query.state.data as MediaJob | undefined)?.status ?? listedJob.status) ? 3000 : false,
    refetchOnMount: "always",
    retry: false,
  });
  const job = latestJob && (active || latestJob.status === listedJob.status) ? latestJob : listedJob;
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !isActive(job.status)) {
      queryClient.invalidateQueries({ queryKey: [JOBS_URL], exact: true });
    }
    wasActive.current = isActive(job.status);
  }, [job.status]);
  const cancelMutation = useMutation({
    mutationFn: () => apiRequest("POST", `${JOBS_URL}/${encodeURIComponent(job.id)}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [JOBS_URL] });
      toast({ title: t("media.cancelledMessage") });
    },
    onError: (error) => toast({ title: t("media.error"), description: messageFromError(error, t("media.unavailable")), variant: "destructive" }),
  });

  const created = new Date(job.createdAt);
  return (
    <Card data-testid={`media-job-${job.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {job.kind === "image" ? <ImageIcon className="h-4 w-4 text-primary" /> : <Video className="h-4 w-4 text-primary" />}
            {t(`media.${job.kind}`)}
          </CardTitle>
          <Badge variant={job.status === "failed" ? "destructive" : job.status === "succeeded" ? "default" : "secondary"} aria-label={t(`media.${job.status}`)}>
            {isActive(job.status) && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {t(`media.${job.status}`)}
          </Badge>
        </div>
        <CardDescription>{!Number.isNaN(created.getTime()) && created.toLocaleString()}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm whitespace-pre-wrap break-words">{job.prompt}</p>
        {job.status === "succeeded" && <JobAsset job={job} />}
        {isActive(job.status) && (
          <div className="space-y-2">
            <div role="status" className="text-sm text-muted-foreground">{t(job.status === "queued" ? "media.waiting" : "media.processing")}</div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>
            <Button variant="outline" size="sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>{t("media.cancelJob")}</Button>
          </div>
        )}
        {job.status === "failed" && <p role="alert" className="flex gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{job.error || t("media.error")}</p>}
        {statusError && isActive(job.status) && <p role="alert" className="text-sm text-destructive">{messageFromError(statusError, t("media.unavailable"))}</p>}
      </CardContent>
    </Card>
  );
}

export default function MediaPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<MediaKind>("image");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(3);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const pendingKey = useRef<string | null>(null);

  const jobsQuery = useQuery({
    queryKey: [JOBS_URL],
    queryFn: getJobs,
    refetchInterval: (query) => (query.state.data as MediaJob[] | undefined)?.some((job) => isActive(job.status)) ? 5000 : false,
    retry: false,
  });
  const createMutation = useMutation({
    mutationFn: async ({ selectedKind, text, seconds, key }: { selectedKind: MediaKind; text: string; seconds: number; key: string }) =>
      readJob(await apiRequest("POST", JOBS_URL, {
        kind: selectedKind, prompt: text, ...(selectedKind === "video" ? { duration: seconds } : {}), idempotencyKey: key,
      })),
    onSuccess: () => {
      pendingKey.current = null;
      setPrompt("");
      setSubmitError("");
      queryClient.invalidateQueries({ queryKey: [JOBS_URL] });
      toast({ title: t("media.created") });
    },
    onError: (error) => setSubmitError(messageFromError(error, t("media.unavailable"))),
  });

  function confirmGeneration() {
    const text = prompt.trim();
    if (!text || text.length > PROMPT_LIMIT || createMutation.isPending) return;
    setSubmitError("");
    setConfirmOpen(false);
    if (!pendingKey.current) pendingKey.current = crypto.randomUUID();
    createMutation.mutate({ selectedKind: kind, text, seconds: duration, key: pendingKey.current });
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Sparkles className="h-6 w-6 text-primary" />{t("media.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("media.subtitle")}</p>
      </header>
      <Card>
        <CardHeader><CardTitle>{t("media.create")}</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>{t("media.kind")}</Label>
            <div className="flex gap-2">
              <Button type="button" variant={kind === "image" ? "default" : "outline"} aria-pressed={kind === "image"} onClick={() => { setKind("image"); pendingKey.current = null; }}><ImageIcon className="h-4 w-4 mr-2" />{t("media.image")}</Button>
              <Button type="button" variant={kind === "video" ? "default" : "outline"} aria-pressed={kind === "video"} onClick={() => { setKind("video"); pendingKey.current = null; }}><Video className="h-4 w-4 mr-2" />{t("media.video")}</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="media-prompt">{t("media.prompt")}</Label>
            <Textarea id="media-prompt" data-testid="media-prompt" rows={4} maxLength={PROMPT_LIMIT} value={prompt} placeholder={t("media.placeholder")} onChange={(event) => { setPrompt(event.target.value); pendingKey.current = null; }} />
            <p className="text-xs text-muted-foreground text-right">{t("media.promptLimit", { count: prompt.length })}</p>
          </div>
          {kind === "video" && (
            <div className="space-y-2">
              <Label htmlFor="media-duration">{t("media.duration")}</Label>
              <select id="media-duration" value={duration} onChange={(event) => { setDuration(Number(event.target.value)); pendingKey.current = null; }} className="flex h-10 w-full max-w-48 rounded-md border border-input bg-background px-3 py-2 text-sm">
                {[2, 3, 4, 5].map((seconds) => <option key={seconds} value={seconds}>{t("media.seconds", { count: seconds })}</option>)}
              </select>
            </div>
          )}
          {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}
          <Button disabled={!prompt.trim() || createMutation.isPending} onClick={() => setConfirmOpen(true)}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {createMutation.isPending ? t("media.generating") : t("media.generate", { kind: t(`media.${kind}`).toLowerCase() })}
          </Button>
        </CardContent>
      </Card>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("media.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("media.confirmDesc", { kind: t(`media.${kind}`).toLowerCase() })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("media.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmGeneration}>{t("media.confirmButton")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <section className="space-y-4">
        <div className="flex justify-between items-center gap-3">
          <h2 className="text-xl font-semibold">{t("media.jobs")}</h2>
          <Button variant="outline" size="sm" disabled={jobsQuery.isFetching} onClick={() => jobsQuery.refetch()} aria-label={t("media.refresh")}>
            <RefreshCw className={`h-4 w-4 mr-2 ${jobsQuery.isFetching ? "animate-spin" : ""}`} />{t("media.refresh")}
          </Button>
        </div>
        {jobsQuery.isLoading && <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>}
        {jobsQuery.isError && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{t("media.loadError")}: {messageFromError(jobsQuery.error, t("media.unavailable"))}</p>}
        {jobsQuery.data?.length === 0 && <p className="rounded-lg border p-8 text-center text-muted-foreground">{t("media.empty")}</p>}
        {!!jobsQuery.data?.length && <div className="grid gap-4 sm:grid-cols-2">{jobsQuery.data.map((job) => <JobCard key={job.id} listedJob={job} />)}</div>}
      </section>
    </div>
  );
}