import type { ReactNode } from "react";
import { TelegramIcon, WhatsAppIcon } from "@/components/ui/icons";
import { siteContacts } from "@/lib/site";

export type ContactLinkKind = "phone" | "email" | "telegram" | "whatsapp";
export type MessengerLabelVariant = "short" | "full" | "handle";

const CONTACT_LINKS: Record<ContactLinkKind, { href: string; label: string; external?: boolean; ariaLabel?: string }> = {
  phone: { href: siteContacts.phoneHref, label: siteContacts.phoneDisplay },
  email: { href: `mailto:${siteContacts.email}`, label: siteContacts.email },
  telegram: { href: siteContacts.telegramHref, label: "@katettech", external: true, ariaLabel: "Telegram" },
  whatsapp: { href: siteContacts.whatsappHref, label: "+74994606567", external: true, ariaLabel: "WhatsApp" },
};

function messengerLabel(kind: "telegram" | "whatsapp", variant: MessengerLabelVariant) {
  if (variant === "short") {
    return kind === "telegram"
      ? <TelegramIcon aria-hidden="true" focusable="false" />
      : <WhatsAppIcon aria-hidden="true" focusable="false" />;
  }
  if (variant === "full") return kind === "telegram" ? "Telegram" : "Whatsapp";
  return CONTACT_LINKS[kind].label;
}

export function ContactLink({ kind, className, children }: { kind: ContactLinkKind; className?: string; children?: ReactNode }) {
  const item = CONTACT_LINKS[kind];

  return (
    <a className={className} href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noreferrer" : undefined} aria-label={item.ariaLabel}>
      {children ?? item.label}
    </a>
  );
}

export function ContactLinks({ className, kinds }: { className: string; kinds: ContactLinkKind[] }) {
  return (
    <div className={className}>
      {kinds.map((kind) => (
        <ContactLink kind={kind} key={kind} />
      ))}
    </div>
  );
}

export function MessengerContactLinks({
  className,
  variant = "handle",
  prompt,
}: {
  className: string;
  variant?: MessengerLabelVariant;
  prompt?: string;
}) {
  return (
    <div className={className} aria-label="Мессенджеры">
      <ContactLink kind="telegram">{messengerLabel("telegram", variant)}</ContactLink>
      <ContactLink kind="whatsapp">{messengerLabel("whatsapp", variant)}</ContactLink>
      {prompt ? <span>{prompt}</span> : null}
    </div>
  );
}