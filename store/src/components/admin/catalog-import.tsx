"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { applyCatalogImportAction, previewCatalogImportAction, type ImportPreview } from "@/actions/admin/catalog-import";
import { Notice } from "@/components/ui";

export function CatalogImport() {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, check, checking] = useActionState<ImportPreview | null, FormData>(previewCatalogImportAction, null);
  const [result, apply, importing] = useActionState<ImportPreview | null, FormData>(applyCatalogImportAction, null);
  // Which file the preview belongs to; choosing another file hides the old preview.
  const [checkedFile, setCheckedFile] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const showPreview = preview && checkedFile === currentFile && !result;
  const busy = checking || importing;

  function fileData(): FormData | null {
    const form = formRef.current;
    const file = form ? (new FormData(form).get("file") as File | null) : null;
    if (!form || !file || file.size === 0) {
      setFileError("Choose the CSV file first.");
      return null;
    }
    setFileError(null);
    return new FormData(form);
  }

  return (
    <div className="space-y-5">
      <form
        ref={formRef}
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = fileData();
          if (!fd) return;
          setCheckedFile(currentFile);
          startTransition(() => check(fd));
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <label htmlFor="catalog-file" className="sr-only">
          Catalogue CSV file
        </label>
        <input
          id="catalog-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          aria-invalid={fileError ? true : undefined}
          aria-describedby={fileError ? "catalog-file-error" : undefined}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setCurrentFile(f ? `${f.name}:${f.size}:${f.lastModified}` : null);
            setFileError(null);
          }}
          className="text-sm file:mr-3 file:rounded-full file:border file:border-forest file:bg-paper file:px-4 file:py-2 file:text-sm file:font-semibold file:text-forest"
        />
        <button type="submit" disabled={busy} className="rounded-full border border-forest px-5 py-2.5 text-sm font-semibold text-forest disabled:opacity-60">
          {checking ? "Checking…" : "Check file"}
        </button>
        {showPreview && preview.ok && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const fd = fileData();
              if (!fd || !window.confirm(`Import ${preview.products?.length} product${preview.products?.length === 1 ? "" : "s"} into the catalogue?`)) return;
              startTransition(() => apply(fd));
            }}
            className="rounded-full bg-forest px-5 py-2.5 text-sm font-semibold text-ivory disabled:opacity-60"
          >
            {importing ? "Importing…" : `Import ${preview.products?.length} product${preview.products?.length === 1 ? "" : "s"}`}
          </button>
        )}
        {fileError && (
          <p id="catalog-file-error" className="w-full text-sm font-semibold text-chilli">
            {fileError}
          </p>
        )}
      </form>

      {result && (
        <div className="space-y-3">
          <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>
          {result.results && (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-paper text-sm">
              {result.results.map((r) => (
                <li key={r.handle} className="flex flex-wrap justify-between gap-2 p-3">
                  {r.productId ? (
                    <Link href={`/admin/products/${r.productId}`} className="font-semibold text-forest underline">
                      {r.name}
                    </Link>
                  ) : (
                    <span className="font-semibold">{r.name}</span>
                  )}
                  <span className={r.ok ? "text-muted" : "font-semibold text-chilli"}>{r.message}</span>
                </li>
              ))}
            </ul>
          )}
          {result.errors && <ErrorTable errors={result.errors} />}
        </div>
      )}

      {showPreview && (
        <div className="space-y-3">
          <Notice tone={preview.ok ? "info" : "error"}>
            {preview.message}
            {preview.rowCount !== undefined && <span className="text-muted"> ({preview.rowCount} rows read.)</span>}
          </Notice>
          {preview.warnings?.map((w) => (
            <Notice key={w} tone="warn">
              {w}
            </Notice>
          ))}
          {preview.errors && preview.errors.length > 0 && <ErrorTable errors={preview.errors} />}
          {preview.ok && preview.products && (
            <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs text-muted uppercase">
                  <tr>
                    <th className="p-3">Product</th>
                    <th className="p-3">Change</th>
                    <th className="p-3 text-right">New packs</th>
                    <th className="p-3 text-right">Updated packs</th>
                    <th className="p-3 text-right">Untouched packs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.products.map((p) => (
                    <tr key={p.handle}>
                      <td className="p-3 font-semibold">
                        {p.name}
                        <span className="block text-xs font-normal text-muted">/products/{p.handle}</span>
                      </td>
                      <td className="p-3">{p.isNew ? "New product (draft unless Active)" : "Update existing"}</td>
                      <td className="p-3 text-right tabular-nums">{p.created}</td>
                      <td className="p-3 text-right tabular-nums">{p.updated}</td>
                      <td className="p-3 text-right tabular-nums">{p.unchanged}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorTable({ errors }: { errors: NonNullable<ImportPreview["errors"]> }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-chilli/30 bg-paper">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs text-muted uppercase">
          <tr>
            <th className="p-3">Row</th>
            <th className="p-3">Column</th>
            <th className="p-3">Problem</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {errors.map((e, i) => (
            <tr key={`${e.line}-${e.column}-${i}`}>
              <td className="p-3 tabular-nums">{e.line}</td>
              <td className="p-3 font-mono text-xs">{e.column || "—"}</td>
              <td className="p-3">{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
