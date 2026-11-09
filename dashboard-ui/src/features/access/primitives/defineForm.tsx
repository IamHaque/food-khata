import * as React from "react";
import { z } from "zod";
import { StatusBanner } from "./StatusBanner";

export interface FieldConfig {
  name: string;
  label?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  helpText?: string;
  hidden?: boolean | ((values: any) => boolean);
}

export interface FormConfig<T = any> {
  fields: FieldConfig[];
  schema?: z.ZodType<T>;
  submit: (values: T) => void | Promise<void>;
  submitLabel?: string;
  submittingLabel?: string;
  submitDisabled?: (values: any) => boolean;
  extraContent?: (props: {
    values: any;
    setValue: (name: string, value: any) => void;
    errors: Record<string, string>;
    isSubmitting: boolean;
  }) => React.ReactNode;
  footer?: (props: { values: any; isSubmitting: boolean }) => React.ReactNode;
  className?: string;
}

export interface GeneratedFormProps {
  defaultValues?: Record<string, any>;
  externalError?: string | null;
  onSubmitSuccess?: (data: any) => void;
  disabled?: boolean;
}

export function defineForm<T = any>(config: FormConfig<T>) {
  return function GeneratedForm(props: GeneratedFormProps) {
    const [values, setValues] = React.useState<Record<string, any>>(props.defaultValues ?? {});
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [submitting, setSubmitting] = React.useState(false);

    const handleChange = (name: string, value: any) => {
      setValues((v) => ({ ...v, [name]: value }));
      if (errors[name]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (config.schema) {
        const result = config.schema.safeParse(values);
        if (!result.success) {
          const errs: Record<string, string> = {};
          for (const issue of result.error.issues) {
            const key = issue.path.join(".") || "_";
            if (!errs[key]) errs[key] = issue.message;
          }
          setErrors(errs);
          return;
        }
      }
      setErrors({});
      setSubmitting(true);
      try {
        await config.submit(values as T);
        props.onSubmitSuccess?.(values);
      } catch (err: any) {
        // Error handling can be caught by caller or set
        if (err?.message) {
          setErrors((prev) => ({ ...prev, _: err.message }));
        }
      } finally {
        setSubmitting(false);
      }
    };

    const isSubmitBlocked =
      submitting ||
      props.disabled ||
      (config.submitDisabled ? config.submitDisabled(values) : false);

    return (
      <form onSubmit={handleSubmit} className={`space-y-4 ${config.className ?? ""}`} noValidate>
        {(props.externalError || errors._) && (
          <StatusBanner variant="error">{props.externalError || errors._}</StatusBanner>
        )}

        {config.fields.map((f) => {
          const isHidden = typeof f.hidden === "function" ? f.hidden(values) : Boolean(f.hidden);
          if (isHidden) return null;

          const fieldId = `field-${f.name}`;
          const errorId = `error-${f.name}`;
          const hasError = Boolean(errors[f.name]);

          return (
            <div key={f.name} className="space-y-1">
              {f.label && (
                <label htmlFor={fieldId} className="block text-sm font-medium">
                  {f.label}
                  {f.required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
                </label>
              )}
              <input
                id={fieldId}
                name={f.name}
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
                required={f.required}
                aria-required={f.required}
                aria-invalid={hasError}
                aria-describedby={hasError ? errorId : undefined}
                value={values[f.name] ?? ""}
                onChange={(e) => handleChange(f.name, e.target.value)}
                disabled={submitting || props.disabled}
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                  hasError ? "border-destructive focus:ring-destructive" : "border-input"
                }`}
              />
              {f.helpText && !hasError && (
                <p className="text-xs text-muted-foreground">{f.helpText}</p>
              )}
              {hasError && (
                <p id={errorId} role="alert" className="text-xs text-destructive">
                  {errors[f.name]}
                </p>
              )}
            </div>
          );
        })}

        {config.extraContent?.({
          values,
          setValue: handleChange,
          errors,
          isSubmitting: submitting,
        })}

        <button
          type="submit"
          disabled={isSubmitBlocked}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? config.submittingLabel ?? "Submitting…"
            : config.submitLabel ?? "Submit"}
        </button>

        {config.footer?.({ values, isSubmitting: submitting })}
      </form>
    );
  };
}

export default defineForm;
