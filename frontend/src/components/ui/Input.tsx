import { forwardRef, type InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  const mergedClassName = className ? `ui-input ${className}` : "ui-input";
  return <input ref={ref} className={mergedClassName} {...props} />;
});
