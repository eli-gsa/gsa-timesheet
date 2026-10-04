"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";

// App-wide "something is saving" signal. Any component that calls
// useBusyTransition() instead of React's own useTransition() automatically
// contributes to a shared counter; whenever that counter is > 0, a single
// full-screen overlay (faint dim + spinner) shows over the whole app and
// blocks clicks everywhere, not just on the control that was clicked. This
// is what keeps someone from firing off five more cell-assigns while the
// first one is still in flight.
//
// Call sites don't change shape at all: `const [isPending, startTransition]
// = useBusyTransition();` is a drop-in replacement for
// `const [isPending, startTransition] = useTransition();` - the local
// isPending still works exactly as before for disabling a single button;
// it now also feeds the global overlay.

const BusyCtx = createContext<{ begin: () => void; end: () => void } | null>(null);

export function BusyProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const begin = useCallback(() => setCount((c) => c + 1), []);
  const end = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);
  const value = useMemo(() => ({ begin, end }), [begin, end]);

  return (
    <BusyCtx.Provider value={value}>
      {children}
      {count > 0 && (
        <div
          className="fixed inset-0 z-[200] bg-[#0b0b0b]/8 flex items-center justify-center cursor-wait"
          aria-live="polite"
          aria-busy="true"
        >
          <div
            className="w-8 h-8 rounded-full border-[3px] border-[#c3c2b7] border-t-[#2a78d6] animate-spin"
            role="status"
            aria-label="Working…"
          />
        </div>
      )}
    </BusyCtx.Provider>
  );
}

function useBusyCtx() {
  const ctx = useContext(BusyCtx);
  if (!ctx) {
    throw new Error("useBusyTransition must be used within a BusyProvider (see (app)/layout.tsx).");
  }
  return ctx;
}

export function useBusyTransition() {
  const [isPending, startTransition] = useTransition();
  const { begin, end } = useBusyCtx();

  useEffect(() => {
    if (!isPending) return;
    begin();
    return () => end();
  }, [isPending, begin, end]);

  return [isPending, startTransition] as const;
}
