import { ActionLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <section className="page-hero">
      <div className="container page-hero__inner">
        <p className="eyebrow">404</p>
        <h1>Страница не найдена</h1>
        <p>URL пока не сопоставлен с перенесенным контентом.</p>
        <ActionLink href="/" variant="accent">
          На главную
        </ActionLink>
      </div>
    </section>
  );
}