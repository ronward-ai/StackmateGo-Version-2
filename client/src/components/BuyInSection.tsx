import { useState, useEffect } from 'react';
import { calculatePrizePool } from "@/lib/prizePool";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Coins, Trophy, RefreshCw, Plus, Zap, ChevronDown, ChevronUp, CircleDollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface BuyInSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

// Reusable field row for consistent label + input layout
function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// Styled sub-section that reveals when a toggle is enabled
function SubSection({ children, color = 'purple' }: { children: React.ReactNode; color?: string }) {
  const colorMap: Record<string, string> = {
    purple: 'card-glass-purple',
    green: 'card-glass-green',
    blue: 'card-glass-blue',
    orange: 'card-glass-orange',
  };
  return (
    <div className={cn('rounded-lg p-4 mt-3 space-y-4 fade-in', colorMap[color] || colorMap.purple)}>
      {children}
    </div>
  );
}

// Section header within the form
function SectionHeader({ icon: Icon, title, color }: { icon: any; title: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={cn('h-4 w-4', color)} />
      <span className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</span>
    </div>
  );
}

// Inline number input with optional prefix/suffix
function NumberInput({
  id, value, onChange, min = 0, max, step = 1, placeholder = '0', prefix, suffix, className
}: {
  id?: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
  placeholder?: string; prefix?: string; suffix?: string; className?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {prefix && <span className="text-sm font-medium text-muted-foreground w-6 text-right">{prefix}</span>}
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value === 0 ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
        onFocus={(e) => e.target.select()}
        placeholder={placeholder}
        inputMode="numeric"
        pattern="[0-9]*"
        className={cn('h-9 w-24 text-right', className)}
      />
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export default function BuyInSection({ tournament }: BuyInSectionProps) {
  const { state, updateSettings, updatePrizeStructure } = tournament;

  const [buyInAmount, setBuyInAmount] = useState(10);
  const [startingChips, setStartingChips] = useState(10000);
  const [rakeType, setRakeType] = useState<'percentage' | 'fixed'>('percentage');
  const [rakePercentage, setRakePercentage] = useState(0);
  const [rakeAmount, setRakeAmount] = useState(0);
  const [currencySymbol, setCurrencySymbol] = useState('£');

  const [enableBounties, setEnableBounties] = useState(false);
  const [bountyAmount, setBountyAmount] = useState(0);
  const [bountyType, setBountyType] = useState<'standard' | 'progressive'>('standard');

  const [allowRebuys, setAllowRebuys] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(10);
  const [rebuyChips, setRebuyChips] = useState(10000);
  const [maxRebuys, setMaxRebuys] = useState(0);
  const [rebuyPeriodLevels, setRebuyPeriodLevels] = useState(3);

  const [allowReEntry, setAllowReEntry] = useState(false);
  const [maxReEntries, setMaxReEntries] = useState(0);
  const [reEntryPeriodLevels, setReEntryPeriodLevels] = useState(4);

  const [allowAddons, setAllowAddons] = useState(false);
  const [addonAmount, setAddonAmount] = useState(10);
  const [addonChips, setAddonChips] = useState(10000);
  const [addonAvailableLevel, setAddonAvailableLevel] = useState(6);

  const [manualPayouts, setManualPayouts] = useState<{ position: number; percentage: number }[]>([
    { position: 1, percentage: 50 },
    { position: 2, percentage: 30 },
    { position: 3, percentage: 20 }
  ]);

  const [isApplying, setIsApplying] = useState(false);
  const [justApplied, setJustApplied] = useState(false);

  // Sync from tournament state
  useEffect(() => {
    const p = state.prizeStructure;
    if (!p) return;
    setBuyInAmount(p.buyIn || 10);
    setStartingChips(p.startingChips || 10000);
    setRakeType(p.rakeType || 'percentage');
    setRakePercentage(p.rakePercentage || 0);
    setRakeAmount(p.rakeAmount || 0);
    setEnableBounties(p.enableBounties || false);
    setBountyAmount(p.bountyAmount || 0);
    setBountyType(p.bountyType || 'standard');
    setAllowRebuys(p.allowRebuys || false);
    setRebuyAmount(p.rebuyAmount || 10);
    setRebuyChips(p.rebuyChips || 10000);
    setMaxRebuys(p.maxRebuys || 0);
    setRebuyPeriodLevels(p.rebuyPeriodLevels || 3);
    setAllowReEntry(p.allowReEntry || false);
    setMaxReEntries(p.maxReEntries || 0);
    setReEntryPeriodLevels(p.reEntryPeriodLevels || 4);
    setAllowAddons(p.allowAddons || false);
    setAddonAmount(p.addonAmount || 10);
    setAddonChips(p.addonChips || 10000);
    setAddonAvailableLevel(p.addonAvailableLevel || 6);
    if (p.manualPayouts?.length) setManualPayouts(p.manualPayouts);
  }, [state.prizeStructure]);

  useEffect(() => {
    if (state.settings.currency) setCurrencySymbol(state.settings.currency);
  }, [state.settings.currency]);

  const totalPercentage = manualPayouts.reduce((s, p) => s + p.percentage, 0);

  // Live prize pool preview
  const totalRebuys = state.players.reduce((s, p) => s + (p.rebuys || 0), 0);
  const totalAddons = state.players.reduce((s, p) => s + (p.addons || 0), 0);
  const { gross, rake, net: netPool } = calculatePrizePool({
    buyIn: buyInAmount,
    playerCount: state.players.length,
    totalRebuys, rebuyAmount,
    totalAddons, addonAmount,
    rakeType, rakePercentage, rakeAmount,
  });

  const applyChanges = async () => {
    setIsApplying(true);
    try {
      updatePrizeStructure({
        buyIn: buyInAmount, startingChips,
        rakeType, rakePercentage, rakeAmount,
        enableBounties, bountyAmount, bountyType,
        allowRebuys, rebuyAmount, rebuyChips, maxRebuys, rebuyPeriodLevels,
        allowReEntry, maxReEntries, reEntryPeriodLevels,
        allowAddons, addonAmount, addonChips, addonAvailableLevel,
        manualPayouts
      });
      updateSettings({ currency: currencySymbol });

      if (state.details?.type === 'database' && state.details?.id) {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const { sanitizeForFirestore } = await import('@/lib/utils');
        await updateDoc(doc(db, 'activeTournaments', state.details.id.toString()), sanitizeForFirestore({
          settings: { ...state.settings, currency: currencySymbol },
          prizeStructure: {
            buyIn: buyInAmount, startingChips,
            rakeType, rakePercentage, rakeAmount,
            enableBounties, bountyAmount, bountyType,
            allowRebuys, rebuyAmount, rebuyChips, maxRebuys, rebuyPeriodLevels,
            allowReEntry, maxReEntries, reEntryPeriodLevels,
            allowAddons, addonAmount, addonChips, addonAvailableLevel,
            manualPayouts
          }
        }));
      }

      setJustApplied(true);
      setTimeout(() => setJustApplied(false), 2000);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* ── SECTION 1: Basics ─────────────────────────────── */}
      <Card className="card-glass-indigo rounded-xl">
        <CardContent className="p-5 space-y-4">
          <SectionHeader icon={CircleDollarSign} title="Buy-in & Chips" color="text-indigo-400" />

          <FieldRow label="Currency">
            <Select value={currencySymbol} onValueChange={setCurrencySymbol}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {[
                  ['$','USD'],['€','EUR'],['£','GBP'],['¥','JPY'],
                  ['C$','CAD'],['A$','AUD'],['₹','INR'],['R$','BRL'],
                  ['₽','RUB'],['₺','TRY'],['R','ZAR'],['CHF','CHF'],
                  ['kr','SEK'],['zł','PLN'],['₴','UAH'],['₪','ILS'],
                ].map(([sym, code]) => (
                  <SelectItem key={`${sym}-${code}`} value={sym}>{sym} {code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Buy-in Amount">
            <NumberInput value={buyInAmount} onChange={setBuyInAmount} prefix={currencySymbol} min={0} />
          </FieldRow>

          <FieldRow label="Starting Stack">
            <NumberInput value={startingChips} onChange={setStartingChips} suffix="chips" min={1000} step={1000} />
          </FieldRow>

          <FieldRow
            label="Tournament Fee / Rake"
            hint={rakeType === 'percentage' ? 'Deducted from prize pool' : 'Fixed amount deducted'}
          >
            <div className="flex items-center gap-2">
              <Select value={rakeType} onValueChange={(v: 'percentage' | 'fixed') => setRakeType(v)}>
                <SelectTrigger className="h-9 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">%</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                </SelectContent>
              </Select>
              <NumberInput
                value={rakeType === 'percentage' ? rakePercentage : rakeAmount}
                onChange={rakeType === 'percentage' ? setRakePercentage : setRakeAmount}
                prefix={rakeType === 'percentage' ? '%' : currencySymbol}
                max={rakeType === 'percentage' ? 100 : undefined}
              />
            </div>
          </FieldRow>

          {/* Live prize pool preview */}
          {state.players.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              <span className="text-sm text-muted-foreground">Estimated Prize Pool</span>
              <span className="font-mono font-bold text-lg text-primary">
                {currencySymbol}{netPool.toLocaleString()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION 2: Bounties ───────────────────────────── */}
      <Card className={cn('rounded-xl transition-all', enableBounties ? 'card-glass-orange' : 'card-glass')}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className={cn('h-4 w-4', enableBounties ? 'text-orange-400' : 'text-muted-foreground')} />
              <div>
                <Label htmlFor="enableBounties" className="text-sm font-semibold cursor-pointer">Bounties</Label>
                <p className="text-xs text-muted-foreground">Cash prizes for knockouts</p>
              </div>
            </div>
            <Checkbox
              id="enableBounties"
              checked={enableBounties}
              onCheckedChange={(c) => setEnableBounties(!!c)}
              className="h-5 w-5"
            />
          </div>

          {enableBounties && (
            <SubSection color="orange">
              <FieldRow label="Bounty per Knockout">
                <NumberInput value={bountyAmount} onChange={setBountyAmount} prefix={currencySymbol} />
              </FieldRow>
              <FieldRow label="Bounty Type">
                <Select value={bountyType} onValueChange={(v: 'standard' | 'progressive') => setBountyType(v)}>
                  <SelectTrigger className="h-9 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard (Fixed)</SelectItem>
                    <SelectItem value="progressive">Progressive (PKO)</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              {bountyType === 'progressive' && (
                <div className="text-xs text-orange-300/80 bg-orange-500/10 rounded p-2 border border-orange-500/20">
                  PKO: Half the bounty is paid immediately on knockout, half is added to your own bounty.
                </div>
              )}
            </SubSection>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION 3: Rebuys ────────────────────────────── */}
      <Card className={cn('rounded-xl transition-all', allowRebuys ? 'card-glass-purple' : 'card-glass')}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCw className={cn('h-4 w-4', allowRebuys ? 'text-purple-400' : 'text-muted-foreground')} />
              <div>
                <Label htmlFor="allowRebuys" className="text-sm font-semibold cursor-pointer">Rebuys</Label>
                <p className="text-xs text-muted-foreground">Top up chips after busting</p>
              </div>
            </div>
            <Checkbox
              id="allowRebuys"
              checked={allowRebuys}
              onCheckedChange={(c) => setAllowRebuys(!!c)}
              className="h-5 w-5"
            />
          </div>

          {allowRebuys && (
            <SubSection color="purple">
              <FieldRow label="Rebuy Cost">
                <NumberInput value={rebuyAmount} onChange={setRebuyAmount} prefix={currencySymbol} />
              </FieldRow>
              <FieldRow label="Rebuy Chips">
                <NumberInput value={rebuyChips} onChange={setRebuyChips} suffix="chips" step={1000} />
              </FieldRow>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Rebuy Period</Label>
                  <NumberInput value={rebuyPeriodLevels} onChange={setRebuyPeriodLevels} suffix="lvls" min={1} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Max Rebuys</Label>
                  <NumberInput value={maxRebuys} onChange={setMaxRebuys} placeholder="∞" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Available during first {rebuyPeriodLevels} levels · Max: {maxRebuys || 'unlimited'}
              </p>
            </SubSection>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION 4: Re-entry ──────────────────────────── */}
      <Card className={cn('rounded-xl transition-all', allowReEntry ? 'card-glass-blue' : 'card-glass')}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Plus className={cn('h-4 w-4', allowReEntry ? 'text-blue-400' : 'text-muted-foreground')} />
              <div>
                <Label htmlFor="allowReEntry" className="text-sm font-semibold cursor-pointer">Re-entry</Label>
                <p className="text-xs text-muted-foreground">Full buy-in, fresh starting stack</p>
              </div>
            </div>
            <Checkbox
              id="allowReEntry"
              checked={allowReEntry}
              onCheckedChange={(c) => setAllowReEntry(!!c)}
              className="h-5 w-5"
            />
          </div>

          {allowReEntry && (
            <SubSection color="blue">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Re-entry Period</Label>
                  <NumberInput value={reEntryPeriodLevels} onChange={setReEntryPeriodLevels} suffix="lvls" min={1} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Max Re-entries</Label>
                  <NumberInput value={maxReEntries} onChange={setMaxReEntries} placeholder="∞" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Full buy-in cost, fresh starting stack. Max 0 = unlimited.
              </p>
            </SubSection>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION 5: Add-ons ───────────────────────────── */}
      <Card className={cn('rounded-xl transition-all', allowAddons ? 'card-glass-green' : 'card-glass')}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Coins className={cn('h-4 w-4', allowAddons ? 'text-green-400' : 'text-muted-foreground')} />
              <div>
                <Label htmlFor="allowAddons" className="text-sm font-semibold cursor-pointer">Add-ons</Label>
                <p className="text-xs text-muted-foreground">Optional chip purchase at set level</p>
              </div>
            </div>
            <Checkbox
              id="allowAddons"
              checked={allowAddons}
              onCheckedChange={(c) => setAllowAddons(!!c)}
              className="h-5 w-5"
            />
          </div>

          {allowAddons && (
            <SubSection color="green">
              <FieldRow label="Add-on Cost">
                <NumberInput value={addonAmount} onChange={setAddonAmount} prefix={currencySymbol} />
              </FieldRow>
              <FieldRow label="Add-on Chips">
                <NumberInput value={addonChips} onChange={setAddonChips} suffix="chips" step={1000} />
              </FieldRow>
              <FieldRow label="Available from Level" hint="Typically after rebuy period ends">
                <NumberInput value={addonAvailableLevel} onChange={setAddonAvailableLevel} suffix="+" min={1} />
              </FieldRow>
            </SubSection>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION 6: Prize Distribution ───────────────── */}
      <Card className="card-glass-rose rounded-xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <SectionHeader icon={Trophy} title="Prize Distribution" color="text-rose-400" />
            <Select onValueChange={(v) => {
              const templates: Record<string, { position: number; percentage: number }[]> = {
                'wta': [{ position: 1, percentage: 100 }],
                'top-2': [{ position: 1, percentage: 65 }, { position: 2, percentage: 35 }],
                'top-3': [{ position: 1, percentage: 50 }, { position: 2, percentage: 30 }, { position: 3, percentage: 20 }],
                'top-4': [{ position: 1, percentage: 40 }, { position: 2, percentage: 30 }, { position: 3, percentage: 20 }, { position: 4, percentage: 10 }],
              };
              if (templates[v]) setManualPayouts(templates[v]);
              else if (v === 'top-10pct') {
                const n = Math.max(1, Math.ceil((state.players.length || 10) * 0.1));
                const pts = [40, 25, 15, 10, 6, 4];
                const payouts = Array.from({ length: n }, (_, i) => ({
                  position: i + 1,
                  percentage: i < pts.length - 1 ? pts[i] : Math.max(1, Math.floor(100 / n))
                }));
                // normalise to 100
                const sum = payouts.reduce((s, p) => s + p.percentage, 0);
                payouts[payouts.length - 1].percentage += 100 - sum;
                setManualPayouts(payouts);
              }
            }}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Templates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wta">Winner Takes All</SelectItem>
                <SelectItem value="top-2">Top 2 (65/35)</SelectItem>
                <SelectItem value="top-3">Top 3 (50/30/20)</SelectItem>
                <SelectItem value="top-4">Top 4 (40/30/20/10)</SelectItem>
                <SelectItem value="top-10pct">Top 10% of Field</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {totalPercentage !== 100 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
              <span>⚠️</span>
              <span>Total: {totalPercentage}% — must equal 100%</span>
            </div>
          )}

          <div className="space-y-2">
            {manualPayouts.map((payout, i) => {
              const ordinals = ['1st', '2nd', '3rd'];
              const label = ordinals[i] || `${i + 1}th`;
              const amount = netPool > 0 ? Math.floor(netPool * payout.percentage / 100) : null;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-10 text-muted-foreground">{label}</span>
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={payout.percentage === 0 ? '' : payout.percentage}
                      onChange={(e) => {
                        const newPayouts = [...manualPayouts];
                        newPayouts[i].percentage = parseInt(e.target.value) || 0;
                        setManualPayouts(newPayouts);
                      }}
                      onFocus={(e) => e.target.select()}
                      className="h-9 w-20 text-right"
                      inputMode="numeric"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    {amount !== null && amount > 0 && (
                      <span className="text-sm font-mono text-primary ml-2">
                        {currencySymbol}{amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {manualPayouts.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setManualPayouts(manualPayouts.filter((_, j) => j !== i).map((p, j) => ({ ...p, position: j + 1 })))}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setManualPayouts([...manualPayouts, { position: manualPayouts.length + 1, percentage: 0 }])}
            className="btn-add-position h-9 text-sm w-full"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Position
          </Button>
        </CardContent>
      </Card>

      {/* ── Apply Button ─────────────────────────────────── */}
      <Button
        className="btn-apply-changes h-11 w-full text-sm font-semibold transition-all duration-200"
        variant="outline"
        disabled={isApplying || totalPercentage !== 100}
        onClick={applyChanges}
      >
        {isApplying ? (
          <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Applying...</>
        ) : justApplied ? (
          <><span className="mr-2">✓</span>Applied!</>
        ) : (
          'Apply Changes'
        )}
      </Button>

      {totalPercentage !== 100 && (
        <p className="text-xs text-center text-amber-400">Fix prize distribution before applying</p>
      )}
    </div>
  );
}
