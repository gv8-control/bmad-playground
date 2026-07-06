/**
 * @jest-environment node
 *
 * Story 3.12: Drain Conversations Gracefully on Deploy
 * Unit tests for SessionEventsService — OnModuleDestroy drain behavior.
 *
 * Covers: AC-1 (SIGTERM → SSE drain notification).
 *   - onModuleDestroy emits SESSION_DRAINING to all conversations with active subjects
 *   - onModuleDestroy completes each subject after emitting drain
 *   - complete() removes the subject from the emitters Map
 *   - reconnecting clients get a fresh ReplaySubject (no stale drain event replayed)
 *
 * TDD GREEN PHASE — all tests un-skipped and passing.
 */
import { SessionEventsService } from './session-events.service';

describe('SessionEventsService', () => {
  let service: SessionEventsService;

  beforeEach(() => {
    service = new SessionEventsService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('[P0] Story 3.12 — onModuleDestroy emits SESSION_DRAINING (AC: 1)', () => {
    it('[P0] onModuleDestroy emits SESSION_DRAINING to all conversations with active subjects', async () => {
      const emitSpy = jest.spyOn(service, 'emit');
      service.emit('conv-1', { event: 'SESSION_READY', data: {} });
      service.emit('conv-2', { event: 'SESSION_READY', data: {} });

      await service.onModuleDestroy();

      expect(emitSpy).toHaveBeenCalledWith('conv-1', expect.objectContaining({ event: 'SESSION_DRAINING' }));
      expect(emitSpy).toHaveBeenCalledWith('conv-2', expect.objectContaining({ event: 'SESSION_DRAINING' }));
    });

    it('[P0] onModuleDestroy completes each subject after emitting drain', async () => {
      const completeSpy = jest.spyOn(service, 'complete');
      service.emit('conv-1', { event: 'SESSION_READY', data: {} });
      service.emit('conv-2', { event: 'SESSION_READY', data: {} });

      await service.onModuleDestroy();

      expect(completeSpy).toHaveBeenCalledWith('conv-1');
      expect(completeSpy).toHaveBeenCalledWith('conv-2');
    });

    it('[P0] onModuleDestroy emits SESSION_DRAINING before completing the subject', async () => {
      const orderedEvents: string[] = [];
      const stream = service.getEventStream('conv-1');
      stream.subscribe({
        next: (e) => orderedEvents.push(e.event),
        complete: () => orderedEvents.push('__COMPLETE__'),
      });

      await service.onModuleDestroy();

      const drainIndex = orderedEvents.indexOf('SESSION_DRAINING');
      const completeIndex = orderedEvents.indexOf('__COMPLETE__');
      expect(drainIndex).toBeGreaterThan(-1);
      expect(completeIndex).toBeGreaterThan(-1);
      expect(drainIndex).toBeLessThan(completeIndex);
    });

    it('[P0] onModuleDestroy is a no-op when no conversations have active subjects', async () => {
      const emitSpy = jest.spyOn(service, 'emit');

      await service.onModuleDestroy();

      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('[P0] Story 3.12 — complete() removes subject from Map (AC: 1)', () => {
    it('[P0] complete() removes the subject so reconnecting clients get a fresh ReplaySubject', async () => {
      service.emit('conv-1', { event: 'SESSION_DRAINING', data: {} });

      service.complete('conv-1');

      const freshStream = service.getEventStream('conv-1');
      const received: string[] = [];
      freshStream.subscribe((e) => received.push(e.event));

      expect(received).not.toContain('SESSION_DRAINING');
    });
  });

  describe('[P1] Story 3.12 — onModuleDestroy implements OnModuleDestroy interface (AC: 1)', () => {
    it('[P1] SessionEventsService implements OnModuleDestroy', () => {
      expect(typeof service.onModuleDestroy).toBe('function');
    });
  });
});
