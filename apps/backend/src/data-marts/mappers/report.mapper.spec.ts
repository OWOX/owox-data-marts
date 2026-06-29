import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ReportMapper } from './report.mapper';
import { DataMartMapper } from './data-mart.mapper';
import { DataDestinationMapper } from './data-destination.mapper';
import { Report } from '../entities/report.entity';
import { ReportDto } from '../dto/domain/report.dto';
import { CreateReportRequestApiDto } from '../dto/presentation/create-report-request-api.dto';
import { UpdateReportRequestApiDto } from '../dto/presentation/update-report-request-api.dto';
import { AuthorizationContext } from '../../idp';

const mockAuthContext = (): AuthorizationContext =>
  ({ projectId: 'proj-1', userId: 'user-1', roles: [] }) as unknown as AuthorizationContext;

const minimalReport = (): Partial<Report> => ({
  id: 'report-1',
  title: 'Test',
  dataMart: { id: 'dm-1' } as any,
  dataDestination: { id: 'dd-1' } as any,
  destinationConfig: { type: 'google-sheets' } as any,
  createdAt: new Date('2026-01-01'),
  modifiedAt: new Date('2026-01-02'),
  runsCount: 0,
  owners: [],
});

describe('ReportMapper — uniqueCountConfig round-trip', () => {
  let mapper: ReportMapper;

  const mockDataMartMapper = {
    toDomainDto: jest.fn().mockReturnValue({ id: 'dm-1' }),
    toResponse: jest.fn().mockResolvedValue({ id: 'dm-1' }),
  };

  const mockDataDestinationMapper = {
    toDomainDto: jest.fn().mockReturnValue({ id: 'dd-1' }),
    toApiResponse: jest.fn().mockResolvedValue({ id: 'dd-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportMapper,
        { provide: DataMartMapper, useValue: mockDataMartMapper },
        { provide: DataDestinationMapper, useValue: mockDataDestinationMapper },
      ],
    }).compile();

    mapper = module.get<ReportMapper>(ReportMapper);
  });

  it('toCreateDomainCommand: uniqueCountConfig=true is threaded through', () => {
    const dto: Partial<CreateReportRequestApiDto> = {
      title: 'R',
      dataMartId: 'dm-1',
      dataDestinationId: 'dd-1',
      destinationConfig: {} as any,
      uniqueCountConfig: true,
    };

    const cmd = mapper.toCreateDomainCommand(mockAuthContext(), dto as CreateReportRequestApiDto);

    expect(cmd.uniqueCountConfig).toBe(true);
  });

  it('toCreateDomainCommand: absent uniqueCountConfig becomes null', () => {
    const dto: Partial<CreateReportRequestApiDto> = {
      title: 'R',
      dataMartId: 'dm-1',
      dataDestinationId: 'dd-1',
      destinationConfig: {} as any,
    };

    const cmd = mapper.toCreateDomainCommand(mockAuthContext(), dto as CreateReportRequestApiDto);

    expect(cmd.uniqueCountConfig).toBeNull();
  });

  it('toDomainDto: entity.uniqueCountConfig=true is threaded through', () => {
    const entity = {
      ...minimalReport(),
      uniqueCountConfig: true as boolean | null | undefined,
    } as Report;

    const dto = mapper.toDomainDto(entity);

    expect(dto.uniqueCountConfig).toBe(true);
  });

  it('toDomainDto: entity.uniqueCountConfig=null becomes null in dto', () => {
    const entity = {
      ...minimalReport(),
      uniqueCountConfig: null as boolean | null | undefined,
    } as Report;

    const dto = mapper.toDomainDto(entity);

    expect(dto.uniqueCountConfig).toBeNull();
  });

  it('toResponse: dto.uniqueCountConfig=true appears in response', async () => {
    const reportDto = new ReportDto(
      'report-1',
      'Test',
      { id: 'dm-1' } as any,
      { id: 'dd-1' } as any,
      {} as any,
      new Date(),
      new Date(),
      undefined,
      undefined,
      undefined,
      0,
      null,
      [],
      undefined,
      null,
      null,
      null,
      false,
      false,
      false,
      null,
      null,
      true // uniqueCountConfig
    );

    const response = await mapper.toResponse(reportDto);

    expect(response.uniqueCountConfig).toBe(true);
  });

  it('toUpdateDomainCommand: uniqueCountConfig=false is threaded through', () => {
    const dto: Partial<UpdateReportRequestApiDto> = {
      title: 'R',
      dataDestinationId: 'dd-1',
      destinationConfig: {} as any,
      uniqueCountConfig: false,
    };

    const cmd = mapper.toUpdateDomainCommand(
      'report-1',
      mockAuthContext(),
      dto as UpdateReportRequestApiDto
    );

    expect(cmd.uniqueCountConfig).toBe(false);
  });

  it('toUpdateDomainCommand: absent uniqueCountConfig becomes null', () => {
    const dto: Partial<UpdateReportRequestApiDto> = {
      title: 'R',
      dataDestinationId: 'dd-1',
      destinationConfig: {} as any,
    };

    const cmd = mapper.toUpdateDomainCommand(
      'report-1',
      mockAuthContext(),
      dto as UpdateReportRequestApiDto
    );

    expect(cmd.uniqueCountConfig).toBeNull();
  });

  // M1: malformed output-control configs must be rejected at the request→domain seam
  // with a 400, not parsed for the first time inside the @Transactional service (→ 500).
  it('toCreateDomainCommand: malformed aggregationConfig (wrong-typed function) → BadRequestException (400)', () => {
    const dto: Partial<CreateReportRequestApiDto> = {
      title: 'R',
      dataMartId: 'dm-1',
      dataDestinationId: 'dd-1',
      destinationConfig: {} as any,
      aggregationConfig: [{ column: 'revenue', function: 'NOT_A_FUNCTION' }] as any,
    };

    expect(() =>
      mapper.toCreateDomainCommand(mockAuthContext(), dto as CreateReportRequestApiDto)
    ).toThrow(BadRequestException);
  });

  it('toUpdateDomainCommand: malformed aggregationConfig (wrong-typed function) → BadRequestException (400)', () => {
    const dto: Partial<UpdateReportRequestApiDto> = {
      title: 'R',
      dataDestinationId: 'dd-1',
      destinationConfig: {} as any,
      aggregationConfig: [{ column: 'revenue', function: 42 }] as any,
    };

    expect(() =>
      mapper.toUpdateDomainCommand('report-1', mockAuthContext(), dto as UpdateReportRequestApiDto)
    ).toThrow(BadRequestException);
  });

  it('toCreateDomainCommand: malformed dateTruncConfig (bad unit) → BadRequestException (400)', () => {
    const dto: Partial<CreateReportRequestApiDto> = {
      title: 'R',
      dataMartId: 'dm-1',
      dataDestinationId: 'dd-1',
      destinationConfig: {} as any,
      dateTruncConfig: [{ column: 'date', unit: 'HOUR' }] as any,
    };

    expect(() =>
      mapper.toCreateDomainCommand(mockAuthContext(), dto as CreateReportRequestApiDto)
    ).toThrow(BadRequestException);
  });

  it('toCreateDomainCommand: well-formed configs pass through untouched', () => {
    const dto: Partial<CreateReportRequestApiDto> = {
      title: 'R',
      dataMartId: 'dm-1',
      dataDestinationId: 'dd-1',
      destinationConfig: {} as any,
      columnConfig: ['revenue', 'date'],
      filterConfig: [{ column: 'revenue', operator: 'gt', value: 1 }] as any,
      sortConfig: [{ column: 'date', direction: 'asc' }] as any,
      aggregationConfig: [{ column: 'revenue', function: 'SUM' }] as any,
      dateTruncConfig: [{ column: 'date', unit: 'MONTH' }] as any,
    };

    const cmd = mapper.toCreateDomainCommand(mockAuthContext(), dto as CreateReportRequestApiDto);

    expect(cmd.aggregationConfig).toEqual([{ column: 'revenue', function: 'SUM' }]);
    expect(cmd.dateTruncConfig).toEqual([{ column: 'date', unit: 'MONTH' }]);
  });
});
