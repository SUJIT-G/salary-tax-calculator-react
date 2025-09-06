import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ArrowDownRight, ArrowUpRight, Calculator, Info, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Salary Tax Calculator (India, US, UK)
 * -------------------------------------
 * Modern, responsive calculator with editable tax bands & deductions.
 * NOTE: Tax rules change often. The defaults here are EXAMPLES only.
 * Expose config in `taxConfig` so you can update without touching logic.
 *
 * Features
 * - Countries: India (Old/New), US (Single/Married Filing Jointly), UK (rUK)
 * - Annual ↔ Monthly toggle
 * - Editable deductions/allowances
 * - Optional payroll items (US FICA, UK NI)
 * - Clear tax band breakdown and marginal rate
 * - Shareable URL state (querystring) – optional helper included
 */

type FilingStatusUS = "single" | "married";

type Band = { upto: number | null; rate: number }; // upto = upper bound; null = no upper limit

type CountryKey = "india-new" | "india-old" | "us" | "uk";

type TaxConfig = {
  currency: string;
  countryLabel: string;
  notes?: string;
  // Deduction defaults you may tailor per country
  defaults: {
    standardDeduction: number; // generic standard deduction field
    otherDeductions: number; // user-entered bucket
  };
  // For India: show regime note; For US: filing statuses with bands; For UK: personal allowance modelled as a 0% band
  bands: (params?: any) => Band[];
  // Extra payroll toggles/calcs per country (FICA, NI etc.)
  extras?: (taxableIncome: number, gross: number, params?: any) => { label: string; amount: number }[];
  // Country-specific params controls renderer
  ParamsUI?: React.FC<{ params: any; setParams: (p: any) => void }>;
  // Default params
  defaultParams?: any;
};

// ----------------------
// Example tax configs (PLACEHOLDER RATES – update for live use)
// ----------------------

const taxConfigs: Record<CountryKey, TaxConfig> = {
  "india-new": {
    currency: "₹",
    countryLabel: "India – New Regime",
    notes: "Sample slabs. Update yearly.",
    defaults: { standardDeduction: 0, otherDeductions: 0 },
    bands: () => [
      { upto: 300000, rate: 0 },
      { upto: 700000, rate: 0.05 },
      { upto: 1000000, rate: 0.10 },
      { upto: 1200000, rate: 0.15 },
      { upto: 1500000, rate: 0.20 },
      { upto: null, rate: 0.30 },
    ],
  },
  "india-old": {
    currency: "₹",
    countryLabel: "India – Old Regime",
    notes: "Sample slabs. Update yearly. Add your 80C/80D etc. into 'Other deductions'.",
    defaults: { standardDeduction: 0, otherDeductions: 0 },
    bands: () => [
      { upto: 250000, rate: 0 },
      { upto: 500000, rate: 0.05 },
      { upto: 1000000, rate: 0.20 },
      { upto: null, rate: 0.30 },
    ],
  },
  us: {
    currency: "$",
    countryLabel: "United States – Federal",
    notes: "Simplified federal. Add state taxes separately if needed.",
    defaults: { standardDeduction: 0, otherDeductions: 0 },
    defaultParams: { filing: "single" as FilingStatusUS, includeFICA: true },
    bands: (p?: { filing: FilingStatusUS }) => {
      const filing = p?.filing ?? "single";
      // Placeholder 2025-ish style example bands; update with current-year figures.
      return filing === "married"
        ? [
            { upto: 22000, rate: 0.1 },
            { upto: 94000, rate: 0.12 },
            { upto: 201000, rate: 0.22 },
            { upto: 383000, rate: 0.24 },
            { upto: 487000, rate: 0.32 },
            { upto: 732000, rate: 0.35 },
            { upto: null, rate: 0.37 },
          ]
        : [
            { upto: 11000, rate: 0.1 },
            { upto: 47000, rate: 0.12 },
            { upto: 100000, rate: 0.22 },
            { upto: 191000, rate: 0.24 },
            { upto: 243000, rate: 0.32 },
            { upto: 366000, rate: 0.35 },
            { upto: null, rate: 0.37 },
          ];
    },
    extras: (taxable, gross, p?: { includeFICA: boolean }) => {
      const items: { label: string; amount: number }[] = [];
      if (p?.includeFICA) {
        const ssWageCap = 168600; // example cap; update yearly
        const socialSecurity = Math.min(gross, ssWageCap) * 0.062;
        const medicare = gross * 0.0145;
        items.push({ label: "Social Security (6.2%)", amount: socialSecurity });
        items.push({ label: "Medicare (1.45%)", amount: medicare });
      }
      return items;
    },
    ParamsUI: ({ params, setParams }) => (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-sm">Filing Status</Label>
          <Select
            value={params.filing}
            onValueChange={(v) => setParams({ ...params, filing: v as FilingStatusUS })}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single</SelectItem>
              <SelectItem value="married">Married Filing Jointly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={params.includeFICA} onCheckedChange={(c)=>setParams({ ...params, includeFICA: c })} />
          <span className="text-sm">Include FICA (SS + Medicare)</span>
        </div>
      </div>
    ),
  },
  uk: {
    currency: "£",
    countryLabel: "United Kingdom (rUK)",
    notes: "Simplified Income Tax + optional NI (not Scotland). Update thresholds yearly.",
    defaults: { standardDeduction: 0, otherDeductions: 0 },
    defaultParams: { includeNI: true, personalAllowance: 12570 },
    bands: (p?: { personalAllowance: number }) => [
      { upto: p?.personalAllowance ?? 12570, rate: 0 }, // Personal allowance (phasing ignored for simplicity)
      { upto: 50270, rate: 0.20 }, // Basic
      { upto: 125140, rate: 0.40 }, // Higher
      { upto: null, rate: 0.45 }, // Additional
    ],
    extras: (_taxable, gross, p?: { includeNI: boolean }) => {
      const items: { label: string; amount: number }[] = [];
      if (p?.includeNI) {
        // Simple employee NI for rUK (illustrative)
        const primaryThreshold = 12570; // approx annual
        const upperEarningsLimit = 50270;
        const niLower = Math.max(0, Math.min(gross, upperEarningsLimit) - primaryThreshold) * 0.08; // example 8%
        const niUpper = Math.max(0, gross - upperEarningsLimit) * 0.02; // example 2%
        items.push({ label: "National Insurance (employee)", amount: niLower + niUpper });
      }
      return items;
    },
    ParamsUI: ({ params, setParams }) => (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-sm">Personal Allowance</Label>
          <Input
            type="number"
            value={params.personalAllowance}
            onChange={(e)=> setParams({ ...params, personalAllowance: Number(e.target.value||0) })}
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={params.includeNI} onCheckedChange={(c)=>setParams({ ...params, includeNI: c })} />
          <span className="text-sm">Include National Insurance</span>
        </div>
      </div>
    ),
  },
};

// ----------------------
// Helpers
// ----------------------

function calcProgressiveTax(income: number, bands: Band[]): { tax: number; slices: { amount: number; rate: number; tax: number }[] } {
  let remaining = Math.max(0, income);
  let lastCap = 0;
  let total = 0;
  const slices: { amount: number; rate: number; tax: number }[] = [];

  for (const band of bands) {
    const cap = band.upto ?? Infinity;
    const sliceAmount = Math.max(0, Math.min(remaining, cap - lastCap));
    const sliceTax = sliceAmount * band.rate;
    if (sliceAmount > 0) {
      slices.push({ amount: sliceAmount, rate: band.rate, tax: sliceTax });
      total += sliceTax;
      remaining -= sliceAmount;
      lastCap = cap;
    }
    if (remaining <= 0) break;
  }
  return { tax: total, slices };
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currencySymbolToISO(currency) }).format(n);
}

// Map common glyphs to ISO for Intl (fallback to locale currency if unknown)
function currencySymbolToISO(sym: string): string {
  switch (sym) {
    case "₹": return "INR";
    case "$": return "USD";
    case "£": return "GBP";
    default: return "USD";
  }
}

function useQueryState<T extends object>(state: T, setState: (s: T) => void) {
  // optional tiny helper to read/write querystring; safe no-op on SSR
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    try {
      const decoded = params.get("calc");
      if (decoded) setState({ ...state, ...(JSON.parse(atob(decoded)) as T) });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const write = () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("calc", btoa(JSON.stringify(state)));
    const url = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", url);
  };
  return write;
}

// ----------------------
// UI Component
// ----------------------

export default function SalaryTaxCalculator() {
  const [country, setCountry] = useState<CountryKey>("india-new");
  const cfg = taxConfigs[country];

  const [amount, setAmount] = useState<number>(1200000); // annual gross
  const [period, setPeriod] = useState<"annual" | "monthly">("annual");
  const [standardDeduction, setStandardDeduction] = useState<number>(cfg.defaults.standardDeduction);
  const [otherDeductions, setOtherDeductions] = useState<number>(cfg.defaults.otherDeductions);
  const [params, setParams] = useState<any>(cfg.defaultParams ?? {});

  React.useEffect(() => {
    // reset deductions & params when country changes
    setStandardDeduction(taxConfigs[country].defaults.standardDeduction);
    setOtherDeductions(taxConfigs[country].defaults.otherDeductions);
    setParams(taxConfigs[country].defaultParams ?? {});
  }, [country]);

  const grossAnnual = period === "annual" ? amount : amount * 12;
  const deductions = Math.max(0, standardDeduction + otherDeductions);
  const taxableBase = Math.max(0, grossAnnual - deductions);

  const { tax: incomeTax, slices } = useMemo(() => {
    const bands = cfg.bands(params);
    return calcProgressiveTax(taxableBase, bands);
  }, [taxableBase, cfg, params]);

  const extras = useMemo(() => cfg.extras ? cfg.extras(taxableBase, grossAnnual, params) : [], [cfg, taxableBase, grossAnnual, params]);
  const extraTotal = extras.reduce((a, b) => a + b.amount, 0);

  const totalTax = incomeTax + extraTotal;
  const netAnnual = Math.max(0, grossAnnual - totalTax);

  const toDisplay = (n: number) => period === "annual" ? n : n / 12;

  const writeQuery = useQueryState({ country, amount, period, standardDeduction, otherDeductions, params }, () => {});

  const marginalRate = slices.length ? slices[slices.length - 1].rate : 0;
  const effRate = grossAnnual > 0 ? totalTax / grossAnnual : 0;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-3xl md:text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Calculator className="w-8 h-8" /> Salary Tax Calculator <span className="text-slate-400">(India, US, UK)</span>
        </motion.h1>
        <p className="text-slate-600 mb-6">Editable tax bands & payroll options. Defaults are illustrative—please update with latest official rates.</p>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-3">
                <Label>Country / Regime</Label>
                <Select value={country} onValueChange={(v)=> setCountry(v as CountryKey)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="india-new">India – New Regime</SelectItem>
                    <SelectItem value="india-old">India – Old Regime</SelectItem>
                    <SelectItem value="us">United States – Federal</SelectItem>
                    <SelectItem value="uk">United Kingdom (rUK)</SelectItem>
                  </SelectContent>
                </Select>

                {cfg.ParamsUI && <cfg.ParamsUI params={params} setParams={setParams} />}

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Input Period</Label>
                    <Tabs value={period} onValueChange={(v)=> setPeriod(v as any)} className="mt-1">
                      <TabsList className="grid grid-cols-2">
                        <TabsTrigger value="annual">Annual</TabsTrigger>
                        <TabsTrigger value="monthly">Monthly</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <div className="col-span-2">
                    <Label>Gross Salary ({cfg.currency})</Label>
                    <Input type="number" value={amount} onChange={(e)=> setAmount(Number(e.target.value || 0))} />
                    <div className="pt-3">
                      <Slider
                        value={[Math.min(amount, 5000000)]}
                        max={5000000}
                        step={1000}
                        onValueChange={([v])=> setAmount(v)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <Label>Standard Deduction</Label>
                    <Input type="number" value={standardDeduction} onChange={(e)=> setStandardDeduction(Number(e.target.value||0))} />
                  </div>
                  <div>
                    <Label>Other Deductions</Label>
                    <Input type="number" value={otherDeductions} onChange={(e)=> setOtherDeductions(Number(e.target.value||0))} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-3">
                  <Button variant="outline" onClick={()=>{ setAmount(1200000); setStandardDeduction(cfg.defaults.standardDeduction); setOtherDeductions(cfg.defaults.otherDeductions); setParams(cfg.defaultParams ?? {}); }}>
                    <RefreshCw className="w-4 h-4 mr-2"/> Reset
                  </Button>
                  <Button variant="secondary" onClick={()=> writeQuery()}>
                    Save URL State
                  </Button>
                </div>

                {cfg.notes && (
                  <div className="flex items-start gap-2 text-xs text-slate-500 pt-3">
                    <Info className="w-4 h-4 mt-0.5" />
                    <span>{cfg.notes}</span>
                  </div>
                )}
              </div>

              {/* Summary cards */}
              <div className="md:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="rounded-2xl border-slate-200">
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-2">Summary</h3>
                      <div className="space-y-2 text-sm">
                        <Row label="Gross" value={fmt(toDisplay(grossAnnual), cfg.currency)} />
                        <Row label="Deductions" value={fmt(toDisplay(deductions), cfg.currency)} />
                        <Row label="Taxable Income" value={fmt(toDisplay(taxableBase), cfg.currency)} />
                        <Row label="Income Tax" value={fmt(toDisplay(incomeTax), cfg.currency)} />
                        {extras.map((ex, idx)=> (
                          <Row key={idx} label={ex.label} value={fmt(toDisplay(ex.amount), cfg.currency)} />
                        ))}
                        <div className="h-px bg-slate-200 my-2" />
                        <Row label="Total Tax" value={fmt(toDisplay(totalTax), cfg.currency)} emphasize />
                        <Row label="Net Take‑Home" value={fmt(toDisplay(netAnnual), cfg.currency)} good />
                        <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                          <BadgeStat label="Effective Rate" value={(effRate*100).toFixed(1)+"%"} />
                          <BadgeStat label="Marginal Rate" value={(marginalRate*100).toFixed(1)+"%"} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className="rounded-2xl border-slate-200">
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-2">Tax Band Breakdown</h3>
                      <div className="space-y-2">
                        {slices.length === 0 && (
                          <p className="text-sm text-slate-500">No taxable income in current setup.</p>
                        )}
                        {slices.map((s, i)=> (
                          <div key={i} className="flex items-center justify-between text-sm bg-slate-50 rounded-xl p-2">
                            <span>Band {i+1} @ {(s.rate*100).toFixed(0)}%</span>
                            <span className="tabular-nums">{fmt(toDisplay(s.amount), cfg.currency)} → {fmt(toDisplay(s.tax), cfg.currency)}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer tips */}
        <div className="mt-6 text-xs text-slate-500">
          This calculator is for guidance only. Please verify rates against official tax authority publications before publishing. Update the bands in <code>taxConfigs</code>.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, emphasize=false, good=false }: { label: string; value: string; emphasize?: boolean; good?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={`tabular-nums font-medium ${emphasize? 'text-slate-900' : good? 'text-emerald-600' : 'text-slate-800'}`}>{value}</span>
    </div>
  );
}

function BadgeStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
      <div className="text-slate-500 text-[11px]">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
