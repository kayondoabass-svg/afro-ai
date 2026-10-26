import { Link } from "wouter";
import { SEO_ARTICLES } from "@/data/seo-articles";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search, Clock, ArrowRight } from "lucide-react";
import afroLogo from "@assets/IMG_5719_1771852498362.png";

const CATEGORIES = ["All", ...Array.from(new Set(SEO_ARTICLES.map(a => a.category)))];

export default function ArticlesPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const filtered = SEO_ARTICLES.filter(a => {
    const matchCat = category === "All" || a.category === category;
    const matchQ = !query || a.title.toLowerCase().includes(query.toLowerCase()) || a.excerpt.toLowerCase().includes(query.toLowerCase());
    return matchCat && matchQ;
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <a href="/" className="flex items-center gap-2">
          <img src={afroLogo} alt="Afro AI" className="h-8 w-8 object-contain" />
          <span className="font-bold text-lg text-[#D4A017]">Afro AI</span>
        </a>
        <div className="flex items-center gap-4 text-sm">
          <a href="/" className="text-white/70 hover:text-white transition-colors">Home</a>
          <a href="/pricing" className="text-white/70 hover:text-white transition-colors">Pricing</a>
          <a href="/login" className="bg-[#D4A017] text-black font-semibold px-4 py-2 rounded-lg hover:bg-[#b8891a] transition-colors">Get Started</a>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <Badge className="mb-4 bg-[#D4A017]/20 text-[#D4A017] border-[#D4A017]/30">Resources & Guides</Badge>
        <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
          Grow Your Business<br />with AI Knowledge
        </h1>
        <p className="text-white/60 text-lg max-w-2xl mx-auto mb-8">
          Practical guides, tutorials, and strategies for African entrepreneurs and businesses building their digital presence with AI.
        </p>
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search articles..."
            className="pl-9 bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-[#D4A017]"
          />
        </div>
      </section>

      {/* Categories */}
      <div className="max-w-6xl mx-auto px-6 mb-8">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                category === cat
                  ? "bg-[#D4A017] text-black"
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Articles Grid */}
      <main className="max-w-6xl mx-auto px-6 pb-20">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-white/40">
            <p className="text-lg">No articles found for "{query}"</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(article => (
              <Link key={article.slug} href={`/articles/${article.slug}`}>
                <article className="group bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-[#D4A017]/40 hover:bg-white/8 transition-all cursor-pointer h-full flex flex-col">
                  {/* Cover */}
                  <div className="bg-gradient-to-br from-[#D4A017]/20 to-[#D4A017]/5 p-8 flex items-center justify-center text-5xl border-b border-white/10">
                    {article.coverEmoji}
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className="bg-[#D4A017]/15 text-[#D4A017] border-[#D4A017]/20 text-xs">{article.category}</Badge>
                      <span className="text-white/40 text-xs flex items-center gap-1"><Clock className="w-3 h-3" />{article.readTime}</span>
                    </div>
                    <h2 className="font-bold text-base leading-snug mb-2 group-hover:text-[#D4A017] transition-colors line-clamp-2">{article.title}</h2>
                    <p className="text-white/50 text-sm leading-relaxed line-clamp-3 flex-1">{article.excerpt}</p>
                    <div className="flex items-center gap-1 mt-4 text-[#D4A017] text-sm font-medium">
                      Read article <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* CTA */}
      <section className="border-t border-white/10 py-16 text-center px-6">
        <h2 className="text-2xl font-bold mb-3">Ready to Build with AI?</h2>
        <p className="text-white/60 mb-6">Join thousands of African entrepreneurs using Afro AI to grow their businesses.</p>
        <a href="/login" className="inline-block bg-[#D4A017] text-black font-bold px-8 py-3 rounded-xl hover:bg-[#b8891a] transition-colors">
          Start for Free
        </a>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-white/30 text-sm">
        <p>© 2025 Afro AI — A product of KEYO TECHNOLOGIES, Uganda. Built by Africans for the world.</p>
      </footer>
    </div>
  );
}
