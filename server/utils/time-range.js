const dayjs = require("dayjs");

/**
 * The oldest data kept by the uptime calculator (daily stats), in days
 */
const MAX_RANGE_DAYS = 365;

/**
 * Parse and validate an absolute time range.
 * The range is clamped to the data which is available (the last 365 days until now).
 * @param {number|string} from Start of the range, unix timestamp in seconds
 * @param {number|string} to End of the range, unix timestamp in seconds
 * @param {number} now Current time, unix timestamp in seconds
 * @returns {{from: number, to: number}} The clamped range
 * @throws {Error} Invalid time range
 */
function parseTimeRange(from, to, now = dayjs.utc().unix()) {
    from = Number(from);
    to = Number(to);

    if (!Number.isInteger(from) || !Number.isInteger(to)) {
        throw new Error("Invalid time range");
    }

    from = Math.max(from, now - MAX_RANGE_DAYS * 86400);
    to = Math.min(to, now);

    if (from >= to) {
        throw new Error("Invalid time range");
    }

    return {
        from,
        to,
    };
}

/**
 * Get the time range for the last N hours
 * @param {number|string} hours Number of hours, 1 - 8760
 * @param {number} now Current time, unix timestamp in seconds
 * @returns {{from: number, to: number}} The range
 * @throws {Error} Invalid number of hours
 */
function lastHoursTimeRange(hours, now = dayjs.utc().unix()) {
    hours = Number(hours);

    if (!Number.isInteger(hours) || hours < 1 || hours > MAX_RANGE_DAYS * 24) {
        throw new Error("Invalid time range");
    }

    return {
        from: now - hours * 3600,
        to: now,
    };
}

module.exports = {
    parseTimeRange,
    lastHoursTimeRange,
};
