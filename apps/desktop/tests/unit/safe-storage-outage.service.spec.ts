import type { SafeStorageOutageState } from "@metaverse-systems/llm-tutor-shared/src/contracts/llm-profile-ipc";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { SafeStorageOutageService } from "../../src/main/services/safe-storage-outage.service";

const makeUuid = (index: number): string => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;

describe("SafeStorageOutageService", () => {
  let mockNow: () => number;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000;
    mockNow = vi.fn(() => currentTime);
  });

  describe("constructor", () => {
    it("initializes with default inactive state", () => {
      const service = new SafeStorageOutageService();
      const state = service.getState();

      expect(state.isActive).toBe(false);
      expect(state.startedAt).toBeNull();
      expect(state.resolvedAt).toBeNull();
      expect(state.blockedRequestIds).toEqual([]);
    });

    it("accepts initial state options", () => {
      const initialState = {
        isActive: true,
        startedAt: 500000,
        resolvedAt: null,
        blockedRequestIds: [makeUuid(1)]
      };

      const service = new SafeStorageOutageService({ initialState });
      const state = service.getState();

      expect(state.isActive).toBe(true);
      expect(state.startedAt).toBe(500000);
      expect(state.blockedRequestIds).toEqual([makeUuid(1)]);
    });

    it("uses provided now function", () => {
      const service = new SafeStorageOutageService({ now: mockNow });
      service.startOutage();

      const state = service.getState();
      expect(state.startedAt).toBe(currentTime);
      expect(mockNow).toHaveBeenCalled();
    });
  });

  describe("getState", () => {
    it("returns a clone of the state", () => {
      const service = new SafeStorageOutageService();
      const state1 = service.getState();
      const state2 = service.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
      expect(state1.blockedRequestIds).not.toBe(state2.blockedRequestIds);
    });
  });

  describe("getStatus", () => {
    it("returns available when no outage is active", () => {
      const service = new SafeStorageOutageService();
      expect(service.getStatus()).toBe("available");
    });

    it("returns unavailable when outage is active", () => {
      const service = new SafeStorageOutageService({
        initialState: { isActive: true, startedAt: 1000, resolvedAt: null, blockedRequestIds: [] }
      });
      expect(service.getStatus()).toBe("unavailable");
    });
  });

  describe("isOutageActive", () => {
    it("returns false when no outage is active", () => {
      const service = new SafeStorageOutageService();
      expect(service.isOutageActive()).toBe(false);
    });

    it("returns true when outage is active", () => {
      const service = new SafeStorageOutageService({
        initialState: { isActive: true, startedAt: 1000, resolvedAt: null, blockedRequestIds: [] }
      });
      expect(service.isOutageActive()).toBe(true);
    });
  });

  describe("startOutage", () => {
    it("transitions from inactive to active", () => {
      const service = new SafeStorageOutageService({ now: mockNow });
      const result = service.startOutage();

      expect(result.isActive).toBe(true);
      expect(result.startedAt).toBe(currentTime);
      expect(result.resolvedAt).toBeNull();
      expect(result.blockedRequestIds).toEqual([]);
    });

    it("clears blocked request IDs when starting new outage", () => {
      const service = new SafeStorageOutageService({
        now: mockNow,
        initialState: {
          isActive: false,
          startedAt: null,
          resolvedAt: 900000,
          blockedRequestIds: [makeUuid(2)]
        }
      });

      const result = service.startOutage();
      expect(result.blockedRequestIds).toEqual([]);
    });

    it("does not change state if already active", () => {
      const service = new SafeStorageOutageService({
        now: mockNow,
        initialState: { isActive: true, startedAt: 900000, resolvedAt: null, blockedRequestIds: [] }
      });

      const beforeState = service.getState();
      service.startOutage();
      const afterState = service.getState();

      expect(afterState).toEqual(beforeState);
      expect(afterState.startedAt).toBe(900000); // Should not update timestamp
    });
  });

  describe("resolveOutage", () => {
    it("transitions from active to inactive", () => {
      const service = new SafeStorageOutageService({
        now: mockNow,
        initialState: { isActive: true, startedAt: 900000, resolvedAt: null, blockedRequestIds: [makeUuid(3)] }
      });

      const result = service.resolveOutage();

      expect(result.isActive).toBe(false);
      expect(result.resolvedAt).toBe(currentTime);
      expect(result.blockedRequestIds).toEqual([]);
    });

    it("clears blocked request IDs when resolving", () => {
      const service = new SafeStorageOutageService({
        now: mockNow,
        initialState: {
          isActive: true,
          startedAt: 900000,
          resolvedAt: null,
          blockedRequestIds: [makeUuid(4), makeUuid(5), makeUuid(6)]
        }
      });

      const result = service.resolveOutage();
      expect(result.blockedRequestIds).toEqual([]);
    });

    it("does not change state if already inactive", () => {
      const service = new SafeStorageOutageService({ now: mockNow });

      const beforeState = service.getState();
      service.resolveOutage();
      const afterState = service.getState();

      expect(afterState).toEqual(beforeState);
    });
  });

  describe("setAvailability", () => {
    it("starts outage when setting availability to false", () => {
      const service = new SafeStorageOutageService({ now: mockNow });
      service.setAvailability(false);

      expect(service.isOutageActive()).toBe(true);
      expect(service.getState().startedAt).toBe(currentTime);
    });

    it("resolves outage when setting availability to true", () => {
      const service = new SafeStorageOutageService({
        now: mockNow,
        initialState: { isActive: true, startedAt: 900000, resolvedAt: null, blockedRequestIds: [] }
      });

      service.setAvailability(true);

      expect(service.isOutageActive()).toBe(false);
      expect(service.getState().resolvedAt).toBe(currentTime);
    });
  });

  describe("recordBlockedRequest", () => {
    it("records request ID during active outage", () => {
      const service = new SafeStorageOutageService({
        initialState: { isActive: true, startedAt: 900000, resolvedAt: null, blockedRequestIds: [] }
      });

      const firstId = makeUuid(4);
      const secondId = makeUuid(5);

      service.recordBlockedRequest(firstId);
      expect(service.getState().blockedRequestIds).toEqual([firstId]);

      service.recordBlockedRequest(secondId);
      expect(service.getState().blockedRequestIds).toEqual([firstId, secondId]);
    });

    it("does not record duplicate request IDs", () => {
      const service = new SafeStorageOutageService({
        initialState: { isActive: true, startedAt: 900000, resolvedAt: null, blockedRequestIds: [] }
      });

      const id = makeUuid(6);
      service.recordBlockedRequest(id);
      service.recordBlockedRequest(id);
      service.recordBlockedRequest(id);

      expect(service.getState().blockedRequestIds).toEqual([id]);
    });

    it("ignores blocked requests when outage is not active", () => {
      const service = new SafeStorageOutageService();

      service.recordBlockedRequest(makeUuid(7));
      expect(service.getState().blockedRequestIds).toEqual([]);
    });

    it("ignores empty request IDs", () => {
      const service = new SafeStorageOutageService({
        initialState: { isActive: true, startedAt: 900000, resolvedAt: null, blockedRequestIds: [] }
      });

      service.recordBlockedRequest("");
      service.recordBlockedRequest("   ");

      expect(service.getState().blockedRequestIds).toEqual([]);
    });

    it("ignores non-string request IDs", () => {
      const service = new SafeStorageOutageService({
        initialState: { isActive: true, startedAt: 900000, resolvedAt: null, blockedRequestIds: [] }
      });

      // @ts-expect-error Testing invalid input
      service.recordBlockedRequest(null);
      // @ts-expect-error Testing invalid input
      service.recordBlockedRequest(undefined);
      // @ts-expect-error Testing invalid input
      service.recordBlockedRequest(123);

      expect(service.getState().blockedRequestIds).toEqual([]);
    });
  });

  describe("onStateChange", () => {
    it("notifies listeners when state changes", () => {
      const service = new SafeStorageOutageService({ now: mockNow });
      const listener = vi.fn();

      service.onStateChange(listener);
      service.startOutage();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          startedAt: currentTime
        })
      );
    });

    it("notifies multiple listeners", () => {
      const service = new SafeStorageOutageService();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      service.onStateChange(listener1);
      service.onStateChange(listener2);
      service.startOutage();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it("returns disposer function that removes listener", () => {
      const service = new SafeStorageOutageService();
      const listener = vi.fn();

      const dispose = service.onStateChange(listener);
      dispose();

      service.startOutage();
      expect(listener).not.toHaveBeenCalled();
    });

    it("provides cloned state to listeners", () => {
      const service = new SafeStorageOutageService({
        initialState: { isActive: true, startedAt: 900000, resolvedAt: null, blockedRequestIds: [] }
      });

      let receivedState1: SafeStorageOutageState | undefined;
      let receivedState2: SafeStorageOutageState | undefined;

      service.onStateChange((state) => {
        receivedState1 = state;
      });

      service.recordBlockedRequest(makeUuid(8));

      service.onStateChange((state) => {
        receivedState2 = state;
      });

      service.recordBlockedRequest(makeUuid(9));

      expect(receivedState1).toBeDefined();
      expect(receivedState2).toBeDefined();
      if (!receivedState1 || !receivedState2) {
        throw new Error("Expected listeners to receive state updates");
      }

      expect(receivedState1).not.toBe(receivedState2);
      expect(receivedState1.blockedRequestIds).not.toBe(receivedState2.blockedRequestIds);
    });

    it("continues notifying other listeners if one throws", () => {
      const service = new SafeStorageOutageService();
      const failingListener = vi.fn(() => {
        throw new Error("Listener failed");
      });
      const goodListener = vi.fn();

      service.onStateChange(failingListener);
      service.onStateChange(goodListener);

      expect(() => service.startOutage()).not.toThrow();
      expect(failingListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });

    it("does not notify listeners when state does not change", () => {
      const service = new SafeStorageOutageService();
      const listener = vi.fn();

      service.onStateChange(listener);
      service.resolveOutage(); // Already inactive

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("state transitions", () => {
    it("tracks full outage lifecycle", () => {
      const service = new SafeStorageOutageService({ now: mockNow });
      const stateHistory: SafeStorageOutageState[] = [];

      service.onStateChange((state) => stateHistory.push(state));

      // Start outage
      currentTime = 1000;
      service.startOutage();

      // Record some blocked requests
      service.recordBlockedRequest(makeUuid(10));
      service.recordBlockedRequest(makeUuid(11));

      // Resolve outage
      currentTime = 2000;
      service.resolveOutage();

      expect(stateHistory).toHaveLength(4);

      // Outage started
      expect(stateHistory[0]).toMatchObject({
        isActive: true,
        startedAt: 1000,
        blockedRequestIds: []
      });

      // First request blocked
      expect(stateHistory[1]).toMatchObject({
        isActive: true,
        blockedRequestIds: [makeUuid(10)]
      });

      // Second request blocked
      expect(stateHistory[2]).toMatchObject({
        isActive: true,
        blockedRequestIds: [makeUuid(10), makeUuid(11)]
      });

      // Outage resolved
      expect(stateHistory[3]).toMatchObject({
        isActive: false,
        resolvedAt: 2000,
        blockedRequestIds: []
      });
    });

    it("handles multiple outage cycles", () => {
      const service = new SafeStorageOutageService({ now: mockNow });

      // First outage
      currentTime = 1000;
      service.startOutage();
      service.recordBlockedRequest(makeUuid(12));

      currentTime = 2000;
      service.resolveOutage();

      // Second outage
      currentTime = 3000;
      service.startOutage();
      const state = service.getState();

      expect(state.isActive).toBe(true);
      expect(state.startedAt).toBe(3000);
      expect(state.resolvedAt).toBeNull();
      expect(state.blockedRequestIds).toEqual([]);
    });
  });
});
