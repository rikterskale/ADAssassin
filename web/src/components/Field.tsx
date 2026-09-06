import { useState, type ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function SecretField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  autoComplete = "off",
  required = false,
  maxLength,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="secret-wrap">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          maxLength={maxLength}
          spellCheck={false}
        />
        <button className="btn ghost" type="button" onClick={() => setShow((current) => !current)}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
