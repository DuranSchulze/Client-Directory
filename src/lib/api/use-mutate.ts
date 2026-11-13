"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "./http";

/** One mutation hook for the app: invalidates the given keys, toasts success, toasts the server's message on failure. */
export function useMutate<TVars, TData>(opts: {
  fn: (vars: TVars) => Promise<TData>;
  invalidate: QueryKey[];
  success?: string | ((data: TData) => string);
  onDone?: (data: TData) => void;
  /** Return true when the error was shown inline (for example under a field), so no toast is needed. */
  onFail?: (e: unknown) => boolean | void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.fn,
    onSuccess: async (data) => {
      await Promise.all(opts.invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(data) : opts.success);
      opts.onDone?.(data);
    },
    onError: (e) => { if (!opts.onFail?.(e)) toast.error(errorMessage(e)); },
  });
}
