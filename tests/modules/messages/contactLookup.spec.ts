import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3'; // test fixture (tests/** whitelist)
import {
  normalizePhone,
  buildContactLookup,
  lookupContact,
} from '@main/modules/messages/contactLookup';

describe('contactLookup', () => {
  it('normalizePhone — sadece rakam, son 9 hane', () => {
    expect(normalizePhone('+905551234567')).toBe('551234567');
    expect(normalizePhone('(555) 123 45 67')).toBe('551234567'); // ülke kodu yok ama son 9 hane eşleşir
    expect(normalizePhone('0555 123 45 67')).toBe('551234567');
  });

  it('buildContactLookup — null db boş map', () => {
    expect(buildContactLookup(null).size).toBe(0);
  });

  it('buildContactLookup + lookupContact — son 9 hane eşleşmesi (ülke kodu farkı)', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE ABPerson (ROWID INTEGER PRIMARY KEY, First TEXT, Last TEXT, Organization TEXT);
      CREATE TABLE ABMultiValue (ROWID INTEGER PRIMARY KEY, record_id INTEGER, property INTEGER, value TEXT);
    `);
    db.prepare(`INSERT INTO ABPerson (ROWID, First, Last) VALUES (1, 'Ahmet', 'Yilmaz')`).run();
    db.prepare(
      `INSERT INTO ABMultiValue (record_id, property, value) VALUES (1, 3, '(555) 123 45 67')`,
    ).run();

    const map = buildContactLookup(db);
    // handle ülke koduyla gelir, AB ülke kodsuz — yine de eşleşmeli
    expect(lookupContact('+905551234567', map)).toBe('Ahmet Yilmaz');
    expect(lookupContact('+901112223344', map)).toBeNull();
    db.close();
  });

  it('lookupContact — email handle (property=4)', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE ABPerson (ROWID INTEGER PRIMARY KEY, First TEXT, Last TEXT, Organization TEXT);
      CREATE TABLE ABMultiValue (ROWID INTEGER PRIMARY KEY, record_id INTEGER, property INTEGER, value TEXT);
    `);
    db.prepare(`INSERT INTO ABPerson (ROWID, First, Last) VALUES (1, 'Mehmet', 'Demir')`).run();
    db.prepare(
      `INSERT INTO ABMultiValue (record_id, property, value) VALUES (1, 4, 'mehmet@example.com')`,
    ).run();
    const map = buildContactLookup(db);
    expect(lookupContact('MEHMET@example.com', map)).toBe('Mehmet Demir');
    db.close();
  });

  it('formatName — sadece org varsa org', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE ABPerson (ROWID INTEGER PRIMARY KEY, First TEXT, Last TEXT, Organization TEXT);
      CREATE TABLE ABMultiValue (ROWID INTEGER PRIMARY KEY, record_id INTEGER, property INTEGER, value TEXT);
    `);
    db.prepare(
      `INSERT INTO ABPerson (ROWID, First, Last, Organization) VALUES (1, NULL, NULL, 'TKGM')`,
    ).run();
    db.prepare(
      `INSERT INTO ABMultiValue (record_id, property, value) VALUES (1, 3, '+908501112233')`,
    ).run();
    const map = buildContactLookup(db);
    expect(lookupContact('+908501112233', map)).toBe('TKGM');
    db.close();
  });
});
