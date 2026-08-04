import { describe, expect, it, vi } from "vitest";

import { PerformancesService } from "./performances.service.js";

describe("PerformancesService", () => {
  function dependencies() {
    const performance = {
      id: "c29540d4-e2cc-4fd9-bfa6-85bff55b87a5",
      artistId: "d403af36-536d-4a22-a522-25b4b4b68871",
      date: "2026-08-07",
      startTime: new Date("2026-08-08T03:40:00Z"),
      endTime: new Date("2026-08-08T04:55:00Z"),
      location: "Lands End",
      changeType: "added",
      changedFields: [],
      detectedAt: new Date("2026-08-01T00:00:00Z"),
      previousPerformanceId: null,
      previousDate: null,
      previousStartTime: null,
      previousEndTime: null,
      previousLocation: null,
    };
    const repository = {
      find: vi.fn().mockResolvedValue([performance]),
      findOneBy: vi.fn().mockResolvedValue(performance),
    };
    return { performance, repository, service: new PerformancesService(repository as never) };
  }

  it("excludes removed performances by default", async () => {
    const { repository, service } = dependencies();

    await service.findAll({});

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          changeType: expect.objectContaining({ _type: "not", _value: "removed" }),
        }),
      })
    );
  });

  it("includes removed performances when requested", async () => {
    const { repository, service } = dependencies();

    await service.findAll({ includeRemoved: true });

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      })
    );
  });

  it("does not return a historical version by id", async () => {
    const { performance, repository, service } = dependencies();

    await service.findById(performance.id);

    expect(repository.findOneBy).toHaveBeenCalledWith({
      id: performance.id,
      changeType: expect.objectContaining({ _type: "not", _value: "removed" }),
    });
  });

  it("maps previous schedule values from the view", async () => {
    const { performance, repository, service } = dependencies();
    repository.find.mockResolvedValue([
      {
        ...performance,
        changeType: "changed",
        changedFields: ["starts", "location"],
        previousPerformanceId: "038152b2-ff93-47aa-a91f-d29c609dfcff",
        previousDate: "2026-08-07",
        previousStartTime: new Date("2026-08-08T03:10:00Z"),
        previousEndTime: new Date("2026-08-08T04:25:00Z"),
        previousLocation: "Sutro",
      },
    ]);

    await expect(service.findAll({})).resolves.toEqual([
      expect.objectContaining({
        change: {
          type: "changed",
          fields: ["starts", "location"],
          detectedAt: performance.detectedAt,
          previous: {
            id: "038152b2-ff93-47aa-a91f-d29c609dfcff",
            date: "2026-08-07",
            startTime: new Date("2026-08-08T03:10:00Z"),
            endTime: new Date("2026-08-08T04:25:00Z"),
            location: "Sutro",
          },
        },
      }),
    ]);
  });

  it("serializes database date values as date-only strings", async () => {
    const { performance, repository, service } = dependencies();
    repository.find.mockResolvedValue([
      {
        ...performance,
        date: new Date("2026-08-07T00:00:00.000Z"),
        changeType: "changed",
        previousPerformanceId: "038152b2-ff93-47aa-a91f-d29c609dfcff",
        previousDate: new Date("2026-08-06T00:00:00.000Z"),
      },
    ]);

    await expect(service.findAll({})).resolves.toEqual([
      expect.objectContaining({
        date: "2026-08-07",
        change: expect.objectContaining({
          previous: expect.objectContaining({ date: "2026-08-06" }),
        }),
      }),
    ]);
  });
});
