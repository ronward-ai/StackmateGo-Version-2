import { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [buyInAmount, setBuyInAmount] = useState(10);
  const [bountyAmount, setBountyAmount] = useState(0);
  const [enableBounties, setEnableBounties] = useState(false);
  const [allowRebuys, setAllowRebuys] = useState(false);
  const [allowAddons, setAllowAddons] = useState(false);
  const [rebuyAmount, setRebuyAmount] = useState(10);
  const [addonAmount, setAddonAmount] = useState(10);
  const [rebuyPeriodLevels, setRebuyPeriodLevels] = useState(3);
  const [maxRebuys, setMaxRebuys] = useState(0);
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
    <Card className="p-4 bg-gradient-to-r from-slate-800/50 to-slate-700/50 border border-slate-600/30 backdrop-blur-sm">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <DollarSign className="mr-2 h-5 w-5 text-secondary" />
          Buy-in & Prizes
        </h2>
        {isExpanded ? (
          <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
            unfold_less
          </span>
        ) : (
          <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
            unfold_more
          </span>
        )}
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
          <div className="space-y-4">
            {/* Currency Selection */}
            <div className="space-y-2">
              <Label htmlFor="currency" className="text-sm font-medium">
                Currency
              </Label>
              <Select value={currencySymbol} onValueChange={setCurrencySymbol}>
                <SelectTrigger className="h-10">
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
                <span className="text-sm font-medium min-w-[20px]">{currencySymbol}</span>
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
                  className="w-24 h-10 !bg-black border-gray-600 text-white"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Starting Stack */}
            <div className="space-y-2">
              <Label htmlFor="startingChips" className="text-sm font-medium">
                Starting Stack (Chips)
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
                  className="w-32 h-10 !bg-black border-gray-600 text-white"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="10000"
                />
                <span className="text-sm text-muted-foreground">chips</span>
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
                    <span className="text-sm font-medium min-w-[20px]">{currencySymbol}</span>
                    <Input
                      id="bountyAmount"
                      type="text"
                      value={bountyAmount === 0 ? '' : bountyAmount}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d+$/.test(value)) {
                          setBountyAmount(value === '' ? 0 : parseInt(value) || 0);
                        }
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-24 h-10 !bg-black border-gray-600 text-white [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="rebuyAmount" className="text-sm font-medium text-muted-foreground">
                        Rebuy Amount
                      </Label>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium min-w-[20px]">{currencySymbol}</span>
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
                          className="w-24 h-10 !bg-black border-gray-600 text-white"
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
                              setRebuyChips(1000);
                            } else {
                              setRebuyChips(parseInt(value) || 1000);
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-24 h-10 !bg-black border-gray-600 text-white"
                          placeholder="10000"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                        <span className="text-xs text-muted-foreground">chips</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="rebuyPeriod" className="text-sm font-medium text-muted-foreground">
                        Rebuy Period (levels)
                      </Label>
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
                        className="h-10 !bg-black border-gray-600 text-white"
                        placeholder="3"
                        inputMode="numeric"
                        pattern="[0-9]*"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="maxRebuys" className="text-sm font-medium text-muted-foreground">
                        Max Rebuys
                      </Label>
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
                        className="h-10 !bg-black border-gray-600 text-white"
                        placeholder="0"
                        inputMode="numeric"
                        pattern="[0-9]*"
                      />
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="addonAmount" className="text-sm font-medium text-muted-foreground">
                        Add-on Amount
                      </Label>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium min-w-[20px]">{currencySymbol}</span>
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
                          className="w-24 h-10 !bg-black border-gray-600 text-white"
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
                              setAddonChips(1000);
                            } else {
                              setAddonChips(parseInt(value) || 1000);
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-24 h-10 !bg-black border-gray-600 text-white"
                          placeholder="10000"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                        <span className="text-xs text-muted-foreground">chips</span>
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
                        className="w-24 h-10 !bg-black border-gray-600 text-white"
                        placeholder="6"
                        inputMode="numeric"
                        pattern="[0-9]*"
                      />
                      <span className="text-xs text-muted-foreground">and higher</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add-ons become available from level {addonAvailableLevel} onwards (typically after rebuy period)
                  </p>
                </div>
              )}
            </div>
          </div>

          <Separator className="my-4" />

          {/* Prize Money Distribution */}
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-medium mb-1">Prize Money Distribution</h3>
              <p className="text-sm text-muted-foreground">
                Set payout percentages for each position. Total should add up to 100%.
              </p>
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
                className="h-10 text-sm bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10"
              >
                <span className="material-icons text-sm mr-1">add</span>
                Add Position
              </Button>
            </div>
          </div>

          <Button 
            className="h-10 bg-card border border-green-500 text-green-500 hover:bg-green-500 hover:bg-opacity-10 w-full mt-4" 
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
                  setTimeout(() => {
                    fetch(`/api/tournaments/${state.details.id}/timer-update`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
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
                      })
                    }).catch(error => {
                      console.error('Failed to broadcast buy-in/prize changes:', error);
                    });
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

          
        </div>
      )}
    </Card>
  );
}