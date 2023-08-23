const HEBREW_LETTERS = ["\u05D0", "\u05D1", "\u05D2", "\u05D3", "\u05D4", "\u05D5", "\u05D6", "\u05D7", "\u05D8", "\u05D9", "\u05DB", "\u05DC", "\u05DE", "\u05E0", "\u05E1", "\u05E2", "\u05E4", "\u05E6", "\u05E7", "\u05E8", "\u05E9", "\u05EA"];
// These are the required fields for each type of row.
const MODULE_FIELDS = {
    title: "Source", includeChapter: false, accompany: false, range: "all", 
    source: undefined, lan: "hebrew", fontSize: "16px", font: "default"
}
const ROW_FIELDS = {
    header: {
        title: "Mikraot Gedolot"
    },
    single: {
        ...MODULE_FIELDS
    },
    double: {
        left: {...MODULE_FIELDS},
        right: {...MODULE_FIELDS},
        spacing: 50
    },
}
const RANGE_LIMIT = 5;

let sourceData = {};

// Gets the Hebrew representation of a verse number
function getHebrewVerseNumber(number) {
    let result = "";
    if (1 <= number && number <= 10) {
        result = HEBREW_LETTERS[number - 1];
    } else if (11 <= number) {
        let hundreds = Math.floor(number / 100);
        number = number % 100;
        if (hundreds > 0) {
            result += HEBREW_LETTERS[17 + hundreds];
        }
        if (number === 15) {
            return "\u05D8\u05D5"; // ��
        } else if (number === 16) {
            return "\u05D8\u05D6"; // ��
        } else {
            result += HEBREW_LETTERS[8 + Math.floor(number / 10)];
            let remainder = number % 10;
            if (remainder > 0) {
                result += HEBREW_LETTERS[remainder - 1];
            }
        }
    }
    return result;
}

// Formats a text data into a string 
function formatText(text, location, midway=false) {
    let string = text;
    const chapIndex = 1;
    if (!midway && location[chapIndex] !== undefined && !(location[chapIndex + 1] > 1)) {
        string = `<span class="verseNo">${getHebrewVerseNumber(location[chapIndex])}</span> ${string}`;
    }
    string += " ";
    return string;
}

function checkOverflow(el)
{
    var curOverflow = el.style.overflow;

    if ( !curOverflow || curOverflow === "visible" )
        el.style.overflow = "hidden";

    var isOverflowing = el.clientWidth < el.scrollWidth 
        || el.clientHeight < el.scrollHeight;

    el.style.overflow = curOverflow;

    return isOverflowing;
}

function createElement(type, className) {
    let el = document.createElement(type);
    el.className = className;
    return el;
}

function renderModule(el, module, addReference=false) {
    if (module.main === true) {
        el.classList.add("main");
    }
    if (addReference) {
        module.objectRef = el;
    }
    let heading = createElement("div", "contentHeading");
    el.appendChild(heading);
    el.classList.add(module.font);
    el.style.fontSize = module.fontSize;
}

// Render a template's structure into the location div and add references to the template
function renderTemplate(template, location, side="right", addReferences=false) {
    let rows = [];
    let mirror = false;
    if (side === "right") {
        rows = template.right;
    } else if (side === "left") {
        if (template.mirrorPage === true) {
            rows = template.right;
            mirror = true;
        } else {
            rows = template.left;
        }
    }
    let modifiedRows = [];
    for (let i in rows) {
        let row = rows[i];
        let element = createElement("div", "invalid");
        switch (row.type) {
            case "header":
                element.className = "header";
                // two classnames so that I can interchange the css on mirror
                let left = createElement("div", "hLeft");
                left.classList.add(mirror ? "headerPage" : "headerExtra")
                let center = createElement("div", "headerTitle hCenter");
                let right = createElement("div", "hRight");
                right.classList.add(mirror ? "headerExtra" : "headerPage")
                element.appendChild(left);
                element.appendChild(center);
                element.appendChild(right);
                break;
            case "double":
                element.className = "double";
                let leftCon = createElement("div", "leftContent");
                let rightCon = createElement("div", "rightContent");
                renderModule(leftCon, row.left, addReferences);
                renderModule(rightCon, row.right, addReferences);
                if (addReferences && mirror) { 
                    row = Object.assign({}, row); // don't want to modify the template
                    let temp = row.left;
                    row.left = row.right;
                    row.right = temp;
                }
                element.appendChild(rightCon);
                element.appendChild(leftCon);
                break;
            case "single":
                element.className = "single";
                let single = createElement("div", "content");
                renderModule(single, row, addReferences);
                element.appendChild(single);
                break;
        }
        modifiedRows.push(row);
        location.appendChild(element);
    }
    return modifiedRows;
}

// Helper function for loadTemplateFields
function applyObjectDefaults(obj, def) {
    let keys = Object.keys(def);
    for (let k in keys) {
        let key = keys[k];
        if (obj[key] === undefined) {
            obj[key] = def[key];
        } else if (typeof def[key] === "object") {
            applyObjectDefaults(obj[key], def[key])
        }
    }
}

function getPageList(template) {
    let pageList = ["right"];
    if (!template.mirrorPage) {
        pageList.push("left");
    }
    return pageList;
}

// Loads field data into a copy of given template
function loadTemplateFields(template, fields) {
    let t = JSON.parse(JSON.stringify(template));
    let pageList = getPageList(template);
    for (let p in pageList) {
        let page = t[pageList[p]];
        let pageFields = fields[p];
        for (let m in page) {
            let pageModule = page[m];
            let moduleFields = pageFields[m];
            applyObjectDefaults(pageModule, moduleFields);
            applyObjectDefaults(pageModule, ROW_FIELDS[pageModule.type]);
        }
    }
    return t;
}

// Locates the main module from an object
function locateMainModule(obj) {
    let keys = Object.keys(obj);
    for (let k in keys) {
        let key = keys[k];
        if (typeof obj[key] === "object") {
            let subResult = locateMainModule(obj[key]);
            if (subResult !== undefined) {
                return subResult;
            }
        } else if (key === "main" && obj[key]) {
            return obj;
        }
    }
    return undefined;
}

function getModuleListFromPage(loadedTemplate) {
    let sources = {};
    let pageList = getPageList(loadedTemplate);
    for (let p in pageList) {
        let page = loadedTemplate[pageList[p]];
        for (let r in page) {
            let row = page[r];
            let modules = [];
            if (row.type === "double") {
                modules = [row.left, row.right];
            } else if (row.type === "single") {
                modules = [row];
            }
            for (let m in modules) {
                let module = modules[m];
                module.row = row;
                if (!module.main) {
                    sources[module.source] = module;
                }
            }
        }
    }
    return sources;
}

// format a double row
function formatDouble(left, right, spacing=50) {
    if (spacing !== 50 && left.classList.contains("rightContent")) { // reverse spacing if mirrored
        spacing = 100 - spacing;
    }
    const widthFormat = (percentage) => `calc(${percentage}% - var(--offset))`;
    left.style.float = "left";
    right.style.float = "right";
    left.style.width = widthFormat(spacing);
    right.style.width = widthFormat(100 - spacing);
    if (left.clientHeight > right.clientHeight) {
        left.parentElement.appendChild(left);
        right.style.float = "right";
        left.style.float = "none";
        right.style.width = widthFormat(100 - spacing);
        left.style.width = "initial";
    } else if (left.clientHeight <= right.clientHeight) {
        right.parentElement.appendChild(right);
        left.style.float = "left";
        right.style.float = "none";
        left.style.width = widthFormat(spacing);
        right.style.width = "initial";
    }
}

// helper function for buildPages, returns whether the verses overflowed
function iterativelyAddVerses(source, untilVerse, containerPage, formatDoubleCol=false, left=null, right=null) {
    let verses = source.text[source.lan];
    let verse = verses[source.position.text];
    source.objectRef.style.display = "block"; // to allow content to be hidden unless stuff is added
    let overflowed = false;
    while (verse !== undefined && compareLocations(verse.location, untilVerse) < 0) {
        let text = formatText(verse.data.substring(source.position.charIndex), verse.location, source.position.charIndex !== 0);
        let el = createElement("span", "textNode");
        el.innerHTML = text;
        source.objectRef.appendChild(el);
        // check overflow here
        if (formatDoubleCol) {
            formatDouble(left, right, source.row.spacing);
        }
        let overflow = checkOverflow(containerPage);
        // dumb overflow procedure
        if (overflow) {
            let rawText = verse.data;
            for (let i = rawText.length - 2; i >= 0; i--) {
                if (rawText.charAt(i) === " " || i === 0) {
                    let textAttempt = formatText(rawText.substring(source.position.charIndex, i), verse.location, source.position.charIndex !== 0);
                    el.innerHTML = textAttempt;
                    if (formatDoubleCol)
                        formatDouble(left, right, source.row.spacing);
                    overflow = checkOverflow(containerPage);
                    if (!overflow) {
                        // handle the edge case if the entire verse overflows (since +1 accounts for a space)
                        if (i === 0 || rawText.trim().length === 0) {
                            source.position.charIndex = i;
                            source.objectRef.removeChild(source.objectRef.lastChild);
                        } else {
                            source.position.charIndex = i + 1; 
                        }
                        break;
                    }
                }
            }
            overflowed = true;
            break;
        }
        source.position.text++;
        source.position.charIndex = 0;
        verse = verses[source.position.text];
    }
    if (source.objectRef.children.length === 1) {
        source.objectRef.style.display = "none";
    }
    return overflowed;
}

// Iteratively builds up pages from a format and its requiredFields
// The system for storing properties here is a "module" which combines properties from multiple sources for convenience
async function buildPages(container, template, requiredFields) {
    // Load important info
    let loadedTemplate = loadTemplateFields(template, requiredFields);
    let main = locateMainModule(loadedTemplate);
    let mainRange = processRangeString(main.range, RANGE_LIMIT);
    // Build verified source list
    let sources = getModuleListFromPage(loadedTemplate);;
    // Fetch sources
    for (let r in mainRange) {
        main.text = await fetchSource(main.source, mainRange[r]);
    }
    for (let source in sources) {
        let data = sources[source];
        if (data.accompany) {
            if (!hasBaseText(source, main.source)) { // If accompany is set incorrectly
                data.range = NaN;
            }
        }
        let rangeEntry = data.range === "all" ? mainRange : processRangeString(data.range);
        for (let r in rangeEntry) {
            let range = rangeEntry[r];
            data.text = await fetchSource(source, range);
        }
        data.position = {
            text: 0,
            charIndex: 0
        };
    }
    main.position = {text: 0, charIndex: 0};
    // add content to document magically
    let direction = 0; // 0 is right, 1 is left
    let pageNumber = 0;
    let currentPage = null;
    let fillContent = true; // whether to continue filling
    let mainContentEnded = false; // whether the main content has ended
    do {
        let mainPos = Math.min(main.text[main.lan].length - 1, main.position.text);
        let currentVerse = main.text[main.lan][mainPos].location;
        // add page
        let side = direction === 0 ? "right" : "left";
        currentPage = createElement("div", side);
        main.objectRef = null;
        let templateRows = renderTemplate(loadedTemplate, currentPage, side, true);
        container.appendChild(currentPage);
        // add regular heading
        let titleEl = currentPage.getElementsByClassName("headerTitle")[0];
        if (titleEl !== undefined) {
            titleEl.innerHTML = `${main.title}`;
            let chapter = currentVerse[currentVerse.length - 2];
            if (chapter !== undefined) {
                titleEl.innerHTML += ` ${getHebrewVerseNumber(chapter)}`;
            }
        }
        let pageEl = currentPage.getElementsByClassName("headerPage")[0];
        if (pageEl !== undefined) {
            pageEl.innerHTML = `${getHebrewVerseNumber(pageNumber + 1)}`; 
        }
        // add source headings
        for (let s in sources) {
            let source = sources[s];
            let heading = source.objectRef.getElementsByClassName("contentHeading")[0];
            heading.innerHTML = source.title;
        }
        // fill page content iteratively
        let roomExists = true;
        while (roomExists && fillContent) {
            // iterate the current verse
            let nextV = main.text[main.lan][main.position.text + 1];
            if (nextV === undefined) {
                nextVerse = currentVerse.slice();
                nextVerse[nextVerse.length - 1]++;
            } else {
                nextVerse = nextV.location;
            }
            // add main content
            if (!mainContentEnded) {
                iterativelyAddVerses(main, nextVerse, currentPage);
            }
            // add commentaries up until the current point of the main content
            // TODO try allowing commentaries to take up remaining space, second pass through?
            // TODO implement non accompanying sources
            for (let r in templateRows) {
                let row = templateRows[r];
                switch (row.type) {
                    case "single":
                        if (!row.main) {
                            roomExists = !iterativelyAddVerses(sources[row.source], nextVerse, currentPage);
                        }
                        break;
                    case "double":
                        if (!row.left.main)
                            roomExists = !iterativelyAddVerses(sources[row.left.source], nextVerse, currentPage, formatDoubleCol=true, 
                                left=row.left.objectRef, right=row.right.objectRef);
                            if (!roomExists)
                                break;
                        if (!row.right.main)
                            roomExists = !iterativelyAddVerses(sources[row.right.source], nextVerse, currentPage, formatDoubleCol=true, 
                                left=row.left.objectRef, right=row.right.objectRef);
                        break;
                }
                if (!roomExists)
                    break;
            }
            // check if any source still has content
            if (nextV === undefined) {
                fillContent = false;
                for (let s in sources) {
                    let source = sources[s];
                    if (source.text[source.lan][source.position.text] !== undefined) {
                        fillContent = true;
                        break;
                    }
                }
                mainContentEnded = true;
            } else {
                currentVerse = nextVerse;
            }
        }
        pageNumber++;
        direction = 1 - direction;
    } while(fillContent);
    // create pages as needed (modify that method to add document objects to the modules)
}

function onApiResponse(response) {
    console.log(response);
}

initializeAPI(onApiResponse);
axios.get("./resources/testFormat.json").then(res => {
    let template = res.data;
    let container = document.getElementById("pages");
    let fields = [[
        {title: "Test Render"},
        {left: {title: "תרגום", source: "Onkelos Exodus", accompany: true}, 
        right: {title: "שמות", source: "Exodus", range: "1", includeChapter: true}},
        {left: {title: "שפתי חכמים", source: "Siftei Chakhamim, Exodus", accompany: true, fontSize: "12px"},
        right: {title: "רשי", source: "Rashi on Exodus", accompany: true, font: "rashi"}},
        {title: "אבן עזרא", source: "Ibn Ezra on Exodus", accompany: true},
        {title: "בעל הטורים", source: "Kitzur Baal HaTurim on Exodus", accompany: true}
    ]];
    buildPages(container, template, fields);
}).catch(LOG_FUNC);