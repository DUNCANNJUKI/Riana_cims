import { useEffect, useMemo, useState } from 'react';
import {
  CountryCode,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js/max';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const defaultCountry = (import.meta.env.VITE_DEFAULT_PHONE_COUNTRY || 'KE') as CountryCode;

export const normalizeInternationalPhone = (value: string, country: CountryCode = defaultCountry) => {
  const parsed = parsePhoneNumberFromString(String(value || '').trim(), country);
  const type = parsed?.getType();
  return parsed?.isValid() && (type === 'MOBILE' || type === 'FIXED_LINE_OR_MOBILE') ? parsed.number : null;
};

export const isValidInternationalPhone = (value: string) => Boolean(normalizeInternationalPhone(value));

interface CountryPhoneInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export const CountryPhoneInput = ({
  id,
  value,
  onChange,
  disabled,
  required,
  className,
}: CountryPhoneInputProps) => {
  const inferredCountry = parsePhoneNumberFromString(value || '')?.country;
  const [country, setCountry] = useState<CountryCode>(inferredCountry || defaultCountry);
  const regionNames = useMemo(
    () => typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null,
    [],
  );
  const countries = useMemo(() => getCountries()
    .map((code) => ({
      code,
      name: regionNames?.of(code) || code,
      callingCode: getCountryCallingCode(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name)), [regionNames]);

  useEffect(() => {
    if (inferredCountry && inferredCountry !== country) setCountry(inferredCountry);
  }, [inferredCountry, country]);

  const displayValue = useMemo(() => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const parsed = parsePhoneNumberFromString(raw, country);
    if (parsed?.nationalNumber) return parsed.nationalNumber;

    const cleaned = raw.replace(/[^\d+]/g, '');
    const callingCode = getCountryCallingCode(country);
    if (cleaned.startsWith(`+${callingCode}`)) return cleaned.slice(callingCode.length + 1);
    if (cleaned.startsWith(callingCode)) return cleaned.slice(callingCode.length);
    return cleaned.replace(/^\+/, '');
  }, [country, value]);

  const updateNumber = (rawValue: string, selectedCountry = country) => {
    const cleaned = rawValue.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) {
      onChange(cleaned);
      return;
    }
    const nationalDigits = cleaned.replace(/^0+/, '');
    onChange(nationalDigits ? `+${getCountryCallingCode(selectedCountry)}${nationalDigits}` : '');
  };

  const changeCountry = (nextCountry: CountryCode) => {
    const parsed = parsePhoneNumberFromString(value || '', country);
    const nationalNumber = parsed?.nationalNumber || '';
    setCountry(nextCountry);
    onChange(nationalNumber ? `+${getCountryCallingCode(nextCountry)}${nationalNumber}` : '');
  };

  return (
    <div className={cn('grid grid-cols-[minmax(8.5rem,0.8fr)_minmax(9rem,1.2fr)] gap-2', className)}>
      <select
        aria-label="Phone country code"
        value={country}
        onChange={(event) => changeCountry(event.target.value as CountryCode)}
        disabled={disabled}
        className="h-10 min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {countries.map(({ code, name, callingCode }) => (
          <option key={code} value={code}>{name} (+{callingCode})</option>
        ))}
      </select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={displayValue}
        onChange={(event) => updateNumber(event.target.value)}
        placeholder="Phone number"
        disabled={disabled}
        required={required}
        maxLength={20}
      />
    </div>
  );
};
