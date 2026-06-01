"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type DeliveryCalculationResponse = {
  address: string;
  normalizedAddress: string;
  resolvedAddress: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  distanceKm: number;
  insideMkad: boolean;
  excessKm: number;
  costRub: number;
  ratePerKm: number;
};

export function DeliveryCostCalculator({ equipmentTitle }: { equipmentTitle: string }) {
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryCalculationResponse | null>(null);

  const formattedCost = useMemo(() => {
    if (!result) return null;
    return `${result.costRub.toLocaleString("ru-RU")} р.`;
  }, [result]);

  async function handleCalculate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setResult(null);

    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      setErrorMessage("Укажите адрес доставки.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/delivery/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: trimmedAddress }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || "Не удалось выполнить расчет.");
      }

      const data = (await response.json()) as DeliveryCalculationResponse;
      setResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось выполнить расчет.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <h3>Расчет стоимости доставки</h3>
      <form onSubmit={handleCalculate} aria-label="Форма расчета стоимости доставки">
        <input name="form_name" type="hidden" value="Расчет стоимости доставки" />
        <input name="message" type="hidden" value={`Расчет доставки: ${equipmentTitle}`} />
        <label>
          <span>Адрес доставки:</span>
          <Input
            name="address"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Например: Москва, Тверская, 1"
            autoComplete="street-address"
          />
        </label>
        <Button type="submit" variant="accent" size="md" disabled={isLoading}>
          {isLoading ? "Рассчитываем..." : "Рассчитать стоимость"}
        </Button>
      </form>

      {errorMessage ? <p className="equipment-detail-template__calculator-error">{errorMessage}</p> : null}

      {result ? (
        <div className="equipment-detail-template__calculator-result" role="status" aria-live="polite">
          <p className="equipment-detail-template__calculator-distance">
            Расстояние от центра Москвы: {result.distanceKm.toFixed(1)} км
          </p>
          {result.insideMkad ? (
            <p className="equipment-detail-template__calculator-total equipment-detail-template__calculator-total--free">
              Бесплатная доставка (в пределах МКАД)
            </p>
          ) : (
            <p className="equipment-detail-template__calculator-total">
              Стоимость доставки: {formattedCost} ({result.excessKm} км x {result.ratePerKm} р./км)
            </p>
          )}
        </div>
      ) : (
        <p>Введите адрес и нажмите «Рассчитать стоимость».</p>
      )}
    </>
  );
}