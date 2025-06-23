import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Textarea } from '@owox/ui/components/textarea';

interface SecureJsonInputProps {
  value: string;
  onChange: (value: string) => void;
  keysToMask?: string[];
  className?: string;
}

interface JsonObject {
  [key: string]: JsonValue;
}
type JsonArray = JsonValue[];
type JsonValue = string | number | boolean | null | JsonObject | JsonArray;

export function SecureJsonInput({
  value,
  onChange,
  keysToMask = [],
  className,
}: SecureJsonInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  const getMaskedValue = (jsonString: string): string => {
    if (!jsonString) return '';

    try {
      const json = JSON.parse(jsonString) as JsonObject;

      const maskObject = (obj: JsonValue): JsonValue => {
        if (typeof obj !== 'object' || obj === null) return obj;

        const masked: JsonObject | JsonArray = Array.isArray(obj) ? [...obj] : { ...obj };

        if (Array.isArray(masked)) {
          masked.forEach((item, index) => {
            if (typeof item === 'object' && item !== null) {
              masked[index] = maskObject(item);
            }
          });
        } else {
          Object.entries(masked).forEach(([key, value]) => {
            if (keysToMask.includes(key)) {
              if (typeof value === 'string') {
                masked[key] = '*'.repeat(value.length);
              } else {
                masked[key] = '*****';
              }
            } else if (typeof value === 'object' && value !== null) {
              masked[key] = maskObject(value);
            }
          });
        }

        return masked;
      };

      const validJson: JsonValue = typeof json === 'object' ? json : {};
      const maskedJson = maskObject(validJson);
      return JSON.stringify(maskedJson, null, 2);
    } catch {
      return jsonString;
    }
  };

  return (
    <div className='relative'>
      <Textarea
        value={isVisible ? value : getMaskedValue(value)}
        onChange={e => {
          onChange(e.target.value);
        }}
        className={`font-mono ${className ?? ''}`}
        rows={8}
      />
      <Button
        type='button'
        variant='ghost'
        className='absolute top-2 right-2'
        onClick={() => {
          setIsVisible(!isVisible);
        }}
      >
        {isVisible ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
      </Button>
    </div>
  );
}
