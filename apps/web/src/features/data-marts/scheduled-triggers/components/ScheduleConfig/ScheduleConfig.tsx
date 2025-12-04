import { useState, useEffect, useMemo, type FC, useRef, useCallback } from 'react';
import { Button } from '@owox/ui/components/button';
import { Input } from '@owox/ui/components/input';
import { Label } from '@owox/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@owox/ui/components/select';
import { Badge } from '@owox/ui/components/badge';
import { Switch } from '@owox/ui/components/switch';
import { Separator } from '@owox/ui/components/separator';
import { Settings, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cronToScheduleConfig } from './cron-parser';
import { MultiSelect } from '@owox/ui/components/common/multi-select';
import { timezoneService } from '../../../../../services';
import { Alert, AlertDescription, AlertTitle } from '@owox/ui/components/alert';
import { Combobox } from '../../../../../shared/components/Combobox/combobox';
import {
  type ScheduleConfig,
  WEEKDAYS,
  getBrowserTimezone,
  getScheduleDescription,
} from '../../utils/schedule-utils';

type ScheduleType = 'daily' | 'weekly' | 'monthly' | 'interval' | 'custom';

interface ScheduleData {
  cron: string;
  timezone: string;
  enabled: boolean;
}

interface ScheduleConfigProps {
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  onChange?: (data: ScheduleData) => void;
  className?: string;
  showPreview?: boolean;
  showSaveButton?: boolean;
  hideEnableSwitch?: boolean;
}

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: `${String(i + 1)}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`,
}));

const MINUTE_INTERVALS = [5, 10, 15, 30];
const HOUR_INTERVALS = [1, 2, 3, 4, 6, 8, 12];

// Form Field Components
interface ScheduleTypeFieldProps {
  value: ScheduleType;
  onChange: (value: ScheduleType) => void;
  disabled?: boolean;
}

const ScheduleTypeField: FC<ScheduleTypeFieldProps> = ({ value, onChange, disabled }) => {
  return (
    <div className='space-y-2'>
      <Label>Type</Label>
      <Select
        value={value}
        onValueChange={(type: ScheduleType) => {
          onChange(type);
        }}
        disabled={disabled}
      >
        <SelectTrigger className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='daily'>Daily</SelectItem>
          <SelectItem value='weekly'>Weekly</SelectItem>
          <SelectItem value='monthly'>Monthly</SelectItem>
          <SelectItem value='interval'>Interval</SelectItem>
          {/*<SelectItem value='custom'>Custom</SelectItem>*/}
        </SelectContent>
      </Select>
    </div>
  );
};

interface TimeFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const TimeField: FC<TimeFieldProps> = ({ value, onChange, disabled }) => {
  return (
    <div className='space-y-2'>
      <Label>Time</Label>
      <div className='flex items-center gap-2'>
        <Input
          className={'w-24'}
          type='time'
          value={value}
          onChange={e => {
            onChange(e.target.value);
          }}
          disabled={disabled}
        />
      </div>
    </div>
  );
};

interface TimezoneFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  timezones: { value: string; label: string }[];
}

const TimezoneField: FC<TimezoneFieldProps> = ({ value, onChange, disabled, timezones }) => {
  return (
    <div className='w-full space-y-2'>
      <Label>Timezone</Label>
      <div className='flex items-center gap-2'>
        <Combobox
          options={timezones}
          value={value}
          onValueChange={onChange}
          placeholder='Select timezone'
          emptyMessage='No timezones found'
          disabled={disabled}
          className='w-full'
        />
      </div>
    </div>
  );
};

interface WeekdaysFieldProps {
  value: number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
}

const WeekdaysField: FC<WeekdaysFieldProps> = ({ value, onChange, disabled }) => {
  return (
    <div className='space-y-2'>
      <Label>Days of Week</Label>
      <div className={disabled ? 'pointer-events-none' : ''}>
        <MultiSelect
          options={WEEKDAYS}
          selected={value}
          onSelectionChange={onChange}
          placeholder='Select days...'
          maxDisplayItems={3}
        />
      </div>
    </div>
  );
};

interface MonthDaysFieldProps {
  value: number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
}

const MonthDaysField: FC<MonthDaysFieldProps> = ({ value, onChange, disabled }) => {
  return (
    <div className='space-y-2'>
      <Label>Days of Month</Label>
      <div className={disabled ? 'pointer-events-none' : ''}>
        <MultiSelect
          options={MONTH_DAYS}
          selected={value}
          onSelectionChange={onChange}
          placeholder='Select days...'
          maxDisplayItems={4}
        />
      </div>
    </div>
  );
};

interface IntervalFieldProps {
  intervalType: 'minutes' | 'hours';
  intervalValue: number;
  onTypeChange: (value: 'minutes' | 'hours') => void;
  onValueChange: (value: number) => void;
  disabled?: boolean;
}

const IntervalField: FC<IntervalFieldProps> = ({
  intervalType,
  intervalValue,
  onTypeChange,
  onValueChange,
  disabled,
}) => {
  return (
    <div className='grid grid-cols-2 gap-3'>
      <div className='space-y-2'>
        <Label>Type</Label>
        <Select
          value={intervalType}
          onValueChange={(type: 'minutes' | 'hours') => {
            onTypeChange(type);
          }}
          disabled={disabled}
        >
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='minutes'>Minutes</SelectItem>
            <SelectItem value='hours'>Hours</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-2'>
        <Label>Every</Label>
        <Select
          value={intervalValue.toString()}
          onValueChange={value => {
            onValueChange(Number.parseInt(value) || 1);
          }}
          disabled={disabled}
        >
          <SelectTrigger className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(intervalType === 'minutes' ? MINUTE_INTERVALS : HOUR_INTERVALS).map(interval => (
              <SelectItem key={interval} value={interval.toString()}>
                {interval} {intervalType === 'minutes' ? 'min' : 'hr'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

interface CustomCronFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const CustomCronField: FC<CustomCronFieldProps> = ({ value, onChange, disabled }) => {
  return (
    <div className='space-y-1'>
      <Label className='text-sm'>Cron Expression</Label>
      <Input
        value={value}
        onChange={e => {
          onChange(e.target.value);
        }}
        placeholder='0 9 * * *'
        className='h-9 font-mono text-sm'
        disabled={disabled}
      />
      <p className='text-muted-foreground text-xs'>Format: minute hour day month day-of-week</p>
    </div>
  );
};

export function ScheduleConfig({
  cron = '0 9 * * *',
  timezone: propTimezone,
  enabled = true,
  onChange,
  className,
  showPreview = true,
  showSaveButton = false,
  hideEnableSwitch = false,
}: ScheduleConfigProps) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [currentTimezone, setCurrentTimezone] = useState(propTimezone ?? getBrowserTimezone());
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);

  const timezones = useMemo(() => {
    return timezoneService.getTimezonesWithOffset().map(tz => ({
      value: tz.identifier,
      label: tz.displayName,
      offset: tz.offsetString,
      isDST: tz.isDST,
    }));
  }, []);

  const [config, setConfig] = useState<ScheduleConfig>(() => {
    return cronToScheduleConfig(cron, currentTimezone);
  });

  const [cronExpression, setCronExpression] = useState('');
  const [nextRun, setNextRun] = useState('');

  // Initialize from props
  useEffect(() => {
    setIsEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    const newTimezone = propTimezone ?? getBrowserTimezone();
    setCurrentTimezone(newTimezone);
  }, [propTimezone]);

  useEffect(() => {
    if (cron) {
      const newConfig = cronToScheduleConfig(cron, currentTimezone);
      setConfig(newConfig);
    }
  }, [cron, currentTimezone]);

  const generateCronExpression = (config: ScheduleConfig): string => {
    const [hours, minutes] = config.time.split(':').map(Number);

    switch (config.type) {
      case 'daily':
        return `${String(minutes)} ${String(hours)} * * *`;
      case 'weekly':
        return `${String(minutes)} ${String(hours)} * * ${config.weekdays.join(',')}`;
      case 'monthly':
        return `${String(minutes)} ${String(hours)} ${config.monthDays.join(',')} * *`;
      case 'interval':
        return config.intervalType === 'minutes'
          ? `*/${String(config.intervalValue)} * * * *`
          : `0 */${String(config.intervalValue)} * * *`;
      case 'custom':
        return config.customCron;
      default:
        return `${String(minutes)} ${String(hours)} * * *`;
    }
  };

  const handleIntervalTypeChange = useCallback((intervalType: 'minutes' | 'hours') => {
    setConfig(prev => {
      if (prev.intervalType === intervalType) {
        console.log('Type unchanged, skipping update');
        return prev;
      }
      const validValues = intervalType === 'minutes' ? MINUTE_INTERVALS : HOUR_INTERVALS;
      const newIntervalValue = validValues[0];
      return {
        ...prev,
        intervalType,
        intervalValue: newIntervalValue,
      };
    });
  }, []);

  const handleIntervalValueChange = useCallback((intervalValue: number) => {
    setConfig(prev => {
      const validValues = prev.intervalType === 'minutes' ? MINUTE_INTERVALS : HOUR_INTERVALS;
      if (!validValues.includes(intervalValue)) {
        return prev;
      }
      return { ...prev, intervalValue };
    });
  }, []);

  const getNextRunDescription = useMemo(() => {
    return (config: ScheduleConfig): string => {
      return getScheduleDescription(config, isEnabled);
    };
  }, [isEnabled]);

  useEffect(() => {
    const cron = generateCronExpression(config);
    setCronExpression(cron);
    setNextRun(getNextRunDescription(config));
  }, [config, isEnabled, currentTimezone, getNextRunDescription]);

  // Handle onChange callback
  const prevCronRef = useRef('');
  const prevTimezoneRef = useRef('');
  const prevEnabledRef = useRef(false);

  useEffect(() => {
    const cron = generateCronExpression(config);
    if (onChange) {
      // Only call onChange if any of the values have changed
      if (
        prevCronRef.current !== cron ||
        prevTimezoneRef.current !== currentTimezone ||
        prevEnabledRef.current !== isEnabled
      ) {
        onChange({
          cron,
          timezone: currentTimezone,
          enabled: isEnabled,
        });

        // Update the refs with the current values
        prevCronRef.current = cron;
        prevTimezoneRef.current = currentTimezone;
        prevEnabledRef.current = isEnabled;
      }
    }
  }, [config, currentTimezone, isEnabled, onChange]);

  const handleEnabledChange = (checked: boolean) => {
    setIsEnabled(checked);
  };

  const handleTimezoneChange = (timezone: string) => {
    setCurrentTimezone(timezone);
    setConfig(prev => ({ ...prev, timezone }));
  };

  const needsTimezone = ['daily', 'weekly', 'monthly'].includes(config.type);

  return (
    <div className={className}>
      {!hideEnableSwitch && (
        <div className='mb-4 space-y-4 pt-0'>
          <div className='flex items-center justify-end'>
            <div className='flex items-center gap-2'>
              <Label htmlFor='schedule-enabled' className='text-sm font-normal'>
                {isEnabled ? 'Enabled' : 'Disabled'}
              </Label>
              <Switch
                id='schedule-enabled'
                checked={isEnabled}
                onCheckedChange={handleEnabledChange}
              />
            </div>
          </div>
        </div>
      )}
      <div className='space-y-4 pt-0'>
        <div className={`space-y-4 ${!isEnabled ? 'opacity-50' : ''}`}>
          {/* Schedule Type */}
          <ScheduleTypeField
            value={config.type}
            onChange={type => {
              setConfig(prev => ({ ...prev, type }));
            }}
            disabled={!isEnabled}
          />

          {/* Time and Timezone Row */}
          {config.type !== 'custom' && config.type !== 'interval' && (
            <div className='flex gap-3'>
              <TimeField
                value={config.time}
                onChange={time => {
                  setConfig(prev => ({ ...prev, time }));
                }}
                disabled={!isEnabled}
              />

              {needsTimezone && (
                <TimezoneField
                  value={currentTimezone}
                  onChange={handleTimezoneChange}
                  disabled={!isEnabled}
                  timezones={timezones}
                />
              )}
            </div>
          )}

          {/* Timezone for interval and custom */}
          {(config.type === 'interval' || config.type === 'custom') && (
            <TimezoneField
              value={currentTimezone}
              onChange={handleTimezoneChange}
              disabled={!isEnabled}
              timezones={timezones}
            />
          )}

          {/* Weekdays */}
          {config.type === 'weekly' && (
            <WeekdaysField
              value={config.weekdays}
              onChange={weekdays => {
                setConfig(prev => ({ ...prev, weekdays }));
              }}
              disabled={!isEnabled}
            />
          )}

          {/* Month Days */}
          {config.type === 'monthly' && (
            <MonthDaysField
              value={config.monthDays}
              onChange={monthDays => {
                setConfig(prev => ({ ...prev, monthDays }));
              }}
              disabled={!isEnabled}
            />
          )}

          {/* Interval */}
          {config.type === 'interval' && (
            <IntervalField
              intervalType={config.intervalType}
              intervalValue={config.intervalValue}
              onTypeChange={handleIntervalTypeChange}
              onValueChange={handleIntervalValueChange}
              disabled={!isEnabled}
            />
          )}

          {/* Custom Cron */}
          {config.type === 'custom' && (
            <CustomCronField
              value={config.customCron}
              onChange={customCron => {
                setConfig(prev => ({ ...prev, customCron }));
              }}
              disabled={!isEnabled}
            />
          )}
        </div>

        {/* Preview Section */}
        {showPreview && (
          <>
            <Separator className='my-3' />
            <div className='space-y-3'>
              <div
                className='flex cursor-pointer items-center justify-between'
                onClick={() => {
                  setIsPreviewExpanded(!isPreviewExpanded);
                }}
              >
                <div className='flex items-center gap-2'>
                  <Settings className='h-4 w-4' />
                  <span className='text-sm font-medium'>Preview</span>
                </div>
                {isPreviewExpanded ? (
                  <ChevronUp className='text-muted-foreground h-4 w-4' />
                ) : (
                  <ChevronDown className='text-muted-foreground h-4 w-4' />
                )}
              </div>

              {isPreviewExpanded && (
                <>
                  <div className='grid gap-4'>
                    <div className='flex items-center justify-between'>
                      <span className='text-muted-foreground text-xs'>Status:</span>
                      <Badge variant={isEnabled ? 'default' : 'secondary'} className='text-xs'>
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>

                    <div className='flex items-center justify-between'>
                      <span className='text-muted-foreground text-xs'>Cron:</span>
                      <Badge variant='secondary' className='font-mono text-xs'>
                        {cronExpression}
                      </Badge>
                    </div>

                    <div className='flex items-center justify-between'>
                      <span className='text-muted-foreground text-xs'>Timezone:</span>
                      <Badge variant='outline' className='text-xs'>
                        {currentTimezone}
                      </Badge>
                    </div>

                    <div className='flex items-start justify-between gap-2'>
                      <span className='text-muted-foreground text-xs'>Schedule:</span>
                      <span className='flex-1 text-right text-xs'>{nextRun}</span>
                    </div>
                  </div>

                  {isEnabled && needsTimezone && currentTimezone !== getBrowserTimezone() && (
                    <Alert className={'border-amber-200 bg-amber-50'}>
                      <AlertCircle className='h-4 w-4' />
                      <AlertTitle>Time Zone</AlertTitle>
                      <AlertDescription>
                        Schedule runs in {currentTimezone} (not your local {getBrowserTimezone()}{' '}
                        time). Execution time may differ from expected.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {showSaveButton && (
          <Button className='w-full' disabled={!isEnabled}>
            Save Schedule
          </Button>
        )}
      </div>
    </div>
  );
}
