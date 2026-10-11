export interface DnsInstruction { type: string; name: string; value: string; priority?: number; }
export function parseDnsInstructions(text: string | null, kind: "dkim" | "spf" | "dmarc"): { records: DnsInstruction[]; unparsed: string[] } {
  const records: DnsInstruction[] = [], unparsed: string[] = [];
  for (const line of (text || "").split("\n").map(v => v.trim()).filter(Boolean)) {
    const match = line.match(/^(?:(TXT|CNAME|MX)\s+)?([^\s]+)\s*→\s*(.+?)(?:\s+\(priority\s+(\d+)\))?$/i);
    if (match && (match[1] || (kind === "dkim" && match[2].includes("._domainkey.")))) {
      records.push({type:(match[1] || "CNAME").toUpperCase(), name:match[2], value:match[3], ...(match[4] !== undefined ? {priority:Number(match[4])} : {})});
    } else if (kind === "spf" && /^v=spf1\b/i.test(line)) {
      records.push({type:"TXT", name:"@", value:line});
    } else if (kind === "dmarc" && /^v=DMARC1\b/i.test(line)) {
      records.push({type:"TXT", name:"_dmarc", value:line});
    } else unparsed.push(line);
  }
  return {records,unparsed};
}
