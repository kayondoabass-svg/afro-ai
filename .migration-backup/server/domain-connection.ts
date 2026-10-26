type DnsLookup = {
  resolveCname(name: string): Promise<string[]>;
  resolve4(name: string): Promise<string[]>;
  resolve6(name: string): Promise<string[]>;
};
export async function verifyAppDomain(domain: string, dns: DnsLookup, target = "afroaigroup.com") {
  const canonical = (name: string) => name.toLowerCase().replace(/\.$/, "");
  const cnames = await dns.resolveCname(domain).catch(() => []);
  if (cnames.some(name => canonical(name) === canonical(target))) return true;
  // Flattened apex records must actually reach our host, not just have any A record.
  const [a, aaaa, targetA, targetAAAA] = await Promise.all([
    dns.resolve4(domain).catch((): string[] => []), dns.resolve6(domain).catch((): string[] => []),
    dns.resolve4(target).catch((): string[] => []), dns.resolve6(target).catch((): string[] => []),
  ]);
  return a.some(ip => targetA.includes(ip)) || aaaa.some(ip => targetAAAA.includes(ip));
}