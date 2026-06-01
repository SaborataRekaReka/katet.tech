import Link from "next/link";
import Image from "next/image";
import { ActionLink } from "@/components/ui/Button";

type HomeServiceCardProps = {
  title: string;
  description: string;
  image: string;
  href: string;
};

export function HomeServiceCard({ title, description, image, href }: HomeServiceCardProps) {
  return (
    <article className="home-service-feature">
      <div className="home-service-feature__visual">
        <Image src={image} alt={title} width={300} height={170} loading="lazy" />
      </div>

      <div className="home-service-feature__content">
        <h3>
          <Link className="home-service-feature__title-link" href={href}>
            {title}
          </Link>
        </h3>
        <p>{description}</p>
        <div className="home-service-feature__actions">
          <ActionLink
            href="#lead"
            variant="accent"
            size="lg"
            data-lead-modal="true"
            data-lead-kind="rent"
            data-lead-form-name="Карточка услуги — заказ"
            data-lead-title="Оформление заявки на услугу"
            data-lead-topic={title}
            data-lead-message={`Интересует услуга: ${title}`}
            data-lead-submit="Отправить заявку"
          >
            Заказать
          </ActionLink>
        </div>
      </div>
    </article>
  );
}
