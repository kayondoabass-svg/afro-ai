import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAppHandoff } from "@/lib/app-handoff";

export function AppHandoffContext({ prefilledFields }: { prefilledFields: string[] }) {
  const context = useAppHandoff();
  if (!context.hasContext) return null;
  return (
    <Card className="border-primary/25 bg-primary/5 mb-6" data-testid="card-app-handoff-context">
      <CardContent className="p-4">
        {context.isLoading ? (
          <div aria-label="Checking selected app ownership" className="space-y-2">
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-4 w-72" />
          </div>
        ) : context.isError ? (
          <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>We could not verify the selected app and project. No setup has been started.</p>
            <Button variant="outline" size="sm" onClick={() => void context.retry()}>Try again</Button>
          </div>
        ) : !context.valid ? (
          <p role="alert" className="text-sm text-muted-foreground">
            The selected app and project could not be confirmed in your account. No setup has been started.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-semibold">Setup context · {context.project?.name || context.app?.title}</p>
            {context.hostname && <p className="text-sm text-muted-foreground">Selected website: {context.hostname}</p>}
            <p className="text-xs text-muted-foreground">
              {prefilledFields.length
                ? `Prefilled: ${prefilledFields.join(", ")}. Review before saving.`
                : "No setup fields are available on this screen; nothing has been installed or charged."}
              {" "}Nothing is installed, purchased, or charged automatically.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
