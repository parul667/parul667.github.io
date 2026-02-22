// do this for the raw date str because otherwise UTC stuff might mess it up when fetching your local time zone
function parseLocalDate(dateStr) {
    // dateStr format: "YYYY-MM-DD"
    const parts = dateStr.split("-");
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

const root = document.body;

const startDate = parseLocalDate(root.dataset.startDate);
const endYear = Number(root.dataset.endYear);
const SHEET_NAME = root.dataset.sheetName;

// open sheet and file->share->public to web->make public
// ALSO you need to go say share->share with others->anyone with link->viewer too!!!
// then copy paste the sheet ID in here
const SHEET_ID = "1r-NjsFVOCoyVxlyvjxT1-ALvFMOY3gFVf4_gayLDh8A";

const MS_PER_DAY = 86400000;
const MS_PER_WEEK = MS_PER_DAY * 7;

const timeline = document.getElementById("timeline");
const today = new Date();

function formatDate(d) {
    return d.toISOString().slice(0, 10);
}

function normalizeSheetDate(value) {
    if (!value) return null;

    // Case 1: already in "YYYY-MM-DD"
    if (typeof value === "string" && /^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
        const [y, m, d] = value.split("-");
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }

    // Case 2: Google Sheets date string: "Date(2015,5,20)"
    if (typeof value === "string" && value.startsWith("Date(")) {
        const match = value.match(/Date\((\d+),(\d+),(\d+)\)/);
        if (!match) return null;

        const year = match[1];
        const month = String(Number(match[2]) + 1).padStart(2, "0"); // month is 0-based
        const day = String(match[3]).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    return null;
}

async function loadEventsFromSheet() {
    sheet_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;

    const res = await fetch(sheet_URL);
    const text = await res.text();

    // Google wraps JSON in a function call 🤦
    const json = JSON.parse(
        text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1)
    );

    const rows = json.table.rows;
    const cols = json.table.cols;
    
    // Build { date: 0, name: 1, desc: 2, ... }
    const colIndex = {};
    cols.forEach((col, i) => {
        if (col.label) {
            colIndex[col.label.trim()] = i;
        }
    });
    
    const events = {};
    rows.forEach(row => {
        const get = (row, key) => row.c[colIndex[key]]?.v;

        const rawDate = get(row, "date");
        const date = normalizeSheetDate(rawDate);
        const name = get(row, "name");
        const desc = get(row, "desc");
        const category = get(row, "category");
        const link = get(row, "link");

        if (!date || !name) return;

        if (!events[date]) events[date] = [];
        events[date].push({ name, desc, category, link });
    });

    return events;
}

async function loadPhasesFromSheet() {
    const url =
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}Phases`;

    const res = await fetch(url);
    const text = await res.text();

    const json = JSON.parse(
        text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1)
    );

    const rows = json.table.rows;
    const cols = json.table.cols;

    const colIndex = {};
    cols.forEach((c, i) => colIndex[c.label.trim()] = i);

    return rows.map(r => {
        const get = key => r.c[colIndex[key]]?.v;

        return {
            key: get("key"),
            start: parseLocalDate(normalizeSheetDate(get("start"))),
            end: get("end")
                ? parseLocalDate(normalizeSheetDate(get("end")))
                : null,
            color: "#"+get("color"),
            eventColor: get("eventColor")
        };
    });
}

function getPhaseForDate(date) {
    return PHASES.find(p => date >= p.start && (!p.end || date <= p.end));
}

let EVENTS = {};
let PHASES = [];

Promise.all([
    loadEventsFromSheet(),
    loadPhasesFromSheet()
]).then(([events, phases]) => {
    EVENTS = events;
    PHASES = phases;
    buildTimeLine();
});

function buildTimeLine() {

    for (let year = startDate.getFullYear(); year <= endYear; year++) {
        const yearStart = new Date(year, startDate.getMonth(), startDate.getDate());
        const age = year - startDate.getFullYear();
        const nextBirthday = new Date(year + 1, startDate.getMonth(), startDate.getDate());

        // Decade header
        if (age % 10 === 0) {
            const decade = document.createElement("div");
            decade.className = "decade-header";

            if (age === 0) {
                decade.textContent = "My first ten years";
            } else if (age === 10) {
                decade.textContent = "My teens";
            } else {
                decade.textContent = `My ${age}s`;
            }

            timeline.appendChild(decade);
        }

        for (let w = 0; w < 52; w++) {
            const weekDate = new Date(yearStart.getTime() + w * MS_PER_WEEK);
            if (weekDate >= nextBirthday) break;

            const weekDiv = document.createElement("div");

            weekDiv.className = "week";

            const today = new Date();
            if (weekDate > today) {
                weekDiv.classList.add("future");
            }

            const phase = getPhaseForDate(weekDate);

            if (phase) {
                weekDiv.dataset.phase = phase.key;
                weekDiv.style.setProperty("--phase-color", phase.color);
            }else if(weekDate > today){
                weekDiv.style.setProperty("--phase-color", "#ccc");
            }

            weekDiv.addEventListener('mouseenter', () => {
                const tooltip = weekDiv.querySelector('.tooltip');
                if (!tooltip) return;

                const boxRect = weekDiv.getBoundingClientRect();
                const tooltipRect = tooltip.getBoundingClientRect();

                let pxOffset = 0;
                const leftEdge = boxRect.left + (boxRect.width / 2) - (tooltipRect.width / 2);
                const rightEdge = leftEdge + tooltipRect.width;
                const viewportWidth = window.innerWidth;

                const leftPad = 10;
                const rightPad = 25;
                if (leftEdge < leftPad) {
                    pxOffset = leftPad - leftEdge;  // positive px offset to move right
                }
                else if (rightEdge > viewportWidth - rightPad) {
                    pxOffset = (viewportWidth - rightPad) - rightEdge;  // negative px offset to move left
                }

                tooltip.style.left = '50%';
                tooltip.style.transform = `translateX(calc(-50% + ${pxOffset}px))`;

            });


            // Collect all events in this week (loop days)
            const eventsThisWeek = [];
            for (let d = 0; d < 7; d++) {
                const day = new Date(weekDate.getTime() + d * MS_PER_DAY);
                const key = formatDate(day); // "YYYY-MM-DD"
                if (EVENTS[key]) {
                    EVENTS[key].forEach(e => eventsThisWeek.push({ date: key, event: e }));
                }
            }

            // === ADD BIRTHDAY ENTRY AUTOMATICALLY === (assumes startdate is your birthday)
            const birthdayThisYear = new Date(year, startDate.getMonth(), startDate.getDate());
            const weekStart = new Date(weekDate);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);

            if (birthdayThisYear >= weekStart && birthdayThisYear <= weekEnd) {
                //weekDiv.classList.add("birthday");
                weekDiv.classList.add("event");
                const birthdayAge = year - startDate.getFullYear();
                // Add birthday label as an event with special flag
                eventsThisWeek.unshift({
                    date: formatDate(birthdayThisYear),
                    event: {
                        name: `🎂${birthdayAge} in ${year}`,
                        isBirthday: true,
                        desc: null,
                    }
                });
            }
            // === END ADD BIRTHDAY ENTRY ===        

            if (eventsThisWeek.length > 0) {
                weekDiv.classList.add("event");

                const labelWrap = document.createElement("div");
                labelWrap.className = "week-label-wrap";

                const label = document.createElement("div");
                label.className = "week-label";

                for(let i = 0; i < eventsThisWeek.length; ++i){
                    const event = eventsThisWeek[i].event;
                    const eventLink = event.link;
                    if(!event){
                        continue;
                    }
                    if (eventLink) {
                        const match = event.name.match(/^(.*)<(.*)>(.*)$/);

                        const link = document.createElement("a");
                        link.href = eventLink;
                        link.target = "_blank";

                        if (!match) {
                            link.textContent = event.name;
                            label.appendChild(link);
                        }else{
                            const [, before, linkText, after] = match;

                            const beforeSpan = document.createElement("span");
                            beforeSpan.textContent = before;
                            label.appendChild(beforeSpan)

                            link.textContent = linkText;
                            label.appendChild(link);

                            const afterSpan = document.createElement("span");
                            afterSpan.textContent = after;
                            label.appendChild(afterSpan)
                        }
                    } else {
                        const reg = document.createElement("span");
                        reg.textContent = i > 0 ? " + " + event.name : event.name;
                        label.appendChild(reg);
                    }
                }

                labelWrap.appendChild(label);
                weekDiv.appendChild(labelWrap);
            }

            // Create tooltip for every box
            const tooltip = document.createElement("div");
            tooltip.className = "tooltip";

            if (eventsThisWeek.length > 0) {
                // Group events by date
                const groupedByDate = eventsThisWeek.reduce((acc, cur) => {
                    if (!acc[cur.date]) acc[cur.date] = [];
                    acc[cur.date].push(cur.event);
                    return acc;
                }, {});

                tooltip.innerHTML = Object.entries(groupedByDate)
                    .map(([dateStr, events]) => {
                        const prettyDate = parseLocalDate(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

                        // Build event HTML with CSS classes instead of inline styles
                        const eventsHtml = events.map(e => {
                            return `<strong class="${e.isBirthday ? 'birthday-event' : ''}">${e.name.replace(/[<>]/g, '')}</strong>` +
                                (e.desc ? `<div class="event-desc">${e.desc}</div>` : '');
                        }).join("<hr class='tooltip-divider'>");

                        return `<div class="tooltip-date">${prettyDate}</div>${eventsHtml}`;
                    })
                    .join("<br><br>");
            } else {
                // No events this week — just show the week start date nicely formatted
                const prettyDate = weekDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
                tooltip.innerHTML = `<div class="tooltip-date">${prettyDate}</div>`;
            }

            weekDiv.appendChild(tooltip);

            timeline.appendChild(weekDiv);
        }
    }
}