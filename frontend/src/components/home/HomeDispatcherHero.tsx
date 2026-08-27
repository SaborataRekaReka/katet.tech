"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LeadAttributionFields } from "@/components/forms/LeadAttributionFields";
import { PolicyConsent } from "@/components/forms/LeadCaptureForm";
import { Badge } from "@/components/ui/Badge";
import { ActionLink, Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  NoteIcon,
  PhoneIcon,
  PinIcon,
  RouteIcon,
  TelegramIcon,
  WhatsAppIcon,
} from "@/components/ui/icons";
import { stripHtml } from "@/lib/format";
import { siteContacts } from "@/lib/site";
import styles from "./HomeDispatcherHero.module.css";

type EquipmentOption = {
  value: string;
  label: string;
  image: string;
  available: number;
};

const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  {
    value: "Экскаватор",
    label: "Экскаватор",
    image: "/assets/katet/fleet/b7502c83-ff61-41e7-a.png",
    available: 12,
  },
  {
    value: "Автокран",
    label: "Автокран",
    image: "/assets/katet/fleet/freepik_br_e427661a-718f-4e1a-880b-13261cb6cb44.png",
    available: 16,
  },
  {
    value: "Манипулятор",
    label: "Манипулятор",
    image: "/assets/katet/fleet/image.png",
    available: 10,
  },
  {
    value: "Самосвал",
    label: "Самосвал",
    image: "/assets/katet/fleet/55f40cec-24df-4a25-9.png",
    available: 8,
  },
  {
    value: "Автовышка",
    label: "Автовышка",
    image: "/assets/katet/fleet/751cd9a1-aab9-4b7b-b.png",
    available: 14,
  },
  {
    value: "Трал",
    label: "Трал",
    image: "/assets/katet/fleet/tral_1.png",
    available: 4,
  },
  {
    value: "Мини-экскаватор",
    label: "Мини-экскаватор",
    image: "/assets/katet/fleet/7171602a-7101-408e-9.png",
    available: 5,
  },
];

const WEEK_DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function HomeDispatcherHero() {
  const [shiftCount, setShiftCount] = useState(1);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentOption>(EQUIPMENT_OPTIONS[0]);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [showDropoffAddress, setShowDropoffAddress] = useState(false);
  const [dateTimeOpen, setDateTimeOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [detailsNote, setDetailsNote] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const equipmentRef = useRef<HTMLDivElement | null>(null);
  const dateTimeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (equipmentRef.current && !equipmentRef.current.contains(target)) {
        setEquipmentOpen(false);
      }

      if (dateTimeRef.current && !dateTimeRef.current.contains(target)) {
        setDateTimeOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEquipmentOpen(false);
        setDateTimeOpen(false);
        setDetailsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!detailsOpen) {
      document.body.classList.remove("home-details-modal-open");
      return;
    }

    document.body.classList.add("home-details-modal-open");

    return () => {
      document.body.classList.remove("home-details-modal-open");
    };
  }, [detailsOpen]);

  const description = stripHtml(
      "Предоставим строительную спецтехнику в течение нескольких часов с сопровождаем заказ до завершения работ.",
  );
  const calendarDays = buildCalendarDays(calendarMonth);
  const today = new Date();
  const hasExtraDetails = Boolean(
    pickupAddress.trim() || dropoffAddress.trim() || selectedDate || detailsNote.trim() || shiftCount > 1,
  );
  const detailsModal =
    detailsOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.detailsModalBackdrop}
            role="dialog"
            aria-modal="true"
            aria-labelledby="details-modal-title"
            onClick={() => {
              setDetailsOpen(false);
              setDateTimeOpen(false);
            }}
          >
            <div className={styles.detailsModal} onClick={(event) => event.stopPropagation()}>
              <div className={styles.detailsModalHead}>
                <h3 id="details-modal-title">Уточнить детали</h3>
                <button
                  type="button"
                  className={styles.detailsModalClose}
                  onClick={() => {
                    setDetailsOpen(false);
                    setDateTimeOpen(false);
                  }}
                >
                  Закрыть
                </button>
              </div>
              <p className={styles.detailsModalText}>Заполните только то, что хотите уточнить к заказу.</p>

              <div className={styles.detailsModalBody}>
                <div className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Маршрут</span>
                  <div className={styles.addressRow}>
                    <div className={styles.addressMain}>
                      <div className={styles.control}>
                        <span className={styles.icon} aria-hidden="true">
                          <PinIcon />
                        </span>
                        <Input
                          type="text"
                          placeholder="Адрес подачи"
                          aria-label="Адрес подачи"
                          value={pickupAddress}
                          onChange={(event) => setPickupAddress(event.target.value)}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.addressToggle}
                      aria-label={showDropoffAddress ? "Скрыть адрес выгрузки" : "Добавить адрес выгрузки"}
                      onClick={() =>
                        setShowDropoffAddress((value) => {
                          const next = !value;
                          if (!next) {
                            setDropoffAddress("");
                          }
                          return next;
                        })
                      }
                    >
                      {showDropoffAddress ? "−" : "+"}
                    </button>
                  </div>

                  {showDropoffAddress ? (
                    <label className={styles.addressSecondary}>
                      <span>Адрес выгрузки</span>
                      <div className={styles.control}>
                        <span className={styles.icon} aria-hidden="true">
                          <RouteIcon />
                        </span>
                        <Input
                          type="text"
                          placeholder="Если отличается"
                          value={dropoffAddress}
                          onChange={(event) => setDropoffAddress(event.target.value)}
                        />
                      </div>
                    </label>
                  ) : null}
                </div>

                <div className={`${styles.field} ${styles.fieldWide} ${styles.dateTimeField}`} ref={dateTimeRef}>
                  <span>Дата подачи</span>
                  <button
                    type="button"
                    className={styles.dateTimeTrigger}
                    aria-expanded={dateTimeOpen}
                    aria-haspopup="dialog"
                    onClick={() => {
                      setEquipmentOpen(false);
                      setDateTimeOpen((value) => !value);
                    }}
                  >
                    <span className={styles.dateTimeTriggerIcon} aria-hidden="true">
                      <CalendarIcon />
                    </span>
                    <span className={`${styles.dateTimeValue} ${selectedDate ? "" : styles.dateTimePlaceholder}`}>
                      {selectedDate ? formatDateLabel(selectedDate) : "Выберите дату подачи"}
                    </span>
                    <span className={styles.dateTimeChevron} aria-hidden="true">
                      <ChevronDownIcon />
                    </span>
                  </button>

                  {dateTimeOpen ? (
                    <div className={styles.dateTimePanel} role="dialog" aria-label="Выбор даты подачи">
                      <div className={styles.calendarHeader}>
                        <button
                          type="button"
                          className={styles.calendarNav}
                          aria-label="Предыдущий месяц"
                          onClick={() => setCalendarMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}
                        >
                          <ChevronLeftIcon />
                        </button>
                        <strong>{formatMonthLabel(calendarMonth)}</strong>
                        <button
                          type="button"
                          className={styles.calendarNav}
                          aria-label="Следующий месяц"
                          onClick={() => setCalendarMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}
                        >
                          <ChevronRightIcon />
                        </button>
                      </div>

                      <div className={styles.calendarWeekdays} aria-hidden="true">
                        {WEEK_DAY_LABELS.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>

                      <div className={styles.calendarGrid}>
                        {calendarDays.map((day) => {
                          const inCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                          const isSelected = selectedDate ? isSameDate(day, selectedDate) : false;
                          const isToday = isSameDate(day, today);

                          return (
                            <button
                              key={toIsoDate(day)}
                              type="button"
                              className={`${styles.calendarDay} ${inCurrentMonth ? "" : styles.calendarDayMuted} ${isSelected ? styles.calendarDaySelected : ""} ${isToday ? styles.calendarDayToday : ""}`}
                              onClick={() => {
                                setSelectedDate(day);
                                setDateTimeOpen(false);
                              }}
                            >
                              {day.getDate()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                <fieldset className={styles.durationField}>
                  <legend>Количество смен</legend>
                  <div className={styles.shiftStepper}>
                    <button
                      type="button"
                      className={styles.shiftButton}
                      aria-label="Уменьшить количество смен"
                      onClick={() => setShiftCount((value) => Math.max(1, value - 1))}
                    >
                      -
                    </button>
                    <div className={styles.shiftValue} aria-live="polite">
                      <strong>{shiftCount}</strong>
                      <span>{shiftWord(shiftCount)}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.shiftButton}
                      aria-label="Увеличить количество смен"
                      onClick={() => setShiftCount((value) => Math.min(99, value + 1))}
                    >
                      +
                    </button>
                  </div>
                </fieldset>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Что нужно дополнительно</span>
                  <div className={styles.control}>
                    <span className={styles.icon} aria-hidden="true">
                      <NoteIcon />
                    </span>
                    <Input
                      type="text"
                      placeholder="Например: подача в ночь, ограниченный въезд, сопровождение"
                      value={detailsNote}
                      onChange={(event) => setDetailsNote(event.target.value)}
                    />
                  </div>
                </label>
              </div>

              <div className={styles.detailsModalActions}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={styles.detailsModalSecondary}
                  onClick={() => {
                    setPickupAddress("");
                    setDropoffAddress("");
                    setShowDropoffAddress(false);
                    setSelectedDate(null);
                    setShiftCount(1);
                    setDetailsNote("");
                    setDateTimeOpen(false);
                  }}
                >
                  Очистить
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  className={styles.detailsModalPrimary}
                  onClick={() => {
                    setDetailsOpen(false);
                    setDateTimeOpen(false);
                  }}
                >
                  Подтвердить
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <section className={styles.shell}>
      <div className={`container ${styles.heroGrid}`}>
        <div className={styles.offer}>
          <Badge className={styles.dispatcherBadge} tone="promo">
            -20% при заказе от 2-х смен
          </Badge>
          <h1>Аренда спецтехники в Москве и области</h1>
          <p>{description}</p>

          <div className={styles.actions}>
            <ActionLink className={styles.actionsParkLink} href="#park" variant="outline" size="lg">
              Смотреть автопарк
            </ActionLink>
            <div className={styles.actionsSocial} aria-label="Мессенджеры">
              <a
                className={`${styles.actionsIconButton} ${styles.actionsTelegram}`}
                href={siteContacts.telegramHref}
                target="_blank"
                rel="noreferrer"
                aria-label="Написать в Telegram"
              >
                <TelegramIcon aria-hidden="true" />
              </a>
              <a
                className={`${styles.actionsIconButton} ${styles.actionsWhatsapp}`}
                href={siteContacts.whatsappHref}
                target="_blank"
                rel="noreferrer"
                aria-label="Написать в WhatsApp"
              >
                <WhatsAppIcon aria-hidden="true" />
              </a>
              <span className={styles.actionsSocialText}>Оформляйте заявки через мессенджеры</span>
            </div>
          </div>
        </div>

        <aside className={styles.formCard}>
          <form id="lead" className={styles.form} action="/api/leads/" method="post">
            <LeadAttributionFields />
            <input name="form_name" type="hidden" value="Главная — диспетчерская форма" />
            <div className={styles.formHead}>
              <h2>Оформить заявку</h2>
              <p>Фиксируем стоимость, подбираем технику и подтверждаем заказ в течение 5-15 минут.</p>
            </div>

            <div className={styles.formGroup}>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span>Тип техники</span>
                <div className={styles.equipmentPicker} ref={equipmentRef}>
                  <button
                    type="button"
                    className={styles.equipmentTrigger}
                    aria-expanded={equipmentOpen}
                    aria-haspopup="listbox"
                    aria-controls="equipment-type-options"
                    onClick={() => {
                      setDateTimeOpen(false);
                      setEquipmentOpen((value) => !value);
                    }}
                  >
                    <span className={styles.equipmentTriggerLead}>
                      <span className={styles.equipmentThumb}>
                        <Image src={selectedEquipment.image} alt="" fill sizes="84px" />
                      </span>
                      <span className={styles.equipmentText}>
                        <strong>{selectedEquipment.label}</strong>
                        <small>Свободно: {selectedEquipment.available} ед.</small>
                      </span>
                    </span>
                    <span className={styles.equipmentChevron} aria-hidden="true">
                      <ChevronDownIcon />
                    </span>
                  </button>

                  {equipmentOpen ? (
                    <div className={styles.equipmentMenu} id="equipment-type-options" role="listbox" aria-label="Тип техники">
                      {EQUIPMENT_OPTIONS.map((item) => {
                        const isSelected = selectedEquipment.value === item.value;

                        return (
                          <button
                            key={item.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`${styles.equipmentOption} ${isSelected ? styles.equipmentOptionActive : ""}`}
                            onClick={() => {
                              setSelectedEquipment(item);
                              setEquipmentOpen(false);
                            }}
                          >
                            <span className={styles.equipmentOptionThumb}>
                              <Image src={item.image} alt="" fill sizes="84px" />
                            </span>
                            <span className={styles.equipmentOptionMeta}>
                              <strong>{item.label}</strong>
                              <small>Свободно: {item.available} ед.</small>
                            </span>
                            <span className={styles.equipmentOptionCount}>{item.available}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <input name="equipment_type" type="hidden" value={selectedEquipment.value} />
                <input name="equipment_available_count" type="hidden" value={String(selectedEquipment.available)} />
              </label>
            </div>

            <div className={styles.formGroup}>
              <div className={styles.formGrid}>
                <label className={`${styles.field} ${styles.fieldWide} ${styles.phoneField}`}>
                  <span>Телефон</span>
                  <div className={styles.control}>
                    <span className={styles.icon} aria-hidden="true">
                      <PhoneIcon />
                    </span>
                    <Input name="phone" type="tel" placeholder="+7 (___) ___-____" required />
                  </div>
                </label>
              </div>
            </div>

            <div className={styles.detailsEntry}>
              <button
                type="button"
                className={`${styles.detailsTrigger} ${hasExtraDetails ? styles.detailsTriggerFilled : ""}`}
                onClick={() => {
                  setEquipmentOpen(false);
                  setDateTimeOpen(false);
                  setDetailsOpen(true);
                }}
              >
                {hasExtraDetails ? "Уточнить детали (заполнено)" : "Уточнить детали"}
              </button>
              <p className={styles.detailsHint}>Опционально: маршрут, дата подачи, количество смен и комментарий.</p>
            </div>

            <input name="pickup_address" type="hidden" value={pickupAddress} />
            <input name="dropoff_address" type="hidden" value={dropoffAddress} />
            <input name="pickup_date" type="hidden" value={selectedDate ? toIsoDate(selectedDate) : ""} />
            <input name="has_dropoff_address" type="hidden" value={showDropoffAddress ? "1" : "0"} />
            <input name="rent_duration" type="hidden" value={`${shiftCount} ${shiftWord(shiftCount)}`} />
            <input name="rent_duration_shifts" type="hidden" value={String(shiftCount)} />
            <input name="comment" type="hidden" value={detailsNote} />

            {detailsModal}

            <PolicyConsent className={styles.consent} periodInsideLink={false} />

            <Button className={styles.submit} type="submit" variant="accent" size="lg">
              Рассчитать за 5 минут
            </Button>
          </form>
        </aside>
      </div>
    </section>
  );
}

function shiftWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod100 >= 11 && mod100 <= 14) return "смен";
  if (mod10 === 1) return "смена";
  if (mod10 >= 2 && mod10 <= 4) return "смены";
  return "смен";
}

function buildCalendarDays(month: Date) {
  const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstWeekdayIndex = (firstDayOfMonth.getDay() + 6) % 7;
  const calendarStart = new Date(firstDayOfMonth);
  calendarStart.setDate(firstDayOfMonth.getDate() - firstWeekdayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });
}

function isSameDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
  }).format(date);
}

function formatMonthLabel(date: Date) {
  const value = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(date);

  return value.charAt(0).toUpperCase() + value.slice(1);
}
