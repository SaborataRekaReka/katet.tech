import Link from "next/link";
import type { ReactNode } from "react";
import { LeadAttributionFields } from "@/components/forms/LeadAttributionFields";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { MessengerContactLinks } from "@/components/ui/ContactLinks";
import { Input } from "@/components/ui/Input";

type LeadField = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  labelClassName?: string;
  srOnlyLabel?: boolean;
  defaultValue?: string;
};

type HiddenField = {
  name: string;
  value: string;
};

type LeadCaptureFormProps = {
  id?: string;
  className?: string;
  formName: string;
  title?: string;
  titleLevel?: "h2" | "h3";
  fields: LeadField[];
  hiddenFields?: HiddenField[];
  showConsent?: boolean;
  consentClassName?: string;
  consentDefaultChecked?: boolean;
  consentRequired?: boolean;
  consentPeriodInsideLink?: boolean;
  buttonText: string;
  buttonClassName?: string;
  buttonVariant?: ButtonVariant | null;
  showMessengers?: boolean;
  messengerClassName?: string;
  messengerVariant?: "short" | "full";
  footer?: ReactNode;
};

export function PolicyConsent({
  className,
  defaultChecked = true,
  required = true,
  periodInsideLink = true,
}: {
  className?: string;
  defaultChecked?: boolean;
  required?: boolean;
  periodInsideLink?: boolean;
}) {
  return (
    <label className={className}>
      <input type="checkbox" name="privacy" defaultChecked={defaultChecked} required={required} />
      <span>
        Я даю согласие на обработку моих персональных данных в соответствии с{" "}
        <Link href="/policy/">политикой конфиденциальности{periodInsideLink ? "." : ""}</Link>
        {periodInsideLink ? null : "."}
      </span>
    </label>
  );
}

export function MessengerLinks({ className, variant = "short" }: { className: string; variant?: "short" | "full" }) {
  return <MessengerContactLinks className={className} variant={variant} prompt="Оформляйте заявки через мессенджеры" />;
}

export function LeadCaptureForm({
  id,
  className,
  formName,
  title,
  titleLevel = "h2",
  fields,
  hiddenFields = [],
  showConsent = true,
  consentClassName,
  consentDefaultChecked = true,
  consentRequired = true,
  consentPeriodInsideLink = true,
  buttonText,
  buttonClassName,
  buttonVariant = "accent",
  showMessengers = false,
  messengerClassName,
  messengerVariant = "short",
  footer,
}: LeadCaptureFormProps) {
  const formClassName = ["lead-capture-form", className].filter(Boolean).join(" ");

  return (
    <form id={id} className={formClassName} action="/api/leads/" method="post">
      <LeadAttributionFields />
      {title ? titleLevel === "h3" ? <h3>{title}</h3> : <h2>{title}</h2> : null}
      <input name="form_name" type="hidden" value={formName} />
      {hiddenFields.map((field) => (
        <input key={field.name} name={field.name} type="hidden" value={field.value} />
      ))}
      {fields.map((field) => (
        <label className={field.labelClassName} key={field.name}>
          <span className={field.srOnlyLabel ? "sr-only" : undefined}>{field.label}</span>
          <Input
            name={field.name}
            type={field.type || "text"}
            placeholder={field.placeholder}
            required={field.required}
            defaultValue={field.defaultValue}
          />
        </label>
      ))}
      {showConsent ? (
        <PolicyConsent
          className={consentClassName}
          defaultChecked={consentDefaultChecked}
          required={consentRequired}
          periodInsideLink={consentPeriodInsideLink}
        />
      ) : null}
      <Button className={buttonClassName} type="submit" variant={buttonVariant}>
        {buttonText}
      </Button>
      {showMessengers && messengerClassName ? <MessengerLinks className={messengerClassName} variant={messengerVariant} /> : null}
      {footer}
    </form>
  );
}
