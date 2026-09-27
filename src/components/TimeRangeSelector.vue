<template>
    <div class="time-range-selector">
        <button
            ref="toggle"
            type="button"
            class="btn btn-light dropdown-toggle btn-period-toggle"
            data-bs-toggle="dropdown"
            data-bs-auto-close="outside"
            aria-expanded="false"
            :aria-label="$t('Time range')"
            data-testid="time-range-toggle"
            @click="onToggle"
        >
            {{ label }}&nbsp;
        </button>
        <div class="dropdown-menu dropdown-menu-end">
            <button
                v-for="(item, key) in presetOptions"
                :key="key"
                type="button"
                class="dropdown-item"
                :class="{ active: modelValue === key }"
                @click="selectPreset(key)"
            >
                {{ item }}
            </button>
            <button
                type="button"
                class="dropdown-item"
                :class="{ active: isCustom }"
                data-testid="time-range-custom"
                @click="openCustomForm"
            >
                {{ $t("customTimeRange") }}
            </button>

            <form v-if="showCustomForm" class="custom-range-form" @submit.prevent="applyCustomRange">
                <label class="form-label" :for="`${uid}-from`">{{ $t("startDateTime") }}</label>
                <input
                    :id="`${uid}-from`"
                    v-model="customFrom"
                    type="datetime-local"
                    class="form-control form-control-sm mb-2"
                    :min="minInput"
                    :max="maxInput"
                    required
                />

                <label class="form-label" :for="`${uid}-to`">{{ $t("endDateTime") }}</label>
                <input
                    :id="`${uid}-to`"
                    v-model="customTo"
                    type="datetime-local"
                    class="form-control form-control-sm mb-2"
                    :min="minInput"
                    :max="maxInput"
                    required
                />

                <div v-if="invalidRange" class="text-danger small mb-2">
                    {{ $t("invalidTimeRange") }}
                </div>

                <div class="d-flex justify-content-end gap-2">
                    <button type="button" class="btn btn-sm btn-secondary" @click="closeCustomForm">
                        {{ $t("Cancel") }}
                    </button>
                    <button type="submit" class="btn btn-sm btn-primary" :disabled="invalidRange">
                        {{ $t("Apply") }}
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>

<script>
import { Dropdown } from "bootstrap";
import dayjs from "dayjs";

/**
 * Default preset time ranges, in hours
 */
const DEFAULT_PRESETS = [3, 6, 24, 168, 336, 720];

/**
 * The oldest data which can be selected, in days (same as the daily stats kept on the server)
 */
const MAX_RANGE_DAYS = 365;

let uidCounter = 0;

export default {
    props: {
        /**
         * Selected time range:
         * "0" for recent heartbeats, a number of hours as string (e.g. "168") for a preset,
         * or { from, to } in unix timestamp (seconds) for a custom range
         */
        modelValue: {
            type: [String, Object],
            default: "0",
        },
        /** Preset time ranges, in hours */
        presets: {
            type: Array,
            default: () => DEFAULT_PRESETS,
        },
    },
    emits: ["update:modelValue"],
    data() {
        return {
            uid: `time-range-${++uidCounter}`,
            showCustomForm: false,
            customFrom: "",
            customTo: "",
            minInput: "",
            maxInput: "",
        };
    },
    computed: {
        presetOptions() {
            let options = {
                0: this.$t("recent"),
            };

            for (const hours of this.presets) {
                options[String(hours)] = this.presetLabel(hours);
            }

            return options;
        },

        isCustom() {
            return typeof this.modelValue === "object" && this.modelValue !== null;
        },

        label() {
            if (this.isCustom) {
                const format = "YYYY-MM-DD HH:mm";
                const from = this.$root.unixToDayjs(this.modelValue.from).format(format);
                const to = this.$root.unixToDayjs(this.modelValue.to).format(format);
                return `${from} – ${to}`;
            }

            return this.presetOptions[this.modelValue] ?? this.presetLabel(Number(this.modelValue));
        },

        invalidRange() {
            if (!this.customFrom || !this.customTo) {
                return false;
            }

            return (
                !this.inputToUnix(this.customFrom) ||
                this.inputToUnix(this.customFrom) >= this.inputToUnix(this.customTo)
            );
        },
    },
    mounted() {
        this.dropdown = new Dropdown(this.$refs.toggle, {
            // Open the menu towards the middle of the screen, so it is not cut off (e.g. for RTL languages)
            popperConfig: (defaultConfig) => {
                const rect = this.$refs.toggle.getBoundingClientRect();
                const isLeftHalf = rect.left + rect.width / 2 < window.innerWidth / 2;
                return {
                    ...defaultConfig,
                    placement: isLeftHalf ? "bottom-start" : "bottom-end",
                };
            },
        });
    },
    beforeUnmount() {
        this.dropdown.dispose();
    },
    methods: {
        /**
         * Get a translated label for a preset time range
         * @param {number} hours Number of hours
         * @returns {string} Label, e.g. "6 hours" or "7 days"
         */
        presetLabel(hours) {
            if (hours > 24 && hours % 24 === 0) {
                return this.$t("days", hours / 24);
            }
            return this.$t("hours", hours);
        },

        /**
         * Convert the value of <input type="datetime-local"> in the user timezone to unix timestamp
         * @param {string} value Input value
         * @returns {number|null} Unix timestamp in seconds
         */
        inputToUnix(value) {
            const date = dayjs.tz(value, this.$root.timezone);
            return date.isValid() ? date.unix() : null;
        },

        /**
         * Refresh the selectable range when the dropdown is opened
         * @returns {void}
         */
        onToggle() {
            const now = dayjs();
            this.maxInput = this.$root.toDateTimeInputFormat(now);
            this.minInput = this.$root.toDateTimeInputFormat(now.subtract(MAX_RANGE_DAYS, "day"));
        },

        /**
         * Select a preset time range
         * @param {string} key Number of hours as string, "0" for recent
         * @returns {void}
         */
        selectPreset(key) {
            this.showCustomForm = false;
            this.$emit("update:modelValue", key);
            this.hideDropdown();
        },

        /**
         * Show the form to select a custom time range, prefilled with the current range
         * @returns {void}
         */
        openCustomForm() {
            let to = dayjs();
            let from = to.subtract(1, "day");

            if (this.isCustom) {
                from = dayjs.unix(this.modelValue.from);
                to = dayjs.unix(this.modelValue.to);
            } else if (Number(this.modelValue) > 0) {
                from = to.subtract(Number(this.modelValue), "hour");
            }

            this.customFrom = this.$root.toDateTimeInputFormat(from);
            this.customTo = this.$root.toDateTimeInputFormat(to);
            this.showCustomForm = true;
        },

        /**
         * Close the custom time range form without applying it
         * @returns {void}
         */
        closeCustomForm() {
            this.showCustomForm = false;
            this.hideDropdown();
        },

        /**
         * Apply the custom time range
         * @returns {void}
         */
        applyCustomRange() {
            if (this.invalidRange) {
                return;
            }

            this.$emit("update:modelValue", {
                from: this.inputToUnix(this.customFrom),
                to: this.inputToUnix(this.customTo),
            });
            this.showCustomForm = false;
            this.hideDropdown();
        },

        /**
         * Close the dropdown menu
         * @returns {void}
         */
        hideDropdown() {
            this.dropdown.hide();
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../assets/vars.scss";

.time-range-selector {
    display: inline-block;

    .dropdown-menu {
        padding: 0;
        min-width: 50px;
        font-size: 0.9em;

        .dark & {
            background: $dark-bg;
        }

        .dropdown-item {
            border-radius: 0.3rem;
            padding: 2px 16px 4px;

            .dark & {
                background: $dark-bg;
                color: $dark-font-color;
            }

            .dark &:hover {
                background: $dark-font-color;
                color: $dark-font-color2;
            }
        }

        .dark & .dropdown-item.active {
            background: $primary;
            color: $dark-font-color2;
        }
    }

    .custom-range-form {
        width: 250px;
        padding: 10px 16px 12px;
        border-top: 1px solid rgba(0, 0, 0, 0.1);

        .dark & {
            border-top-color: $dark-border-color;
            color: $dark-font-color;
        }

        .form-label {
            margin-bottom: 2px;
        }

        // Dark date picker icon and popup
        .dark & .form-control {
            color-scheme: dark;
        }
    }

    .btn-period-toggle {
        padding: 2px 15px;
        background: transparent;
        border: 0;
        color: $link-color;
        opacity: 0.7;
        font-size: 0.9em;

        &::after {
            vertical-align: 0.155em;
        }

        .dark & {
            color: $dark-font-color;
        }
    }
}
</style>
