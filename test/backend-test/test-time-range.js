const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert");
const dayjs = require("dayjs");
dayjs.extend(require("dayjs/plugin/utc"));
dayjs.extend(require("../../server/modules/dayjs/plugin/timezone"));
const { UptimeCalculator } = require("../../server/uptime-calculator");
const { parseTimeRange, lastHoursTimeRange } = require("../../server/utils/time-range");
const { UP, DOWN, MAINTENANCE } = require("../../src/util");

describe("parseTimeRange()", () => {
    const now = dayjs.utc("2025-06-15 12:00:00").unix();

    test("returns a valid range as is", () => {
        const range = parseTimeRange(now - 3600, now - 60, now);
        assert.deepStrictEqual(range, { from: now - 3600, to: now - 60 });
    });

    test("accepts numeric strings from a query", () => {
        const range = parseTimeRange(String(now - 3600), String(now), now);
        assert.deepStrictEqual(range, { from: now - 3600, to: now });
    });

    test("clamps the range to the last 365 days until now", () => {
        const range = parseTimeRange(now - 400 * 86400, now + 3600, now);
        assert.deepStrictEqual(range, { from: now - 365 * 86400, to: now });
    });

    test("rejects an invalid range", () => {
        assert.throws(() => parseTimeRange(now, now - 60, now), /Invalid time range/);
        assert.throws(() => parseTimeRange(now - 60, now - 60, now), /Invalid time range/);
        assert.throws(() => parseTimeRange("abc", now, now), /Invalid time range/);
        assert.throws(() => parseTimeRange(undefined, now, now), /Invalid time range/);
        assert.throws(() => parseTimeRange(now - 1.5, now, now), /Invalid time range/);
        // Completely in the future
        assert.throws(() => parseTimeRange(now + 60, now + 3600, now), /Invalid time range/);
    });
});

describe("lastHoursTimeRange()", () => {
    const now = dayjs.utc("2025-06-15 12:00:00").unix();

    test("returns the last N hours", () => {
        assert.deepStrictEqual(lastHoursTimeRange("168", now), { from: now - 168 * 3600, to: now });
    });

    test("rejects an invalid number of hours", () => {
        assert.throws(() => lastHoursTimeRange("0", now), /Invalid time range/);
        assert.throws(() => lastHoursTimeRange("8761", now), /Invalid time range/);
        assert.throws(() => lastHoursTimeRange("1.5", now), /Invalid time range/);
        assert.throws(() => lastHoursTimeRange("7d", now), /Invalid time range/);
    });
});

describe("UptimeCalculator time range", () => {
    afterEach(() => {
        UptimeCalculator.currentDate = null;
    });

    /**
     * Add a heartbeat at the given date
     * @param {UptimeCalculator} c Uptime calculator
     * @param {string} date UTC date
     * @param {number} status Status
     * @param {number} ping Ping
     * @returns {Promise<void>}
     */
    async function beat(c, date, status, ping = 10) {
        UptimeCalculator.currentDate = dayjs.utc(date);
        await c.update(status, ping);
    }

    test("getRangeDataType() picks the finest data which is still kept", () => {
        UptimeCalculator.currentDate = dayjs.utc("2025-06-15 12:00:00");
        const c = new UptimeCalculator();
        const now = UptimeCalculator.currentDate.unix();

        assert.strictEqual(c.getRangeDataType(now - 3600), "minute");
        assert.strictEqual(c.getRangeDataType(now - 86400), "minute");
        assert.strictEqual(c.getRangeDataType(now - 86400 - 1), "hour");
        assert.strictEqual(c.getRangeDataType(now - 30 * 86400), "hour");
        assert.strictEqual(c.getRangeDataType(now - 31 * 86400), "day");
    });

    test("getDataArrayInRange() returns only the data within a past range", async () => {
        const c = new UptimeCalculator();
        await beat(c, "2025-06-15 10:00:10", UP);
        await beat(c, "2025-06-15 10:01:10", DOWN);
        await beat(c, "2025-06-15 10:02:10", UP);
        await beat(c, "2025-06-15 10:03:10", UP);
        await beat(c, "2025-06-15 11:00:10", UP);

        UptimeCalculator.currentDate = dayjs.utc("2025-06-15 12:00:00");
        const from = dayjs.utc("2025-06-15 10:01:00").unix();
        const to = dayjs.utc("2025-06-15 10:02:30").unix();
        const data = c.getDataArrayInRange(from, to, "minute");

        // Newest first
        assert.deepStrictEqual(
            data.map((d) => d.timestamp),
            [dayjs.utc("2025-06-15 10:02:00").unix(), dayjs.utc("2025-06-15 10:01:00").unix()]
        );
        assert.strictEqual(data[0].up, 1);
        assert.strictEqual(data[1].down, 1);
    });

    test("getDataArrayInRange() rejects a range which is too large for the type", () => {
        const c = new UptimeCalculator();
        const to = dayjs.utc("2025-06-15 12:00:00").unix();

        assert.throws(() => c.getDataArrayInRange(to - 1441 * 60, to, "minute"), /The range is too large/);
        assert.throws(() => c.getDataArrayInRange(to - 721 * 3600, to, "hour"), /The range is too large/);
        assert.throws(() => c.getDataArrayInRange(to, to - 60, "minute"), /Invalid range/);
        assert.throws(() => c.getDataArrayInRange(to - 60, to, "week"), /Invalid type/);
        assert.doesNotThrow(() => c.getDataArrayInRange(to - 720 * 3600, to, "hour"));
    });

    test("getBucketsInRange() sums up the data of each bucket", async () => {
        const c = new UptimeCalculator();
        // Bucket 1: 10:00 - 11:00, all up
        await beat(c, "2025-06-15 10:10:00", UP, 10);
        await beat(c, "2025-06-15 10:20:00", UP, 30);
        // Bucket 2: 11:00 - 12:00, partially down
        await beat(c, "2025-06-15 11:10:00", UP, 20);
        await beat(c, "2025-06-15 11:20:00", DOWN);
        // Bucket 3: 12:00 - 13:00, maintenance only
        await beat(c, "2025-06-15 12:10:00", MAINTENANCE);
        // Bucket 4: 13:00 - 14:00, no data

        UptimeCalculator.currentDate = dayjs.utc("2025-06-15 14:00:00");
        const from = dayjs.utc("2025-06-15 10:00:00").unix();
        const to = dayjs.utc("2025-06-15 14:00:00").unix();
        const buckets = c.getBucketsInRange(from, to, 4);

        assert.strictEqual(buckets.length, 4);
        assert.deepStrictEqual(
            buckets.map((b) => [b.start, b.end]),
            [0, 1, 2, 3].map((i) => [from + i * 3600, from + (i + 1) * 3600])
        );

        assert.deepStrictEqual(
            buckets.map((b) => [b.up, b.down, b.maintenance]),
            [
                [2, 0, 0],
                [1, 1, 0],
                [0, 0, 1],
                [0, 0, 0],
            ]
        );
        assert.strictEqual(buckets[0].avgPing, 20);
        assert.strictEqual(buckets[1].avgPing, 20);
        assert.strictEqual(buckets[3].avgPing, null);
    });

    test("getBucketsInRange() uses fewer buckets if the data is coarser", async () => {
        const c = new UptimeCalculator();
        await beat(c, "2025-01-10 10:00:00", UP);

        // Older than 30 days, only daily data is available
        UptimeCalculator.currentDate = dayjs.utc("2025-06-15 12:00:00");
        const from = dayjs.utc("2025-01-05 00:00:00").unix();
        const to = dayjs.utc("2025-01-15 00:00:00").unix();
        const buckets = c.getBucketsInRange(from, to, 50);

        assert.strictEqual(buckets.length, 10);
        assert.strictEqual(
            buckets.reduce((total, b) => total + b.up, 0),
            1
        );
        assert.strictEqual(buckets[5].up, 1);
    });
});
