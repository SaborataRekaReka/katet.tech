import type { Metadata } from "next";
import { ContactLink } from "@/components/ui/ContactLinks";
import { ActionLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Спасибо за заказ",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ThankYouPage() {
  return (
    <section style={{ minHeight: "50vh", display: "grid", placeItems: "center", padding: "48px 16px" }}>
      <div style={{ maxWidth: "820px", textAlign: "center", display: "grid", gap: "20px" }}>
        <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 3rem)", textAlign: "center" }}>Спасибо за заказ</h1>
        <p style={{ margin: 0, fontSize: "1.1rem", lineHeight: 1.6 }}>
          Спасибо за заявку! Мы ее получили и в ближайшее время свяжемся с вами для уточнения деталей. Вы также можете
          связаться с нами сами, перейдя в мессенджеры <ContactLink kind="telegram">Telegram</ContactLink> и{" "}
          <ContactLink kind="whatsapp">Whatsapp</ContactLink>.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
          <ActionLink href="/" variant="accent">На главную</ActionLink>
          <ActionLink href="/arenda/" variant="outline">Смотреть наш парк</ActionLink>
        </div>
      </div>
    </section>
  );
}