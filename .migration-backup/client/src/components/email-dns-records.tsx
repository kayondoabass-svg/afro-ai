import { parseDnsInstructions } from "@shared/email-dns-instructions";
import { Button } from "@/components/ui/button";

export function EmailDnsRecords({ domain, onCopy }: {
  domain: { dkimToken: string | null; spfRecord: string | null; dmarcRecord: string | null };
  onCopy: (value: string, label: string) => void;
}) {
  const groups = [parseDnsInstructions(domain.dkimToken, "dkim"), parseDnsInstructions(domain.spfRecord, "spf"), parseDnsInstructions(domain.dmarcRecord, "dmarc")];
  const records = groups.flatMap(group => group.records), unparsed = groups.flatMap(group => group.unparsed);
  return <div className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3 text-xs" data-testid="email-dns-records">
    <p className="font-semibold">Add these records at your DNS provider</p>
    <p className="text-muted-foreground">Copy Name and Value separately. Keep CNAME records DNS-only. Do not replace your mailbox MX records or existing SPF/DMARC policies; merge compatible SPF mechanisms rather than creating a second SPF record.</p>
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead><tr><th className="p-2">Type</th><th className="p-2">Name</th><th className="p-2">Value</th><th className="p-2">MX priority</th></tr></thead>
        <tbody>{records.map((record, index) => <tr key={index} className="border-t align-top">
          <td className="p-2 font-mono">{record.type}</td>
          <td className="p-2"><code className="break-all">{record.name}</code><Button variant="ghost" size="sm" className="block" onClick={() => onCopy(record.name, "DNS name")}>Copy name</Button></td>
          <td className="p-2"><code className="break-all">{record.value}</code><Button variant="ghost" size="sm" className="block" onClick={() => onCopy(record.value, "DNS value")}>Copy value</Button></td>
          <td className="p-2">{record.priority ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {unparsed.length > 0 && <div><p className="font-semibold">Additional instructions (not automatically parsed)</p><pre className="whitespace-pre-wrap break-all">{unparsed.join("\n")}</pre></div>}
    {!records.length && !unparsed.length && <p role="alert">No DNS instructions are available. Contact support before changing DNS; this domain is not ready to verify.</p>}
    <p className="text-muted-foreground">After saving the records, select Verify. DNS propagation may take up to 72 hours. Pending is not verified.</p>
  </div>;
}
