import { sanitizeCompanyId, assertValidCompanyId, validateSubject, sanitizeSubjectPart } from './security.utils';

describe('security.utils', () => {
  describe('sanitizeCompanyId', () => {
    it('normalizes a dashed UUID to dashless lowercase', () => {
      const input = '550E8400-E29B-41D4-A716-446655440000';
      const result = sanitizeCompanyId(input);
      expect(result).toBe('550e8400e29b41d4a716446655440000');
    });

    it('returns dashless UUID as-is (lowercased)', () => {
      const input = '550E8400E29B41D4A716446655440000';
      const result = sanitizeCompanyId(input);
      expect(result).toBe('550e8400e29b41d4a716446655440000');
    });

    it('trims whitespace before normalizing', () => {
      const input = '  550e8400e29b41d4a716446655440000  ';
      const result = sanitizeCompanyId(input);
      expect(result).toBe('550e8400e29b41d4a716446655440000');
    });

    it('throws for invalid UUID', () => {
      expect(() => sanitizeCompanyId('not-a-uuid')).toThrow('Invalid company ID');
    });

    it('throws for empty string', () => {
      expect(() => sanitizeCompanyId('')).toThrow('Invalid company ID');
    });

    it('throws for UUID with wrong segment lengths', () => {
      expect(() => sanitizeCompanyId('550e8400-e29b-41d4-a716-44665544000')).toThrow('Invalid company ID');
    });
  });

  describe('assertValidCompanyId', () => {
    it('does not throw for valid dashed UUID', () => {
      expect(() => assertValidCompanyId('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    });

    it('does not throw for valid dashless UUID', () => {
      expect(() => assertValidCompanyId('550e8400e29b41d4a716446655440000')).not.toThrow();
    });

    it('does not throw for uppercase dashed UUID', () => {
      expect(() => assertValidCompanyId('550E8400-E29B-41D4-A716-446655440000')).not.toThrow();
    });

    it('throws for invalid UUID', () => {
      expect(() => assertValidCompanyId('invalid')).toThrow('Invalid company ID');
    });

    it('throws for empty string', () => {
      expect(() => assertValidCompanyId('')).toThrow('Invalid company ID');
    });

    it('trims whitespace before validating', () => {
      expect(() => assertValidCompanyId('  550e8400-e29b-41d4-a716-446655440000  ')).not.toThrow();
    });
  });

  describe('validateSubject', () => {
    it('returns true for valid convention-compliant subject', () => {
      const subject = 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';
      expect(validateSubject(subject)).toBe(true);
    });

    it('returns true for subject with multi-version number', () => {
      const subject = 'company.550e8400e29b41d4a716446655440000.billing.invoice.paid.v12';
      expect(validateSubject(subject)).toBe(true);
    });

    it('returns true for subject with hyphenated parts', () => {
      const subject = 'company.550e8400e29b41d4a716446655440000.my-domain.my-entity.my-action.v1';
      expect(validateSubject(subject)).toBe(true);
    });

    it('returns false for subject with uppercase domain', () => {
      const subject = 'company.550e8400e29b41d4a716446655440000.Payment.proof.uploaded.v1';
      expect(validateSubject(subject)).toBe(false);
    });

    it('returns false for subject missing company prefix', () => {
      const subject = '550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1';
      expect(validateSubject(subject)).toBe(false);
    });

    it('returns false for subject with wrong UUID format', () => {
      const subject = 'company.abc.payment.proof.uploaded.v1';
      expect(validateSubject(subject)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(validateSubject('')).toBe(false);
    });
  });

  describe('sanitizeSubjectPart', () => {
    it('returns valid lowercase subject parts as-is', () => {
      expect(sanitizeSubjectPart('payment')).toBe('payment');
    });

    it('lowercases input', () => {
      expect(sanitizeSubjectPart('PAYMENT')).toBe('payment');
    });

    it('removes dots (subject separators)', () => {
      expect(sanitizeSubjectPart('pay.ment')).toBe('payment');
    });

    it('removes NATS wildcards', () => {
      expect(sanitizeSubjectPart('pay*>ment')).toBe('payment');
    });

    it('removes spaces', () => {
      expect(sanitizeSubjectPart('pay ment')).toBe('payment');
    });

    it('preserves hyphens', () => {
      expect(sanitizeSubjectPart('my-domain')).toBe('my-domain');
    });

    it('collapses multiple hyphens into one', () => {
      expect(sanitizeSubjectPart('my---domain')).toBe('my-domain');
    });

    it('strips leading and trailing hyphens', () => {
      expect(sanitizeSubjectPart('-payment-')).toBe('payment');
    });

    it('trims whitespace first', () => {
      expect(sanitizeSubjectPart('  payment  ')).toBe('payment');
    });

    it('throws when result is empty after sanitization', () => {
      expect(() => sanitizeSubjectPart('...')).toThrow('Invalid subject part');
    });

    it('throws for all-special-character input', () => {
      expect(() => sanitizeSubjectPart('***')).toThrow('Invalid subject part');
    });

    it('handles underscore removal', () => {
      expect(sanitizeSubjectPart('my_domain')).toBe('mydomain');
    });
  });
});
