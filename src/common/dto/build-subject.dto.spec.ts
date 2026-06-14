import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BuildSubjectDto } from './build-subject.dto';

function createValidDto(): Record<string, unknown> {
  return {
    companyId: '550e8400-e29b-41d4-a716-446655440000',
    domain: 'payment',
    entity: 'proof',
    action: 'uploaded',
  };
}

describe('BuildSubjectDto', () => {
  describe('valid inputs', () => {
    it('accepts dashed UUID companyId', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
      });
      expect(validateSync(dto)).toHaveLength(0);
    });

    it('accepts dashless UUID companyId', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400e29b41d4a716446655440000',
        domain: 'debt',
        entity: 'schedule',
        action: 'generated',
      });
      expect(validateSync(dto)).toHaveLength(0);
    });

    it('accepts all valid domain/entity/action/version', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        domain: 'client',
        entity: 'profile',
        action: 'updated',
        version: '2',
      });
      expect(validateSync(dto)).toHaveLength(0);
    });

    it('defaults version to "1" when not specified', () => {
      const dto = plainToInstance(BuildSubjectDto, createValidDto());
      expect(dto.version).toBe('1');
    });
  });

  describe('invalid companyId', () => {
    it('rejects non-UUID string', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        ...createValidDto(),
        companyId: 'not-a-uuid',
      });
      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'companyId')).toBe(true);
    });

    it('rejects too-short UUID string', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        ...createValidDto(),
        companyId: '550e8400',
      });
      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'companyId')).toBe(true);
    });

    it('rejects empty string', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        ...createValidDto(),
        companyId: '',
      });
      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'companyId')).toBe(true);
    });
  });

  describe('invalid domain/entity/action', () => {
    it('rejects empty string for domain', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        ...createValidDto(),
        domain: '',
      });
      expect(validateSync(dto).some((e) => e.property === 'domain')).toBe(true);
    });

    it('rejects empty string for entity', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        ...createValidDto(),
        entity: '',
      });
      expect(validateSync(dto).some((e) => e.property === 'entity')).toBe(true);
    });

    it('rejects empty string for action', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        ...createValidDto(),
        action: '',
      });
      expect(validateSync(dto).some((e) => e.property === 'action')).toBe(true);
    });

    it('rejects missing companyId field', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
      });
      expect(validateSync(dto).some((e) => e.property === 'companyId')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('accepts numeric string version "2"', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        ...createValidDto(),
        version: '2',
      });
      expect(validateSync(dto)).toHaveLength(0);
    });

    it('accepts domain with hyphens', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        ...createValidDto(),
        domain: 'my-domain',
      });
      expect(validateSync(dto)).toHaveLength(0);
    });

    it('accepts action with hyphens', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        ...createValidDto(),
        action: 're-processed',
      });
      expect(validateSync(dto)).toHaveLength(0);
    });
  });
});
