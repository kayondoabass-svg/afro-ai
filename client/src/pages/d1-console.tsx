import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Database, Play, RefreshCw, Table2, ChevronRight, RotateCcw, AlertCircle, Lock } from "lucide-react";

export default function D1ConsolePage() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const isFounder = (user as any)?.isFounder === true;
  const [sql, setSql] = useState("SELECT name FROM sqlite_master WHERE type='table';");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<{ results: any[]; meta: any } | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const { data: status } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/d1/status"],
    enabled: isFounder,
  });

  const { data: tablesData, isLoading: tablesLoading, refetch: refetchTables } = useQuery<{ tables: string[] }>({
    queryKey: ["/api/d1/tables"],
    enabled: isFounder && status?.configured === true,
  });

  const { data: tableInfo } = useQuery<{ columns: any[] }>({
    queryKey: ["/api/d1/tables", selectedTable, "info"],
    queryFn: () => fetch(`/api/d1/tables/${selectedTable}/info`, { credentials: "include" }).then(r => r.json()),
    enabled: isFounder && !!selectedTable,
  });

  const { data: tableRows, isLoading: rowsLoading } = useQuery<{ results: any[]; meta: any }>({
    queryKey: ["/api/d1/tables", selectedTable, "rows"],
    queryFn: () => fetch(`/api/d1/tables/${selectedTable}/rows?limit=50`, { credentials: "include" }).then(r => r.json()),
    enabled: isFounder && !!selectedTable,
  });

  const queryMutation = useMutation({
    mutationFn: (sqlStr: string) =>
      apiRequest("POST", "/api/d1/query", { sql: sqlStr }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.message) {
        setQueryError(data.message);
        setQueryResult(null);
      } else {
        setQueryResult(data);
        setQueryError(null);
        refetchTables();
        queryClient.invalidateQueries({ queryKey: ["/api/d1/tables"] });
      }
    },
    onError: (e: any) => {
      setQueryError(e.message);
      setQueryResult(null);
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/d1/sync").then(r => r.json()),
    onSuccess: (data) => {
      if (data.message) {
        toast({ title: "Sync failed", description: data.message, variant: "destructive" });
      } else {
        toast({ title: "Sync complete", description: `${data.synced} users synced to D1` });
        refetchTables();
      }
    },
    onError: (e: any) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const tables = tablesData?.tables || [];

  const runQuery = () => {
    if (!sql.trim()) return;
    setQueryError(null);
    setQueryResult(null);
    queryMutation.mutate(sql.trim());
  };

  const displayRows = selectedTable ? tableRows?.results : queryResult?.results;
  const displayColumns = selectedTable
    ? tableInfo?.columns?.map((c: any) => c.name) || []
    : queryResult?.results?.length ? Object.keys(queryResult.results[0]) : [];

  if (!authLoading && !isFounder) {
    return (
      <div className="p-6 max-w-4xl mx-auto" data-testid="d1-access-denied">
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Lock className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">This tool isn't available on your account</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              The D1 Database console is an internal administration tool reserved for the platform team.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Database className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">D1 Console</h1>
        </div>
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
            <p className="font-medium">D1 not configured</p>
            <p className="text-sm text-muted-foreground mt-1">Add CLOUDFLARE_D1_TOKEN and CLOUDFLARE_D1_DATABASE_ID to your secrets.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" /> D1 Console
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cloudflare D1 — production-db · Query, browse, and sync your edge database.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchTables()} data-testid="button-refresh-tables">
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} data-testid="button-sync-d1">
            <RotateCcw className="w-4 h-4 mr-1" />
            {syncMutation.isPending ? "Syncing…" : "Sync from PostgreSQL"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tables sidebar */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Table2 className="w-4 h-4" /> Tables
              <Badge variant="secondary">{tables.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {tablesLoading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : tables.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6 px-3">No tables yet. Create one using the SQL editor.</p>
            ) : (
              <div className="py-1">
                {tables.map(t => (
                  <button
                    key={t}
                    onClick={() => { setSelectedTable(t); setQueryResult(null); setQueryError(null); }}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-muted/50 transition-colors ${selectedTable === t ? "bg-muted font-medium text-primary" : ""}`}
                    data-testid={`button-table-${t}`}
                  >
                    <span className="truncate font-mono">{t}</span>
                    <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-50" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main panel */}
        <div className="lg:col-span-3 space-y-4">
          {/* SQL Editor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">SQL Editor</CardTitle>
              <CardDescription>Write and run SQL queries against your D1 database.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={sql}
                onChange={e => setSql(e.target.value)}
                className="font-mono text-sm min-h-28 resize-y"
                placeholder="SELECT * FROM my_table LIMIT 10;"
                data-testid="textarea-sql"
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runQuery(); }}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Ctrl+Enter to run</p>
                <Button onClick={runQuery} disabled={queryMutation.isPending} size="sm" data-testid="button-run-query">
                  <Play className="w-4 h-4 mr-1" />
                  {queryMutation.isPending ? "Running…" : "Run Query"}
                </Button>
              </div>
              {queryError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex gap-2" data-testid="text-query-error">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {queryError}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results / Table viewer */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {selectedTable ? (
                  <>
                    <Table2 className="w-4 h-4" />
                    <span className="font-mono">{selectedTable}</span>
                    {tableInfo?.columns && <Badge variant="secondary">{tableInfo.columns.length} cols</Badge>}
                    {tableRows?.meta?.rows_read !== undefined && <Badge variant="outline">{tableRows.results.length} rows</Badge>}
                    <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => setSelectedTable(null)}>Clear</Button>
                  </>
                ) : (
                  <>Results {queryResult && <Badge variant="secondary">{queryResult.results.length} rows</Badge>}</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(rowsLoading) ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : !displayRows || displayRows.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Database className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">{selectedTable ? "Table is empty" : "Run a query to see results"}</p>
                </div>
              ) : (
                <div className="overflow-auto rounded border max-h-96">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        {displayColumns.map(col => (
                          <th key={col} className="text-left px-3 py-2 border-b font-semibold whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-d1-${i}`}>
                          {displayColumns.map(col => (
                            <td key={col} className="px-3 py-1.5 max-w-48 truncate text-muted-foreground" title={String(row[col] ?? "")}>
                              {row[col] === null ? <span className="text-muted-foreground/40 italic">null</span> : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
