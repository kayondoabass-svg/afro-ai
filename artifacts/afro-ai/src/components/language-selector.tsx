import { languages } from "@/lib/translations";
import { useLanguage } from "@/hooks/use-language";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe } from "lucide-react";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useLanguage();
  const currentLang = languages.find((l) => l.code === language);

  return (
    <Select value={language} onValueChange={(val) => setLanguage(val as any)}>
      <SelectTrigger
        className={compact ? "w-auto gap-1.5" : "w-[160px]"}
        data-testid="select-language"
      >
        <Globe className="w-4 h-4 flex-shrink-0" />
        <SelectValue>
          {compact ? currentLang?.code.toUpperCase() : currentLang?.nativeName}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {languages.map((lang) => (
          <SelectItem
            key={lang.code}
            value={lang.code}
            data-testid={`lang-option-${lang.code}`}
          >
            <span>{lang.nativeName}</span>
            <span className="text-muted-foreground ml-2 text-xs">({lang.name})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
