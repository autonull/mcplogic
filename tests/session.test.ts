/**
 * Tests for session management
 */

import { SessionManager, createSessionManager, Session } from '../src/session/manager.js';
import { LogicException } from '../src/types/errors.js';

describe('SessionManager', () => {
    let manager: SessionManager;

    beforeEach(() => {
        manager = createSessionManager();
    });

    afterEach(async () => {
        manager.stop();
        await manager.clearAll();
    });

    describe('create', () => {
        test('creates session with UUID', () => {
            const session = manager.create();

            expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
            expect(session.premises).toEqual([]);
            expect(session.prologProgram).toBe('');
            expect(session.createdAt).toBeLessThanOrEqual(Date.now());
        });

        test('creates session with custom TTL', () => {
            const session = manager.create({ ttlMs: 60000 });

            expect(session.ttlMs).toBe(60000);
        });

        test('uses default TTL when not specified', () => {
            const session = manager.create();

            expect(session.ttlMs).toBe(30 * 60 * 1000); // 30 minutes
        });

        test('throws when max sessions reached', () => {
            // Create max sessions
            for (let i = 0; i < SessionManager.MAX_SESSIONS; i++) {
                manager.create();
            }

            expect(() => manager.create()).toThrow(LogicException);
            expect(() => manager.create()).toThrow(/limit/i);
        });
    });

    describe('get', () => {
        test('retrieves existing session', () => {
            const created = manager.create();
            const retrieved = manager.get(created.id);

            expect(retrieved.id).toBe(created.id);
        });

        test('updates lastAccessedAt on get', async () => {
            const session = manager.create();
            const originalAccess = session.lastAccessedAt;

            // Wait a bit
            await new Promise(r => setTimeout(r, 10));

            manager.get(session.id);
            expect(session.lastAccessedAt).toBeGreaterThan(originalAccess);
        });

        test('throws for non-existent session', () => {
            expect(() => manager.get('non-existent-id')).toThrow(LogicException);
            expect(() => manager.get('non-existent-id')).toThrow(/not found/i);
        });
    });

    describe('exists', () => {
        test('returns true for existing session', () => {
            const session = manager.create();
            expect(manager.exists(session.id)).toBe(true);
        });

        test('returns false for non-existent session', () => {
            expect(manager.exists('non-existent')).toBe(false);
        });
    });

    describe('delete', () => {
        test('deletes existing session', async () => {
            const session = manager.create();
            const result = await manager.delete(session.id);

            expect(result).toBe(true);
            expect(manager.exists(session.id)).toBe(false);
        });

        test('throws for non-existent session', async () => {
            await expect(manager.delete('non-existent')).rejects.toThrow(LogicException);
        });
    });

    describe('assertPremise', () => {
        test('adds premise to session', async () => {
            const session = manager.create();
            await manager.assertPremise(session.id, 'man(socrates)');

            expect(session.premises).toContain('man(socrates)');
            expect(session.prologProgram).toContain('man(socrates)');
        });

        test('accumulates multiple premises', async () => {
            const session = manager.create();
            await manager.assertPremise(session.id, 'man(socrates)');
            await manager.assertPremise(session.id, 'all x (man(x) -> mortal(x))');

            expect(session.premises).toHaveLength(2);
        });

        test('throws for non-existent session', async () => {
            await expect(manager.assertPremise('bad-id', 'P(x)')).rejects.toThrow(LogicException);
        });
    });

    describe('retractPremise', () => {
        test('removes existing premise', async () => {
            const session = manager.create();
            await manager.assertPremise(session.id, 'man(socrates)');
            await manager.assertPremise(session.id, 'man(plato)');

            const removed = await manager.retractPremise(session.id, 'man(socrates)');

            expect(removed).toBe(true);
            expect(session.premises).not.toContain('man(socrates)');
            expect(session.premises).toContain('man(plato)');
        });

        test('returns false for non-existent premise', async () => {
            const session = manager.create();
            await manager.assertPremise(session.id, 'man(socrates)');

            const removed = await manager.retractPremise(session.id, 'man(plato)');

            expect(removed).toBe(false);
        });

        test('updates Prolog program after retract', async () => {
            const session = manager.create();
            await manager.assertPremise(session.id, 'man(socrates)');
            await manager.retractPremise(session.id, 'man(socrates)');

            expect(session.prologProgram).not.toContain('man(socrates)');
        });
    });

    describe('listPremises', () => {
        test('returns copy of premises', async () => {
            const session = manager.create();
            await manager.assertPremise(session.id, 'P(a)');
            await manager.assertPremise(session.id, 'Q(b)');

            const premises = manager.listPremises(session.id);

            expect(premises).toEqual(['P(a)', 'Q(b)']);
            // Verify it's a copy
            premises.push('R(c)');
            expect(session.premises).toHaveLength(2);
        });
    });

    describe('clear', () => {
        test('clears all premises but keeps session', async () => {
            const session = manager.create();
            await manager.assertPremise(session.id, 'P(a)');
            await manager.assertPremise(session.id, 'Q(b)');

            await manager.clear(session.id);

            expect(session.premises).toEqual([]);
            expect(session.prologProgram).toBe('');
            expect(manager.exists(session.id)).toBe(true);
        });
    });

    describe('getInfo', () => {
        test('returns session info without updating access time', () => {
            const session = manager.create();
            const originalAccess = session.lastAccessedAt;

            const info = manager.getInfo(session.id);

            expect(info.id).toBe(session.id);
            expect(info.premiseCount).toBe(0);
            expect(info.expiresAt).toBe(session.lastAccessedAt + session.ttlMs);
            expect(session.lastAccessedAt).toBe(originalAccess);
        });
    });

    describe('count', () => {
        test('tracks session count', async () => {
            expect(manager.count).toBe(0);

            const s1 = manager.create();
            expect(manager.count).toBe(1);

            manager.create();
            expect(manager.count).toBe(2);

            await manager.delete(s1.id);
            expect(manager.count).toBe(1);
        });
    });
});

describe('Session workflow', () => {
    let manager: SessionManager;

    beforeEach(() => {
        manager = createSessionManager();
    });

    afterEach(async () => {
        manager.stop();
        await manager.clearAll();
    });

    test('full workflow: create -> assert -> list -> clear -> delete', async () => {
        // Create
        const session = manager.create();
        expect(session.id).toBeDefined();

        // Assert premises
        await manager.assertPremise(session.id, 'all x (man(x) -> mortal(x))');
        await manager.assertPremise(session.id, 'man(socrates)');

        // List
        const premises = manager.listPremises(session.id);
        expect(premises).toHaveLength(2);

        // Clear
        await manager.clear(session.id);
        expect(manager.listPremises(session.id)).toHaveLength(0);
        expect(manager.exists(session.id)).toBe(true);

        // Delete
        await manager.delete(session.id);
        expect(manager.exists(session.id)).toBe(false);
    });
});
