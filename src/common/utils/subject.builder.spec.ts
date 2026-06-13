import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BuildSubjectDto } from '../dto/build-subject.dto';
import { SubjectBuilder, buildSubject } from './subject.builder';

describe('SubjectBuilder', () => {
  describe('BuildSubjectDto validation', () => {
    it('accepts a valid DTO with dashed UUID', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
      });
      const errors = validateSync(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts a valid DTO with dashless UUID', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400e29b41d4a716446655440000',
        domain: 'debt',
        entity: 'schedule',
        action: 'generated',
        version: '2',
      });
      const errors = validateSync(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects missing companyId', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
      });
      const errors = validateSync(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'companyId')).toBe(true);
    });

    it('rejects empty domain', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        domain: '',
        entity: 'proof',
        action: 'uploaded',
      });
      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'domain')).toBe(true);
    });

    it('rejects empty entity', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        domain: 'payment',
        entity: '',
        action: 'uploaded',
      });
      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'entity')).toBe(true);
    });

    it('rejects empty action', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        domain: 'payment',
        entity: 'proof',
        action: '',
      });
      const errors = validateSync(dto);
      expect(errors.some((e) => e.property === 'action')).toBe(true);
    });
  });

  describe('SubjectBuilder.build()', () => {
    it('builds subject with dashed UUID (dashes removed)', () => {
      const builder = new SubjectBuilder();
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        domain: 'payment',
        entity: 'proof',
        action: 'uploaded',
      });
      const subject = builder.build(dto);
      expect(subject).toBe('company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1');
    });

    it('builds subject with already-dashless UUID', () => {
      const builder = new SubjectBuilder();
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '550e8400e29b41d4a716446655440000',
        domain: 'debt',
        entity: 'schedule',
        action: 'generated',
        version: '2',
      });
      const subject = builder.build(dto);
      expect(subject).toBe('company.550e8400e29b41d4a716446655440000.debt.schedule.generated.v2');
    });

    it('uses default version "1" when not specified', () => {
      const builder = new SubjectBuilder();
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        domain: 'client',
        entity: 'profile',
        action: 'updated',
      });
      const subject = builder.build(dto);
      expect(subject).toContain('.v1');
    });

    it('builds correct subject for notification domain', () => {
      const builder = new SubjectBuilder();
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: '11111111-2222-3333-4444-555555555555',
        domain: 'notification',
        entity: 'email',
        action: 'sent',
        version: '3',
      });
      const subject = builder.build(dto);
      expect(subject).toBe('company.11111111222233334444555555555555.notification.email.sent.v3');
    });
  });

  describe('buildSubject() function', () => {
    it('produces the same result as SubjectBuilder.build()', () => {
      const dto = plainToInstance(BuildSubjectDto, {
        companyId: 'aaaaaaaabbbbccccddddeeeeeeeeeeee',
        domain: 'bank',
        entity: 'statement',
        action: 'processed',
        version: '1',
      });
      const classResult = new SubjectBuilder().build(dto);
      const fnResult = buildSubject(dto);
      expect(fnResult).toBe(classResult);
    });
  });
});
