import { plainToInstance } from 'class-transformer';
import { BuildGlobalSubjectDto } from '../dto/build-global-subject.dto';
import { SubjectBuilder, buildGlobalSubject, isGlobalSubject } from './subject.builder';
import { buildResponseSubject, buildGlobalResponseSubject } from './subject-parser';

describe('Global subject building', () => {
  describe('SubjectBuilder.buildGlobal()', () => {
    it('builds global subject with domain/entity/action/version', () => {
      const builder = new SubjectBuilder();
      const dto = plainToInstance(BuildGlobalSubjectDto, {
        domain: 'iam',
        entity: 'company',
        action: 'created',
        version: '1',
      });
      const subject = builder.buildGlobal(dto);
      expect(subject).toBe('global.iam.company.created.v1');
    });

    it('uses default version "1" when not specified', () => {
      const builder = new SubjectBuilder();
      const dto = plainToInstance(BuildGlobalSubjectDto, {
        domain: 'system',
        entity: 'config',
        action: 'updated',
      });
      const subject = builder.buildGlobal(dto);
      expect(subject).toContain('.v1');
    });
  });

  describe('buildGlobalSubject() function', () => {
    it('produces the same result as SubjectBuilder.buildGlobal()', () => {
      const dto = plainToInstance(BuildGlobalSubjectDto, {
        domain: 'iam',
        entity: 'role',
        action: 'deleted',
        version: '2',
      });
      const classResult = new SubjectBuilder().buildGlobal(dto);
      const fnResult = buildGlobalSubject(dto);
      expect(fnResult).toBe(classResult);
      expect(fnResult).toBe('global.iam.role.deleted.v2');
    });
  });

  describe('isGlobalSubject()', () => {
    it('returns true for subjects starting with "global."', () => {
      expect(isGlobalSubject('global.iam.company.created.v1')).toBe(true);
    });

    it('returns false for tenant subjects starting with "company."', () => {
      expect(isGlobalSubject('company.abc123.payment.proof.uploaded.v1')).toBe(false);
    });

    it('returns false for subjects starting with "dlq.global."', () => {
      expect(isGlobalSubject('dlq.global.iam.company.created.v1')).toBe(false);
    });
  });

  describe('buildGlobalResponseSubject()', () => {
    it('appends .response before version segment for global subjects', () => {
      const response = buildGlobalResponseSubject('global.iam.company.created.v1');
      expect(response).toBe('global.iam.company.created.response.v1');
    });

    it('preserves the version number', () => {
      const response = buildGlobalResponseSubject('global.system.config.updated.v2');
      expect(response).toBe('global.system.config.updated.response.v2');
    });

    it('throws Error for malformed global subject', () => {
      expect(() => buildGlobalResponseSubject('invalid')).toThrow(/invalid global subject format/i);
    });
  });

  describe('buildResponseSubject (tenant) rejects global subjects', () => {
    it('throws Error for global. prefix subjects', () => {
      expect(() => buildResponseSubject('global.iam.company.created.v1')).toThrow(/invalid subject format/i);
    });
  });
});
