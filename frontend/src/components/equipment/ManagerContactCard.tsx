import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { ActionLink } from "@/components/ui/Button";
import { ContactLink, ContactLinks, MessengerContactLinks } from "@/components/ui/ContactLinks";

export function ManagerContactCard({ variant = "archive" }: { variant?: "archive" | "detail" }) {
  if (variant === "detail") {
    return (
      <div className="equipment-detail-template__manager">
        <Image src="/assets/katet/archive/cta-dmitry.jpg" alt="Антон" width={100} height={100} loading="lazy" />
        <h3>Антон</h3>
        <ContactLink kind="phone" />
        <ContactLink kind="email" />
        <ContactLink kind="telegram">@katettech</ContactLink>
        <ContactLink kind="whatsapp">+74994606567</ContactLink>
      </div>
    );
  }

  return (
    <article className="archive-consult-card">
      <div className="archive-consult-card__body">
        <Image src="/assets/katet/archive/cta-dmitry.jpg" alt="Антон" width={140} height={140} loading="lazy" />
        <div className="archive-consult-card__person">
          <Badge tone="success">Онлайн</Badge>
          <p>Антон</p>
        </div>
        <h3>Отвечу на все вопросы</h3>
        <ContactLinks className="archive-consult-card__contacts" kinds={["phone", "email"]} />
        <MessengerContactLinks className="archive-consult-card__messengers" />
      </div>
      <ActionLink
        className="archive-consult-card__button"
        href="#lead"
        variant="neutral"
        size="lg"
        data-lead-modal="true"
        data-lead-kind="consult"
        data-lead-form-name="Карточка менеджера — консультация"
        data-lead-title="Получить консультацию менеджера"
        data-lead-submit="Получить консультацию"
      >
        Быстрая консультация
      </ActionLink>
    </article>
  );
}