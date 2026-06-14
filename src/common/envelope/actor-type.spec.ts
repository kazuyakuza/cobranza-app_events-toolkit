import { ActorType } from './actor-type.enum';

describe('ActorType', () => {
  it('exposes CLIENT member with value "client"', () => {
    expect(ActorType.CLIENT).toBe('client');
  });

  it('exposes COMPANY_USER member with value "company_user"', () => {
    expect(ActorType.COMPANY_USER).toBe('company_user');
  });

  it('exposes SYSTEM member with value "system"', () => {
    expect(ActorType.SYSTEM).toBe('system');
  });

  it('exposes SCHEDULER member with value "scheduler"', () => {
    expect(ActorType.SCHEDULER).toBe('scheduler');
  });

  it('exposes EXTERNAL_API member with value "external_api"', () => {
    expect(ActorType.EXTERNAL_API).toBe('external_api');
  });

  it('has exactly 5 enum members', () => {
    const keys = Object.keys(ActorType);
    expect(keys).toHaveLength(5);
  });

  it('iterates over all member entries', () => {
    const keys = Object.keys(ActorType);
    expect(keys).toContain('CLIENT');
    expect(keys).toContain('SYSTEM');
    expect(keys).toContain('SCHEDULER');
  });
});
