import { Fragment, type ReactNode } from "react";

/**
 * A translated sentence with elements (usually links) inside it, so each
 * language can put them where its word order needs:
 * rich(t("Read our {link}."), { link: <a href="/terms">{t("terms")}</a> }).
 */
export function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    return <Fragment key={i}>{name && name in parts ? parts[name] : piece}</Fragment>;
  });
}
