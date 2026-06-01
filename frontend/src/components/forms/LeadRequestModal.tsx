"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { PolicyConsent } from "@/components/forms/LeadCaptureForm";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type ModalPayload = {
  title: string;
  description: string;
  formName: string;
  submitText: string;
  triggerLabel: string;
  topic: string;
  sourcePath: string;
  sourceHref: string;
  messageDefault: string;
  kind: string;
};

const LEAD_HASHES = new Set(["#lead", "#detail-lead"]);
const LEAD_CTA_TEXT = /заказ|аренд|звон|консультац|заявк/u;

function normalizeText(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function defaultDescription(pathname: string) {
  if (pathname === "/") {
    return "Подберем подходящую технику под вашу задачу и перезвоним в течение 5-15 минут.";
  }

  return "Уточним детали заказа и быстро сориентируем по стоимости и срокам подачи техники.";
}

function resolveHash(href: string) {
  const value = href.trim();
  if (!value) return null;

  if (value.startsWith("#")) {
    return value;
  }

  if (typeof window === "undefined") return null;

  try {
    return new URL(value, window.location.origin).hash || null;
  } catch {
    return null;
  }
}

function isLeadHashHref(href: string | null) {
  if (!href) return false;
  const hash = resolveHash(href);
  return Boolean(hash && LEAD_HASHES.has(hash));
}

function inferKind(payload: Partial<ModalPayload>) {
  const kind = payload.kind || "";
  if (kind) return kind;

  const label = `${payload.triggerLabel || ""} ${payload.topic || ""}`.toLocaleLowerCase("ru-RU");
  if (label.includes("звон")) return "call";
  if (label.includes("консультац")) return "consult";
  if (label.includes("аренд")) return "rent";
  if (label.includes("заказ") || label.includes("заявк")) return "request";

  return "request";
}

function buildPayload(trigger: HTMLElement, pathname: string): ModalPayload {
  const sourcePath = pathname || (typeof window !== "undefined" ? window.location.pathname : "/");
  const sourceHref = trigger.getAttribute("href") || "#lead";
  const triggerLabel = normalizeText(trigger.dataset.leadLabel) || normalizeText(trigger.textContent) || "Оставить заявку";
  const payload: Partial<ModalPayload> = {
    title: normalizeText(trigger.dataset.leadTitle),
    description: normalizeText(trigger.dataset.leadDescription) || defaultDescription(sourcePath),
    formName: normalizeText(trigger.dataset.leadFormName),
    submitText: normalizeText(trigger.dataset.leadSubmit),
    triggerLabel,
    topic: normalizeText(trigger.dataset.leadTopic) || triggerLabel,
    sourcePath,
    sourceHref,
    messageDefault: normalizeText(trigger.dataset.leadMessage),
    kind: normalizeText(trigger.dataset.leadKind),
  };

  const kind = inferKind(payload);
  if (!payload.title) {
    if (kind === "call") payload.title = "Закажите звонок менеджера";
    if (kind === "rent") payload.title = "Заявка на аренду техники";
    if (kind === "consult") payload.title = "Получить консультацию";
    if (!payload.title) payload.title = "Оставьте заявку";
  }

  if (!payload.formName) {
    if (kind === "call") payload.formName = "Попап — заказать звонок";
    if (kind === "rent") payload.formName = "Попап — аренда";
    if (kind === "consult") payload.formName = "Попап — консультация";
    if (!payload.formName) payload.formName = "Модальное окно — заявка";
  }

  if (!payload.submitText) {
    payload.submitText = kind === "call" ? "Жду звонка" : "Отправить заявку";
  }

  return {
    title: payload.title || "Оставьте заявку",
    description: payload.description || defaultDescription(sourcePath),
    formName: payload.formName || "Модальное окно — заявка",
    submitText: payload.submitText || "Отправить заявку",
    triggerLabel: payload.triggerLabel || triggerLabel,
    topic: payload.topic || triggerLabel,
    sourcePath,
    sourceHref,
    messageDefault: payload.messageDefault || "",
    kind,
  };
}

function closestLeadTrigger(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null;

  const explicit = target.closest<HTMLElement>("[data-lead-modal]");
  if (explicit) return explicit;

  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (anchor && isLeadHashHref(anchor.getAttribute("href"))) {
    return anchor;
  }

  const button = target.closest<HTMLButtonElement>("button");
  if (!button || button.dataset.leadIgnore === "true") return null;
  if (button.closest("form")) return null;

  const buttonText = normalizeText(button.textContent).toLocaleLowerCase("ru-RU");
  if (!LEAD_CTA_TEXT.test(buttonText)) return null;

  return button;
}

export function LeadRequestModal() {
  const pathname = usePathname();
  const [payload, setPayload] = useState<ModalPayload | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const isOpen = Boolean(payload);

  const closeModal = () => {
    setPayload(null);
    if (lastFocusedRef.current) {
      lastFocusedRef.current.focus();
    }
  };

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const trigger = closestLeadTrigger(event.target);
      if (!trigger) return;

      event.preventDefault();
      lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPayload(buildPayload(trigger, pathname || "/"));
    };

    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
    };
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove("lead-modal-open");
      return;
    }

    document.body.classList.add("lead-modal-open");
    const timer = window.setTimeout(() => {
      phoneInputRef.current?.focus();
    }, 10);

    return () => {
      window.clearTimeout(timer);
      document.body.classList.remove("lead-modal-open");
    };
  }, [isOpen]);

  if (!payload) return null;

  return (
    <div
      className={`lead-modal ${isOpen ? "is-open" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeModal();
        }
      }}
    >
      <section className="lead-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title">
        <header className="lead-modal__head">
          <div>
            <span className="lead-modal__eyebrow">Заявка</span>
            <h2 id="lead-modal-title">{payload.title}</h2>
          </div>
          <button className="lead-modal__close" type="button" onClick={closeModal} aria-label="Закрыть окно заявки">
            Закрыть
          </button>
        </header>

        <p className="lead-modal__description">{payload.description}</p>

        <form className="lead-modal__form" action="/api/leads/" method="post">
          <input name="form_name" type="hidden" value={payload.formName} />
          <input name="lead_context_kind" type="hidden" value={payload.kind} />
          <input name="lead_context_topic" type="hidden" value={payload.topic} />
          <input name="lead_context_trigger" type="hidden" value={payload.triggerLabel} />
          <input name="lead_context_path" type="hidden" value={payload.sourcePath} />
          <input name="lead_context_href" type="hidden" value={payload.sourceHref} />

          <div className="lead-modal__fields">
            <label className="lead-modal__field lead-modal__field--phone">
              <span>Телефон</span>
              <Input
                ref={phoneInputRef}
                name="phone"
                type="tel"
                placeholder="+7 (___) ___-____"
                autoComplete="tel"
                required
              />
            </label>

            <label className="lead-modal__field lead-modal__field--name">
              <span>Имя</span>
              <Input name="name" type="text" placeholder="Как к вам обращаться" autoComplete="name" />
            </label>

            <label className="lead-modal__field lead-modal__field--note">
              <span>Комментарий</span>
              <Input
                name="message"
                type="text"
                defaultValue={payload.messageDefault}
                placeholder="Что нужно сделать"
              />
            </label>
          </div>

          <PolicyConsent className="lead-modal__consent" periodInsideLink={false} />

          <div className="lead-modal__actions">
            <Button className="lead-modal__submit" type="submit" variant="accent" size="lg">
              {payload.submitText}
            </Button>
            <p>Перезваниваем в течение 5-15 минут, работаем без выходных.</p>
          </div>
        </form>
      </section>
    </div>
  );
}