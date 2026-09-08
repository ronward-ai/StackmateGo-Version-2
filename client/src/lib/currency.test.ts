import { describe, it, expect } from 'vitest';
import { currencyOf, money, DEFAULT_CURRENCY } from './currency';

describe('currencyOf', () => {
  it('uses the setting when there is one', () => {
    expect(currencyOf({ currency: '$' })).toBe('$');
    expect(currencyOf({ currency: '€' })).toBe('€');
  });

  it('falls back to the historical default, so old leagues do not move', () => {
    expect(currencyOf()).toBe(DEFAULT_CURRENCY);
    expect(currencyOf(null)).toBe(DEFAULT_CURRENCY);
    expect(currencyOf({})).toBe(DEFAULT_CURRENCY);
    expect(currencyOf({ currency: '' })).toBe(DEFAULT_CURRENCY);
    expect(currencyOf({ currency: '   ' })).toBe(DEFAULT_CURRENCY);
  });
});

describe('money', () => {
  it('groups thousands', () => {
    expect(money(1234, '£')).toBe('£1,234');
  });

  it('rounds to whole units', () => {
    expect(money(12.4, '$')).toBe('$12');
    expect(money(12.6, '$')).toBe('$13');
  });

  it('keeps the sign outside the symbol', () => {
    expect(money(-20, '£')).toBe('-£20');
  });

  it('takes whatever symbol it is given', () => {
    expect(money(50, '€')).toBe('€50');
  });
});
