import { useLanguage } from "@/hooks/use-language";
import "./new-chat-entry.css";

export function NewChatEntry({ name, onSuggestion }: { name?: string; onSuggestion: (value: string) => void }) {
  const { t } = useLanguage();
  const suggestions = ["Website", "App", "AI"].map(kind => ({
    label: t(`chat.entry${kind}Label`),
    prompt: t(`chat.entry${kind}Prompt`),
  }));
  return (
    <section className="new-chat-entry" aria-labelledby="new-chat-heading" data-testid="new-chat-entry">
      <p className="new-chat-entry__eyebrow">Afro AI</p>
      <h2 id="new-chat-heading">{name ? t("chat.entryGreeting", { name }) : t("chat.entryTitle")}</h2>
      <p className="new-chat-entry__subtitle">{t("chat.entrySubtitle")}</p>
      <div className="new-chat-entry__suggestions">
        {suggestions.map(({ label, prompt }) => (
          <button key={label} type="button" onClick={() => onSuggestion(prompt)}>{label}</button>
        ))}
      </div>
    </section>
  );
}