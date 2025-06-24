import { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Button } from '@owox/ui/components/button';
import { Textarea } from '@owox/ui/components/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@owox/ui/components/tooltip';

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
  // Function to check if any of the keysToMask actually exist in the content
  const hasSensitiveData = (jsonString: string, keys: string[]): boolean => {
    if (!jsonString || keys.length === 0) return false;

    try {
      const json = JSON.parse(jsonString) as JsonObject;

      const checkObject = (obj: JsonValue): boolean => {
        if (typeof obj !== 'object' || obj === null) return false;

        if (Array.isArray(obj)) {
          return obj.some(item => typeof item === 'object' && item !== null && checkObject(item));
        }

        return Object.keys(obj).some(
          key =>
            keys.includes(key) ||
            (typeof obj[key] === 'object' && obj[key] !== null && checkObject(obj[key]))
        );
      };

      return checkObject(json);
    } catch {
      return false;
    }
  };

  // Start in edit mode if value is empty, there are no keys to mask, or no sensitive data exists
  const shouldStartVisible =
    !value || keysToMask.length === 0 || !hasSensitiveData(value, keysToMask);
  const [isVisible, setIsVisible] = useState(shouldStartVisible);

  // Update visibility when value or keys to mask change
  useEffect(() => {
    if (!value || keysToMask.length === 0 || !hasSensitiveData(value, keysToMask)) {
      setIsVisible(true);
    }
  }, [value, keysToMask]);

  // Update visibility when value or keys to mask change
  useEffect(() => {
    if (!value || keysToMask.length === 0 || !hasSensitiveData(value, keysToMask)) {
      setIsVisible(true);
    }
  }, [value, keysToMask]);

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
                // For very long strings, use a more proportional masking approach
                const length = value.length;
                if (length > 30) {
                  // For long strings, use fewer asterisks (max 20)
                  masked[key] = '*'.repeat(Math.min(20, Math.ceil(length / 3)));
                } else if (length > 10) {
                  // For medium strings
                  masked[key] = '*'.repeat(Math.min(10, Math.ceil(length / 2)));
                } else {
                  // For short strings
                  masked[key] = '*'.repeat(length);
                }
              } else {
                masked[key] = '***';
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

  // Store the result of checking for sensitive data
  const hasSensitiveContent = value && keysToMask.length > 0 && hasSensitiveData(value, keysToMask);

  return (
    <div className='relative'>
      {!isVisible && hasSensitiveContent && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className='absolute top-2 left-2 z-10'>
                <Lock className='h-4 w-4 text-gray-500' />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Content is locked in masked mode. Click the eye icon to enable editing.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <Textarea
        value={isVisible ? value : getMaskedValue(value)}
        onChange={e => {
          // Only prevent changes when in masked mode AND there's sensitive content
          if (isVisible || !hasSensitiveContent) {
            onChange(e.target.value);
          }
        }}
        onFocus={e => {
          if (!isVisible && hasSensitiveContent) {
            e.target.blur();
          }
        }}
        readOnly={Boolean(!isVisible && hasSensitiveContent)}
        className={`font-mono ${className ?? ''} ${!isVisible && hasSensitiveContent ? 'cursor-not-allowed opacity-70' : ''} min-h-[150px]`}
        rows={8}
      />
      {/* Only show the visibility toggle button when there's sensitive content */}
      {hasSensitiveContent && (
        <Button
          type='button'
          variant='ghost'
          className='absolute top-2 right-2'
          onClick={() => {
            setIsVisible(!isVisible);
          }}
        >
          {isVisible ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className='flex items-center gap-1'>
                    <EyeOff className='h-4 w-4' />
                    <span className='text-xs'>Mask & Lock</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Mask sensitive data and lock editing</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className='flex items-center gap-1'>
                    <Eye className='h-4 w-4' />
                    <span className='text-xs'>Show & Edit</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Show sensitive data and enable editing</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </Button>
      )}
    </div>
  );
}
