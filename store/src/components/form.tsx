"use client";

/**
 * Form validation in the browser, using the same zod schemas as the server.
 *
 * - A field is checked when you leave it, and re-checked as you type once it
 *   shows an error (so the message clears as soon as it's fixed).
 * - Submitting checks everything and moves focus to the first problem.
 * - Errors returned by the server appear next to the right field.
 * - Typed values are kept when the server rejects a submission. (Passing an
 *   action straight to <form action> makes React clear the form afterwards,
 *   so submissions go through onSubmit instead.)
 */
import { startTransition, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { z } from "zod";
import { cn } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { fieldErrorsFrom, formValues, type FieldErrors } from "@/lib/validation";

type ActionState = { ok: boolean; fieldErrors?: FieldErrors } | null | undefined;

type Options = {
  /** Same schema the server uses (or a client-side subset). */
  schema?: z.ZodType;
  /** Turns FormData into the object the schema expects. Defaults to formValues(). */
  values?: (fd: FormData) => Record<string, unknown>;
  /** useActionState dispatcher, called in a transition once the data passes the schema. */
  action?: (fd: FormData) => void;
  /** Or a plain handler, called directly (for async flows that manage their own pending state). */
  onValid?: (fd: FormData) => void;
  /** Latest useActionState result: its fieldErrors are shown, and ok can reset the form. */
  state?: ActionState;
  /** Field errors from somewhere other than an action state. */
  serverErrors?: FieldErrors | null;
  resetOnSuccess?: boolean;
};

export type FormApi = ReturnType<typeof useForm>;

export function useForm({ schema, values = formValues, action, onValid, state, serverErrors, resetOnSuccess }: Options) {
  const formRef = useRef<HTMLFormElement | null>(null);
  // A callback ref, so the object this hook returns holds no ref objects (React reads it during render).
  const setFormRef = useCallback((el: HTMLFormElement | null) => {
    formRef.current = el;
  }, []);
  const getForm = useCallback(() => formRef.current, []);
  const prefix = useId();
  const [errors, setErrors] = useState<FieldErrors>({});
  const touched = useRef(new Set<string>());

  // Show new server errors (adjusting state during render when the input changes, as React recommends).
  const incoming = state?.fieldErrors ?? serverErrors ?? null;
  const [lastIncoming, setLastIncoming] = useState(incoming);
  if (incoming !== lastIncoming) {
    setLastIncoming(incoming);
    if (incoming) setErrors(incoming);
  }

  useEffect(() => {
    if (incoming && Object.keys(incoming).length) focusFirst(formRef.current, incoming);
  }, [incoming]);

  useEffect(() => {
    if (resetOnSuccess && state?.ok) {
      formRef.current?.reset();
      touched.current.clear();
    }
  }, [state, resetOnSuccess]);

  function check(form: HTMLFormElement): FieldErrors {
    if (!schema) return {};
    const result = schema.safeParse(values(new FormData(form)));
    return result.success ? {} : fieldErrorsFrom(result.error);
  }

  function update(name: string, all: FieldErrors) {
    setErrors((prev) => {
      if (prev[name] === all[name]) return prev;
      const next = { ...prev };
      if (all[name]) next[name] = all[name];
      else delete next[name];
      return next;
    });
  }

  const nameOf = (target: EventTarget) => (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement ? target.name : "");

  const formProps = {
    ref: setFormRef,
    noValidate: true,
    // If someone submits before the page's JavaScript has loaded, the browser does a plain POST
    // (which just reloads the page) instead of a GET that would put typed details in the URL.
    // (Passing the server action here as a no-JS fallback trips a Next.js bug with cookies.)
    method: "post" as const,
    onSubmit(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const form = e.currentTarget;
      const found = check(form);
      setErrors(found);
      if (Object.keys(found).length) {
        focusFirst(form, found);
        return;
      }
      const fd = new FormData(form);
      if (action) startTransition(() => action(fd));
      else onValid?.(fd);
    },
    onBlur(e: React.FocusEvent<HTMLFormElement>) {
      const name = nameOf(e.target);
      if (!name || !e.currentTarget.contains(e.target)) return;
      // Passing through an empty field (tabbing past it, say) isn't a mistake yet: empty
      // fields are checked when the form is sent.
      if (!(e.target as unknown as HTMLInputElement).value?.trim() && !errors[name]) return;
      touched.current.add(name);
      update(name, check(e.currentTarget));
    },
    onChange(e: React.ChangeEvent<HTMLFormElement>) {
      const name = nameOf(e.target);
      // Only re-check while typing once the field has been left or shows an error.
      if (!name || (!touched.current.has(name) && !errors[name])) return;
      update(name, check(e.currentTarget));
    },
  };

  const id = (name: string) => `${prefix}-${name}`;
  return {
    formProps,
    errors,
    setErrors,
    /** The form element (for event handlers and effects, not during render). */
    form: getForm,
    id,
    error: (name: string) => errors[name],
    /** Props for an input/select/textarea: name, id and the accessibility links to its error and hint. */
    field: (name: string, opts: { hint?: boolean } = {}) => {
      const err = errors[name];
      const described = [err ? `${id(name)}-error` : "", opts.hint ? `${id(name)}-hint` : ""].filter(Boolean).join(" ");
      return { name, id: id(name), "aria-invalid": err ? (true as const) : undefined, "aria-describedby": described || undefined };
    },
  };
}

/** Moves focus to the first field (in page order) that has an error. */
function focusFirst(form: HTMLFormElement | null, errors: FieldErrors) {
  if (!form) return;
  for (const el of Array.from(form.elements)) {
    const name = (el as HTMLInputElement).name;
    if (name && errors[name] && typeof (el as HTMLElement).focus === "function" && (el as HTMLInputElement).type !== "hidden") {
      (el as HTMLElement).focus();
      return;
    }
  }
}

export function FieldError({ f, name, className }: { f: FormApi; name: string; className?: string }) {
  const { t } = useI18n();
  const message = f.error(name);
  if (!message) return null;
  return (
    <p id={`${f.id(name)}-error`} className={cn("mt-1 text-sm font-semibold text-chilli", className)}>
      {t(message)}
    </p>
  );
}

/** Label + control + hint + error, wired together for screen readers. */
export function Field({ f, name, label, optional, hint, className, children }: { f: FormApi; name: string; label: ReactNode; optional?: boolean; hint?: ReactNode; className?: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className={className}>
      <label htmlFor={f.id(name)} className="label">
        {label}
        {optional && <span className="font-normal text-muted"> ({t("optional")})</span>}
      </label>
      {children}
      {hint && (
        <p id={`${f.id(name)}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
      <FieldError f={f} name={name} />
    </div>
  );
}

/** Live "120 / 300" counter for text areas with a limit. */
export function CharCount({ value, max }: { value: number; max: number }) {
  return <p className={cn("mt-1 text-right text-xs tabular-nums", value > max ? "font-semibold text-chilli" : "text-muted")}>{`${value} / ${max}`}</p>;
}
