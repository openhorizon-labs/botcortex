"use client";

/**
 * Which brain authors the next skill.
 *
 * Prices come from the api's own billing table, so what's shown here is
 * exactly what gets charged — a picker quoting numbers from somewhere else
 * would eventually quote them wrong.
 *
 * Models the balance can't cover one teach on are disabled with the reason.
 * The alternative is letting someone pick a $30/Mtok model and meet a 402 on
 * their first sentence, having done nothing wrong.
 */

import { useEffect, useState } from "react";
import { ChevronDown, Sparkles, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CatalogueModel = {
  id: string;
  label: string;
  family: string;
  provider: string;
  inputPerMTok: number;
  outputPerMTok: number;
  neededMicros: number;
  affordable: boolean;
  tier: "top" | "fast";
  note: string;
};

/** Sparkles for the capable ones, a bolt for the quick ones — so the trade
 *  being made is legible before reading a single price. */
const TIER_ICON = { top: Sparkles, fast: Zap } as const;

/** Micro-dollars to a plain "$5.00". Both the per-million-token rates and the
 *  one-call estimate are stored in micros; only the meaning differs. */
const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

export function ModelPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  const [models, setModels] = useState<CatalogueModel[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setModels(data.models as CatalogueModel[]);
        if (!value) onChange(data.default as string);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = models.find((m) => m.id === value);
  const families = Array.from(new Set(models.map((m) => m.family)));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-6 cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Choose the model"
        >
          {current ? (
            (() => {
              const Icon = TIER_ICON[current.tier];
              return <Icon className="size-3.5 shrink-0" />;
            })()
          ) : (
            <Sparkles className="size-3.5 shrink-0" />
          )}
          {current?.label ?? value ?? "Model"}
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
        {families.map((family, i) => (
          <div key={family}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {family}
            </DropdownMenuLabel>
            {models
              .filter((m) => m.family === family)
              .map((m) => {
                const Icon = TIER_ICON[m.tier];
                return (
                  <DropdownMenuItem
                    key={m.id}
                    disabled={!m.affordable}
                    onSelect={() => onChange(m.id)}
                    className={cn(
                      "cursor-pointer items-start gap-2",
                      m.id === value && "bg-surface-3",
                    )}
                  >
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{m.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {m.note}
                      </span>
                    </span>
                    <span className="shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground">
                      {m.affordable
                        ? `${dollars(m.inputPerMTok)}/${dollars(m.outputPerMTok)}`
                        : `needs ${dollars(m.neededMicros)}`}
                    </span>
                  </DropdownMenuItem>
                );
              })}
          </div>
        ))}
        {models.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Input / output per million tokens. Charged at cost from your
              credit — only while teaching.
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
