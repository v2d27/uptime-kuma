const { checkLogin } = require("../util-server");
const { UptimeCalculator } = require("../uptime-calculator");
const { log } = require("../../src/util");
const { parseTimeRange } = require("../utils/time-range");

module.exports.chartSocketHandler = (socket) => {
    socket.on("getMonitorChartData", async (monitorID, period, callback) => {
        try {
            checkLogin(socket);

            log.debug("monitor", `Get Monitor Chart Data: ${monitorID} User ID: ${socket.userID}`);

            if (period == null) {
                throw new Error("Invalid period.");
            }

            let uptimeCalculator = await UptimeCalculator.getUptimeCalculator(monitorID);

            let data;
            let type;
            if (typeof period === "object") {
                // Custom range: { from, to } in unix timestamp (seconds)
                const range = parseTimeRange(period.from, period.to);
                type = uptimeCalculator.getRangeDataType(range.from);
                data = uptimeCalculator.getDataArrayInRange(range.from, range.to, type);
            } else if (period <= 24) {
                type = "minute";
                data = uptimeCalculator.getDataArray(period * 60, type);
            } else if (period <= 720) {
                type = "hour";
                data = uptimeCalculator.getDataArray(period, type);
            } else {
                type = "day";
                data = uptimeCalculator.getDataArray(period / 24, type);
            }

            callback({
                ok: true,
                data,
                type,
            });
        } catch (e) {
            callback({
                ok: false,
                msg: e.message,
            });
        }
    });
};
