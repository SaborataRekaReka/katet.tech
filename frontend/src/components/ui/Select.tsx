"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@/components/ui/icons";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function joinClassNames(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

function findNextEnabledIndex(options: SelectOption[], startIndex: number, direction: 1 | -1) {
  if (!options.length) return -1;

  let index = startIndex;
  for (let step = 0; step < options.length; step += 1) {
    index = (index + direction + options.length) % options.length;
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Выберите значение",
  className,
  triggerClassName,
  menuClassName,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const preferredIndex = selectedIndex >= 0 ? selectedIndex : findNextEnabledIndex(options, -1, 1);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  const selectOptionByIndex = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;

    onChange(option.value);
    setIsOpen(false);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction: 1 | -1 = event.key === "ArrowDown" ? 1 : -1;
      const baseIndex = highlightedIndex >= 0 ? highlightedIndex : selectedIndex;
      const nextIndex = findNextEnabledIndex(options, baseIndex, direction);
      if (nextIndex >= 0) {
        setHighlightedIndex(nextIndex);
      }
      setIsOpen(true);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isOpen) {
        setHighlightedIndex(preferredIndex);
        setIsOpen(true);
        return;
      }

      if (highlightedIndex >= 0) {
        selectOptionByIndex(highlightedIndex);
      }
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div
      className={joinClassNames("ui-select", isOpen ? "is-open" : undefined, disabled ? "is-disabled" : undefined, className)}
      ref={rootRef}
    >
      <button
        className={joinClassNames("ui-select__trigger", triggerClassName)}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }

          setHighlightedIndex(preferredIndex);
          setIsOpen(true);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="ui-select__value">{selectedOption?.label || placeholder}</span>
        <ChevronDownIcon className="ui-select__chevron" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div className={joinClassNames("ui-select__menu", menuClassName)} role="listbox">
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = index === highlightedIndex;

            return (
              <button
                className={joinClassNames(
                  "ui-select__option",
                  isSelected ? "is-selected" : undefined,
                  isHighlighted ? "is-highlighted" : undefined,
                )}
                type="button"
                key={`${option.value}:${index}`}
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onMouseEnter={() => {
                  if (!option.disabled) {
                    setHighlightedIndex(index);
                  }
                }}
                onClick={() => selectOptionByIndex(index)}
              >
                <span className="ui-select__option-label">{option.label}</span>
                {isSelected ? <CheckIcon className="ui-select__option-check" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
