import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PublicOriginService } from './public-origin.service';

describe('PublicOriginService', () => {
  let service: PublicOriginService;
  let config: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    config = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [PublicOriginService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get(PublicOriginService);
  });

  describe('ensureHttps', () => {
    it('converts http to https', () => {
      expect(service.ensureHttps('http://example.com')).toBe('https://example.com');
    });

    it('adds https when protocol is missing', () => {
      expect(service.ensureHttps('example.com')).toBe('https://example.com');
    });

    it('keeps https as is', () => {
      expect(service.ensureHttps('https://example.com')).toBe('https://example.com');
    });
  });

  describe('getLookerStudioDeploymentUrl', () => {
    const PORT = 3000;

    beforeEach(() => {
      config.get.mockImplementation((key: string) => {
        if (key === 'PORT') return PORT as unknown as string;
        if (key === 'PUBLIC_ORIGIN') return '' as unknown as string;
        return '' as unknown as string;
      });
    });

    it('uses LOOKER_STUDIO_DESTINATION_ORIGIN when provided (https)', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN')
          return 'https://data-marts.example.com:2077';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe('https://data-marts.example.com:2077');
    });

    it('normalizes http → https for LOOKER_STUDIO_DESTINATION_ORIGIN', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return 'http://data-marts.example.com:2077';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe('https://data-marts.example.com:2077');
    });

    it('handles LOOKER_STUDIO_DESTINATION_ORIGIN as host:port', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return 'data-marts.example.com:2077';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe('https://data-marts.example.com:2077');
    });

    it('falls back to PUBLIC_ORIGIN when LS is empty', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return '';
        if (key === 'PUBLIC_ORIGIN') return 'my-domain.example.com';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe('https://my-domain.example.com');
    });

    it('prefers LOOKER_STUDIO_DESTINATION_ORIGIN over PUBLIC_ORIGIN when both provided', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return 'http://ls.example.com:4444';
        if (key === 'PUBLIC_ORIGIN') return 'public.example.com';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe('https://ls.example.com:4444');
    });

    it('falls back to https://localhost:PORT when both empty', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return '';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe(`https://localhost:${PORT}`);
    });

    it('edge: space inside hostname → fallback to localhost', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return 'https://exa mple.com';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe(`https://localhost:${PORT}`);
    });

    it('edge: space after protocol → fallback to localhost', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return 'http:// example.com';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe(`https://localhost:${PORT}`);
    });

    it('edge: space before dot → fallback to localhost', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return 'example .com';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe(`https://localhost:${PORT}`);
    });

    it('edge: spaces around host and port → fallback to localhost', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return 'exa mple . com : 8080';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe(`https://localhost:${PORT}`);
    });

    it('edge: space before port → fallback to localhost', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return 'example.com :443';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe(`https://localhost:${PORT}`);
    });

    it('edge: non-numeric port → fallback to localhost', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return 'example.com:abc';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe(`https://localhost:${PORT}`);
    });

    it('edge: only protocol → fallback to localhost', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return 'https://';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe(`https://localhost:${PORT}`);
    });

    it('edge: missing scheme marker → fallback to localhost', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return '://example.com';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe(`https://localhost:${PORT}`);
    });

    it('invalid PORT as string → falls back to DEFAULT_PORT', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return '';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return 'HELLO WORLD' as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe('https://localhost:3000');
    });

    it('invalid PORT as negative number → falls back to DEFAULT_PORT', () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'LOOKER_STUDIO_DESTINATION_ORIGIN') return '';
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return -1 as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getLookerStudioDeploymentUrl()).toBe('https://localhost:3000');
    });
  });

  describe('getPublicOrigin', () => {
    it('returns PUBLIC_ORIGIN when provided', () => {
      const PORT = 4000;
      config.get.mockImplementation((key: string) => {
        if (key === 'PUBLIC_ORIGIN') return 'http://my-public.example.com';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getPublicOrigin()).toBe('http://my-public.example.com');
    });

    it('falls back to http://localhost:PORT when PUBLIC_ORIGIN is empty', () => {
      const PORT = 4321;
      config.get.mockImplementation((key: string) => {
        if (key === 'PUBLIC_ORIGIN') return '';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getPublicOrigin()).toBe(`http://localhost:${PORT}`);
    });

    it('falls back to http://localhost:PORT when PUBLIC_ORIGIN is invalid', () => {
      const PORT = 5555;
      config.get.mockImplementation((key: string) => {
        if (key === 'PUBLIC_ORIGIN') return 'exa mple.com';
        if (key === 'PORT') return PORT as unknown as string;
        return '' as unknown as string;
      });
      expect(service.getPublicOrigin()).toBe(`http://localhost:${PORT}`);
    });
  });
});
