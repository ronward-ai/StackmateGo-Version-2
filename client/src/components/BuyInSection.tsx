import { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign } from "lucide-react";

interface BuyInSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function BuyInSection({ tournament }: BuyInSectionProps) {

  const [buyInAmount, setBuyInAmount] = useState(10);
  const [bountyAmount, setBountyAmount] = useState(0);
  const [enableBounties, setEnableBounties] = useState(false);
  const [allowRebuys, setAllowRebuys] = useState(false);
  const [allowAddons, setAllowAddons] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(10);
  const [addonAmount, setAddonAmount] = useState(10);
  const [rebuyPeriodLevels, setRebuyPeriodLevels] = useState(3);
  const [maxRebuys, setMaxRebuys] = useState(0);
  const [rakePercentage, setRakePercentage] = useState(0);
  const [rakeAmount, setRakeAmount] = useState(0);
  const [rakeType, setRakeType] = useState<'percentage' | 'fixed'>('percentage');
  const [currencySymbol, setCurrencySymbol] = useState('£');
  const [isApplying, setIsApplying] = useState(false);
  const [justApplied, setJustApplied] = useState(false);
  const [manualPayouts, setManualPayouts] = useState<{position: number; percentage: number}[]>([
    {position: 1, percentage: 50},
    {position: 2, percentage: 30},
    {position: 3, percentage: 20}
  ]);
  const [startingChips, setStartingChips] = useState(10000);
  const [rebuyChips, setRebuyChips] = useState(10000);
  const [addonChips, setAddonChips] = useState(10000);
  const [addonAvailableLevel, setAddonAvailableLevel] = useState(6);

  const { 
    state, 
    updateSettings, 
    updatePrizeStructure
  } = tournament;

  // Initialize prize structure values
  useEffect(() => {
    if (state.prizeStructure) {
      setBuyInAmount(state.prizeStructure.buyIn);
      setBountyAmount(state.prizeStructure.bountyAmount || 0);
      setEnableBounties(state.prizeStructure.enableBounties || false);
      setAllowRebuys(state.prizeStructure.allowRebuys || false);
      setAllowAddons(state.prizeStructure.allowAddons || false);
      setRebuyAmount(state.prizeStructure.rebuyAmount || 10);
      setAddonAmount(state.prizeStructure.addonAmount || 10);
      setRebuyPeriodLevels(state.prizeStructure.rebuyPeriodLevels || 3);
      setMaxRebuys(state.prizeStructure.maxRebuys || 0);
      setRakePercentage(state.prizeStructure.rakePercentage || 0);
      setRakeAmount(state.prizeStructure.rakeAmount || 0);
      setRakeType(state.prizeStructure.rakeType || 'percentage');
      setStartingChips(state.prizeStructure.startingChips || 10000);
      setRebuyChips(state.prizeStructure.rebuyChips || 10000);
      setAddonChips(state.prizeStructure.addonChips || 10000);
      setAddonAvailableLevel(state.prizeStructure.addonAvailableLevel || 6);
      if (state.prizeStructure.manualPayouts) {
        setManualPayouts(state.prizeStructure.manualPayouts);
      }
    }
  }, [state.prizeStructure]);

  // Initialize currency from settings
  useEffect(() => {
    if (state.settings.currency) {
      setCurrencySymbol(state.settings.currency);
    }
  }, [state.settings.currency]);

  return (
    <Card className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 border border-slate-600/30 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold flex items-center">
            <DollarSign className="mr-2 h-5 w-5 text-orange-500" />
            Buy-in & Prizes
          </h2>
        </div>

        <div className="space-y-6">
          {/* Currency Selection */}
          <div className="space-y-2">
            <Label htmlFor="currency" className="text-sm font-medium">
              Currency
            </Label>
            <Select value={currencySymbol} onValueChange={setCurrencySymbol}>
              <SelectTrigger className="h-10 w-full sm:w-[280px]">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="$">$ (USD - US Dollar)</SelectItem>
                  <SelectItem value="€">€ (EUR - Euro)</SelectItem>
                  <SelectItem value="£">£ (GBP - British Pound)</SelectItem>
                  <SelectItem value="¥">¥ (JPY - Japanese Yen)</SelectItem>
                  <SelectItem value="C$">C$ (CAD - Canadian Dollar)</SelectItem>
                  <SelectItem value="A$">A$ (AUD - Australian Dollar)</SelectItem>
                  <SelectItem value="₹">₹ (INR - Indian Rupee)</SelectItem>
                  <SelectItem value="₩">₩ (KRW - South Korean Won)</SelectItem>
                  <SelectItem value="¥">¥ (CNY - Chinese Yuan)</SelectItem>
                  <SelectItem value="R$">R$ (BRL - Brazilian Real)</SelectItem>
                  <SelectItem value="₽">₽ (RUB - Russian Ruble)</SelectItem>
                  <SelectItem value="₺">₺ (TRY - Turkish Lira)</SelectItem>
                  <SelectItem value="₱">₱ (PHP - Philippine Peso)</SelectItem>
                  <SelectItem value="₡">₡ (CRC - Costa Rican Colón)</SelectItem>
                  <SelectItem value="₨">₨ (PKR - Pakistani Rupee)</SelectItem>
                  <SelectItem value="₦">₦ (NGN - Nigerian Naira)</SelectItem>
                  <SelectItem value="₴">₴ (UAH - Ukrainian Hryvnia)</SelectItem>
                  <SelectItem value="₪">₪ (ILS - Israeli Shekel)</SelectItem>
                  <SelectItem value="₫">₫ (VND - Vietnamese Dong)</SelectItem>
                  <SelectItem value="₨">₨ (LKR - Sri Lankan Rupee)</SelectItem>
                  <SelectItem value="₹">₹ (BTN - Bhutanese Ngultrum)</SelectItem>
                  <SelectItem value="₨">₨ (NPR - Nepalese Rupee)</SelectItem>
                  <SelectItem value="₨">₨ (MVR - Maldivian Rufiyaa)</SelectItem>
                  <SelectItem value="₨">₨ (MUR - Mauritian Rupee)</SelectItem>
                  <SelectItem value="₨">₨ (SCR - Seychellois Rupee)</SelectItem>
                  <SelectItem value="R">R (ZAR - South African Rand)</SelectItem>
                  <SelectItem value="CHF">CHF (Swiss Franc)</SelectItem>
                  <SelectItem value="kr">kr (SEK - Swedish Krona)</SelectItem>
                  <SelectItem value="kr">kr (NOK - Norwegian Krone)</SelectItem>
                  <SelectItem value="kr">kr (DKK - Danish Krone)</SelectItem>
                  <SelectItem value="zł">zł (PLN - Polish Złoty)</SelectItem>
                  <SelectItem value="Kč">Kč (CZK - Czech Koruna)</SelectItem>
                  <SelectItem value="Ft">Ft (HUF - Hungarian Forint)</SelectItem>
                  <SelectItem value="lei">lei (RON - Romanian Leu)</SelectItem>
                  <SelectItem value="лв">лв (BGN - Bulgarian Lev)</SelectItem>
                  <SelectItem value="kn">kn (HRK - Croatian Kuna)</SelectItem>
                  <SelectItem value="din">din (RSD - Serbian Dinar)</SelectItem>
                  <SelectItem value="₼">₼ (AZN - Azerbaijani Manat)</SelectItem>
                  <SelectItem value="₸">₸ (KZT - Kazakhstani Tenge)</SelectItem>
                  <SelectItem value="сом">сом (KGS - Kyrgyzstani Som)</SelectItem>
                  <SelectItem value="сом">сом (UZS - Uzbekistani Som)</SelectItem>
                  <SelectItem value="₾">₾ (GEL - Georgian Lari)</SelectItem>
                  <SelectItem value="֏">֏ (AMD - Armenian Dram)</SelectItem>
                  <SelectItem value="ман">ман (TMT - Turkmenistani Manat)</SelectItem>
                  <SelectItem value="₼">₼ (BYN - Belarusian Ruble)</SelectItem>
                  <SelectItem value="lek">lek (ALL - Albanian Lek)</SelectItem>
                  <SelectItem value="КМ">КМ (BAM - Bosnia-Herzegovina Convertible Mark)</SelectItem>
                  <SelectItem value="ден">ден (MKD - Macedonian Denar)</SelectItem>
                  <SelectItem value="MT">MT (MZN - Mozambican Metical)</SelectItem>
              </SelectContent>
            </Select>
          </div>

            {/* Buy-in Amount */}
            <div className="space-y-2">
              <Label htmlFor="buyIn" className="text-sm font-medium">
                Buy-in Amount
              </Label>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium w-8 text-center">{currencySymbol}</span>
                <Input
                  id="buyIn"
                  type="number"
                  min={0}
                  value={buyInAmount === 0 ? '' : buyInAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setBuyInAmount(0);
                    } else {
                      setBuyInAmount(parseInt(value) || 0);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  className="w-32 h-10"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Tournament Fee / Rake */}
            <div className="space-y-2">
              <Label htmlFor="rakeInput" className="text-sm font-medium">
                Tournament Fee / Rake
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={rakeType} onValueChange={(value: 'percentage' | 'fixed') => setRakeType(value)}>
                  <SelectTrigger className="w-[140px] h-10">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
                
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium w-8 text-center">
                    {rakeType === 'percentage' ? '%' : currencySymbol}
                  </span>
                  <Input
                    id="rakeInput"
                    type="number"
                    min={0}
                    max={rakeType === 'percentage' ? 100 : undefined}
                    value={rakeType === 'percentage' ? (rakePercentage === 0 ? '' : rakePercentage) : (rakeAmount === 0 ? '' : rakeAmount)}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        if (rakeType === 'percentage') setRakePercentage(0);
                        else setRakeAmount(0);
                      } else {
                        const parsed = parseInt(value) || 0;
                        if (rakeType === 'percentage') {
                          setRakePercentage(Math.min(100, Math.max(0, parsed)));
                        } else {
                          setRakeAmount(Math.max(0, parsed));
                        }
                      }
                    }}
                    onFocus={(e) => e.target.select()}
                    className="w-32 h-10"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {rakeType === 'percentage' 
                  ? 'Percentage deducted from the total prize pool.' 
                  : 'Fixed amount deducted from the total prize pool.'}
              </p>
            </div>

            {/* Starting Stack */}
            <div className="space-y-2">
              <Label htmlFor="startingChips" className="text-sm font-medium">
                Starting Stack
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="startingChips"
                  type="number"
                  min={1000}
                  step={1000}
                  value={startingChips === 0 ? '' : startingChips}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setStartingChips(1000);
                    } else {
                      setStartingChips(parseInt(value) || 1000);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  className="w-32 h-10"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
                <span className="text-sm text-muted-foreground w-12">chips</span>
              </div>
            </div>

            {/* Bounties Section */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enableBounties"
                  checked={enableBounties}
                  onCheckedChange={(checked) => setEnableBounties(!!checked)}
                />
                <Label htmlFor="enableBounties" className="text-sm font-medium">
                  Add Bounties
                </Label>
              </div>

              {enableBounties && (
                <div className="ml-6 space-y-2">
                  <Label htmlFor="bountyAmount" className="text-sm font-medium text-muted-foreground">
                    Bounty per Knockout
                  </Label>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium w-8 text-center">{currencySymbol}</span>
                    <Input
                      id="bountyAmount"
                      type="number"
                      min={0}
                      value={bountyAmount === 0 ? '' : bountyAmount}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '') {
                          setBountyAmount(0);
                        } else {
                          setBountyAmount(parseInt(value) || 0);
                        }
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-24 h-10"
                      placeholder="0"
                      inputMode="numeric"
                      pattern="[0-9]*"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Rebuys Section */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allowRebuys"
                  checked={allowRebuys}
                  onCheckedChange={(checked) => setAllowRebuys(!!checked)}
                />
                <Label htmlFor="allowRebuys" className="text-sm font-medium">
                  Allow Rebuys
                </Label>
              </div>

              {allowRebuys && (
                <div className="ml-6 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="rebuyAmount" className="text-sm font-medium text-muted-foreground">
                        Rebuy Amount
                      </Label>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium w-8 text-center">{currencySymbol}</span>
                        <Input
                          id="rebuyAmount"
                          type="number"
                          min={0}
                          value={rebuyAmount === 0 ? '' : rebuyAmount}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setRebuyAmount(0);
                            } else {
                              setRebuyAmount(parseInt(value) || 0);
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-24 h-10"
                          placeholder="10"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rebuyChips" className="text-sm font-medium text-muted-foreground">
                        Rebuy Chips
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="rebuyChips"
                          type="number"
                          min={1000}
                          step={1000}
                          value={rebuyChips === 0 ? '' : rebuyChips}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setRebuyChips(0);
                            } else {
                              setRebuyChips(parseInt(value) || 0);
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-24 h-10"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                        <span className="text-sm text-muted-foreground w-12">chips</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="rebuyPeriod" className="text-sm font-medium text-muted-foreground">
                        Rebuy Period
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="rebuyPeriod"
                          type="number"
                          min={1}
                          value={rebuyPeriodLevels === 1 ? '' : rebuyPeriodLevels}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setRebuyPeriodLevels(1);
                            } else {
                              setRebuyPeriodLevels(parseInt(value) || 1);
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-24 h-10"
                          placeholder="3"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                        <span className="text-sm text-muted-foreground w-12">levels</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxRebuys" className="text-sm font-medium text-muted-foreground">
                        Max Rebuys
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="maxRebuys"
                          type="number"
                          min={0}
                          value={maxRebuys === 0 ? '' : maxRebuys}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setMaxRebuys(0);
                            } else {
                              setMaxRebuys(parseInt(value) || 0);
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-24 h-10"
                          placeholder="0"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                        <span className="text-sm text-muted-foreground w-12">max</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Players can rebuy during first {rebuyPeriodLevels} levels. Max: {maxRebuys || 'unlimited'}
                  </p>
                </div>
              )}
            </div>

            {/* Addons Section */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allowAddons"
                  checked={allowAddons}
                  onCheckedChange={(checked) => setAllowAddons(!!checked)}
                />
                <Label htmlFor="allowAddons" className="text-sm font-medium">
                  Allow Add-ons
                </Label>
              </div>

              {allowAddons && (
                <div className="ml-6 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="addonAmount" className="text-sm font-medium text-muted-foreground">
                        Add-on Amount
                      </Label>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium w-8 text-center">{currencySymbol}</span>
                        <Input
                          id="addonAmount"
                          type="number"
                          min={0}
                          value={addonAmount === 0 ? '' : addonAmount}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setAddonAmount(0);
                            } else {
                              setAddonAmount(parseInt(value) || 0);
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-24 h-10"
                          placeholder="10"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="addonChips" className="text-sm font-medium text-muted-foreground">
                        Add-on Chips
                      </Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="addonChips"
                          type="number"
                          min={1000}
                          step={1000}
                          value={addonChips === 0 ? '' : addonChips}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setAddonChips(0);
                            } else {
                              setAddonChips(parseInt(value) || 0);
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-24 h-10"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                        <span className="text-sm text-muted-foreground w-12">chips</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addonAvailableLevel" className="text-sm font-medium text-muted-foreground">
                      Available from Level
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Input
                        id="addonAvailableLevel"
                        type="number"
                        min={1}
                        value={addonAvailableLevel === 0 ? '' : addonAvailableLevel}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            setAddonAvailableLevel(1);
                          } else {
                            setAddonAvailableLevel(parseInt(value) || 1);
                          }
                        }}
                        onFocus={(e) => e.target.select()}
                        className="w-24 h-10"
                        placeholder="6"
                        inputMode="numeric"
                        pattern="[0-9]*"
                      />
                      <span className="text-sm text-muted-foreground w-16">and higher</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add-ons become available from level {addonAvailableLevel} onwards (typically after rebuy period)
                  </p>
                </div>
              )}
            </div>
          </div>

          <Separator className="my-6" />

          {/* Prize Money Distribution */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-medium mb-1">Prize Money Distribution</h3>
                <p className="text-sm text-muted-foreground">
                  Set payout percentages for each position. Total should add up to 100%.
                </p>
              </div>
              <Select onValueChange={(value) => {
                if (value === 'winner-takes-all') {
                  setManualPayouts([{ position: 1, percentage: 100 }]);
                } else if (value === 'top-2') {
                  setManualPayouts([
                    { position: 1, percentage: 65 },
                    { position: 2, percentage: 35 }
                  ]);
                } else if (value === 'top-3') {
                  setManualPayouts([
                    { position: 1, percentage: 50 },
                    { position: 2, percentage: 30 },
                    { position: 3, percentage: 20 }
                  ]);
                } else if (value === 'top-4') {
                  setManualPayouts([
                    { position: 1, percentage: 40 },
                    { position: 2, percentage: 30 },
                    { position: 3, percentage: 20 },
                    { position: 4, percentage: 10 }
                  ]);
                } else if (value === 'top-10-percent') {
                  const numPlayers = state.players.length || 10; // Default to 10 if no players
                  const numPaid = Math.max(1, Math.ceil(numPlayers * 0.1));
                  
                  if (numPaid === 1) {
                    setManualPayouts([{ position: 1, percentage: 100 }]);
                  } else if (numPaid === 2) {
                    setManualPayouts([
                      { position: 1, percentage: 65 },
                      { position: 2, percentage: 35 }
                    ]);
                  } else if (numPaid === 3) {
                    setManualPayouts([
                      { position: 1, percentage: 50 },
                      { position: 2, percentage: 30 },
                      { position: 3, percentage: 20 }
                    ]);
                  } else {
                    // Simple distribution for 4+ players
                    const payouts = [];
                    let remaining = 100;
                    let currentPercentage = 40; // Start with 40% for 1st
                    
                    for (let i = 0; i < numPaid; i++) {
                      if (i === numPaid - 1) {
                        payouts.push({ position: i + 1, percentage: remaining });
                      } else {
                        payouts.push({ position: i + 1, percentage: currentPercentage });
                        remaining -= currentPercentage;
                        currentPercentage = Math.floor(currentPercentage * 0.6); // Decrease by 40% each step
                      }
                    }
                    setManualPayouts(payouts);
                  }
                }
              }}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Templates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="winner-takes-all">Winner Takes All (100%)</SelectItem>
                  <SelectItem value="top-2">Top 2 (65/35)</SelectItem>
                  <SelectItem value="top-3">Top 3 (50/30/20)</SelectItem>
                  <SelectItem value="top-4">Top 4 (40/30/20/10)</SelectItem>
                  <SelectItem value="top-10-percent">Top 10% of Field</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(() => {
              // Calculate total percentage
              const totalPercentage = manualPayouts.reduce((sum, payout) => sum + payout.percentage, 0);

              // Show warning if not 100%
              if (totalPercentage !== 100) {
                return (
                  <div className="bg-amber-500 bg-opacity-10 rounded-lg p-3 border border-amber-500">
                    <div className="flex items-center text-amber-500">
                      <span className="material-icons text-sm mr-2">warning</span>
                      <span className="text-sm font-medium">
                        Total: {totalPercentage}% (should be 100%)
                      </span>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            <div className="space-y-2">
              {manualPayouts.map((payout, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-12 text-sm font-medium">
                    {index === 0 ? "1st:" : 
                     index === 1 ? "2nd:" : 
                     index === 2 ? "3rd:" : 
                     `${index + 1}th:`}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={payout.percentage === 0 ? '' : payout.percentage}
                      onChange={(e) => {
                        const value = e.target.value;
                        const newPayouts = [...manualPayouts];
                        if (value === '') {
                          newPayouts[index].percentage = 0;
                        } else {
                          newPayouts[index].percentage = parseInt(value) || 0;
                        }
                        setManualPayouts(newPayouts);
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-16 h-10 !bg-black border-gray-600 text-white"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="0"
                    />
                    <span className="text-sm">%</span>
                  </div>
                  {manualPayouts.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newPayouts = manualPayouts.filter((_, i) => i !== index);
                        // Adjust position numbers
                        newPayouts.forEach((p, i) => {
                          p.position = i + 1;
                        });
                        setManualPayouts(newPayouts);
                      }}
                      className="h-10 px-3 text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}

              <Button
                variant="outline"
                onClick={() => {
                  const newPosition = manualPayouts.length + 1;
                  setManualPayouts([...manualPayouts, { position: newPosition, percentage: 0 }]);
                }}
                className="btn-add-position h-10 text-sm transition-all duration-200"
              >
                <span className="material-icons text-sm mr-1">add</span>
                Add Position
              </Button>
            </div>
          </div>

          <Button 
            className="btn-apply-changes h-10 w-full mt-6 transition-all duration-200" 
            variant="outline"
            disabled={isApplying}
            onClick={async () => {
              setIsApplying(true);

              try {
                // Update prize structure with new buy-in amount, bounty settings, rebuy/addon settings and manual payouts
                updatePrizeStructure({ 
                  buyIn: buyInAmount,
                  bountyAmount: enableBounties ? bountyAmount : 0,
                  enableBounties,
                  allowRebuys,
                  allowAddons,
                  rebuyAmount,
                  addonAmount,
                  rebuyPeriodLevels,
                  maxRebuys,
                  rakePercentage,
                  rakeAmount,
                  rakeType,
                  manualPayouts,
                  startingChips,
                  rebuyChips,
                  addonChips,
                  addonAvailableLevel
                });

                // Update currency in settings
                updateSettings({ currency: currencySymbol });

                // Broadcast buy-in/prize changes to participant view for database tournaments
                if (state.details?.type === 'database' && state.details?.id) {
                  setTimeout(async () => {
                    try {
                      const { doc, updateDoc } = await import('firebase/firestore');
                      const { db } = await import('@/lib/firebase');
                      const { sanitizeForFirestore } = await import('@/lib/utils');
                      const docRef = doc(db, 'activeTournaments', state.details!.id.toString());
                      
                      await updateDoc(docRef, sanitizeForFirestore({
                        currentLevel: state.currentLevel,
                        secondsLeft: state.secondsLeft,
                        isRunning: state.isRunning,
                        smallBlind: state.levels[state.currentLevel]?.small || 0,
                        bigBlind: state.levels[state.currentLevel]?.big || 0,
                        ante: state.levels[state.currentLevel]?.ante || 0,
                        players: state.players || [],
                        blindLevels: state.levels || [],
                        settings: { ...state.settings, currency: currencySymbol },
                        prizeStructure: {
                          buyIn: buyInAmount,
                          bountyAmount: enableBounties ? bountyAmount : 0,
                          enableBounties,
                          allowRebuys,
                          allowAddons,
                          rebuyAmount,
                          addonAmount,
                          rebuyPeriodLevels,
                          maxRebuys,
                          manualPayouts,
                          startingChips,
                          rebuyChips,
                          addonChips,
                          addonAvailableLevel
                        }
                      }));
                    } catch (error) {
                      console.error('Failed to broadcast buy-in/prize changes:', error);
                    }
                  }, 100);
                }

                // Show success state
                setJustApplied(true);
                setTimeout(() => setJustApplied(false), 2000);

              } finally {
                setIsApplying(false);
              }
            }}
          >
            {isApplying ? (
              <>
                <span className="animate-spin mr-2">⟳</span>
                <span>Applying...</span>
              </>
            ) : justApplied ? (
              <>
                <span className="material-icons text-sm mr-1">check</span>
                <span>Applied!</span>
              </>
            ) : (
              <>
                <span className="material-icons text-sm mr-1">save</span>
                <span>Apply Changes</span>
              </>
            )}
          </Button>
      </CardContent>
    </Card>
  );
}