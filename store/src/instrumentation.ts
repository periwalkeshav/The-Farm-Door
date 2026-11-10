import type { Instrumentation } from "next";

/** Records server errors and emails the owner (see src/server/errors.ts). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportServerError } = await import("./server/errors");
  await reportServerError(err, request, context);
};
