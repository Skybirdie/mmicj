"use strict";

/*
=========================================================
 SkyMedia Date Display

 Formats a contract "date" field (YYYYMMDDHHmm, e.g.
 "202609050800") for display underneath a landing card's
 title:

   - Less than a week old: relative ("5 days ago",
     "6 hours ago", "3 minutes ago").
   - A week or older (or a future-dated/unparseable value):
     absolute ("Sep 5th, 2026").

 Mirrors the date parsing already used by LibrarySorter /
 VideoSorter / SlideshowSorter (12-digit contract format,
 with a fallback to Date.parse for other reasonable
 formats) so display and sorting never disagree about what
 a given date value means.
=========================================================
*/

window.DateDisplay = (function () {

    const api = {};

    const MONTH_NAMES = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;


    /*-------------------------------------------------------
     Parse a contract date value into a Date, or null.
    -------------------------------------------------------*/

    function parse(value) {

        const raw = String(value ?? "").trim();

        if (!raw) {
            return null;
        }

        const digits = raw.replace(/[^0-9]/g, "");

        if (/^\d{12}$/.test(digits)) {

            const year = Number(digits.slice(0, 4));
            const month = Number(digits.slice(4, 6));
            const day = Number(digits.slice(6, 8));
            const hour = Number(digits.slice(8, 10));
            const minute = Number(digits.slice(10, 12));

            if (
                month >= 1 && month <= 12 &&
                day >= 1 && day <= 31 &&
                hour >= 0 && hour <= 23 &&
                minute >= 0 && minute <= 59
            ) {

                const date =
                    new Date(year, month - 1, day, hour, minute);

                if (
                    date.getFullYear() === year &&
                    date.getMonth() === month - 1 &&
                    date.getDate() === day
                ) {
                    return date;
                }

            }

        }

        const parsed = Date.parse(raw);

        return Number.isFinite(parsed) ? new Date(parsed) : null;

    }


    /*-------------------------------------------------------
     Ordinal day suffix: 1st, 2nd, 3rd, 4th ... 21st ...
    -------------------------------------------------------*/

    function ordinal(day) {

        const remainder100 = day % 100;

        if (remainder100 >= 11 && remainder100 <= 13) {
            return day + "th";
        }

        switch (day % 10) {
            case 1: return day + "st";
            case 2: return day + "nd";
            case 3: return day + "rd";
            default: return day + "th";
        }

    }


    /*-------------------------------------------------------
     Absolute format: "Sep 5th, 2026"
    -------------------------------------------------------*/

    function absolute(date) {

        return (
            MONTH_NAMES[date.getMonth()] + " " +
            ordinal(date.getDate()) + ", " +
            date.getFullYear()
        );

    }


    /*-------------------------------------------------------
     Relative format: "5 days ago" / "6 hours ago" /
     "3 minutes ago" / "just now"
    -------------------------------------------------------*/

    function relative(diffMs) {

        if (diffMs < MINUTE) {
            return "just now";
        }

        if (diffMs < HOUR) {
            const minutes = Math.floor(diffMs / MINUTE);
            return minutes + (minutes === 1 ? " minute ago" : " minutes ago");
        }

        if (diffMs < DAY) {
            const hours = Math.floor(diffMs / HOUR);
            return hours + (hours === 1 ? " hour ago" : " hours ago");
        }

        const days = Math.floor(diffMs / DAY);
        return days + (days === 1 ? " day ago" : " days ago");

    }


    /*-------------------------------------------------------
     Public: format(value) -> display string, or "" when
     the value is missing/unparseable.
    -------------------------------------------------------*/

    api.format = function (value, now = new Date()) {

        const date = parse(value);

        if (!date) {
            return "";
        }

        const diffMs = now.getTime() - date.getTime();

        if (diffMs >= 0 && diffMs < WEEK) {
            return relative(diffMs);
        }

        return absolute(date);

    };


    return api;

})();