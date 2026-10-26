import { Facebook, Instagram } from "lucide-react";

const profiles = [
  { name: "Facebook", href: "https://www.facebook.com/afroaigroup", Icon: Facebook },
  { name: "Instagram", href: "https://www.instagram.com/afroaigroup/", Icon: Instagram },
];

export function SocialLinks() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {profiles.map(({ name, href, Icon }) => (
        <a
          key={name}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Afro AI on ${name} (opens in a new tab)`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{name}</span>
        </a>
      ))}
    </div>
  );
}