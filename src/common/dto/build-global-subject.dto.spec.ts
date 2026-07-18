import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BuildGlobalSubjectDto } from './build-global-subject.dto';

describe('BuildGlobalSubjectDto', () => {
  describe('valid inputs', () => {
    it('accepts valid domain/entity/action/version', () => {
      const dto = plainToInstance(BuildGlobalSubjectDto, {
        domain: 'iam',
        entity: 'company',
        action: 'created',
        version: '1',
      });
      expect(validateSync(dto)).toHaveLength(0);
    });

    it('defaults version to "1" when not specified', () => {
      const dto = plainToInstance(BuildGlobalSubjectDto, {
        domain: 'iam',
        entity: 'user',
        action: 'updated',
      });
      expect(dto.version).toBe('1');
    });
  });

  describe('invalid inputs', () => {
    it('rejects empty domain', () => {
      const dto = plainToInstance(BuildGlobalSubjectDto, {
        domain: '',
        entity: 'company',
        action: 'created',
      });
      expect(validateSync(dto).some((e) => e.property === 'domain')).toBe(true);
    });

    it('rejects empty entity', () => {
      const dto = plainToInstance(BuildGlobalSubjectDto, {
        domain: 'iam',
        entity: '',
        action: 'created',
      });
      expect(validateSync(dto).some((e) => e.property === 'entity')).toBe(true);
    });

    it('rejects empty action', () => {
      const dto = plainToInstance(BuildGlobalSubjectDto, {
        domain: 'iam',
        entity: 'company',
        action: '',
      });
      expect(validateSync(dto).some((e) => e.property === 'action')).toBe(true);
    });

    it('rejects missing domain', () => {
      const dto = plainToInstance(BuildGlobalSubjectDto, {
        entity: 'company',
        action: 'created',
      });
      expect(validateSync(dto).some((e) => e.property === 'domain')).toBe(true);
    });
  });
});
