import { useParams, Link } from "wouter";
import { SEO_ARTICLES } from "@/data/seo-articles";
import { Badge } from "@/components/ui/badge";
import { Clock, ArrowLeft, ArrowRight, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-2xl font-bold mt-10 mb-4 text-white">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-lg font-bold mt-6 mb-3 text-white">{line.slice(4)}</h3>);
    } else if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(<p key={i} className="font-bold text-white my-3">{line.slice(2, -2)}</p>);
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={i} className="list-disc list-inside space-y-1.5 my-4 text-white/80 text-sm leading-relaxed">
          {items.map((item, j) => <li key={j}>{parseLine(item)}</li>)}
        </ul>
      );
      continue;
    } else if (line.startsWith("```")) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="bg-black/40 border border-white/10 rounded-xl p-4 my-4 overflow-x-auto text-sm text-green-400 font-mono">
          {codeLines.join("\n")}
        </pre>
      );
    } else if (line.startsWith("| ")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("| ")) {
        if (!lines[i].includes("---")) {
          rows.push(lines[i].split("|").slice(1, -1).map(c => c.trim()));
        }
        i++;
      }
      if (rows.length > 0) {
        elements.push(
          <div key={i} className="overflow-x-auto my-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {rows[0].map((h, j) => (
                    <th key={j} className="text-left px-4 py-2 bg-[#D4A017]/20 text-[#D4A017] font-semibold border border-white/10">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, ri) => (
                  <tr key={ri} className="border-b border-white/10 hover:bg-white/5">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2 text-white/80 border border-white/10">{parseLine(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    } else if (line.trim() === "") {
      // skip blank lines between elements
    } else {
      elements.push(<p key={i} className="text-white/75 leading-relaxed my-3 text-[15px]">{parseLine(line)}</p>);
    }
    i++;
  }
  return elements;
}

function parseLine(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|\[.*?\]\(.*?\)|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="bg-white/10 text-[#D4A017] px-1.5 py-0.5 rounded text-sm font-mono">{part.slice(1, -1)}</code>;
    }
    const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      return <a key={i} href={linkMatch[2]} className="text-[#D4A017] hover:underline" target={linkMatch[2].startsWith("http") ? "_blank" : undefined} rel="noreferrer">{linkMatch[1]}</a>;
    }
    return part;
  });
}

export default function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const article = SEO_ARTICLES.find(a => a.slug === slug);
  const currentIdx = SEO_ARTICLES.findIndex(a => a.slug === slug);
  const prev = currentIdx > 0 ? SEO_ARTICLES[currentIdx - 1] : null;
  const next = currentIdx < SEO_ARTICLES.length - 1 ? SEO_ARTICLES[currentIdx + 1] : null;

  if (!article) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center gap-4">
        <p className="text-white/50">Article not found.</p>
        <Link href="/articles" className="text-[#D4A017] hover:underline">← Back to articles</Link>
      </div>
    );
  }

  const share = () => {
    if (navigator.share) {
      navigator.share({ title: article.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied!", description: "Share this article with your network." });
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center gap-2">
          <img src={afroLogo} alt="Afro AI" className="h-8 w-8 object-contain" />
          <span className="font-bold text-lg text-[#D4A017]">Afro AI</span>
        </a>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/articles" className="text-white/70 hover:text-white transition-colors flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> All Articles
          </Link>
          <a href="/login" className="bg-[#D4A017] text-black font-semibold px-4 py-2 rounded-lg hover:bg-[#b8891a] transition-colors">Get Started</a>
        </div>
      </header>

      {/* Article */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Meta */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Badge className="bg-[#D4A017]/15 text-[#D4A017] border-[#D4A017]/20">{article.category}</Badge>
          <span className="text-white/40 text-sm flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{article.readTime}</span>
          <span className="text-white/40 text-sm">{article.publishedAt}</span>
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-4">{article.title}</h1>
        <p className="text-white/60 text-lg leading-relaxed mb-8 border-l-4 border-[#D4A017]/40 pl-4">{article.excerpt}</p>

        {/* Cover */}
        <div className="bg-gradient-to-br from-[#D4A017]/20 to-[#D4A017]/5 rounded-2xl p-12 text-center text-7xl mb-10 border border-[#D4A017]/20">
          {article.coverEmoji}
        </div>

        {/* Content */}
        <div className="prose-custom">
          {renderMarkdown(article.content)}
        </div>

        {/* Share */}
        <div className="mt-12 pt-8 border-t border-white/10 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="font-semibold">Found this useful?</p>
            <p className="text-white/50 text-sm">Share it with a fellow entrepreneur.</p>
          </div>
          <button
            onClick={share}
            className="flex items-center gap-2 bg-[#D4A017]/20 text-[#D4A017] border border-[#D4A017]/30 px-5 py-2.5 rounded-xl font-medium hover:bg-[#D4A017]/30 transition-colors"
          >
            <Share2 className="w-4 h-4" /> Share Article
          </button>
        </div>

        {/* Prev / Next */}
        <div className="mt-10 grid grid-cols-2 gap-4">
          {prev ? (
            <Link href={`/articles/${prev.slug}`} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-[#D4A017]/30 transition-all group">
              <p className="text-white/40 text-xs mb-1 flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Previous</p>
              <p className="text-sm font-medium line-clamp-2 group-hover:text-[#D4A017] transition-colors">{prev.title}</p>
            </Link>
          ) : <div />}
          {next ? (
            <Link href={`/articles/${next.slug}`} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-[#D4A017]/30 transition-all group text-right">
              <p className="text-white/40 text-xs mb-1 flex items-center gap-1 justify-end">Next <ArrowRight className="w-3 h-3" /></p>
              <p className="text-sm font-medium line-clamp-2 group-hover:text-[#D4A017] transition-colors">{next.title}</p>
            </Link>
          ) : <div />}
        </div>

        {/* CTA */}
        <div className="mt-12 bg-gradient-to-br from-[#D4A017]/20 to-[#D4A017]/5 border border-[#D4A017]/30 rounded-2xl p-8 text-center">
          <p className="text-2xl font-bold mb-2">Ready to get started?</p>
          <p className="text-white/60 mb-5">Build your first AI-powered website or chatbot for free — no credit card required.</p>
          <a href="/login" className="inline-block bg-[#D4A017] text-black font-bold px-8 py-3 rounded-xl hover:bg-[#b8891a] transition-colors">
            Start Building Free →
          </a>
        </div>
      </main>

      <footer className="border-t border-white/10 py-8 text-center text-white/30 text-sm mt-10">
        <p>© 2025 Afro AI — A product of KEYO TECHNOLOGIES, Uganda. Built by Africans for the world.</p>
        <div className="flex items-center justify-center gap-4 mt-3">
          <Link href="/articles" className="hover:text-white/60 transition-colors">All Articles</Link>
          <a href="/privacy" className="hover:text-white/60 transition-colors">Privacy</a>
          <a href="/terms" className="hover:text-white/60 transition-colors">Terms</a>
        </div>
      </footer>
    </div>
  );
}
