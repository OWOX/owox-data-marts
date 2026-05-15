import { DataMartMetadataScope } from '../../ai-insights/ai-insights-types';

export class GenerateDataMartMetadataCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly scope: DataMartMetadataScope,
    public readonly useSample: boolean,
    public readonly fieldName: string | undefined,
    public readonly userId: string = '',
    public readonly roles: string[] = [],
    /**
     * When true, the use-case skips its in-process EDIT access check.
     *
     * The trigger-based flow uses this: the controller already verified access at
     * the POST that created the trigger, but by the time the scheduler picks the
     * trigger up the request `roles` are gone, so a fresh matrix check would fail
     * for any user who relied on role-based (not ownership-based) edit rights.
     *
     * The synchronous endpoint never sets this — the in-process check remains the
     * authoritative gate there.
     */
    public readonly skipAccessCheck: boolean = false
  ) {}
}
