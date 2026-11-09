import * as React from "react";
import { z } from "zod";

export interface FieldConfig {
  name: string;
  label?: string;
  type?: string;
  placeholder?: string;
}

export interface FormConfig {
  fields: FieldConfig[];
  schema: z.ZodType<any>;
  submit: (values: any) => void | Promise<void>;
}

export function defineForm(config: FormConfig) {
  return function GeneratedForm(props: { defaultValues?: Record<string, any> }) {
    const [values, setValues] = React.useState<Record<string, any>>(props.defaultValues ?? {});
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [submitting, setSubmitting] = React.useState(false);

    const handleChange = (name: string, value: any) => {
      setValues((v) => ({ ...v, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
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
      setErrors({});
      setSubmitting(true);
      try {
        await config.submit(result.data);
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {config.fields.map((f) => (
          <div key={f.name} className="space-y-1">
            {f.label && <label className="text-sm font-medium">{f.label}</label>}
            <input
              type={f.type ?? "text"}
              placeholder={f.placeholder}
              value={values[f.name] ?? ""}
              onChange={(e) => handleChange(f.name, e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            {errors[f.name] && <p className="text-xs text-destructive">{errors[f.name]}</p>}
          </div>
        ))}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </form>
    );
  };
}

export default defineForm;
